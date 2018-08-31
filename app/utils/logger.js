const fs = require("fs-extra");
const path = require('path');
const dateformat = require('dateformat');
const localpaths = require('./localpaths.js')
const os = require('os');

fs.ensureDirSync(path.join(localpaths.user, 'logs'))
const logsLocation = path.join(localpaths.user, 'logs', `${dateformat(new Date(), 'yyyy-mm-dd-HH.MM.ss')}.txt`)
fs.appendFileSync(logsLocation, `${os.platform()} - ${os.type()} ${os.release()} ${os.arch()}\r\n\r\n`);
fs.readdir(path.join(localpaths.user, 'logs'), function (err, files) {
  if (err) throw err;
  else {
    var logs = [];
    files.forEach(function (file) {
			logs.push(file.substring(0, file.length-4));
    });
		logs.sort()
		if (logs.length>5){
			for (let i=0; i<logs.length-5; i++){
				fs.unlinkSync(path.join(localpaths.user, 'logs', logs[i]+".txt"));
			}
		}
  }
});

function removeColors(string){
	return string.replace(/\x1b\[\d+m/g,"");
}

function debug(message){
	var str = "[\x1b[32mDebug\x1b[0m] "+message;
	console.log(str);
	//fs.appendFileSync(logsLocation, removeColors(str)+"\r\n");
	return;
}
function info(message){
	var str = "[\x1b[35mInfo\x1b[0m] "+message;
	console.log(str);
	fs.appendFileSync(logsLocation, removeColors(str)+"\r\n");
	return;
}
function warn(message){
	var str = "[\x1b[33mWarning\x1b[0m] "+message;
	console.log(str);
	fs.appendFileSync(logsLocation, removeColors(str)+"\r\n");
	return;
}
function error(message){
	var str = "[\x1b[31mError\x1b[0m] "+message;
	console.log(str);
	fs.appendFileSync(logsLocation, removeColors(str)+"\r\n");
	return;
}

module.exports.debug = debug;
module.exports.info = info;
module.exports.warn = warn;
module.exports.error = error;
module.exports.logPath = logsLocation;
