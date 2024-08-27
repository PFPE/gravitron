
////////////////////////////////////////////////////////////////////////
// constants and other useful stuff
////////////////////////////////////////////////////////////////////////
const faafactor = 0.3086;
const gravcal = 414125;
const otherfactor = 8388607;
const g0 = 10000;
const isDebug = true;

const statmessage = document.getElementById('statusText'); // FOR TESTING ONLY

////////////////////////////////////////////////////////////////////////
// classes etc
////////////////////////////////////////////////////////////////////////

class valWithTime{
    constructor() {
        this.time = new Date(0);
        this.height = -999;
        this.mgal = -999;
    }
    updateHeight(value) {
        this.height = value;
        this.time = new Date();  // current timestamp
    }
}

class stationData {
    constructor() {
        this.station = null;  // station name
        this.stationGravity = -999;
        this.stationDB = null;  // will be an `object` which is sort of like a dict
        this.stationNumber = null;  // gets written in report
    }
}

class landTieData {
    constructor() {
        this.meter = null;
        this.meterFile = null;
        this.shipLon = null;
        this.shipLat = null;
        this.meterTemp = null;
        this.shipElev = null;
        this.landTieValue = null;
        this.drift = null; // byproduct of land tie calc

        this.brackets = [];
        this.mgalVals = [];
        this.factors = [];

        this.dtAB = null;
        this.dtAA = null;
        this.dcAvgMgalsB = null;
        this.mgalAvgs = [-999,-999,-999];
        this.timeAvgs = [new Date(0), new Date(0), new Date(0)];

        this.a1 = new valWithTime();
        this.a2 = new valWithTime();
        this.a3 = new valWithTime();

        this.b1 = new valWithTime();
        this.b2 = new valWithTime();
        this.b3 = new valWithTime();

        this.c1 = new valWithTime();
        this.c2 = new valWithTime();
        this.c3 = new valWithTime();

    }
    calibrateCounts() {
        if (this.brackets.length === 0) {  // no calibration table to use
            return 
        }
        let counts = [this.a1, this.a2, this.a3, this.b1, this.b2, this.b3, this.c1, this.c2, this.c3];
        counts.forEach(item => {  // loop over all 9 counts entries
            if (item.height !== -999) {  // if there are counts entered
                let found = false;
                let minDiff = Infinity;
                let closeval = 0;
                for (let i=0; i<this.brackets.length; i++) { // look for nearest bracket below
                   let br = this.brackets[i]
                    if (br < item.height) {
                        let diff = Math.abs(item.height - br);
                        if (diff < minDiff) {
                            minDiff = diff;
                            closeval = i;
                            found = true;
                        }
                    }
                }
                if (found) { // if we found a good bracket, calibrate and save mgal value
                    let residual_reading = item.height - this.brackets[closeval];
                    item.mgal = residual_reading*this.factors[closeval] + this.mgalVals[closeval];
                } else {
                    item.mgal = -999;
                }
            }
        });
    }
}

class TieData {
    constructor() {
        // water heights and times at pier
        this.h1 = new valWithTime();
        this.h2 = new valWithTime();
        this.h3 = new valWithTime();

        this.personnel = null;

        this.ship = null;  // ship selected
        //this.alt_ship = null; // not sure if we need this? for "other" case
        this.gravgrav = null; // this is the dgs data gravity time series
        this.gravtime = null; // goes with ship bc need to know which ship for read function

        this.isLandTie = false;
        this.landTie = new landTieData();
        this.stationData = new stationData();

        this.bias = null;
        this.avgHeight = null;
        this.waterGrav = null;  //byproduct of bias calc that we might want to write?
        this.avgMeterGrav = null;  // filtered average over h1/h2/h3 time window
    }
}

// create the tieData object
const tieData = new TieData();


////////////////////////////////////////////////////////////////////////
// tie metadata, general
////////////////////////////////////////////////////////////////////////

// handle saving personnel name from text input
const personbtn = document.getElementById('btnPersonSave')
personbtn.addEventListener('click', async () => {
    const thename = document.getElementById('personField').value;
    tieData.personnel = thename;
    const thenamePrint = document.getElementById('savedPerson');
    thenamePrint.textContent = `Person: ${tieData.personnel}`;
});

// populate ship and station dropdown lists, using read functions in main
document.addEventListener('DOMContentLoaded', async () => {
    // ship choice dropdown, populate the tieData.ship
    const shipDropdown = document.getElementById('shipDropdown');
    // Get the dropdown options from the main process
    const shipOptions = await window.electronAPI.getShipOptions();
    // Populate the dropdown with the options
    shipOptions.forEach(option => {
        const optElement = document.createElement('option');
        optElement.value = option;
        optElement.textContent = option;
        shipDropdown.appendChild(optElement);
    });

    const stationDropdown = document.getElementById('stationDropdown');
    const stationOptions = await window.electronAPI.getStationDB();
    tieData.stationData.stationDB = stationOptions;
    stationOptions.forEach(option => {
        const optStation = document.createElement('option');
        optStation.value = option["NAME"];
        optStation.textContent = option["NAME"];
        stationDropdown.appendChild(optStation);
    });
});

