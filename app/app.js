/*
 *  _____                    _                    _
 * |  __ \                  | |                  | |
 * | |  | |  ___   ___  ____| |  ___    __ _   __| |  ___  _ __
 * | |  | | / _ \ / _ \|_  /| | / _ \  / _` | / _` | / _ \| '__|
 * | |__| ||  __/|  __/ / / | || (_) || (_| || (_| ||  __/| |
 * |_____/  \___| \___|/___||_| \___/  \__,_| \__,_| \___||_|
 *
 *
 *
 *  Original work by ZzMTV <https://boerse.to/members/zzmtv.3378614/>
 * */

const express = require('express');
const app = express();
const server = require('http').createServer(app);
const mflac = require('flac-metadata');
const io = require('socket.io').listen(server, {log: false});
const fs = require('fs-extra');
const async = require('async');
const request = require('requestretry').defaults({maxAttempts: 2147483647, retryDelay: 1000, timeout: 8000});
const os = require('os');
const ID3Writer = require('./lib/browser-id3-writer');
const Deezer = require('./deezer-api');
const path = require('path');
const crypto = require('crypto');
const logger = require('./logger.js');
const Spotify = require('spotify-web-api-node');
const authCredentials = require('./authCredentials.js')

// Load Config File
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

if(!fs.existsSync(userdata+"config.json")){
	fs.outputFileSync(userdata+"config.json",fs.readFileSync(__dirname+path.sep+"default.json",'utf8'));
}

var spotifyApi = new Spotify(authCredentials);

// Settings update fix
let configFile = require(userdata+path.sep+"config.json");
if( typeof configFile.userDefined.numplaylistbyalbum != "boolean" ||
	typeof configFile.userDefined.syncedlyrics != "boolean" ||
	typeof configFile.userDefined.padtrck != "boolean" ||
	typeof configFile.userDefined.extendedTags != "boolean"||
	typeof configFile.userDefined.partOfSet != "boolean"||
	typeof configFile.userDefined.chartsCountry != "string"||
	typeof configFile.userDefined.albumNameTemplate != "string"){
		fs.outputFileSync(userdata+"config.json",fs.readFileSync(__dirname+path.sep+"default.json",'utf8'));
		configFile = require(userdata+path.sep+"config.json");
}

// Main Constants
const configFileLocation = userdata+"config.json";
const autologinLocation = userdata+"autologin";
const coverArtFolder = os.tmpdir() + path.sep + 'deezloader-imgs' + path.sep;
const defaultDownloadDir = homedata + path.sep + "Music" + path.sep + 'Deezloader' + path.sep;
const defaultSettings = require('./default.json').userDefined;

// Setup the folders START
let mainFolder = defaultDownloadDir;

if (configFile.userDefined.downloadLocation != null) {
	mainFolder = configFile.userDefined.downloadLocation;
}

initFolders();
// END

// Route and Create server
app.use('/', express.static(__dirname + '/public/'));
server.listen(configFile.serverPort);
logger.logs('Info', 'Server is running @ localhost:' + configFile.serverPort);

//Autologin encryption/decryption
var ekey = "62I9smDurjvfOdn2JhUdi99yeoAhxikw";

function alencrypt(input) {
	var iv = crypto.randomBytes(16);
	var data = new Buffer(input).toString('binary');
	key = new Buffer(ekey, "utf8");
	var cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
	var encrypted;
	encrypted =  cipher.update(data, 'utf8', 'binary') +  cipher.final('binary');
	var encoded = new Buffer(iv, 'binary').toString('hex') + new Buffer(encrypted, 'binary').toString('hex');

	return encoded;
}

function aldecrypt(encoded) {
	var combined = new Buffer(encoded, 'hex');
	key = new Buffer(ekey, "utf8");
	// Create iv
	var iv = new Buffer(16);
	combined.copy(iv, 0, 0, 16);
	edata = combined.slice(16).toString('binary');
	// Decipher encrypted data
	var decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
	var decrypted, plaintext;
	plaintext = (decipher.update(edata, 'binary', 'utf8') + decipher.final('utf8'));

	return plaintext;
}

