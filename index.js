const plcip = "192.168.1.225";
const plcport = 502;
// create an empty modbus client
const ModbusRTU = require("modbus-serial");
const client = new ModbusRTU();
const bodyParser = require('body-parser');
const express = require('express')
const delay = require("delay");
const request = require('request');
const axios = require('axios');

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
var statusYellowLight = [false, false, false, false]
var statusGreenLight = [false, false, false, false]

app.use(express.json())
var address = require('address');
var myip = address.ip();
var a = 0;
var time = [0,0,0]

//========DEFAULT TIME VARIABLE ========//
var timerDensity = [10, 30, 50]

//======== LANE CONGESTION =========//
var laneDensity = [2, 2, 2, 2]

connectPLC();
//readPLC(1013);


app.get('/dynamicstatus', (req, res) => { //reads whether dynamic mode is on or off
  respReadPLC(1013, res);
  //res.send(readPLC(1013))
  console.log('Done on http');
})

app.get('/hazardstatus', (req, res) => { //reads whether hazard mode is on or off
  respReadPLC(1014, res);
  console.log('Done on http');
})

app.get('/regularstatus', (req, res) => { //reads whether regular mode is on or off
  respReadPLC(1015, res);
  console.log('Done on http');
})

function respReadPLC(addr, res) {
  // read the values of 10 registers starting at address 0
  // on device number 1. and log the values to the console.
  client.readHoldingRegisters(addr, 1, function(err, data) {
    console.log(data.data);
    res.send(data.data);
  });
}


//============================//
// RECEIVE LANE DENSITY BYPASS//
//============================//
app.post('/bypassdensity', (req, res) => {
  //lane4 = (JSON.parse(req.body.lane4));
  // if (typeof req.body.lane !== 'undefined') {
  //   lane4 = (JSON.parse(req.body.lane4));
  //   console.log('Ini lane 4');
  // }
  updateLaneDensity(req.body.lane, req.body.density)
  console.log(laneDensity);
  res.sendStatus(200);
});

function updateLaneDensity(lane, density) {
  laneDensity[lane - 1] = density;
}


//====================//
// UPDATE PRESET TIME //
//====================//
app.post('/updatepreset', (req, res) => {
  updatePreset(req.body.level, req.body.time)
  console.log(timerDensity);
  res.sendStatus(200);
});

function updatePreset(level, time) {
  timerDensity[level - 1] = time;
}


//=========//
// DYNAMIC //
//=========//
app.get('/dynamic', (req, res) => {
  enableDynamic(1013, res);
})

function enableDynamic(addr, res) {
  client.writeCoil(addr, 1);
  setTimeout(function() {
    client.writeCoil(addr, 0);
    res.send('enabled');
  }, 1000);
}

//========//
// HAZARD //
//========//
app.get('/hazard', (req, res) => {
  enableHazard(1014, res);
})

function enableHazard(addr, res) {
  client.writeCoil(addr, 1);
  setTimeout(function() {
    client.writeCoil(addr, 0);
    res.send('enabled');
  }, 1000);
}

//=========//
// REGULAR //
//=========//
app.get('/regular', (req, res) => {
  enableRegular(1015, res);
})

function enableRegular(addr, res) {
  client.writeCoil(addr, 1);
  setTimeout(function() {
    client.writeCoil(addr, 0);
    res.send('enabled');
  }, 1000);
}

app.get('/readDynamicPreset', (req, res) => {
  readDynamicPreset(0002, res);
})

app.listen(port, () => {
  console.log(`Modbus Middleware listening at http://${myip}:${port}`)
})


// app.get('/lightstatus', (req, res) => {
//   readLoopCoilLightStatus(0, 0, 4, 3, function() {
//     res.send(statusCoilLight);
//     //res.sendStatus(200);
//   });
// })

function connectPLC() {
  // open connection to a tcp line
  client.connectTCP(plcip, {
    port: plcport
  });
  console.log(`PLC ${plcip} : ${plcport}  Connected!`)
  client.setID(2);
}

function readPLC(addr) {
  // read the values of 10 registers starting at address 0
  // on device number 1. and log the values to the console.
  //setTimeout(function() {
  client.readHoldingRegisters(addr, 1, function(err, data) {
    console.log(data.data);
    return (data.data);
  });
  console.log('reading...');
  //}, 500);
}