// handle selecting ship name
const selectedOption = document.getElementById('selectedShip');
shipDropdown.addEventListener('change', (event) => {
    tieData.ship = event.target.value;
    selectedOption.textContent = `Ship: ${tieData.ship}`;
});

// handle selecting station and getting absolute gravity value for it
const selectedStation = document.getElementById('selectedStation');
const stationGravText = document.getElementById('stationGrav');
stationDropdown.addEventListener('change', (event) => {
    tieData.stationData.station = event.target.value;
    tieData.stationData.stationDB.forEach(element => {
        if (element["NAME"] === tieData.stationData.station){
            tieData.stationData.stationGravity = parseFloat(element["GRAVITY"]);
            tieData.stationData.stationNumber = element["NUMBER"];
        }
    });
    selectedStation.textContent = `Station: ${tieData.stationData.station}`;
    stationGravText.textContent = `Gravity: ${tieData.stationData.stationGravity}`;
    gravOverride.value = tieData.stationData.stationGravity;
});

// handle a value entered to override database gravity
document.getElementById('btnOverrideGrav').addEventListener('click', async () => {
    tieData.stationData.stationGravity = parseFloat(document.getElementById('gravOverride').value);
    stationGravText.textContent = `Gravity: ${tieData.stationData.stationGravity}`;
})

////////////////////////////////////////////////////////////////////////
// bias calc
////////////////////////////////////////////////////////////////////////

// entering and saving water heights
const hbtn1 = document.getElementById('Height1Save')
hbtn1.addEventListener('click', async () => {
    const HeightInput1 = parseFloat(document.getElementById('heightField1').value);
    if (!isNaN(HeightInput1)) {
        tieData.h1.updateHeight(HeightInput1);
    } else {
        console.error('Invalid number input');
    }
    height1Entered.textContent = `${tieData.h1.time.toISOString()}`;
});
const hbtn2 = document.getElementById('Height2Save')
hbtn2.addEventListener('click', async () => {
    const HeightInput2 = parseFloat(document.getElementById('heightField2').value);
    if (!isNaN(HeightInput2)) {
        tieData.h2.updateHeight(HeightInput2);
    } else {
        console.error('Invalid number input');
    }
    height2Entered.textContent = `${tieData.h2.time.toISOString()}`;
});
const hbtn3 = document.getElementById('Height3Save')
hbtn3.addEventListener('click', async () => {
    const HeightInput3 = parseFloat(document.getElementById('heightField3').value);
    if (!isNaN(HeightInput3)) {
        tieData.h3.updateHeight(HeightInput3);
    } else {
        console.error('Invalid number input');
    }
    height3Entered.textContent = `${tieData.h3.time.toISOString()}`;
});

// handle reading DGS file
const btnDGSFile = document.getElementById('btnSelectDGS');
btnDGSFile.addEventListener('click', async () => {
    await window.electronAPI.openDGSgrav();
});
window.electronAPI.returnDGSgrav((rows) => {
    let stamps = [];
    let rgrav = [];
    rows.forEach(rw => {
        const tokens = rw.split(",");
        // case split based on selected ship
        switch (tieData.ship) {
            case "R/V Thompson":
                rgrav.push(parseFloat(tokens[3]));
                let dates = tokens[0].split('/');
                let timebits = tokens[1].split(':');
                let dtime1 = new Date(Date.UTC(parseInt(dates[2]),parseInt(dates[0]),parseInt(dates[1]),parseInt(timebits[0]),parseInt(timebits[1]),parseInt(timebits[2].split('.')[[0]])));
                stamps.push(dtime1);
                statmessage.textContent = `${tieData.ship} DGS file(s) read`
                break;
            case "R/V Atlantis":
            case "R/V Revelle":
            case "R/V Palmer":
            case "R/V Ride":
                rgrav.push(parseFloat(tokens[1]));
                let dtime = new Date(Date.UTC(parseInt(tokens[19]),parseInt(tokens[20]),parseInt(tokens[21]),parseInt(tokens[22]),parseInt(tokens[23]),parseInt(tokens[24])));
                stamps.push(dtime);
                statmessage.textContent = `${tieData.ship} DGS file(s) read`
                break;
            default:
                statmessage.textContent = 'ship not supported';
                break;
        }
    })
    // sort by timestamps in case there were multiple files out of order
    let combined = stamps.map((value, index) => {
        return {key: value, value: rgrav[index] };
    });
    combined.sort((a, b) => a.key - b.key);

    tieData.gravgrav = combined.map(element => element.value);
    tieData.gravtime = combined.map(element => element.key);
    const filteredData = filterRgrav(tieData.gravgrav);
    tieData.gravgrav = filteredData;

    var myChart = new Chart(ctx, {
           type: 'line',
        data: {
            labels: tieData.gravtime,//timeSection,
            datasets: [{
                label: 'DGS data',
                data: tieData.gravgrav, //dataSection,
                fill: false,
                borderColor: 'rgba(75, 192, 192, 1)',
                tension: 0,
                pointStyle: false
            }]
        },
        options: {
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    ticks: {
                        callback: function(value, index, ticks) {
                            return value*1e-12;
                        }
                    }
                },
                y: {
                    beginAtZero: false
                }
            }
        } 
        });

})

