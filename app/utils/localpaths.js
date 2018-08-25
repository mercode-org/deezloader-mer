const path = require('path');
const os = require('os');
const {app} = require('electron')

var userdata = "";
var homedata = os.homedir();
var musicdata = ""
if(typeof app !== "undefined"){
  userdata = app.getPath("appData")+path.sep+"Deezloader Remix"+path.sep;
  musicdata = app.getPath('music')+path.sep;
}else{
  if(process.env.APPDATA){
  	userdata = process.env.APPDATA + path.sep + "Deezloader Remix" + path.sep;
  }else if(process.platform == "darwin"){
  	userdata = homedata + '/Library/Application Support/Deezloader Remix/';
  }else if(process.platform == "android"){
    homedata += "/storage/emulated/0";
    userdata = homedata + "/Deezloader Remix/";
  }else{
  	userdata = homedata + '/.config/Deezloader Remix/';
  }
  musicdata = homedata + path.sep + "Music" + path.sep;
}

module.exports.home = homedata;
module.exports.user = userdata;
module.exports.music = musicdata;