//=====================//
// READ CURRENT LIGHTS //
//=====================//
function readLoopCoilLightStatus(i, j, im, jm, functionx) {
  addr = addrCoilLight[i][j];
  client.readCoils(addr, 1, function(err, data) {
    //console.log(err);
    if(err){
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
  console.log(statusCoilLight);
  console.log(laneDensity);
  obtainCongestion();
  updatePLCTimer();
}


//====================//
// GET TRAFFIC STATUS // during yellow light
//====================//
function obtainCongestion() {
  console.log(statusCoilLight);
  if (statusCoilLight[3][1] == true) { // if yellow light in lane4 is on
    client.writeCoil(1006, 1);
    setTimeout(function() {
      client.writeCoil(1006, 0);
    }, 500);
    if (statusCoilLight[3][1] !== statusYellowLight[3]) { // and state of yellow light is originaly off
      axios.get('http://13.229.203.154/dtc/1') //obtain traffic for lane 1
        .then(response => {
          laneDensity[0] = (response.data.density_level); //parse and store that shit
          console.log(laneDensity);
          console.log('lane1 data obtained');
        })
        .catch(error => {
          console.log(error);
        });

      statusYellowLight[0] = false;
      statusYellowLight[3] = true;
      statusYellowLight[1] = false;
      statusYellowLight[2] = false;
    }
  } else if (statusCoilLight[0][1] == true) { //if yellow light in lane 1 is on
    if (statusCoilLight[0][1] !== statusYellowLight[0]) { //and state of yellow light is originlly off
      axios.get('http://13.229.203.154/dtc/2') //obtain traffic for lane 2
        .then(response => {
          laneDensity[1] = (response.data.density_level);
          console.log(laneDensity);
          console.log('lane2 data obtained');
        })
        .catch(error => {
          console.log(error);
        });
      statusYellowLight[1] = false;
      statusYellowLight[0] = true;
      statusYellowLight[3] = false;
      statusYellowLight[2] = false;
    }
  } else if (statusCoilLight[1][1] == true) { //lane3
    if (statusCoilLight[1][1] !== statusYellowLight[1]) {
      axios.get('http://13.229.203.154/dtc/3')
        .then(response => {
          laneDensity[2] = (response.data.density_level);
          console.log(laneDensity);
          console.log('lane3 data obtained');
        })
        .catch(error => {
          console.log(error);
        });
      statusYellowLight[2] = false;
      statusYellowLight[0] = false;
      statusYellowLight[1] = true;
      statusYellowLight[3] = false;
    }
  } else if (statusCoilLight[2][1] == true) { //lane4
    if (statusCoilLight[2][1] !== statusYellowLight[2]) {
      axios.get('http://13.229.203.154/dtc/4')
        .then(response => {
          laneDensity[3] = (response.data.density_level);
          console.log(laneDensity);
          console.log('lane4 data obtained');
        })
        .catch(error => {
          console.log(error);
        });
      statusYellowLight[3] = false;
      statusYellowLight[0] = false;
      statusYellowLight[1] = false;
      statusYellowLight[2] = true;
    }
  }
}


//=================//
// UPDATE PLC TIME // when green light start
//=================//
function updatePLCTimer() {
  if (statusCoilLight[0][2] == true) { // if green light in lane 1 is on
    if (statusCoilLight[0][2] !== statusGreenLight[0]) {

      client.writeRegister(0002, timerDensity[laneDensity[0]]);
      console.log('lane1 data updated');
      statusGreenLight[0] = true;
      statusGreenLight[3] = false;
      statusGreenLight[1] = false;
      statusGreenLight[2] = false;
    }
  } else if (statusCoilLight[1][2] == true) {
    if (statusCoilLight[1][2] !== statusGreenLight[1]) {
      client.writeRegister(0003, timerDensity[laneDensity[1]]);
      console.log('lane2 data updated');
      statusGreenLight[0] = false;
      statusGreenLight[3] = false;
      statusGreenLight[1] = true;
      statusGreenLight[2] = false;
    }
  } else if (statusCoilLight[2][2] == true) {
    if (statusCoilLight[2][2] !== statusGreenLight[2]) {
      client.writeRegister(0004, timerDensity[laneDensity[2]]);
      console.log('lane3 data updated');
      statusGreenLight[0] = false;
      statusGreenLight[3] = false;
      statusGreenLight[1] = false;
      statusGreenLight[2] = true;
    }

  } else if (statusCoilLight[3][2] == true) {
    if (statusCoilLight[3][2] !== statusGreenLight[3]) {

      client.writeRegister(0005, timerDensity[laneDensity[3]]);
      console.log('lane4 data updated');
      statusGreenLight[0] = false;
      statusGreenLight[3] = true;
      statusGreenLight[1] = false;
      statusGreenLight[2] = false;
    }
  }
}



setInterval(function() {
  readLoopCoilLightStatus(0, 0, 4, 3, showStatusCoilLight);
}, 1000);


function readDynamicPreset(addr, res) {
  client.readHoldingRegisters(addr, 4, function(err, data) {
    res.send(data.data);
  });
}