// create the Blackman window FIR filter
function firwin(taps, wn) {
    const filterCoefficients = [];
    const a = (taps - 1) / 2.0;
    
    for (let i = 0; i < taps; i++) {
        const x = (i - a) * Math.PI * wn;
        const window = 0.42 - 0.5 * Math.cos(2 * Math.PI * i / (taps - 1)) + 0.08 * Math.cos(4 * Math.PI * i / (taps - 1));
        const sinc = x === 0 ? 1 : Math.sin(x) / x;
        filterCoefficients.push(sinc * window);
    }
    
    // Normalize the filter coefficients
    const sum = filterCoefficients.reduce((acc, val) => acc + val, 0);
    return filterCoefficients.map(coef => coef / sum);
}

// 'odd' extension of array, padding before filtering
function oddExt(x, n) {
    if (n < 1) {
        return x;
    }
    if (n > x.length - 1) {
        throw new Error(`The extension length n (${n}) is too big. It must not exceed x.length-1, which is ${x.length - 1}.`);
    }

    // Left extension
    const leftEnd = x[0];
    const leftExt = x.slice(1, n + 1).reverse().map(val => 2 * leftEnd - val);

    // Right extension
    const rightEnd = x[x.length - 1];
    const rightExt = x.slice(-n - 1, -1).reverse().map(val => 2 * rightEnd - val);

    // Concatenate the extended parts with the original array
    const ext = leftExt.concat(x, rightExt);

    return ext;
}

// forward+backward filtering
function filtfilt(B, data) {
    // Forward filter, revers, filter, reverse to output
    let filteredData = applyFilter(B, data);
    filteredData = filteredData.reverse();
    filteredData = applyFilter(B, filteredData);
    return filteredData.reverse();
}

// one direction of filtering, with padding
function applyFilter(B, data) {
    const padData = oddExt(data,B.length);
    const result = new Array(padData.length).fill(0);
    const taps = B.length;
    
    for (let i = 0; i < padData.length; i++) {
        for (let j = 0; j < taps; j++) {
            if (i - j >= 0) {
                result[i] += B[j] * padData[i - j];
            }
        }
    }
    return result.slice(B.length,-B.length);
}

// applying all the filter stuff to an array of gravity values (set ntaps etc)
function filterRgrav(rgrav) {
    const ndata = rgrav.length;
    const filtertime = Math.round(ndata / 10);
    const sampling = 1;
    const taps = 2 * filtertime;
    const freq = 1 / filtertime;
    const nyquist = sampling / 2;
    const wn = freq / nyquist;

    // Generate filter coefficients using Blackman window
    const B = firwin(taps, wn);

    // filter forward and backward for zero phase
    const fdat = filtfilt(B, rgrav);
    
    return fdat;
}


