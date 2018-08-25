const fs = require("fs-extra");
const path = require('path');
const os = require('os');

var userdata = "";
var homedata = "";
if(process.env.APPDATA){
	userdata = process.env.APPDATA + path.sep + "Deezloader Remix\\";
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

const logsLocation = userdata + "/deezloader.log";

function logs(level, message, callback){
	var str = "["+level+"]"+message;
	console.log(str);
	fs.appendFileSync(logsLocation, str+"\n");
	return;
}

module.exports.logs = logs;