// START sockets clusterfuck
io.sockets.on('connection', function (socket) {
	socket.downloadQueue = [];
	socket.currentItem = null;
	socket.lastQueueId = null;

	socket.on("login", function (username, password, autologin) {
		Deezer.init(username, password, function (err) {
			if(err){
				socket.emit("login", err.message);
				logger.logs('Error',"Failed to login, "+err.message);
			}else{
				if(autologin){
					var data = username + "\n" + password;
					fs.outputFile(autologinLocation, alencrypt(data) , function(){
						if(!err){
							logger.logs('Info',"Added autologin successfully");
						}else{
							logger.logs('Info',"Failed to add autologin file");
						}
					});
				}
				socket.emit("login", "none");
				logger.logs('Info',"Logged in successfully");
			}
		});
	});

	socket.on("autologin", function(){
		fs.readFile(autologinLocation, function(err, data){
			if(err){
				logger.logs('Info',"No auto login found");
				return;
			}
			try{
				var fdata = aldecrypt(data.toString('utf8'));

			}catch(e){
				logger.logs('Warning',"Invalid autologin file, deleting");
				fs.unlink(autologinLocation,function(){
				});
				return;
			}
			fdata = fdata.split('\n');
			socket.emit("autologin",fdata[0],fdata[1]);
		});
	});

	socket.on("logout", function(){
		logger.logs('Info',"Logged out");
		fs.unlink(autologinLocation,function(){
		});
		return;
	});

	Deezer.onDownloadProgress = function (track, progress) {
		if (!track.trackSocket) {
			return;
		}

		if(track.trackSocket.currentItem.type == "track"){
			let complete;
			if (!track.trackSocket.currentItem.percentage) {
				track.trackSocket.currentItem.percentage = 0;
			}
			if(configFile.userDefined.hifi){
				complete = track.FILESIZE_FLAC;
			}else{
				if (track.FILESIZE_MP3_320) {
					complete = track.FILESIZE_MP3_320;
				} else if (track.FILESIZE_MP3_256) {
					complete = track.FILESIZE_MP3_256;
				} else {
					complete = track.FILESIZE_MP3_128 || 0;
				}
			}

			let percentage = (progress / complete) * 100;

			if ((percentage - track.trackSocket.currentItem.percentage > 1) || (progress == complete)) {
				track.trackSocket.currentItem.percentage = percentage;
				track.trackSocket.emit("downloadProgress", {
					queueId: track.trackSocket.currentItem.queueId,
					percentage: track.trackSocket.currentItem.percentage
				});
			}
		}
	};

	function addToQueue(object) {
		socket.downloadQueue.push(object);
		socket.emit('addToQueue', object);

		queueDownload(getNextDownload());
	}

	function getNextDownload() {
		if (socket.currentItem != null || socket.downloadQueue.length == 0) {
			if (socket.downloadQueue.length == 0 && socket.currentItem == null) {
				socket.emit("emptyDownloadQueue", {});
			}
			return null;
		}
		socket.currentItem = socket.downloadQueue[0];
		return socket.currentItem;
	}

	//currentItem: the current item being downloaded at that moment such as a track or an album
	//downloadQueue: the tracks in the queue to be downloaded
	//lastQueueId: the most recent queueID
	//queueId: random number generated when user clicks download on something
	function queueDownload(downloading) {
		if (!downloading) return;

		// New batch emits new message
		if (socket.lastQueueId != downloading.queueId) {
			if (downloading.type != "spotifyplaylist"){
				socket.emit("downloadStarted", {queueId: downloading.queueId});
			}
			socket.lastQueueId = downloading.queueId;
		}

		if (downloading.type == "track") {
			logger.logs('Info',"Registered a track "+downloading.id);
			downloadTrack([downloading.id,0], downloading.settings, null, function (err) {
				if (err) {
					downloading.failed++;
				} else {
					downloading.downloaded++;
				}
				socket.emit("updateQueue", downloading);
				if (socket.downloadQueue[0] && (socket.downloadQueue[0].queueId == downloading.queueId)) {
					socket.downloadQueue.shift();
				}
				socket.currentItem = null;
				//fs.rmdirSync(coverArtDir);
				queueDownload(getNextDownload());
			});
		} else if (downloading.type == "playlist") {
			logger.logs('Info',"Registered a playlist "+downloading.id);
			Deezer.getPlaylistTracks(downloading.id, function (tracks, err) {
				downloading.settings.plName = downloading.name;
				async.eachSeries(tracks.data, function (t, callback) {
					if (downloading.cancelFlag) {
						logger.logs('Info',"Stopping the playlist queue");
						callback("stop");
						return;
					}
					downloading.settings.playlist = {
						position: tracks.data.indexOf(t),
						fullSize: tracks.data.length
					};
					downloadTrack([t.id,0], downloading.settings, null, function (err) {
						if (!err) {
							downloading.downloaded++;
						} else {
							downloading.failed++;
						}
						socket.emit("downloadProgress", {
							queueId: downloading.queueId,
							percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
						});
						socket.emit("updateQueue", downloading);
						callback();
					});
				}, function (err) {
					logger.logs('Info',"Playlist finished "+downloading.name);
					if(typeof socket.downloadQueue[0] != 'undefined'){
						socket.emit("downloadProgress", {
							queueId: socket.downloadQueue[0].queueId,
							percentage: 100
						});
					}
					if (downloading && socket.downloadQueue[0] && socket.downloadQueue[0].queueId == downloading.queueId) socket.downloadQueue.shift();
					socket.currentItem = null;
					//fs.rmdirSync(coverArtDir);
					queueDownload(getNextDownload());
				});
			});
		} else if (downloading.type == "spotifyplaylist") {
				spotifyApi.clientCredentialsGrant().then(function(creds) {
					downloading.settings.plName = downloading.name;
					spotifyApi.setAccessToken(creds.body['access_token']);
					numPages=Math.floor((downloading.size-1)/100);
					let pages = []
					downloading.playlistContent = new Array(downloading.size);
					for (let offset = 0; offset<=numPages; offset++){
						pages.push(new Promise(function(resolvePage) {
							spotifyApi.getPlaylistTracks(downloading.settings.spotifyUser, downloading.id, {fields: "", offset: offset}).then(function(resp) {
								resp.body['items'].forEach((t, index) => {
									downloading.playlistContent[(offset*100)+index] = new Promise(function(resolve, reject) {
										Deezer.track2ID(t.track.artists[0].name, t.track.name, function (response,err){
											resolve([response,0]);
										});
									});
								});
								logger.logs("Debug", "Page "+offset+" done");
								resolvePage();
							}, function(err) {console.log('Something went wrong!', err)});
						}));
					}
					logger.logs("Info","Waiting for all pages");
					Promise.all(pages).then((val)=>{
						logger.logs("Info","Waiting for all tracks to be converted");
						Promise.all(downloading.playlistContent).then((values)=>{
							logger.logs("Info","All tracks converted, starting download");
							socket.emit("downloadStarted", {queueId: downloading.queueId});
							async.eachSeries(values, function (t, callback) {
								if (downloading.cancelFlag) {
									logger.logs('Info',"Stopping the playlist queue");
									callback("stop");
									return;
								}
								downloading.settings.playlist = {
									position: values.indexOf(t),
									fullSize: values.length
								};
								downloadTrack(t, downloading.settings, null, function (err) {
									if (!err) {
										downloading.downloaded++;
									} else {
										downloading.failed++;
									}
									socket.emit("downloadProgress", {
										queueId: downloading.queueId,
										percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
									});
									socket.emit("updateQueue", downloading);
									callback();
								});
							}, function (err) {
								logger.logs('Info',"Playlist finished "+downloading.name);
								if(typeof socket.downloadQueue[0] != 'undefined'){
									socket.emit("downloadProgress", {
										queueId: socket.downloadQueue[0].queueId,
										percentage: 100
									});
								}
								if (downloading && socket.downloadQueue[0] && socket.downloadQueue[0].queueId == downloading.queueId) socket.downloadQueue.shift();
								socket.currentItem = null;
								//fs.rmdirSync(coverArtDir);
								queueDownload(getNextDownload());
							});
						}).catch((err)=>{
							console.log('Something went wrong!', err);
						});
					}).catch((err)=>{
						console.log('Something went wrong!', err);
					});
				}, function(err) {console.log('Something went wrong!', err)});
		} else if (downloading.type == "album") {
			logger.logs('Info',"Registered an album "+downloading.id);
			Deezer.getAlbumTracks(downloading.id, function (tracks, err) {
				downloading.settings.tagPosition = true;
				downloading.settings.albName = downloading.name;
				downloading.settings.artName = downloading.artist;
				async.eachSeries(tracks.data, function (t, callback) {
					if (downloading.cancelFlag) {
						logger.logs('Info',"Stopping the album queue");
						callback("stop");
						return;
					}
					downloading.settings.playlist = {
						position: tracks.data.indexOf(t),
						fullSize: tracks.data.length
					};
					downloadTrack([t.id,0], downloading.settings, null, function (err) {
						if (!err) {
							downloading.downloaded++;
						} else {
							downloading.failed++;
						}
						socket.emit("downloadProgress", {
							queueId: downloading.queueId,
							percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
						});
						socket.emit("updateQueue", downloading);
						callback();
					});
				}, function (err) {
					if (downloading.countPerAlbum) {
						if (socket.downloadQueue.length > 1 && socket.downloadQueue[1].queueId == downloading.queueId) {
							socket.downloadQueue[1].download = downloading.downloaded;
						}
						socket.emit("updateQueue", downloading);
					}
					logger.logs('Info',"Album finished "+downloading.name);
					if(typeof socket.downloadQueue[0] != 'undefined'){
						socket.emit("downloadProgress", {
							queueId: socket.downloadQueue[0].queueId,
							percentage: 100
						});
					}
					if (downloading && socket.downloadQueue[0] && socket.downloadQueue[0].queueId == downloading.queueId) socket.downloadQueue.shift();
					socket.currentItem = null;
					queueDownload(getNextDownload());
				});
			});
		}
	}

	socket.on("downloadtrack", function (data) {
		Deezer.getTrack(data.id, configFile.userDefined.hifi, function (track, err) {
			if (err) {
				return;
			}
			let queueId = "id" + Math.random().toString(36).substring(2);
			let _track = {
				name: track["SNG_TITLE"],
				size: 1,
				downloaded: 0,
				failed: 0,
				queueId: queueId,
				id: track["SNG_ID"],
				type: "track"
			};
			if (track["VERSION"]) _track.name = _track.name + " " + track["VERSION"];
			_track.settings = data.settings || {};
			addToQueue(_track);
		});
	});

	socket.on("downloadplaylist", function (data) {
		Deezer.getPlaylist(data.id, function (playlist, err) {
			if (err) {
				return;
			}
			Deezer.getPlaylistSize(data.id, function (size, err) {
				if (err) {
					return;
				}
				let queueId = "id" + Math.random().toString(36).substring(2);
				let _playlist = {
					name: playlist["title"],
					size: size,
					downloaded: 0,
					failed: 0,
					queueId: queueId,
					id: playlist["id"],
					type: "playlist"
				};
				_playlist.settings = data.settings || {};
				addToQueue(_playlist);
			});
		});
	});

	socket.on("downloadspotifyplaylist", function (data) {
		spotifyApi.clientCredentialsGrant().then(function(creds) {
			spotifyApi.setAccessToken(creds.body['access_token']);
			spotifyApi.getPlaylist(data.settings.spotifyUser, data.id, {fields: "id,name,tracks.total"}).then(function(resp) {
				let queueId = "id" + Math.random().toString(36).substring(2);
				let _playlist = {
					name: resp.body["name"],
					size: resp.body["tracks"]["total"],
					downloaded: 0,
					failed: 0,
					queueId: queueId,
					id: resp.body["id"],
					type: "spotifyplaylist"
				};
				_playlist.settings = data.settings || {};
				addToQueue(_playlist);
			}, function(err) {
				console.log('Something went wrong!', err);
			});
		},
		function(err) {
			console.log('Something went wrong when retrieving an access token', err);
		});
	});

	socket.on("downloadalbum", function (data) {
		Deezer.getAlbum(data.id, function (album, err) {
			if (err) {
				return;
			}
			Deezer.getAlbumSize(data.id, function (size, err) {
				if (err) {
					return;
				}
				let queueId = "id" + Math.random().toString(36).substring(2);
				let _album = {
					name: album["title"],
					label: album["label"],
					artist: album["artist"].name,
					size: size,
					downloaded: 0,
					failed: 0,
					queueId: queueId,
					id: album["id"],
					type: "album"
				};
				_album.settings = data.settings || {};
				addToQueue(_album);
			});
		});
	});

	socket.on("downloadartist", function (data) {
		Deezer.getArtist(data.id, function (artist, err) {
			if (err) {
				return;
			}
			Deezer.getArtistAlbums(data.id, function (albums, err) {
				if (err) {
					return;
				}
				for (let i = 0; i < albums.data.length; i++) {
					Deezer.getAlbumSize(albums.data[i].id, function(size, err){
						if(err) {
						  return;
						}
						let queueId = "id" + Math.random().toString(36).substring(2);
						let album = albums.data[i];
						let _album = {
							name: album["title"],
							artist: artist.name,
							size: size,
							downloaded: 0,
							failed: 0,
							queueId: queueId,
							id: album["id"],
							type: "album",
							countPerAlbum: true
						};
						_album.settings = data.settings || {};
						addToQueue(_album);
					});
				}
			});
		});
	});

	socket.on("getChartsTopCountry", function () {
		Deezer.getChartsTopCountry(function (charts, err) {
			if(err){
				return;
			}
			if(charts){
				charts = charts.data || [];
			}else{
				charts = [];
			}
			socket.emit("getChartsTopCountry", {charts: charts.data, err: err});
		});
	});

	socket.on("getChartsCountryList", function (data) {
		Deezer.getChartsTopCountry(function (charts, err) {
			if(err){
				return;
			}
			if(charts){
				charts = charts.data || [];
			}else{
				charts = [];
			}
			let countries = [];
			for (let i = 0; i < charts.length; i++) {
				let obj = {
					country: charts[i].title.replace("Top ", ""),
					picture_small: charts[i].picture_small,
					picture_medium: charts[i].picture_medium,
					picture_big: charts[i].picture_big
				};
				countries.push(obj);
			}
			socket.emit("getChartsCountryList", {countries: countries, selected: data.selected});
		});
	});

	socket.on("getChartsTrackListByCountry", function (data) {
		if (!data.country) {
			socket.emit("getChartsTrackListByCountry", {err: "No country passed"});
			return;
		}

		Deezer.getChartsTopCountry(function (charts, err) {
			if(err){
				return;
			}
			if(charts){
				charts = charts.data || [];
			}else{
				charts = [];
			}
			let countries = [];
			for (let i = 0; i < charts.length; i++) {
				countries.push(charts[i].title.replace("Top ", ""));
			}

			if (countries.indexOf(data.country) == -1) {
				socket.emit("getChartsTrackListByCountry", {err: "Country not found"});
				return;
			}

			let playlistId = charts[countries.indexOf(data.country)].id;

			Deezer.getPlaylistTracks(playlistId, function (tracks, err) {
				if (err) {
					socket.emit("getChartsTrackListByCountry", {err: err});
					return;
				}
				socket.emit("getChartsTrackListByCountry", {
					playlist: charts[countries.indexOf(data.country)],
					tracks: tracks.data
				});
			});
		});
	});

	socket.on("search", function (data) {
		data.type = data.type || "track";
		if (["track", "playlist", "album", "artist"].indexOf(data.type) == -1) {
			data.type = "track";
		}

		// Remove "feat."  "ft." and "&" (causes only problems)
		data.text = data.text.replace(/ feat[\.]? /g, " ").replace(/ ft[\.]? /g, " ").replace(/\(feat[\.]? /g, " ").replace(/\(ft[\.]? /g, " ").replace(/\&/g, "");

		Deezer.search(encodeURIComponent(data.text), data.type, function (searchObject, err) {
			try {
				socket.emit("search", {type: data.type, items: searchObject.data});
			} catch (e) {
				socket.emit("search", {type: data.type, items: []});
			}
		});
	});

	socket.on("getInformation", function (data) {
		if (!data.type || (["track", "playlist", "album", "artist"].indexOf(data.type) == -1) || !data.id) {
			socket.emit("getInformation", {err: -1, response: {}, id: data.id});
			return;
		}

		let reqType = data.type.charAt(0).toUpperCase() + data.type.slice(1);

		Deezer["get" + reqType](data.id, function (response, err) {
			if (err) {
				socket.emit("getInformation", {err: "wrong id", response: {}, id: data.id});
				return;
			}
			socket.emit("getInformation", {response: response, id: data.id});
		});
	});

	socket.on("getTrackList", function (data) {
		if (!data.type || (["playlist", "album", "artist"].indexOf(data.type) == -1) || !data.id) {
			socket.emit("getTrackList", {err: -1, response: {}, id: data.id, reqType: data.type});
			return;
		}

		if (data.type == 'artist') {
			Deezer.getArtistAlbums(data.id, function (response, err) {
				if (err) {
					socket.emit("getTrackList", {err: "wrong id", response: {}, id: data.id, reqType: data.type});
					return;
				}
				socket.emit("getTrackList", {response: response, id: data.id, reqType: data.type});
			});
		} else {
			let reqType = data.type.charAt(0).toUpperCase() + data.type.slice(1);

			Deezer["get" + reqType + "Tracks"](data.id, function (response, err) {
				if (err) {
					socket.emit("getTrackList", {err: "wrong id", response: {}, id: data.id, reqType: data.type});
					return;
				}
				socket.emit("getTrackList", {response: response, id: data.id, reqType: data.type});
			});
		}

	});

	socket.on("cancelDownload", function (data) {
		if (!data.queueId) {
			return;
		}

		let cancel = false;
		let cancelSuccess;

		for (let i = 0; i < socket.downloadQueue.length; i++) {
			if (data.queueId == socket.downloadQueue[i].queueId) {
				socket.downloadQueue.splice(i, 1);
				i--;
				cancel = true;
			}
		}

		if (socket.currentItem && socket.currentItem.queueId == data.queueId) {
			cancelSuccess = Deezer.cancelDecryptTrack();
			cancel = cancel || cancelSuccess;
		}


		if (cancelSuccess && socket.currentItem) {
			socket.currentItem.cancelFlag = true;
		}
		if (cancel) {
			socket.emit("cancelDownload", {queueId: data.queueId});
		}
	});

	socket.on("downloadAlreadyInQueue", function (data) {
		if (data.id) {
			return;
		}
		let isInQueue = checkIfAlreadyInQueue(data.id);
		if (isInQueue) {
			socket.emit("downloadAlreadyInQueue", {alreadyInQueue: true, id: data.id, queueId: isInQueue});
		} else {
			socket.emit("downloadAlreadyInQueue", {alreadyInQueue: false, id: data.id});
		}
	});

	socket.on("getUserSettings", function () {
		let settings = configFile.userDefined;
		if (!settings.downloadLocation) {
			settings.downloadLocation = mainFolder;
		}

		socket.emit('getUserSettings', {settings: settings});
	});

	socket.on("saveSettings", function (settings) {
		if (settings.userDefined.downloadLocation == defaultDownloadDir) {
			settings.userDefined.downloadLocation = null;
		} else {
			settings.userDefined.downloadLocation = path.resolve(settings.userDefined.downloadLocation + path.sep) + path.sep;
			mainFolder = settings.userDefined.downloadLocation;
		}

		configFile.userDefined = settings.userDefined;
		fs.outputFile(configFileLocation, JSON.stringify(configFile, null, 2), function (err) {
			if (err) return;
			logger.logs('Info',"Settings updated");
			initFolders();
		});
	});

	function downloadTrack(id, settings, altmetadata, callback) {
		logger.logs('Info',"Getting track data");
		Deezer.getTrack(id[0], configFile.userDefined.hifi, function (track, err) {
			if (err) {
				if(id[1] != 0){
					logger.logs('Warning',"Failed to download track, falling on alternative");
					downloadTrack([id[1],0], settings, null, function(err){
						callback(err);
					});
				}else{
					logger.logs('Error',"Failed to download track");
					callback(err);
				}
				return;
			}
			logger.logs('Info',"Getting album data");
			Deezer.getAlbum(track["ALB_ID"], function(res, err){
				if(err){
					if(id[1] != 0){
						logger.logs('Warning',"Failed to download track, falling on alternative");
						downloadTrack([id[1],0], settings, null, function(err){
							callback(err);
						});
					}else{
						logger.logs('Error',"Failed to download track");
						callback(new Error("Album does not exists."));
					}
					return;
				}
				logger.logs('Info',"Getting ATrack data");
				Deezer.getATrack(res.tracks.data[res.tracks.data.length - 1].id, function(tres){
					track.trackSocket = socket;

					settings = settings || {};
					// winston.log('debug', 'TRACK:', track);
					if (track["VERSION"]) track["SNG_TITLE"] += " " + track["VERSION"];
					var ajson = res;
					var tjson = tres;
					if(track["SNG_CONTRIBUTORS"]){
						if(track["SNG_CONTRIBUTORS"].composer){
							var composertag = "";
							for (var i = 0; i < track["SNG_CONTRIBUTORS"].composer.length; i++) {
								composertag += track["SNG_CONTRIBUTORS"].composer[i] + ", ";
							}
							composertag = composertag.substring(0,composertag.length-2);
						}
						if(track["SNG_CONTRIBUTORS"].musicpublisher){
							var publishertag = "";
							for (var i = 0; i < track["SNG_CONTRIBUTORS"].musicpublisher.length; i++) {
								publishertag += track["SNG_CONTRIBUTORS"].musicpublisher[i] + ", ";
							}
							publishertag = publishertag.substring(0,publishertag.length-2);
						}
						if(track["SNG_CONTRIBUTORS"].producer){
							var producertag = "";
							for (var i = 0; i < track["SNG_CONTRIBUTORS"].producer.length; i++) {
								producertag += track["SNG_CONTRIBUTORS"].producer[i] + ", ";
							}
							producertag = producertag.substring(0,producertag.length-2);
						}
						if(track["SNG_CONTRIBUTORS"].engineer){
							var engineertag = "";
							for (var i = 0; i < track["SNG_CONTRIBUTORS"].engineer.length; i++) {
								engineertag += track["SNG_CONTRIBUTORS"].engineer[i] + ", ";
							}
							engineertag = engineertag.substring(0,engineertag.length-2);
						}
						if(track["SNG_CONTRIBUTORS"].writer){
							var writertag = "";
							for (var i = 0; i < track["SNG_CONTRIBUTORS"].writer.length; i++) {
								writertag += track["SNG_CONTRIBUTORS"].writer[i] + ", ";
							}
							writertag = writertag.substring(0,writertag.length-2);
						}
						if(track["SNG_CONTRIBUTORS"].author){
							var authortag = "";
							for (var i = 0; i < track["SNG_CONTRIBUTORS"].author.length; i++) {
								authortag += track["SNG_CONTRIBUTORS"].author[i] + ", ";
							}
							authortag = authortag.substring(0,authortag.length-2);
						}
						if(track["SNG_CONTRIBUTORS"].mixer){
							var mixertag = "";
							for (var i = 0; i < track["SNG_CONTRIBUTORS"].mixer.length; i++) {
								mixertag += track["SNG_CONTRIBUTORS"].mixer[i] + ", ";
							}
							mixertag = mixertag.substring(0,mixertag.length-2);
						}
					}
					let metadata;
					if(altmetadata){
						metadata = altmetadata;
						if(track["LYRICS_TEXT"] && !metadata.unsynchronisedLyrics){
							metadata.unsynchronisedLyrics = {
								description: "",
								lyrics: track["LYRICS_TEXT"]
							};
						}
					}else{
						metadata = {
							title: track["SNG_TITLE"],
							artist: track["ART_NAME"],
							album: track["ALB_TITLE"],
							performerInfo: ajson.artist.name,
							trackNumber: track["TRACK_NUMBER"] + "/" + ajson.nb_tracks,
							partOfSet: track["DISK_NUMBER"] + "/" + tjson.disk_number,
							explicit: track["EXPLICIT_LYRICS"],
							ISRC: track["ISRC"],
						};
						if (configFile.userDefined.extendedTags){
							metadata.push({
								length: track["DURATION"],
								BARCODE: ajson.upc,
								rtype: ajson.record_type
							});
							if(track["COPYRIGHT"]){
								metadata.copyright = track["COPYRIGHT"];
							}
							if(composertag){
								metadata.composer = composertag;
							}
							if(mixertag){
								metadata.mixer = mixertag;
							}
							if(authortag){
								metadata.author = authortag;
							}
							if(writertag){
								metadata.writer = writertag;
							}
							if(engineertag){
								metadata.engineer = engineertag;
							}
							if(producertag){
								metadata.producer = producertag;
							}
							if(track["LYRICS_TEXT"]){
								metadata.unsynchronisedLyrics = {
									description: "",
									lyrics: track["LYRICS_TEXT"]
								};
							}
							if (track["GAIN"]) {
								metadata.trackgain = track["GAIN"];
							}
						}


						if(ajson.label){
							metadata.publisher = ajson.label;
						}
						if(settings.plName && !(settings.createArtistFolder || settings.createAlbumFolder) && !configFile.userDefined.numplaylistbyalbum){
							metadata.trackNumber = (parseInt(settings.playlist.position)+1).toString() + "/" + settings.playlist.fullSize;
							metadata.partOfSet = "1/1";
						}
						if(settings.artName){
							metadata.trackNumber = (settings.playlist.position+1).toString() + "/" + ajson.nb_tracks;
						}
						if (0 < parseInt(track["BPM"])) {
							metadata.bpm = track["BPM"];
						}
						if(ajson.genres && ajson.genres.data[0] && ajson.genres.data[0].name){
							metadata.genre = ajson.genres.data[0].name;
						    if (track.format == 9){
							    metadata.genre = ajson.genres.data[0].name;
						    } else {
						        genreArray = [];
    							var first = true;
    							ajson.genres.data.forEach(function(genre){
    								genreArray.push(genre.name);
    							});
    							Array.from(new Set(genreArray)).forEach(function(genre){
    								if(first){
    									metadata.genre = genre;
    									first = false;
    								} else{
    									if(metadata.genre.indexOf(genre) == -1)
    										metadata.genre += String.fromCharCode(parseInt("\u0000",16)) + genre;
    								}
    							});
    						}
						}
						if (track["ALB_PICTURE"]) {
							metadata.image = Deezer.albumPicturesHost + track["ALB_PICTURE"] + settings.artworkSize;
						}

						if (ajson.release_date) {
							metadata.year = ajson.release_date.slice(0, 4);
							metadata.date = ajson.release_date;
						}else if(track["PHYSICAL_RELEASE_DATE"]){
							metadata.year = track["PHYSICAL_RELEASE_DATE"].slice(0, 4);
							metadata.date = track["PHYSICAL_RELEASE_DATE"];
						}
					}
					let filename = fixName(`${metadata.artist} - ${metadata.title}`);
					if (settings.filename) {
						filename = fixName(settingsRegex(metadata, settings.filename, settings.playlist));
					}

					let filepath = mainFolder;
					if (settings.createArtistFolder || settings.createAlbumFolder) {
						if(settings.plName){
							filepath += antiDot(fixName(settings.plName)) + path.sep;
						}
						if (settings.createArtistFolder) {
							if(settings.artName){
								filepath += antiDot(fixName(settings.artName)) + path.sep;
							}else{
								filepath += antiDot(fixName(metadata.artist)) + path.sep;
							}
						}

						if (settings.createAlbumFolder) {
							if(settings.artName){
								filepath += antiDot(fixName(settingsRegexAlbum(metadata,settings.foldername,settings.artName,settings.albName))) + path.sep;
							}else{
								filepath += antiDot(fixName(settingsRegexAlbum(metadata,settings.foldername,metadata.performerInfo,metadata.album))) + path.sep;
							}
						}
					} else if (settings.plName) {
						filepath += antiDot(fixName(settings.plName)) + path.sep;
					} else if (settings.artName) {
						filepath += antiDot(fixName(settingsRegexAlbum(metadata,settings.foldername,settings.artName,settings.albName))) + path.sep;
					}

					let writePath;
					if(track.format == 9){
						writePath = filepath + filename + '.flac';
					}else{
						writePath = filepath + filename + '.mp3';
					}
					if(track["LYRICS_SYNC_JSON"] && configFile.userDefined.syncedlyrics){
						var lyricsbuffer = "";
						for(var i=0;i<track["LYRICS_SYNC_JSON"].length;i++){
							if(track["LYRICS_SYNC_JSON"][i].lrc_timestamp){
								lyricsbuffer += track["LYRICS_SYNC_JSON"][i].lrc_timestamp+track["LYRICS_SYNC_JSON"][i].line+"\r\n";
							}else if(i+1 < track["LYRICS_SYNC_JSON"].length){
								lyricsbuffer += track["LYRICS_SYNC_JSON"][i+1].lrc_timestamp+track["LYRICS_SYNC_JSON"][i].line+"\r\n";
							}
						}
						if(track.format == 9){
							fs.outputFile(writePath.substring(0,writePath.length-5)+".lrc",lyricsbuffer,function(){});
						}else{
							fs.outputFile(writePath.substring(0,writePath.length-4)+".lrc",lyricsbuffer,function(){});
						}
					}
					logger.logs('Info','Downloading file to ' + writePath);
					if (fs.existsSync(writePath)) {
						logger.logs('Info',"Already downloaded: " + metadata.artist + ' - ' + metadata.title);
						callback();
						return;
					}

					//Get image
					if (metadata.image) {
						let imgPath;
						//If its not from an album but a playlist.
						if(!settings.tagPosition && !settings.createAlbumFolder){
							imgPath = coverArtFolder + fixName(metadata.ISRC) + ".jpg";
						}else{
							imgPath = filepath + "folder.jpg";
						}
						if(fs.existsSync(imgPath) && !imgPath.includes(coverArtFolder)){
							metadata.imagePath = (imgPath).replace(/\\/g, "/");
							logger.logs('Info',"Starting the download process CODE:1");
							condownload();
						}else{
							request.get(metadata.image, {encoding: 'binary'}, function(error,response,body){
								if(error){
									logger.logs('Error', error.stack);
									metadata.image = undefined;
									metadata.imagePath = undefined;
									return;
								}
								fs.outputFile(imgPath,body,'binary',function(err){
									if(err){
										logger.logs('Error', err.stack);
									metadata.image = undefined;
									metadata.imagePath = undefined;
										return;
									}
									metadata.imagePath = (imgPath).replace(/\\/g, "/");
									logger.logs('Info',"Starting the download process CODE:2");
									condownload();
								})
							});
						}
					}else{
						metadata.image = undefined;
						logger.logs('Info',"Starting the download process CODE:3");
						condownload();
					}
					function condownload(){
						var tempPath = writePath+".temp";
						logger.logs('Info',"Downloading and decrypting");
						Deezer.decryptTrack(tempPath,track, function (err) {
							if (err && err.message == "aborted") {
								socket.currentItem.cancelFlag = true;
								logger.logs('Info',"Track got aborted");
								callback();
								return;
							}
							if (err) {
								Deezer.hasTrackAlternative(id[0], function (alternative, err) {
									if (err || !alternative) {
										logger.logs('Error',"Failed to download: " + metadata.artist + " - " + metadata.title);
										callback(err);
										return;
									}
									logger.logs('Error',"Failed to download: " + metadata.artist + " - " + metadata.title+", falling on alternative");
									downloadTrack([alternative.SNG_ID,0], settings, metadata, callback);
								});
								return;
							}
							if (settings.createM3UFile && settings.playlist) {
								if(track.format == 9){
									fs.appendFileSync(filepath + "playlist.m3u", filename + ".flac\r\n");
								}else{
									fs.appendFileSync(filepath + "playlist.m3u", filename + ".mp3\r\n");
								}
							}
							logger.logs('Info',"Downloaded: " + metadata.artist + " - " + metadata.title);
							metadata.artist = '';
							var first = true;
							artistArray = []
							track['ARTISTS'].forEach(function(artist){
								artistArray.push(artist['ART_NAME']);
							});
							var separator = String.fromCharCode(parseInt("\u0000",16));
							if (track.format == 9)
							    separator = ', ';
							Array.from(new Set(artistArray)).forEach(function(artist){
								if(first){
									metadata.artist = artist;
									first = false;
								} else{
									if(metadata.artist.indexOf(artist) == -1)
										metadata.artist += separator + artist;
								}
							});

							if(track.format == 9){
								let flacComments = [
									'TITLE=' + metadata.title,
									'ALBUM=' + metadata.album,
									'ALBUMARTIST=' + metadata.performerInfo,
									'ARTIST=' + metadata.artist,
									'TRACKNUMBER=' + splitNumber(metadata.trackNumber,false),
									'DISCNUMBER=' + splitNumber(metadata.partOfSet,false),
									'TRACKTOTAL=' + splitNumber(metadata.trackNumber,true),
									'DISCTOTAL=' + splitNumber(metadata.partOfSet,true),
									'ITUNESADVISORY=' + metadata.explicit,
									'ISRC=' + metadata.ISRC
								];
								if(configFile.userDefined.extendedTags){
									flacComments.push(
										'LENGTH=' + metadata.length,
										'BARCODE=' + metadata.BARCODE
									);
								}
								if(metadata.unsynchronisedLyrics){
									flacComments.push('LYRICS='+metadata.unsynchronisedLyrics.lyrics);
								}
								if(metadata.genre){
									flacComments.push('GENRE=' + metadata.genre);
								}
								if(metadata.copyright){
									flacComments.push('COPYRIGHT=' + metadata.copyright);
								}
								if (0 < parseInt(metadata.year)) {
									flacComments.push('DATE=' + metadata.date);
									flacComments.push('YEAR=' + metadata.year);
								}
								if (0 < parseInt(metadata.bpm)) {
									flacComments.push('BPM=' + metadata.bpm);
								}
								if(metadata.composer){
									flacComments.push('COMPOSER=' + metadata.composer);
								}
								if(metadata.publisher){
									flacComments.push('ORGANIZATION=' + metadata.publisher);
								}
								if(metadata.mixer){
									flacComments.push('MIXER=' + metadata.mixer);
								}
								if(metadata.author){
									flacComments.push('AUTHOR=' + metadata.author);
								}
								if(metadata.writer){
									flacComments.push('WRITER=' + metadata.writer);
								}
								if(metadata.engineer){
									flacComments.push('ENGINEER=' + metadata.engineer);
								}
								if(metadata.producer){
									flacComments.push('PRODUCER=' + metadata.producer);
								}
								if(metadata.trackgain){
									flacComments.push('REPLAYGAIN_TRACK_GAIN=' + metadata.trackgain);
								}
								const reader = fs.createReadStream(tempPath);
								const writer = fs.createWriteStream(writePath);
								let processor = new mflac.Processor({parseMetaDataBlocks: true});

								let vendor = 'reference libFLAC 1.2.1 20070917';
								let cover = null;
								if(metadata.imagePath){
									cover = fs.readFileSync(metadata.imagePath);
								}
								let mdbVorbisPicture;
								let mdbVorbisComment;
								processor.on('preprocess', (mdb) => {
									// Remove existing VORBIS_COMMENT and PICTURE blocks, if any.
									if (mflac.Processor.MDB_TYPE_VORBIS_COMMENT === mdb.type) {
										mdb.remove();
									} else if (mflac.Processor.MDB_TYPE_PICTURE === mdb.type) {
										mdb.remove();
									}

									if (mdb.isLast) {
										var res = 0;
										if(configFile.userDefined.artworkSize.includes("1400")){
											res = 1400;
										}else if(configFile.userDefined.artworkSize.includes("1200")){
											res = 1200;
										}else if(configFile.userDefined.artworkSize.includes("1000")){
											res = 1000;
										}else if(configFile.userDefined.artworkSize.includes("800")){
											res = 800;
										}else if(configFile.userDefined.artworkSize.includes("500")){
											res = 500;
										}
										if(cover){
											mdbVorbisPicture = mflac.data.MetaDataBlockPicture.create(true, 3, 'image/jpeg', '', res, res, 24, 0, cover);
										}
										mdbVorbisComment = mflac.data.MetaDataBlockVorbisComment.create(false, vendor, flacComments);
										mdb.isLast = false;
									}
								});

								processor.on('postprocess', (mdb) => {
									if (mflac.Processor.MDB_TYPE_VORBIS_COMMENT === mdb.type && null !== mdb.vendor) {
										vendor = mdb.vendor;
									}

									if (mdbVorbisPicture && mdbVorbisComment) {
										processor.push(mdbVorbisComment.publish());
										processor.push(mdbVorbisPicture.publish());
									}else if(mdbVorbisComment){
										processor.push(mdbVorbisComment.publish());
									}
								});

								reader.on('end', () => {
									fs.remove(tempPath);
								});

								reader.pipe(processor).pipe(writer);
							}else{
								const songBuffer = fs.readFileSync(tempPath);
								const writer = new ID3Writer(songBuffer);
								writer.setFrame('TIT2', metadata.title)
									.setFrame('TPE1', [metadata.artist])
									.setFrame('TALB', metadata.album)
									.setFrame('TPE2', metadata.performerInfo)
									.setFrame('TRCK', (configFile.userDefined.partOfSet ? metadata.trackNumber : splitNumber(metadata.trackNumber,false)))
									.setFrame('TPOS', (configFile.userDefined.partOfSet ? metadata.partOfSet : splitNumber(metadata.partOfSet,false)))
									.setFrame('TSRC', metadata.ISRC);
								if (configFile.userDefined.extendedTags){
									writer.setFrame('TLEN', metadata.length)
										.setFrame('TXXX', {
											description: 'BARCODE',
											value: metadata.BARCODE
										})
								}
								if(metadata.imagePath){
									const coverBuffer = fs.readFileSync(metadata.imagePath);
									writer.setFrame('APIC', {
										type: 3,
										data: coverBuffer,
										description: ''
									});
								}
								if(metadata.unsynchronisedLyrics){
									writer.setFrame('USLT', metadata.unsynchronisedLyrics);
								}
								if(metadata.publisher){
									writer.setFrame('TPUB', metadata.publisher);
								}
								if(metadata.genre){
									writer.setFrame('TCON', [metadata.genre]);
								}
								if(metadata.copyright){
									writer.setFrame('TCOP', metadata.copyright);
								}
								if (0 < parseInt(metadata.year)) {
									writer.setFrame('TDAT', metadata.date);
									writer.setFrame('TYER', metadata.year);
								}
								if (0 < parseInt(metadata.bpm)) {
									writer.setFrame('TBPM', metadata.bpm);
								}
								if(metadata.composer){
									writer.setFrame('TCOM', [metadata.composer]);
								}
								if(metadata.trackgain){
									writer.setFrame('TXXX', {
										description: 'REPLAYGAIN_TRACK_GAIN',
										value: metadata.trackgain
									});
								}
								writer.addTag();

								const taggedSongBuffer = Buffer.from(writer.arrayBuffer);
								fs.writeFileSync(writePath, taggedSongBuffer);
								fs.remove(tempPath);
							}

							callback();
						});
					}
				});
			});
		});
	}

	function checkIfAlreadyInQueue(id) {
		let exists = false;
		for (let i = 0; i < socket.downloadQueue.length; i++) {
			if (socket.downloadQueue[i].id == id) {
				exists = socket.downloadQueue[i].queueId;
			}
		}
		if (socket.currentItem && (socket.currentItem.id == id)) {
			exists = socket.currentItem.queueId;
		}
		return exists;
	}
});

// Helper functions

/**
 * Updates individual parameters in the settings file
 * @param config
 * @param value
 */
function updateSettingsFile(config, value) {
	configFile.userDefined[config] = value;

	fs.outputFile(configFileLocation, JSON.stringify(configFile, null, 2), function (err) {
		if (err) return;
		logger.logs('Info',"Settings updated");

		// FIXME: Endless Loop, due to call from initFolders()...crashes soon after startup
		// initFolders();
	});
}

function fixName (txt) {
  const regEx = /[\0\/\\:*?"<>|]/g;
  return txt.replace(regEx, '_');
}

function antiDot(str){
	while(str[str.length-1] == "." || str[str.length-1] == " " || str[str.length-1] == "\n"){
		str = str.substring(0,str.length-1);
	}
	if(str.length < 1){
		str = "dot";
	}
	return fixName(str);
}

/**
 * Initialize the temp folder for covers and main folder for downloads
 */
function initFolders() {
	// Check if main folder exists
	if (!fs.existsSync(mainFolder)) {
		mainFolder = defaultDownloadDir;
		updateSettingsFile('downloadLocation', defaultDownloadDir);
	}

	fs.removeSync(coverArtFolder);
	fs.ensureDirSync(coverArtFolder);

}

/**
 * Creates the name of the tracks replacing wildcards to correct metadata
 * @param metadata
 * @param filename
 * @param playlist
 * @returns {XML|string|*}
 */
function settingsRegex(metadata, filename, playlist) {
	filename = filename.replace(/%title%/g, metadata.title);
	filename = filename.replace(/%album%/g, metadata.album);
	filename = filename.replace(/%artist%/g, metadata.artist);
	filename = filename.replace(/%year%/g, metadata.year);
	if(typeof metadata.trackNumber != 'undefined'){
		if(configFile.userDefined.padtrck){
			 filename = filename.replace(/%number%/g, pad(splitNumber(metadata.trackNumber, false), splitNumber(metadata.trackNumber, true)));
		}else{
			filename = filename.replace(/%number%/g, splitNumber(metadata.trackNumber, false));
		}
	} else {
		filename = filename.replace(/%number%/g, '');
	}
	return filename;
}

/**
 * Creates the name of the albums folder replacing wildcards to correct metadata
 * @param metadata
 * @param foldername
 * @returns {XML|string|*}
 */
function settingsRegexAlbum(metadata, foldername, artist, album) {
	foldername = foldername.replace(/%album%/g, album);
	foldername = foldername.replace(/%artist%/g, artist);
	foldername = foldername.replace(/%year%/g, metadata.year);
	foldername = foldername.replace(/%type%/g, metadata.rtype);
	return foldername;
}

/**
 * I really don't understand what this does ... but it does something
 * @param str
 * @param max
 * @returns {String|string|*}
 */
function pad(str, max) {
	str = str.toString();
	max = max.toString();
	return str.length < max.length || str.length == 1 ? pad("0" + str, max) : str;
}

/**
 * Splits the %number%
 * @param string str
 * @return string
 */
function splitNumber(str,total){
	str = str.toString();
	var i = str.indexOf("/");
	if(total && i > 0){
		return str.slice(i+1, str.length);
	}else if(i > 0){
		return str.slice(0, i);
	}else{
		return str;
	}
	return i > 0 ? str.slice(0, i) : str;
}

// Show crash error in console for debugging
process.on('uncaughtException', function (err) {
	logger.logs('Error',err.stack,function(){
		socket.emit("message", "Critical Error, report to the developer", err.stack);
	});
});

// Exporting vars
module.exports.mainFolder = mainFolder;
module.exports.defaultSettings = defaultSettings;
module.exports.defaultDownloadDir = defaultDownloadDir;