// compute bias!!
const btnBiasCalc = document.getElementById('btnComputeBias');
var ctx = document.getElementById('myChart');
btnBiasCalc.addEventListener('click', async () => {
    // CHECK that a DGS file has been loaded
    if (tieData.gravgrav.length === 0) {
        statmessage.textContent = "No DGS file loaded"
        return
    }
    // get 3 (negative) heights and their timestamps (or faux timestamps)
    let heights = [];
    let height_times = [];
    [tieData.h1,tieData.h2,tieData.h3].forEach((hh,i) => {
        if (hh.height !== null && hh.height !== -999) {
            heights.push(-1*Math.abs(hh.height));  // all height values need to be negative
            if (isDebug) {
                height_times.push(tieData.gravtime[20*i].getTime());
            }
            else {
                height_times.push(hh.time.getTime());
            }
        }
    })
    // check land tie boolean, get pier gravity value accordingly
    let pier_grav = -999
        if (tieData.isLandTie && tieData.landTie.landTieValue !== null) {
        pier_grav = tieData.landTie.landTieValue;
    } else {
        pier_grav = tieData.stationData.stationGravity;
    }
    // check if we have an ok pier gravity value AND we have at least one height
    if (heights.length === 0 || pier_grav < 0){
        statmessage.textContent = "Missing pier gravity and/or water height"
        return
    }
    let avg_height = 0;
    heights.forEach(hh => {
        avg_height += hh;
    })
    avg_height /= heights.length;
    const water_grav = pier_grav + faafactor*avg_height
    // check DGS time series against the height timestamps
    let gravtime_epoch = [];
    tieData.gravtime.forEach(stamp =>{
        gravtime_epoch.push(stamp.getTime());
    })
    const time0 = height_times.reduce((min, current) => current < min ? current : min, height_times[0]);
    const time1 = height_times.reduce((max, current) => current > max ? current : max, height_times[0]);

    const gtime0 = gravtime_epoch.reduce((min, current) => current < min ? current : min, gravtime_epoch[0]);
    const gtime1 = gravtime_epoch.reduce((max, current) => current > max ? current : max, gravtime_epoch[0]);
    if (time0 < gtime0 || time1 > gtime1) {
        statmessage.textContent = "DGS file doesn't cover time window";
        return // DGS file timestamps do not cover the tie time period when water heights were taken
    }

    // filter DGS data
    const filteredData = tieData.gravgrav;
    // extract the section that spans the timestamps of the heights
    const dataSection = filteredData.filter((_, index) => gravtime_epoch[index] >= time0 && gravtime_epoch[index] <= time1);
    const timeSection = gravtime_epoch.filter((_, index) => gravtime_epoch[index] >= time0 && gravtime_epoch[index] <= time1);
    // average that section of the time series
    let avg_dgs_grav = 0;
    dataSection.forEach(value => {
        avg_dgs_grav += value;
    })
    avg_dgs_grav /= dataSection.length;
    // simple bias calculation
    const bias = water_grav - avg_dgs_grav;
    // save things in tieData object
    tieData.bias = bias;
    tieData.waterGrav = water_grav;
    tieData.avgMeterGrav = avg_dgs_grav;
    tieData.avgHeight = avg_height;
    document.getElementById("biasCalcValue").textContent = `Bias: ${bias}`;
})


////////////////////////////////////////////////////////////////////////
// land tie stuff
////////////////////////////////////////////////////////////////////////

// handle the toggle for land tie on/off
const toggleSwitch = document.getElementById('toggleSwitch');
const toggleStateDisplay = document.getElementById('toggleState');
toggleSwitch.addEventListener('change', () => {
    tieData.isLandTie = toggleSwitch.checked;
    toggleStateDisplay.textContent = tieData.isLandTie ? 'ON' : 'OFF';
    if (toggleSwitch.checked){
        [lta1,lta2,lta3,ltb1,ltb2,ltb3,ltc1,ltc2,ltc3,btnlta1,btnlta2,btnlta3,btnltb1,btnltb2,btnltb3,btnltc1,btnltc2,btnltc3,shipLon,shipLat,shipElev,shipTemp,saveLTmeta,btnSelectCalFile,btnDoLandTie].forEach(thing => {
            thing.disabled = false;
        })
    } else {
        [lta1,lta2,lta3,ltb1,ltb2,ltb3,ltc1,ltc2,ltc3,btnlta1,btnlta2,btnlta3,btnltb1,btnltb2,btnltb3,btnltc1,btnltc2,btnltc3,shipLon,shipLat,shipElev,shipTemp,saveLTmeta,btnSelectCalFile,btnDoLandTie].forEach(thing => {
            thing.disabled = true;
        })
    }
});

// get and save land tie metadata (ship location, elevation, temperature)
document.getElementById("saveLTmeta").addEventListener('click', async () => {
    const latfield = document.getElementById("shipLat");
    const lonfield = document.getElementById("shipLon");
    const elefield = document.getElementById("shipElev");
    const temfield = document.getElementById("shipTemp");
    if (latfield.value !== "") {
        tieData.landTie.shipLat = latfield.value;
    } else { tieData.landTie.shipLat = -999 };
    if (lonfield.value !== "") {
        tieData.landTie.shipLon = lonfield.value;
    } else { tieData.landTie.shipLon = -999 };
    if (elefield.value !== "") {
        tieData.landTie.shipElev = elefield.value;
    } else { tieData.landTie.shipElev = -999 };
    if (temfield.value !== "") {
        tieData.landTie.meterTemp = temfield.value;
    } else { tieData.landTie.meterTemp = -999 };
    statmessage.textContent = 'land tie metadata saved'
})

// handle reading land meter calibration file
const btnCalFile = document.getElementById('btnSelectCalFile');
btnCalFile.addEventListener('click', async () => {
    await window.electronAPI.openLandCal();
});
window.electronAPI.returnLandCal((caltable) => {
    tieData.landTie.brackets = caltable[0];
    tieData.landTie.mgalVals = caltable[1];
    tieData.landTie.factors = caltable[2];
    let pathbits = caltable[3].split('/');
    let calfile = pathbits[pathbits.length - 1];
    statmessage.textContent = `${calfile} table read`
    tieData.landTie.meterFile = caltable[3];
    tieData.landTie.meter = calfile.split('.')[0];
})

