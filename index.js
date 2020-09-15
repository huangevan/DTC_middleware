//const plcip = "192.168.1.225";
const plc;
const plcport = 502;
// create an empty modbus client
const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();
const bodyParser = require('body-parser');
const express = require('express')
const delay = require("delay");
const request = require('request');
const axios = require('axios');

const addressMode = [1040, 1041, 1042] //dynamic, hazard, regular
const addressCounter = [51, 501, 502, 503];
const addressCounterReg = 505;

const app = express()
const port = 3000
const totalLanes = 4;
const addrCoilLight = [
  ['0000', '0001', '0002'], //red yellow green
  ['0003', '0004', '0005'],
  ['0006', '0024', '0025'],
  ['0026', '0027', '0028']
]

var statusCoilLight = [
  [false, false, false], //red yellow green
  [false, false, false],
  [false, false, false],
  [false, false, false]
]
var statusYellowLight = [false, false, false, false] // used to compare with previous state
var statusGreenLight = [false, false, false, false] // used to compare with previous state

var modeStatus = [true, false, false] // dynamic - regular - hazard ===value is stored here when mode is hit from backend
var previousModeStatus

app.use(express.json())
var address = require('address');
var myip = address.ip();
var time = [0, 0, 0]

//========DEFAULT TIME VARIABLE ========//
var timerDensity = [10, 30, 50] // individual time set for low-med-high congestion

//======== LANE CONGESTION =========//
var laneDensity = [1, 1, 1, 1] // lane density where 0:low, 1:med, 2:high
var greenLightValue = [0, 0, 0, 0] //density values that has been swapped with time variable

var greenLightCounter = [0, 0, 0, 0]
var redLightCounter = [0, 0, 0, 0]
var yellowLightCounter = [0, 0, 0, 0]
connectPLC();

app.get('/currentstatus', (req, res) => { //reads whether dynamic mode is on or off
  respReadPLC(addressMode[0], res);
  //res.send(readPLC(1013))
  console.log('Done on http');
})

// app.get('/hazardstatus', (req, res) => { //reads whether hazard mode is on or off
//   respReadPLC(addressMode[1], res);
//   console.log('Done on http');
// })
//
// app.get('/regularstatus', (req, res) => { //reads whether regular mode is on or off
//   respReadPLC(addressMode[2], res);
//   console.log('Done on http');
// })

function respReadPLC(addr, res) { //checks for status of mode wether on or not
  client.readCoils(addr,3, function(err, data) {
    console.log(data);
    res.send(data.data);
  });
}

//=== GET TRAFFIC CONDITION AND COUNTDOWN ===//
app.get('/trafficstatus', (req, res) => {
  getAllData(res);
})
function getAllData(res) {
   client.readHoldingRegisters(addressCounter[0], 8, function(err, data) {
  res.send(data.data);
    console.log(data.data);
  });
}

//==== UPDATE PRESET TIME ===//
app.post('/updatepreset', (req, res) => {
  updatePreset(req.body.level, req.body.time)
  console.log(timerDensity);
  res.sendStatus(200);
});

function updatePreset(level, time) {
  timerDensity[level - 1] = time;
}

//=== SWITCH MODES ===//
//switch to dynamic mode
app.get('/dynamic', (req, res) => {
  modeStatus = [true, false, false];
  enableMode(1013, res);
})
//switch to hazard mode
app.get('/hazard', (req, res) => {
  modeStatus = [false, false, true];
  enableMode(1014, res);
})
//switch to regular mode
app.get('/regular', (req, res) => {
  modeStatus = [false, true, false];
  enableMode(1015, res);
})

function enableMode(addr, res) {
  client.writeCoil(addr, 1);
  setTimeout(function() {
    client.writeCoil(addr, 0);
    res.send('enabled');
  }, 1000);
}




app.listen(port, () => {
  console.log(`Modbus Middleware listening at http://${myip}:${port}`)
})

function connectPLC() {
  // open connection to a tcp line
  client.connectTCP(plcip, {
    port: plcport
  });
  console.log(`PLC ${plcip} : ${plcport}  Connected!`)
  client.setID(2);
}

