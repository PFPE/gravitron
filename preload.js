const { contextBridge, ipcRenderer } = require('electron/renderer')

contextBridge.exposeInMainWorld('electronAPI', {
  openLandCal: () => ipcRenderer.invoke('open-dialog-landmeters'),
  returnLandCal: (callback) => ipcRenderer.on('landcal',(event, content) => callback(content)),
  openDGSgrav: () => ipcRenderer.invoke('open-dialog-dgsgrav'),
  returnDGSgrav: (callback) => ipcRenderer.on('dgsgrav',(event, content) => callback(content)),
  getShipOptions: () => ipcRenderer.invoke('get-ship-options'),
  getStationDB: () => ipcRenderer.invoke('get-stations'),
  sendTieToMain: (data) => ipcRenderer.send('tie-data-kv-object', data),
  openReadTOML: () => ipcRenderer.invoke('open-read-toml'),
  returnToml: (callback) => ipcRenderer.on('tomlread',(event, content) => callback(content)),
  toggleDebug: (callback) => ipcRenderer.on('toggle-debug',callback),
})