// handle save/timestampe for each of the land tie values
document.getElementById('btnlta1').addEventListener('click', async () => {
    const countsInput1 = parseFloat(document.getElementById('lta1').value);
    if (!isNaN(countsInput1)) {
        tieData.landTie.a1.updateHeight(countsInput1);
        a1Entered.textContent = `${tieData.landTie.a1.time.toISOString()}`;
    } else {
        console.error('Invalid number input');
    }
});
document.getElementById('btnlta2').addEventListener('click', async () => {
    const countsInput2 = parseFloat(document.getElementById('lta2').value);
    if (!isNaN(countsInput2)) {
        tieData.landTie.a2.updateHeight(countsInput2);
        a2Entered.textContent = `${tieData.landTie.a2.time.toISOString()}`;
    } else {
        console.error('Invalid number input');
    }
});
document.getElementById('btnlta3').addEventListener('click', async () => {
    const countsInput3 = parseFloat(document.getElementById('lta3').value);
    if (!isNaN(countsInput3)) {
        tieData.landTie.a3.updateHeight(countsInput3);
        a3Entered.textContent = `${tieData.landTie.a3.time.toISOString()}`;
    } else {
        console.error('Invalid number input');
    }
});
document.getElementById('btnltb1').addEventListener('click', async () => {
    const countsInput4 = parseFloat(document.getElementById('ltb1').value);
    if (!isNaN(countsInput4)) {
        tieData.landTie.b1.updateHeight(countsInput4);
        b1Entered.textContent = `${tieData.landTie.b1.time.toISOString()}`;
    } else {
        console.error('Invalid number input');
    }
});
document.getElementById('btnltb2').addEventListener('click', async () => {
    const countsInput5 = parseFloat(document.getElementById('ltb2').value);
    if (!isNaN(countsInput5)) {
        tieData.landTie.b2.updateHeight(countsInput5);
        b2Entered.textContent = `${tieData.landTie.b2.time.toISOString()}`;
    } else {
        console.error('Invalid number input');
    }
});
document.getElementById('btnltb3').addEventListener('click', async () => {
    const countsInput6 = parseFloat(document.getElementById('ltb3').value);
    if (!isNaN(countsInput6)) {
        tieData.landTie.b3.updateHeight(countsInput6);
        b3Entered.textContent = `${tieData.landTie.b3.time.toISOString()}`;
    } else {
        console.error('Invalid number input');
    }
});
document.getElementById('btnltc1').addEventListener('click', async () => {
    const countsInput7 = parseFloat(document.getElementById('ltc1').value);
    if (!isNaN(countsInput7)) {
        tieData.landTie.c1.updateHeight(countsInput7);
        c1Entered.textContent = `${tieData.landTie.c1.time.toISOString()}`;
    } else {
        console.error('Invalid number input');
    }
});
document.getElementById('btnltc2').addEventListener('click', async () => {
    const countsInput8 = parseFloat(document.getElementById('ltc2').value);
    if (!isNaN(countsInput8)) {
        tieData.landTie.c2.updateHeight(countsInput8);
        c2Entered.textContent = `${tieData.landTie.c2.time.toISOString()}`;
    } else {
        console.error('Invalid number input');
    }
});
document.getElementById('btnltc3').addEventListener('click', async () => {
    const countsInput9 = parseFloat(document.getElementById('ltc3').value);
    if (!isNaN(countsInput9)) {
        tieData.landTie.c3.updateHeight(countsInput9);
        c3Entered.textContent = `${tieData.landTie.c3.time.toISOString()}`;
    } else {
        console.error('Invalid number input');
    }
});

// handle land tie calibration and calculation
document.getElementById('btnDoLandTie').addEventListener('click', async () => {
    tieData.landTie.calibrateCounts();
    // check if we have some mgal values available, average a/b/c sets
    let mgal_avgs = [];
    let time_avgs = [];

    let point_sets = [[tieData.landTie.a1,tieData.landTie.a2,tieData.landTie.a3],[tieData.landTie.b1,tieData.landTie.b2,tieData.landTie.b3],[tieData.landTie.c1,tieData.landTie.c2,tieData.landTie.c3]];
    point_sets.forEach(points => {
        let mgal_sum = 0;
        let t_sum = 0;
        let good_vals = 0;
        points.forEach(pt => {
            if (pt.mgal !== null && pt.mgal !== -999) { // something was entered and could be calibrated
                mgal_sum += pt.mgal;
                t_sum += pt.time.getTime();
                good_vals += 1
            }
        });
        if (good_vals > 0) {
        mgal_avgs.push(mgal_sum/good_vals);
        time_avgs.push(t_sum/good_vals);
        }
    });
    if (mgal_avgs.length === 3) {  // need to have values for land/ship/land
        const AA_timedelta = time_avgs[2] - time_avgs[0];
        const AB_timedelta = time_avgs[1] - time_avgs[0];
        const drift = (mgal_avgs[2] - mgal_avgs[0])/AA_timedelta;

        const dc_avg_mgals_B = mgal_avgs[1] - AB_timedelta*drift;
        const gdiff = mgal_avgs[0] - dc_avg_mgals_B;
        if (tieData.stationData.stationGravity > 0){
            const land_tie_value = tieData.stationData.stationGravity + gdiff;
            tieData.landTie.landTieValue = land_tie_value;
            tieData.landTie.drift = drift;
            document.getElementById("landTieStat").textContent = `Land tie: ${tieData.landTie.landTieValue}`;

            tieData.landTie.dtAA = AA_timedelta;
            tieData.landTie.dtAB = AB_timedelta;
            tieData.landTie.mgalAvgs = mgal_avgs;
            tieData.landTie.timeAvgs = time_avgs;
            tieData.landTie.dcAvgMgalsB = dc_avg_mgals_B;

        }
    } else {
        document.getElementById("landTieStat").textContent = "not enough counts entries and/or calibration failed"
    }
});