//=====================//
// READ CURRENT LIGHTS //
//=====================//
function readLoopCoilLightStatus(i, j, im, jm, functionx) {
  addr = addrCoilLight[i][j];
  client.readCoils(addr, 1, function(err, data) {
    //console.log(err);
    if (err) {
      readLoopCoilLightStatus(i, j, im, jm, functionx);
      return;
    }
    statusCoilLight[i][j] = data.data[0];
    if (j < (jm - 1)) {
      j++;
      readLoopCoilLightStatus(i, j, im, jm, functionx);
    } else {
      if (j == (jm - 1)) {
        if (i < (im - 1)) {
          i++;
          j = 0;
          readLoopCoilLightStatus(i, j, im, jm, functionx);
        } else {
          functionx();
        }
      }
    }
  })
}

function showStatusCoilLight() {
  obtainCongestion();
  updatePLCTimer();
  console.log('============================');
  console.log('traffic light status');
  console.log(statusCoilLight);
  console.log('density status');
  console.log(laneDensity);

}

//====================//
// GET TRAFFIC STATUS // during yellow light
//====================//
function obtainCongestion() {

  if (statusCoilLight[3][1] == true) { // if yellow light in lane4 is on
    client.writeCoil(1006, 1); // send heartbeat to PLC
    setTimeout(function() {
      client.writeCoil(1006, 0);
    }, 500);

    if (statusCoilLight[3][1] !== statusYellowLight[3]) { // and state of yellow light is originaly off
      axios.get('http://13.229.203.154/dtc/1') //obtain traffic for lane 1
        .then(response => {
          laneDensity[0] = (response.data.density_level); //parse and store that shit
          //console.log('lane1 data obtained');
        })
        .catch(error => {
          console.log(error);
        });
      statusYellowLight = [false, false, false, true]
    }
  } else if (statusCoilLight[0][1] == true) { //if yellow light in lane 1 is on
    if (statusCoilLight[0][1] !== statusYellowLight[0]) { //and state of yellow light is originlly off
      axios.get('http://13.229.203.154/dtc/2') //obtain traffic for lane 2
        .then(response => {
          laneDensity[1] = (response.data.density_level);
          //console.log('lane2 data obtained');
        })
        .catch(error => {
          console.log(error);
        });
      statusYellowLight = [true, false, false, false]
    }
  } else if (statusCoilLight[1][1] == true) { //lane3
    if (statusCoilLight[1][1] !== statusYellowLight[1]) {
      axios.get('http://13.229.203.154/dtc/3')
        .then(response => {
          laneDensity[2] = (response.data.density_level);
          //console.log('lane3 data obtained');
        })
        .catch(error => {
          console.log(error);
        });
      statusYellowLight = [false, true, false, false]
    }
  } else if (statusCoilLight[2][1] == true) { //lane4
    if (statusCoilLight[2][1] !== statusYellowLight[2]) {
      axios.get('http://13.229.203.154/dtc/4')
        .then(response => {
          laneDensity[3] = (response.data.density_level);
          //console.log('lane4 data obtained');
        })
        .catch(error => {
          console.log(error);
        });
      statusYellowLight = [false, false, true, false]
    }
  }
}

//=================//
// UPDATE PLC TIME // when green light start
//=================//
function updatePLCTimer() {
  


  if (statusCoilLight[0][2] == true) { // if green light in lane 1 is on
    if (statusCoilLight[0][2] !== statusGreenLight[0]) { // checks if green light
      client.writeRegister(0002, timerDensity[laneDensity[0]]); // update timer value
      //console.log('lane1 data updated');
      statusGreenLight = [true, false, false, false]; //
    }
  } else if (statusCoilLight[1][2] == true) {

    if (statusCoilLight[1][2] !== statusGreenLight[1]) {
      client.writeRegister(0003, timerDensity[laneDensity[1]]);
      //console.log('lane2 data updated');
      statusGreenLight = [false, true, false, false];
    }
  } else if (statusCoilLight[2][2] == true) {
    if (statusCoilLight[2][2] !== statusGreenLight[2]) {
      client.writeRegister(0004, timerDensity[laneDensity[2]]);
      //console.log('lane3 data updated');
      statusGreenLight = [false, false, true, false];
    }

  } else if (statusCoilLight[3][2] == true) {
    if (statusCoilLight[3][2] !== statusGreenLight[3]) {
      client.writeRegister(0005, timerDensity[laneDensity[3]]);
      //console.log('lane4 data updated');
      statusGreenLight = [false, false, false, true];
    }
  }
}



setInterval(function() {
  readLoopCoilLightStatus(0, 0, 4, 3, showStatusCoilLight);
}, 1000);
