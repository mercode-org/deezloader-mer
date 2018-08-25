const fs = require("fs-extra");
const path = require('path');
const os = require('os');
const dateformat = require('dateformat');

var userdata = "";
var homedata = "";
if(process.env.APPDATA){
	userdata = process.env.APPDATA + path.sep + "Deezloader Remix" + path.sep;
	homedata = os.homedir();
}else if(process.platform == "darwin"){
	homedata = os.homedir();
	userdata = homedata + '/Library/Application Support/Deezloader Remix/';
}else if(process.platform == "android"){
	homedata = os.homedir() + "/storage/shared";
	userdata = homedata + "/Deezloader Remix/";
}else{
	homedata = os.homedir();
	userdata = homedata + '/.config/Deezloader Remix/';
}

fs.ensureDirSync(path.join(userdata, 'logs'))
const logsLocation = path.join(userdata, 'logs', `${dateformat(new Date(), 'yyyy-mm-dd')}.txt`)
fs.appendFileSync(logsLocation, "\r\n\r\n");

function logs(level, message){
	var str = "["+level+"] "+message;
	console.log(str);
	fs.appendFileSync(logsLocation, str+"\r\n");
	return;
}

function removeColors(string){
	return string.replace(/\x1b\[\d+m/g,"");
}

function debug(message){
	var str = "[\x1b[32mDebug\x1b[0m] "+message;
	console.log(str);
	fs.appendFileSync(logsLocation, removeColors(str)+"\r\n");
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

module.exports.logs = logs;

module.exports.debug = debug;
module.exports.info = info;
module.exports.warn = warn;
module.exports.error = error;