////////////////////////////////////////////////////////////////////////
// reading and writing ties in various formats
////////////////////////////////////////////////////////////////////////

function createDataObj(tieData) {
    const ltime1 = new Date(tieData.landTie.timeAvgs[0]);
    const ltime2 = new Date(tieData.landTie.timeAvgs[1]);
    const ltime3 = new Date(tieData.landTie.timeAvgs[2]);
    const tieDataObj = {
        shipName: tieData.ship,
        personnel: tieData.personnel,
        stationName: tieData.stationData.station,
        stationNumber: tieData.stationData.stationNumber,
        stationGrav: tieData.stationData.stationGravity,
        htime1: tieData.h1.time.toISOString(),
        htime2: tieData.h2.time.toISOString(),
        htime3: tieData.h3.time.toISOString(),
        height1: tieData.h1.height.toFixed(2),
        height2: tieData.h2.height.toFixed(2),
        height3: tieData.h3.height.toFixed(2),
        dgsGrav: tieData.avgMeterGrav,
        avgHeight: tieData.avgHeight,
        waterGrav: tieData.waterGrav,
        bias: tieData.bias,

        isLandTie: tieData.isLandTie,
        landMeter: tieData.landTie.meter,
        calPath: tieData.landTie.meterFile,
        meterTemp: tieData.landTie.meterTemp,
        shipLat: tieData.landTie.shipLat,
        shipLon: tieData.landTie.shipLon,
        shipElev: tieData.landTie.shipElev,
        ltime1: ltime1.toISOString(),
        ltime2: ltime2.toISOString(),
        ltime3: ltime3.toISOString(),
        lgrav1: tieData.landTie.mgalAvgs[0],
        lgrav2: tieData.landTie.mgalAvgs[1],
        lgrav3: tieData.landTie.mgalAvgs[2],
        dtAB: tieData.landTie.dtAB,
        dtAA: tieData.landTie.dtAB,
        landTieValue: tieData.landTie.landTieValue,
        drift: tieData.landTie.drift,
        dc_avg_mgals_B: tieData.landTie.dcAvgMgalsB,

        // all of this is for toml files, where we want the underlying land tie info not just averages
        a1t: tieData.landTie.a1.time.toISOString(),
        a1h: tieData.landTie.a1.height,
        a1m: tieData.landTie.a1.mgal,
        a2t: tieData.landTie.a2.time.toISOString(),
        a2h: tieData.landTie.a2.height,
        a2m: tieData.landTie.a2.mgal,
        a3t: tieData.landTie.a3.time.toISOString(),
        a3h: tieData.landTie.a3.height,
        a3m: tieData.landTie.a3.mgal,

        b1t: tieData.landTie.b1.time.toISOString(),
        b1h: tieData.landTie.b1.height,
        b1m: tieData.landTie.b1.mgal,
        b2t: tieData.landTie.b2.time.toISOString(),
        b2h: tieData.landTie.b2.height,
        b2m: tieData.landTie.b2.mgal,
        b3t: tieData.landTie.b3.time.toISOString(),
        b3h: tieData.landTie.b3.height,
        b3m: tieData.landTie.b3.mgal,

        c1t: tieData.landTie.c1.time.toISOString(),
        c1h: tieData.landTie.c1.height,
        c1m: tieData.landTie.c1.mgal,
        c2t: tieData.landTie.c2.time.toISOString(),
        c2h: tieData.landTie.c2.height,
        c2m: tieData.landTie.c2.mgal,
        c3t: tieData.landTie.c3.time.toISOString(),
        c3h: tieData.landTie.c3.height,
        c3m: tieData.landTie.c3.mgal,

    };
    return tieDataObj;
}
document.getElementById('btnOutputReport').addEventListener('click', () => {
  let tieDataObj = createDataObj(tieData);
  tieDataObj["writeTOML"] = false;  // txt report, not toml
  window.electronAPI.sendTieToMain(tieDataObj);
});

document.getElementById('btnSaveTie').addEventListener('click', () => {
  let tieDataObj = createDataObj(tieData);
  tieDataObj["writeTOML"] = true;  // txt report, not toml
  window.electronAPI.sendTieToMain(tieDataObj);
});


