// Load settings before everything
let appConfig;
const fs = require("fs-extra");
const path = require('path');
const electron = require('electron');
const os = require('os');
const app = electron.app;
loadSettings();

const theApp = require('./app');
const BrowserWindow = electron.BrowserWindow;
const WindowStateManager = require('electron-window-state-manager');

const url = require('url');

let mainWindow;


// Create a new instance of the WindowStateManager
const mainWindowState = new WindowStateManager('mainWindow', {
	defaultWidth: 1280,
	defaultHeight: 800
});

require('electron-context-menu')({
	showInspectElement: false
});

function loadSettings(){
	var userdata = "";
	if(process.platform == "android"){
		userdata = os.homedir() + "/storage/shared/Deezloader/";
	}else{
		userdata = app.getPath("appData")+path.sep+"Deezloader"+path.sep;
	}

	if(!fs.existsSync(userdata+"config.json")){
		fs.outputFileSync(userdata+"config.json",fs.readFileSync(__dirname+path.sep+"default.json",'utf8'));
	}

	appConfig = require(userdata+path.sep+"config.json");

	if( typeof appConfig.userDefined.numplaylistbyalbum != "boolean" ||
			typeof appConfig.userDefined.syncedlyrics != "boolean" ||
		 	typeof appConfig.userDefined.padtrck != "boolean" ||
	 		typeof appConfig.userDefined.albumNameTemplate != "string"
		){
		fs.outputFileSync(userdata+"config.json",fs.readFileSync(__dirname+path.sep+"default.json",'utf8'));
		appConfig = require(userdata+path.sep+"config.json");
	}
}

function createWindow () {
	// Create the browser window.
	mainWindow = new BrowserWindow({
		width: mainWindowState.width,
		height: mainWindowState.height,
		x: mainWindowState.x,
		y: mainWindowState.y,
		alwaysOnTop: false,
		frame: false,
		icon: __dirname + "/icon.png",
		minWidth: 415,
		minHeight: 32
	});

	mainWindow.setMenu(null);

	// and load the index.html of the app.
	mainWindow.loadURL('http://localhost:' + appConfig.serverPort);

	mainWindow.on('closed', function () {
		mainWindow = null;
	});

	// Check if window was closed maximized and restore it
	if (mainWindowState.maximized) {
		mainWindow.maximize();
	}

	// Save current window state
	mainWindow.on('close', () => {
		mainWindowState.saveState(mainWindow);
	});
}

app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
	app.quit();
});

app.on('activate', function () {
	if (mainWindow === null) {
		createWindow();
	}
});
