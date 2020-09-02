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
const addressCounter1 = 500;
const addressCounter2 = 501;
const addressCounter3 = 502;
const addressCounter4 = 503;
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
var statusYellowLight = [false, false, false, false]
var statusGreenLight = [false, false, false, false]


app.use(express.json())
var address = require('address');
var myip = address.ip();
var a = 0;
var time = [0,0,0]

//========DEFAULT TIME VARIABLE ========//
var timerDensity = [10, 30, 50] // individual time set for low-med-high congestion

//======== LANE CONGESTION =========//
var laneDensity = [1, 1, 1, 1] // lane density where 0:low, 1:med, 2:high
var greenLightValue = [0, 0, 0, 0] //density values that has been swapped with time variable
var greenLightCounter = [0, 0, 0, 0]
connectPLC();


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
  respReadPLC(1018, res);
  console.log('Done on http');
})

app.get('/trafficstatus', (req, res) => {
  readCounters(addressCounterReg, res);
  console.log('Done on http');
})

function readCounters(addr, res){
client.readInputRegisters(addr, 1, function(err, data){
console.log(data.data);
res.send(data.data);
});
}

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


//==============//
// DYNAMIC MODE //
//==============//
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

//=============//
// HAZARD MODE //
//=============//
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

//==============//
// REGULAR MODE //
//==============//
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
  obtainCongestion();
  updatePLCTimer();
  console.log('============================');
  console.log('traffic light status');
  console.log(statusCoilLight);
  console.log('density status');
  console.log(laneDensity);
  console.log('green light counter');
  console.log(greenLightCounter);

  obtainCounterStatus(addressCounterReg, addressCounter1, addressCounter2, addressCounter3, addressCounter4);
}

function obtainCounterStatus(addrreg, addrdyn1, addrdyn2, addrdyn3, addrdyn4){
  client.readInputRegisters(addrreg, 1, function(err, datar){
  //console.log(datar.data);

  });
  // client.readInputRegisters(addrdyn1, 1, function(err, datad1){
  // //console.log(datad1.data);
  // greenLightCounter[0] = datad1.data ;
  // });
  // client.readInputRegisters(addrdyn2, 1, function(err, datad2){
  // //console.log(datad2.data);
  // greenLightCounter[1] = datad2.data ;
  // });
  // client.readInputRegisters(addrdyn3, 1, function(err, datad3){
  // //console.log(datad3.data);
  // greenLightCounter[2] = datad3.data ;
  // });
  // client.readInputRegisters(addrdyn4, 1, function(err, datad4){
  // //console.log(datad4.data);
  // greenLightCounter[3] = datad4.data ;
  // });
}

//====================//
// GET TRAFFIC STATUS // during yellow light
//====================//
function obtainCongestion() {

  if (statusCoilLight[3][1] == true) { // if yellow light in lane4 is on
    client.writeCoil(1006, 1);
    setTimeout(function() {
      client.writeCoil(1006, 0);
    }, 500);
    if (statusCoilLight[3][1] !== statusYellowLight[3]) { // and state of yellow light is originaly off
      axios.get('https://jsonplaceholder.typicode.com/todos/1') //obtain traffic for lane 1
        .then(response => {
          laneDensity[0] = (response.data.id); //parse and store that shit
          //console.log('lane1 data obtained');
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
      axios.get('https://jsonplaceholder.typicode.com/todos/2') //obtain traffic for lane 2
        .then(response => {
          laneDensity[1] = (response.data.id);
          //console.log('lane2 data obtained');
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
      axios.get('https://jsonplaceholder.typicode.com/todos/1')
        .then(response => {
          laneDensity[2] = (response.data.id);
          //console.log('lane3 data obtained');
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
      axios.get('https://jsonplaceholder.typicode.com/todos/2')
        .then(response => {
          laneDensity[3] = (response.data.id);
          //console.log('lane4 data obtained');
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
    client.readInputRegisters(addressCounter1, 1, function(err, datad1){
    greenLightCounter[0] = (timerDensity[laneDensity[0]]-(datad1.data)-1) ;
    });
    if (statusCoilLight[0][2] !== statusGreenLight[0]) {
      client.writeRegister(0002, timerDensity[laneDensity[0]]);
      console.log('lane1 data updated');
      statusGreenLight = [true, false, false, false];
    }
  } else if (statusCoilLight[1][2] == true) {
    client.readInputRegisters(addressCounter2, 1, function(err, datad2){
    greenLightCounter[1] = (timerDensity[laneDensity[1]]-(datad2.data)-1) ;
    });
    if (statusCoilLight[1][2] !== statusGreenLight[1]) {
      client.writeRegister(0003, timerDensity[laneDensity[1]]);
      console.log('lane2 data updated');
      statusGreenLight = [false, true, false, false];
    }
  } else if (statusCoilLight[2][2] == true) {
    client.readInputRegisters(addressCounter3, 1, function(err, datad3){
    greenLightCounter[2] = (timerDensity[laneDensity[2]]-(datad3.data)-1) ;
    });
    if (statusCoilLight[2][2] !== statusGreenLight[2]) {
      client.writeRegister(0004, timerDensity[laneDensity[2]]);
      console.log('lane3 data updated');
      statusGreenLight = [false, false, true, false];
    }

  } else if (statusCoilLight[3][2] == true) {
    client.readInputRegisters(addressCounter4, 1, function(err, datad4){
    greenLightCounter[3] = (timerDensity[laneDensity[3]]-(datad4.data)-1) ;
    });
    if (statusCoilLight[3][2] !== statusGreenLight[3]) {
      client.writeRegister(0005, timerDensity[laneDensity[3]]);
      console.log('lane4 data updated');
      statusGreenLight = [false, false, false, true];
    }
  }else{
    greenLightCounter = [0,0,0,0]
  }
}



setInterval(function() {
  readLoopCoilLightStatus(0, 0, 4, 3, showStatusCoilLight);
}, 1000);
