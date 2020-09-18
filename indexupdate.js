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

const addressMode = [1040, 1014, 1018] //dynamic, hazard, regular
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
var statusYellowLight = [false, false, false, false]
var statusGreenLight = [false, false, false, false]
let isPLCConnected = false
let isPLC1stConnect = false
let isPLCRead = false
let sbStatusMode = 1
let coilStatusMode = []
let allCountdownData = []

app.use(express.json())
var address = require('address');
const { parse } = require("path");
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
// connectPLC();
connectPLC_upd();


function connectPLC_upd() {
	client.connectTCP(plcip, {port:plcport})
	.then(function() {
		client.setID(2)
		client.setTimeout(5000)
		isPLC1stConnect = true
		sbStatusMode = 1
	})
	.then(function (){
		console.log(`PLC ${plcip} : ${plcport}  Connected!!!!`);
		isPLCConnected = true
	})
	.catch(function (e) {
		console.log("PLC not Connected. Try to Reconnecting ...")
		console.log(isPLC1stConnect)
		// console.log(e);
		isPLCConnected = false;
		connectPLC_upd()
	})
}


setInterval(function() {
	// readLoopCoilLightStatus(0, 0, 4, 3, showStatusCoilLight);
	if(isPLC1stConnect == true) {
		readAllPLCData()
	}

}, 1000);

app.get('/currentstatus', (req, res) => {
	res.send(coilStatusMode)
})

app.get('/trafficstatus', (req, res) => {
	res.send(allCountdownData)
})

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

//switch to dynamic mode
app.get('/dynamic', (req, res) => {
	// enableMode(1013, res);
	sbStatusMode = 1
	res.send('enabled dynamic');
})
//switch to hazard mode
app.get('/hazard', (req, res) => {
	// enableMode(1014, res);
	sbStatusMode = 2
	res.send('enabled hazard');
})
//switch to regular mode
app.get('/regular', (req, res) => {
	// enableMode(1015, res);
	sbStatusMode = 3
	res.send('enabled regular');
})

app.listen(port, () => {
	console.log(`Modbus Middleware listening at http://${myip}:${port}`)
})


