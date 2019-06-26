const path = require('path');
const os = require('os');

var userdata = "";
var homedata = os.homedir();

if(process.env.APPDATA){
	userdata = process.env.APPDATA + path.sep + "Deezloader Remix" + path.sep;
}else if(process.platform == "darwin"){
	userdata = homedata + '/Library/Application Support/Deezloader Remix/';
}else if(process.platform == "android"){
  homedata = "/sdcard";
  userdata = homedata + "/Deezloader Remix/";
}else if (process.env.XDG_CONFIG_HOME){
	userdata = process.env.XDG_CONFIG_HOME + '/Deezloader Remix/';
}else{
	userdata = homedata + '/.config/Deezloader Remix/';
}

module.exports.home = homedata;
module.exports.user = userdata;
