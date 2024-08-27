// load libraries (if that's the right word, who knows)
const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron/main')
const path = require('node:path')
const fs = require('node:fs')

let mainWindow;

const resPath = app.isPackaged ? process.resourcesPath : __dirname;
// main window-creating function!
function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  })
    // Define a custom menu template
    const menuTemplate = [
        {
            label: 'File         ',
            submenu: [
                    {
                  label: 'Close        ',
                  accelerator: 'Ctrl+W',
                  click: () => {
                    const focusedWindow = BrowserWindow.getFocusedWindow();
                    if (focusedWindow) {
                      focusedWindow.close();
                    }
                  }
                },  
                {
                    label: 'Exit         ',
                    accelerator: 'Ctrl+Q', // Shortcut for quitting the app
                    click() {
                        app.quit();
                    }
                }
            ]
        },
        {
            label: 'Help         ',
            submenu: [
                {
                    label: 'Help?         ',
                    click: () => {
                    createHelpWindow();
                    }
                },
                {
                    label: 'Manual        ',
                    click: () => {
                    openManualWindow();
                    }
                }
            ]
        }
    ];

    // Set the custom menu
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

  mainWindow.loadFile('index.html')

  // read the list of ships from file
    ipcMain.handle('get-ship-options', async () => {
        const data = fs.readFileSync(path.join(resPath,'./database/ships.db'), 'utf8');
        const options = data.split('\n').filter(option => option.trim() !== '');
        options.unshift('Choose Ship'); // for nothing selected at the start
        return options;
    });

    // read the station database
    ipcMain.handle('get-stations', async () => {
        const data = fs.readFileSync(path.join(resPath,'./database/stations.db'), 'utf8');
        const chunks = data.split('[STATION');
        chunks.shift();
        const stationDB = [];
        stationDB.push({"NAME":'Choose Station',"NUMBER":"0-000","GRAVITY":"-999"});
        chunks.forEach(chunk => {
            const thisSta = {};
            const lines = chunk.split('\n').filter(option => option.trim() !== '');
            lines.forEach(line => {
                if (line.startsWith('_')) {
                }
                else {
                    const [key,value] = line.split('=');
                    thisSta[key.trim()] = value.trim().replace(/^"|"$/g, '');
                }
            });
            stationDB.push(thisSta);
        });
    return stationDB;
    })
}


function openManualWindow() {
  let helpWindow = new BrowserWindow({
    width: 1000,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
    },
  });

  const pdfPath = path.join(__dirname,'docs/main.pdf');
  helpWindow.loadURL(`file://${pdfPath}`);
}

function createHelpWindow() {
  let helpWindow = new BrowserWindow({
    width: 600,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
    },
  });

  helpWindow.loadFile('help.html');
}


// use the functions to 
app.whenReady().then(() => {
  //ipcMain.handle('dialog:openFile', fileReadData)
  createWindow()
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

ipcMain.handle('open-dialog-landmeters', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({defaultPath: path.join(resPath, './database/land-cal'),properties:['openFile']});
    if (!canceled) {
        fs.readFile(filePaths[0],'utf8',(err,data) => {
            if (err) {
                console.error('error reading file:', err);
                return
            }
            const rows = data.trim().split('\n');
            rows.shift();  // first row is a date

            const brackets = [];
            const mgals = [];
            const factors = [];
            rows.forEach(row => {
                const columns = row.trim().split(/\s+/);
                brackets.push(parseFloat(columns[0]));
                mgals.push(parseFloat(columns[1]));
                factors.push(parseFloat(columns[2]));
            });
        mainWindow.webContents.send('landcal',[brackets,mgals,factors,filePaths[0]]);
        });
    }
});

ipcMain.handle('open-dialog-dgsgrav', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Gravimeter Files',
    properties: ['openFile', 'multiSelections'],
});
    if (!canceled) {
      let rows = [];
      filePaths.forEach(filepath => {
        const data = fs.readFileSync(filepath,'utf8');
        const lines = data.trim().split('\n');
        lines.forEach((line) => {
          rows.push(line);
        });
      });
      mainWindow.webContents.send('dgsgrav',rows);
    }
});

// receiving and writing tie data in reports and/or toml files
ipcMain.on('tie-data-kv-object', async (event, data) => {
  console.log('Received data from renderer'); // :, data);
  let templatePath = '';  // will be toml or txt report (land or not)
  let filePath = '';
  if (data['writeTOML']) {  // writing toml for possible reread
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
          title: 'Save tie to toml',
          defaultPath: path.join(app.getPath('documents'), 'output_tie.toml'),
          filters: [
              { name: 'TOML Files', extensions: ['toml'] },
              { name: 'All Files', extensions: ['*'] }
          ]
      });
      if (canceled) {
          return null;
      } else {
        templatePath = path.join(__dirname,'toml_template.txt');
        generateTextFile(templatePath, filePath, data);
      }
  } else {  // txt report, not toml
    const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
          title: 'Save tie report',
          defaultPath: path.join(app.getPath('documents'), 'tie_report.txt'),
          filters: [
              { name: 'txt Files', extensions: ['txt'] },
              { name: 'All Files', extensions: ['*'] }
          ]
      });
      if (canceled) {
          return null;
      } else {
      templatePath = data["isLandTie"] ? path.join(__dirname, 'report_template_landtie.txt') : path.join(__dirname, 'report_template.txt');
        generateTextFile(templatePath, filePath, data);
      }
  }
  console.log('File written successfully:', filePath);
})

// Function to read the template, replace placeholders, and write the output
function generateTextFile(templatePath, outputPath, variables) {
    // Read the template file
    const template = fs.readFileSync(templatePath, 'utf8');
    // Replace placeholders with variable values
    let outputText = template;
    for (const key in variables) {
        const placeholder = `{{${key}}}`;
        outputText = outputText.replace(new RegExp(placeholder, 'g'), variables[key]);
    }
    // Write the output to a new file
    fs.writeFileSync(outputPath, outputText, 'utf8');
}

// open and read a toml file, send contents to renderer
ipcMain.handle('open-read-toml', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog();
    if (!canceled) {
      fs.readFile(filePaths[0],'utf8',(err,data) => {
          if (err) {
              console.error('error reading file:', err);
              return
          }
          const lines = data.split('\n');
          const result = {};

          lines.forEach(line => {
            line = line.trim()
            if (!line || line.startsWith('#') || line.startsWith('[')) {
              // do nothing with blank lines, commentss, and section headings
            } else {
              var [key, value] = line.split('=').map(part => part.trim())
              // handle quoted strings
              if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1,-1)
              }
              if (key.endsWith('.m') || key.endsWith('.c') || key.endsWith('.m_avg') || key.endsWith('.h')) {
                key = key.replace('.','');
              }
              // figure out what everything is
              if (!isNaN(value)) {
                result[key] = Number(value);
              } else if (value.startsWith('false')) {
                result[key] = false; 
              } else if (value.startsWith('true')) {
                result[key] = true;
              } else if (value.startsWith('null')) {
                result[key] = null;
              } else if (key.endsWith('.t') || key.endsWith('.t_avg')) {
                key = key.replace('.','');
                result[key] = Date.parse(value);
              }  else {
                result[key] = value;  // stringsss
              }
            }
          })
      mainWindow.webContents.send('tomlread',result);
      //console.log(result);
    })
  }
});


app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

app.commandLine.appendSwitch('ignore-gpu-blacklist');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');