//====================//
// GET TRAFFIC STATUS // during yellow light
//====================//
function obtainCongestion() {
	console.log('obtain congestion')
	if (statusCoilLight[3][1] == true) { // if yellow light in lane4 is on
		client.writeCoil(1006, 1); // send heatbeat to PLC
		setTimeout(function() {
			client.writeCoil(1006, 0);
		}, 500);
		if (statusCoilLight[3][1] !== statusYellowLight[3]) { // and state of yellow light is originaly off
			axios.get('http://192.168.1.153/dtc/1') //obtain traffic for lane 1
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
			axios.get('http://192.168.1.153/dtc/2') //obtain traffic for lane 2
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
			axios.get('http://192.168.1.153/dtc/3')
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
			axios.get('http://192.168.1.153/dtc/4')
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
	console.log('update plc timer')

	if (statusCoilLight[0][2] == true) { // if green light in lane 1 is on
		if (statusCoilLight[0][2] !== statusGreenLight[0]) {
			client.writeRegister(2, timerDensity[laneDensity[0]]); // update timer value
			//console.log('lane1 data updated');
			statusGreenLight = [true, false, false, false];
		}
	} else if (statusCoilLight[1][2] == true) {

		if (statusCoilLight[1][2] !== statusGreenLight[1]) {
			client.writeRegister(3, timerDensity[laneDensity[1]]);
			//console.log('lane2 data updated');
			statusGreenLight = [false, true, false, false];
		}
	} else if (statusCoilLight[2][2] == true) {
		if (statusCoilLight[2][2] !== statusGreenLight[2]) {
			client.writeRegister(4, timerDensity[laneDensity[2]]);
			//console.log('lane3 data updated');
			statusGreenLight = [false, false, true, false];
		}

	} else if (statusCoilLight[3][2] == true) {
		if (statusCoilLight[3][2] !== statusGreenLight[3]) {
			client.writeRegister(5, timerDensity[laneDensity[3]]);
			//console.log('lane4 data updated');
			statusGreenLight = [false, false, false, true];
		}
	}
}

function updateDTCMode() {
	if((statusCoilLight[3][1] == true)||(coilStatusMode[2] == true)) {
		setTimeout(function() {
			// console.log('change status : ', sbStatusMode)
			if(sbStatusMode == 1) {						//	Update change to dynamic Mode
				client.writeCoil(1013, 1)
				setTimeout(function() {
					client.writeCoil(1013, 0)
					sbStatusMode = 0
				}, 500)
				// console.log('dynamic mode')
			} else if(sbStatusMode == 3) {				//	Update change to hazard mode
				client.writeCoil(1015, 1)
				setTimeout(function() {
					client.writeCoil(1015, 0)
					sbStatusMode = 0
				}, 500)
				// console.log('regular mode')
			}
		}, 3000)
	}
	if(sbStatusMode == 2) {				//	Update change to regular mode
		client.writeCoil(1014, 1)
		setTimeout(function() {
			client.writeCoil(1014, 0)
			sbStatusMode = 0
		}, 500)
		// console.log('hazard mode')
	}
}

//==============================//
//	UPDATED FUNCTION 			//
//==============================//

//	Logging traffic light status and lane density status
function showStatusCoilLight_upd() {

	console.log('============================');
	console.log('traffic light status');
	console.log(statusCoilLight);
	console.log('density status');
	console.log(laneDensity);
	// console.log('countdown data');
	// console.log(allCountdownData)
}

//	Read and Write all PLC Data
//	-	Read Light Status
//	-	Read CurrentCountdown Value
//	-	Read Current DTC Mode at PLC
//	-	Write updated Dynamic Timer
//	-	Change mode of DTC after yellow at 4th Lane
//	-	Log Light Status and Lane Density

function readAllPLCData() {
	isPLCRead = true

	client.readHoldingRegisters(addressCounter[0], 8, function(err, data) {
		allCountdownData = data.data
		parseCountdownData()
		client.readCoils(1040, 3, function(err, data){
			coilStatusMode = data.data
			// console.log('coil ststus mode')
			// console.log(coilStatusMode)
			if(coilStatusMode[2] == false){
				obtainCongestion()
				updatePLCTimer()
			}
			updateDTCMode()
		})
		showStatusCoilLight_upd()
		isPLCRead = false
	})
}

function parseCountdownData() {
	if(allCountdownData[0] == 1) {
		statusCoilLight[0] = [true, false, false];
	} else if(allCountdownData[0] == 2) {
		statusCoilLight[0] = [false, true, false];
	} else if(allCountdownData[0] == 3) {
		statusCoilLight[0] = [false, false, true];
	}

	if(allCountdownData[2] == 1) {
		statusCoilLight[1] = [true, false, false];
	} else if(allCountdownData[2] == 2) {
		statusCoilLight[1] = [false, true, false];
	} else if(allCountdownData[2] == 3) {
		statusCoilLight[1] = [false, false, true];
	}

	if(allCountdownData[4] == 1) {
		statusCoilLight[2] = [true, false, false];
	} else if(allCountdownData[4] == 2) {
		statusCoilLight[2] = [false, true, false];
	} else if(allCountdownData[4] == 3) {
		statusCoilLight[2] = [false, false, true];
	}

	if(allCountdownData[6] == 1) {
		statusCoilLight[3] = [true, false, false];
	} else if(allCountdownData[6] == 2) {
		statusCoilLight[3] = [false, true, false];
	} else if(allCountdownData[6] == 3) {
		statusCoilLight[3] = [false, false, true];
	}
}


//
// //-----------------------------------------------------------------------
// //	UNUSED FUNCTION
// //-----------------------------------------------------------------------
// app.get('/dynamicstatus', (req, res) => { //reads whether dynamic mode is on or off
// 	// respReadPLC(addressMode[0], res);
// 	//res.send(readPLC(1013))
// 	res.send(coilStatusMode)
//
// 	console.log('Done on http');
// })
//
// app.get('/hazardstatus', (req, res) => { //reads whether hazard mode is on or off
// 	// respReadPLC(addressMode[1], res);
// 	console.log('Done on http');
// })
//
// app.get('/regularstatus', (req, res) => { //reads whether regular mode is on or off
// 	// respReadPLC(addressMode[2], res);
// 	console.log('Done on http');
// })
//
// function respReadPLC(addr, res) { //checks for status of mode wether on or not
// 	client.readCoils(addr,3, function(err, data) {
// 		console.log(data);
// 		res.send(data.data);
// 	});
// }
//
// //============================//
// // RECEIVE LANE DENSITY BYPASS//
// //============================//
// app.post('/bypassdensity', (req, res) => {
// 	//lane4 = (JSON.parse(req.body.lane4));
// 	// if (typeof req.body.lane !== 'undefined') {
// 	//   lane4 = (JSON.parse(req.body.lane4));
// 	//   console.log('Ini lane 4');
// 	// }
// 	updateLaneDensity(req.body.lane, req.body.density)
// 	console.log(laneDensity);
// 	res.sendStatus(200);
// });
//
// function updateLaneDensity(lane, density) {
// 	laneDensity[lane - 1] = density;
// }
// //-----------------------------------------------------------------------
// //	---------------------------------------------------------------------
// //-----------------------------------------------------------------------
// //-----------------------------------------------------------------------
// //	UNUSED FUNCTION
// //-----------------------------------------------------------------------
// function enableMode(addr, res) {
// 	client.writeCoil(addr, 1);
// 	setTimeout(function() {
// 		client.writeCoil(addr, 0);
// 		res.send('enabled');
// 	}, 1000);
// }
//
// function readPLC(addr) {
// 	// read the values of 10 registers starting at address 0
// 	// on device number 1. and log the values to the console.
// 	//setTimeout(function() {
// 	client.readHoldingRegisters(addr, 1, function(err, data) {
// 		console.log(data.data);
// 		return (data.data);
// 	});
// 	console.log('reading...');
// 	//}, 500);
// }
//
//
// //=====================//
// // READ CURRENT LIGHTS //
// //=====================//
// function readLoopCoilLightStatus(i, j, im, jm, functionx) {
// 	addr = addrCoilLight[i][j];
// 	client.readCoils(addr, 1, function(err, data) {
// 		//console.log(err);
// 		if (err) {
// 			readLoopCoilLightStatus(i, j, im, jm, functionx);
// 			return;
// 		}
// 		statusCoilLight[i][j] = data.data[0];
// 		if (j < (jm - 1)) {
// 			j++;
// 			readLoopCoilLightStatus(i, j, im, jm, functionx);
// 		} else {
// 			if (j == (jm - 1)) {
// 				if (i < (im - 1)) {
// 					i++;
// 					j = 0;
// 					readLoopCoilLightStatus(i, j, im, jm, functionx);
// 				} else {
// 					functionx();
// 				}
// 			}
// 		}
// 	})
// }
//
//
// function showStatusCoilLight() {
// 	obtainCongestion()
// 	updatePLCTimer()
// 	console.log('============================');
// 	console.log('traffic light status');
// 	console.log(statusCoilLight);
// 	console.log('density status');
// 	console.log(laneDensity);
//
// }
//
// function connectPLC() {
// 	// open connection to a tcp line
// 	client.connectTCP(plcip, {
// 		port: plcport
// 	});
// 	console.log(`PLC ${plcip} : ${plcport}  Connected!`)
// 	client.setID(2);
// }
// //-----------------------------------------------------------------------
// //	---------------------------------------------------------------------
// //-----------------------------------------------------------------------
//