// re-read a toml file
const btnReadToml = document.getElementById('btnLoadSavedTie');
btnLoadSavedTie.addEventListener('click', async () => {
    await window.electronAPI.openReadTOML();
});
window.electronAPI.returnToml((stuff) => {
    // replace info in tieData construct
    // general meta
    tieData.ship = stuff['ship_name'];
    tieData.personnel = stuff['personnel'];
    // station
    tieData.stationData.station = stuff['station_name'];
    tieData.stationData.stationGravity = stuff['station_gravity']
    tieData.stationData.stationDB.forEach(element => {
        if (element["NAME"] === tieData.stationData.station){
            tieData.stationData.stationNumber = element["NUMBER"];
        }
    });
    // actual tie, such as it is (DGS data is not reloaded)
    tieData.bias = stuff['bias'];
    tieData.avgHeight = stuff['avg_height'];
    tieData.waterGrav = stuff['water_grav'];
    tieData.avgMeterGrav = stuff['avg_dgs_grav'];
    tieData.h1.height = stuff['h1h'];
    tieData.h1.time = new Date(stuff['h1t']);  // json passes msec? anyway this works
    tieData.h2.height = stuff['h2h'];
    tieData.h2.time = new Date(stuff['h2t']);
    tieData.h3.height = stuff['h3h'];
    tieData.h3.time = new Date(stuff['h3t']);
    // land tie stuff (calibration file is not reloaded)
    tieData.isLandTie = stuff['landtie'];
    tieData.landTie.meter = stuff['meter'];
    tieData.landTie.meterFile = stuff['cal_file_path'];
    tieData.landTie.shipLon = stuff['ship_lon'];
    tieData.landTie.shipLat = stuff['ship_lat'];
    tieData.landTie.shipElev = stuff['ship_elev'];
    tieData.landTie.meterTemp = stuff['meter_temp'];
    tieData.landTie.landTieValue = stuff['land_tie_value'];
    tieData.landTie.drift = stuff['drift'];
    tieData.landTie.a1.height = stuff['a1c'];
    tieData.landTie.a2.height = stuff['a2c'];
    tieData.landTie.a3.height = stuff['a3c'];
    tieData.landTie.b1.height = stuff['b1c'];
    tieData.landTie.b2.height = stuff['b2c'];
    tieData.landTie.b3.height = stuff['b3c'];
    tieData.landTie.c1.height = stuff['c1c'];
    tieData.landTie.c2.height = stuff['c2c'];
    tieData.landTie.c3.height = stuff['c3c'];
    tieData.landTie.a1.time = new Date(stuff['a1t']);
    tieData.landTie.a2.time = new Date(stuff['a2t']);
    tieData.landTie.a3.time = new Date(stuff['a3t']);
    tieData.landTie.b1.time = new Date(stuff['b1t']);
    tieData.landTie.b2.time = new Date(stuff['b2t']);
    tieData.landTie.b3.time = new Date(stuff['b3t']);
    tieData.landTie.c1.time = new Date(stuff['c1t']);
    tieData.landTie.c2.time = new Date(stuff['c2t']);
    tieData.landTie.c3.time = new Date(stuff['c3t']);
    tieData.landTie.a1.mgal = stuff['a1m'];
    tieData.landTie.a2.mgal = stuff['a2m'];
    tieData.landTie.a3.mgal = stuff['a3m'];
    tieData.landTie.b1.mgal = stuff['b1m'];
    tieData.landTie.b2.mgal = stuff['b2m'];
    tieData.landTie.b3.mgal = stuff['b3m'];
    tieData.landTie.c1.mgal = stuff['c1m'];
    tieData.landTie.c2.mgal = stuff['c2m'];
    tieData.landTie.c3.mgal = stuff['c3m'];
    tieData.landTie.mgalAvgs = [stuff['aam_avg'],stuff['bbm_avg'],stuff['ccm_avg']];
    tieData.landTie.timeAvgs = [new Date(stuff['aat_avg']),new Date(stuff['bbt_avg']),new Date(stuff['cct_avg'])];
    tieData.landTie.dtAB = tieData.landTie.timeAvgs[1] - tieData.landTie.timeAvgs[0];
    tieData.landTie.dtAA = tieData.landTie.timeAvgs[2] - tieData.landTie.timeAvgs[0];
    tieData.landTie.dcAvgMgalsB = tieData.landTie.mgalAvgs[1] - tieData.landTie.dtAB*tieData.landTie.drift;

    // put info back in the GUI window, in text and in inputs if possible
    if (tieData.ship !== 'Choose Ship'){ 
        selectedOption.textContent = `Ship: ${tieData.ship}`;
        document.getElementById('shipDropdown').value = tieData.ship.trim();
    }
    if (tieData.stationData.station !== 'Choose Station'){
        selectedStation.textContent = `Station: ${tieData.stationData.station}`;
        document.getElementById('stationDropdown').value = tieData.stationData.station.trim();
    }
    if (tieData.stationData.stationGravity !== -999) {
        stationGravText.textContent = `Gravity: ${tieData.stationData.stationGravity}`;
        gravOverride.value = tieData.stationData.stationGravity;
    }

    savedPerson.textContent = `Person: ${tieData.personnel}`;
    document.getElementById('personField').value = tieData.personnel;
    if (tieData.bias !== null) {
        document.getElementById("biasCalcValue").textContent = `Bias: ${tieData.bias}`;
    }
    if (tieData.landTie.landTieValue !== null) {
        document.getElementById("landTieStat").textContent = `Land tie: ${tieData.landTie.landTieValue}`;
    }

    if (tieData.h1.height !== -999){
        height1Entered.textContent = `${tieData.h1.time.toISOString()}`;
        document.getElementById('heightField1').value = tieData.h1.height;
    }
    if (tieData.h2.height !== -999){
        height2Entered.textContent = `${tieData.h2.time.toISOString()}`;
        document.getElementById('heightField2').value = tieData.h2.height;
    }
    if (tieData.h3.height !== -999){
        height3Entered.textContent = `${tieData.h3.time.toISOString()}`;
        document.getElementById('heightField3').value = tieData.h3.height;
    }

    toggleSwitch.checked = tieData.isLandTie;
    toggleStateDisplay.textContent = tieData.isLandTie ? 'ON' : 'OFF';
    if (toggleSwitch.checked){
        [lta1,lta2,lta3,ltb1,ltb2,ltb3,ltc1,ltc2,ltc3,btnlta1,btnlta2,btnlta3,btnltb1,btnltb2,btnltb3,btnltc1,btnltc2,btnltc3,shipLon,shipLat,shipElev,shipTemp,saveLTmeta,btnSelectCalFile,btnDoLandTie].forEach(thing => {
            thing.disabled = false;
        })
    } else {
        [lta1,lta2,lta3,ltb1,ltb2,ltb3,ltc1,ltc2,ltc3,btnlta1,btnlta2,btnlta3,btnltb1,btnltb2,btnltb3,btnltc1,btnltc2,btnltc3,shipLon,shipLat,shipElev,shipTemp,saveLTmeta,btnSelectCalFile,btnDoLandTie].forEach(thing => {
            thing.disabled = true;
        })
    }

    if (tieData.landTie.a1.height !== -999){
        a1Entered.textContent = `${tieData.landTie.a1.time.toISOString()}`;
        document.getElementById('lta1').value = tieData.landTie.a1.height;
    }
    if (tieData.landTie.a2.height !== -999){
        a2Entered.textContent = `${tieData.landTie.a2.time.toISOString()}`;
        document.getElementById('lta2').value = tieData.landTie.a2.height;
    }
    if (tieData.landTie.a3.height !== -999){
        a3Entered.textContent = `${tieData.landTie.a3.time.toISOString()}`;
        document.getElementById('lta3').value = tieData.landTie.a3.height;
    }
    if (tieData.landTie.b1.height !== -999){
        b1Entered.textContent = `${tieData.landTie.b1.time.toISOString()}`;
        document.getElementById('ltb1').value = tieData.landTie.b1.height;
    }
    if (tieData.landTie.b2.height !== -999){
        b2Entered.textContent = `${tieData.landTie.b2.time.toISOString()}`;
        document.getElementById('ltb2').value = tieData.landTie.b2.height;
    }
    if (tieData.landTie.b3.height !== -999){
        b3Entered.textContent = `${tieData.landTie.b3.time.toISOString()}`;
        document.getElementById('ltb3').value = tieData.landTie.b3.height;
    }
    if (tieData.landTie.c1.height !== -999){
        c1Entered.textContent = `${tieData.landTie.c1.time.toISOString()}`;
        document.getElementById('ltc1').value = tieData.landTie.c1.height;
    }
    if (tieData.landTie.c2.height !== -999){
        c2Entered.textContent = `${tieData.landTie.c2.time.toISOString()}`;
        document.getElementById('ltc2').value = tieData.landTie.c2.height;
    }
    if (tieData.landTie.a3.height !== -999){
        c3Entered.textContent = `${tieData.landTie.a3.time.toISOString()}`;
        document.getElementById('ltc3').value = tieData.landTie.c3.height;
    }
    if (tieData.landTie.shipLon !== null) {
        document.getElementById('shipLon').value = tieData.landTie.shipLon;
    }
    if (tieData.landTie.shipLat !== null) {
        document.getElementById('shipLat').value = tieData.landTie.shipLat;
    }
    if (tieData.landTie.shipElev !== null) {
        document.getElementById('shipElev').value = tieData.landTie.shipElev;
    }
    if (tieData.landTie.shipTemp !== null) {
        document.getElementById('shipTemp').value = tieData.landTie.meterTemp;
    }
})

