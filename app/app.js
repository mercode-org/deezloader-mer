/*
*   _____                _                 _             _____                _
*  |  __ \              | |               | |           |  __ \              (_)
*  | |  | | ___  ___ ___| | ___   __ _  __| | ___ _ __  | |__) |___ _ __ ___  ___  __
*  | |  | |/ _ \/ _ \_  / |/ _ \ / _` |/ _` |/ _ \ '__| |  _  // _ \ '_ ` _ \| \ \/ /
*  | |__| |  __/  __// /| | (_) | (_| | (_| |  __/ |    | | \ \  __/ | | | | | |>  <
*  |_____/ \___|\___/___|_|\___/ \__,_|\__,_|\___|_|    |_|  \_\___|_| |_| |_|_/_/\_\
*
**/

// Server stuff
const express = require('express')
const app = express()
const server = require('http').createServer(app)
const io = require('socket.io').listen(server, {log: false, wsEngine: 'ws'})
// Music tagging stuff
const mflac = require('./lib/flac-metadata')
const ID3Writer = require('./lib/browser-id3-writer')
const deezerApi = require('./lib/deezer-api')
const spotifyApi = require('spotify-web-api-node')
// App stuff
const fs = require('fs-extra')
const async = require('async')
const request = require('requestretry').defaults({maxAttempts: 2147483647, retryDelay: 1000, timeout: 8000})
const os = require('os')
const path = require('path')
const logger = require('./utils/logger.js')
const queue = require('queue')
const localpaths = require('./utils/localpaths.js')
const package = require('./package.json')

// First run, create config file
if(!fs.existsSync(localpaths.user+"config.json")){
	fs.outputFileSync(localpaths.user+"config.json",fs.readFileSync(__dirname+path.sep+"default.json",'utf8'))
}

// Main Constants
// Files
const configFileLocation = localpaths.user+"config.json"
// Folders
const coverArtFolder = os.tmpdir() + path.sep + 'deezloader-imgs' + path.sep
const defaultDownloadFolder = localpaths.user + 'Deezloader Music' + path.sep
// Default settings
const defaultSettings = require('./default.json').userDefined
// Spotify Files
const spotifySupport = fs.existsSync(localpaths.user+"authCredentials.js")
if (spotifySupport){
	var authCredentials = require(localpaths.user+'authCredentials.js')
	var Spotify = new spotifyApi(authCredentials)
}

// Setup the folders START
var mainFolder = defaultDownloadFolder

// See if all settings are there after update
var configFile = require(localpaths.user+path.sep+"config.json");
for (let x in defaultSettings){
	if (typeof configFile.userDefined[x] != typeof defaultSettings[x]){
		configFile.userDefined[x] = defaultSettings[x]
	}
}
// Set default download folder if not userDefined
if (configFile.userDefined.downloadLocation != "") {
	mainFolder = configFile.userDefined.downloadLocation
}

initFolders();

// Route and create server
app.use('/', express.static(__dirname + '/public/'))
server.listen(configFile.serverPort)
logger.info('Server is running @ localhost:' + configFile.serverPort)

// START sockets clusterfuck
io.sockets.on('connection', function (s) {
	logger.info("Connection recived!")

	// Check for updates
	request({
		url: "https://notabug.org/RemixDevs/DeezloaderRemix/raw/master/update.json",
		json: true
	}, function(error, response, body) {
		if (!error && response.statusCode === 200) {
			logger.info("Checking for updates")
			let [currentVersion_MAJOR, currentVersion_MINOR, currentVersion_PATCH] = package.version.split(".");
			let [lastVersion_MAJOR, lastVersion_MINOR, lastVersion_PATCH] = body.version.split(".");
			if (
				parseInt(lastVersion_MAJOR) > parseInt(currentVersion_MAJOR) ||
				parseInt(lastVersion_MINOR) > parseInt(currentVersion_MINOR) ||
				parseInt(lastVersion_PATCH) > parseInt(currentVersion_PATCH))
			{
				logger.info("Update Available");
				s.emit("message", {title: `Version ${lastVersion_MAJOR}.${lastVersion_MINOR}.${lastVersion_PATCH} is available!`, msg: body.changelog});
			}
		} else {
			logger.error(error + " " + response.statusCode);
		}
	})

	// Connection dependet variables
	s.Deezer = new deezerApi()
	// TODO: Change queue system
	s.downloadQueue = {}
	s.currentItem = null
	s.lastQueueId = null
	s.trackQueue = queue({
		autostart: true
	})
	s.trackQueue.concurrency = configFile.userDefined.queueConcurrency

	// Function for logging in
	s.on("login", async function (username, password, autologin) {
		try{
			logger.info("Logging in");
			await s.Deezer.login(username, password)
			s.emit("login", {user: s.Deezer.user})
			logger.info("Logged in successfully")
			if (autologin){
				// Save session login so next time login is not needed
				// This is the same method used by the official website
				s.emit('getCookies', s.Deezer.getCookies())
			}
		}catch(err){
			s.emit("login", {error: err.message})
			logger.error(`Login failed: ${err.message}`)
		}
	});

	// Function for autologin
	s.on("autologin", async function(jar, email){
		try{
      await s.Deezer.loginViaCookies(jar, email)
			s.emit('login', {user: s.Deezer.user})
    }catch(err){
      s.emit('login', {error: err.message})
			logger.error(`Autologin failed: ${err.message}`)
      return
    }
	})

	// Function for logout
	s.on("logout", function(){
		logger.info("Logged out")
		// Creating new object to clear the cookies
		s.Deezer = new deezerApi()
		return
	})

	// Returns list of charts available
	s.on("getChartsCountryList", async function (data) {
		try{
			let charts = await s.Deezer.legacyGetChartsTopCountry()
			charts = charts.data || []
			let countries = []
			for (let i = 0; i < charts.length; i++) {
				let obj = {
					country: charts[i].title.replace("Top ", ""),
					picture_small: charts[i].picture_small,
					picture_medium: charts[i].picture_medium,
					picture_big: charts[i].picture_big,
					playlistId: charts[i].id
				}
				countries.push(obj)
			}
			s.emit("getChartsCountryList", {countries: countries, selected: data.selected})
		}catch(err){
			logger.error(`getChartsCountryList failed: ${err.stack}`)
			return
		}
	})

	// Returns chart tracks from Playlist ID
	async function getChartsTrackListById(playlistId){
		if (typeof playlistId === 'undefined') {
			s.emit("getChartsTrackListByCountry", {err: "Can't find that playlist"})
			return
		}
		try{
			let tracks = await s.Deezer.legacyGetPlaylistTracks(playlistId)
			s.emit("getChartsTrackListByCountry", {
				playlistId: playlistId,
				tracks: tracks.data
			})
		}catch(err){
			s.emit("getChartsTrackListByCountry", {err: err})
			logger.error(`getChartsTrackListById failed: ${err.stack}`)
			return
		}
	}

	// Returns chart tracks from country name
	async function getChartsTrackListByCountry(country){
		if (typeof country === 'undefined') {
			s.emit("getChartsTrackListByCountry", {err: "No country passed"})
			return
		}
		try{
			let charts = await s.Deezer.legacyGetChartsTopCountry()
			charts = charts.data || []
			let countries = []
			for (let i = 0; i < charts.length; i++) {
				countries.push(charts[i].title.replace("Top ", ""))
			}
			if (countries.indexOf(country) == -1) {
				s.emit("getChartsTrackListByCountry", {err: "Country not found"});
				return
			}
			let playlistId = charts[countries.indexOf(country)].id;
			await getChartsTrackListById(playlistId)
		}catch(err){
			logger.error(`getChartsTrackListByCountry failed: ${err.stack}`)
			return
		}
	}
	s.on("getChartsTrackListByCountry", function (data) {getChartsTrackListByCountry(data.country)})

	// Returns list of playlists
	async function getMyPlaylistList(){
		try{
			logger.info("Loading Personal Playlists")
			let data = await s.Deezer.legacyGetUserPlaylists(s.Deezer.user.id)
			data = data.data || []
			let playlists = []
			for (let i = 0; i < data.length; i++) {
				let obj = {
					title: data[i].title,
					image: data[i].picture_small,
					songs: data[i].nb_tracks,
					link: data[i].link
				}
				playlists.push(obj)
			}
			if (configFile.userDefined.spotifyUser && spotifySupport){
				let creds = await Spotify.clientCredentialsGrant()
				Spotify.setAccessToken(creds.body['access_token'])
				let first = true
				let offset = 0
				do{
					let data = await Spotify.getUserPlaylists(configFile.userDefined.spotifyUser, {fields: "items(images,name,owner.id,tracks.total,uri),total", offset: offset*20})
					if (first){
						var total = data.body.total
						var numPages=Math.floor((total-1)/20)
						var playlistList = new Array(total)
						first = false
					}
					data.body.items.forEach((playlist, i) => {
						playlistList[(offset*20)+i] = {
							title: playlist.name,
							image: (playlist.images[0] ? playlist.images[0].url : ""),
							songs: playlist.tracks.total,
							link: playlist.uri,
							spotify: true
						}
					})
					offset++
				}while(offset<=numPages)
				playlists = playlists.concat(playlistList)
			}
			logger.info(`Loaded ${playlists.length} Playlist${playlists.length>1 ? "s" : ""}`)
			s.emit("getMyPlaylistList", {playlists: playlists})
		}catch(err){
			logger.error(`getMyPlaylistList failed: ${err.stack}`)
			return
		}
	}
	s.on("getMyPlaylistList", function (d) {getMyPlaylistList()})

	// Returns search results from a query
	s.on("search", async function (data) {
		data.type = data.type || "track"
		if (["track", "playlist", "album", "artist"].indexOf(data.type) == -1) data.type = "track"

		// Remove "feat."  "ft." and "&" (causes only problems)
		data.text = data.text
			.replace(/ feat[\.]? /g, " ")
			.replace(/ ft[\.]? /g, " ")
			.replace(/\(feat[\.]? /g, " ")
			.replace(/\(ft[\.]? /g, " ")
			.replace(/\&/g, "")
			.replace(/–/g, "-")
			.replace(/—/g, "-")

		try {
			let searchObject = await s.Deezer.legacySearch(encodeURIComponent(data.text), data.type)
			s.emit("search", {type: data.type, items: searchObject.data})
		} catch (err) {
			s.emit("search", {type: data.type, items: []})
			logger.error(`search failed: ${err.stack}`)
			return
		}
	})

	// Returns list of tracks from an album/playlist or the list of albums from an artist
	s.on("getTrackList", async function (data) {
		if (!data.type || (["playlist", "album", "artist", "spotifyplaylist"].indexOf(data.type) == -1) || !data.id) {
			s.emit("getTrackList", {err: -1, response: {}, id: data.id, reqType: data.type})
			return
		}
		if (data.type == 'artist') {
			try{
				let response = await s.Deezer.legacyGetArtistAlbums(data.id)
				s.emit("getTrackList", {response: response, id: data.id, reqType: data.type})
			}catch(err){
				s.emit("getTrackList", {err: "wrong artist id", response: {}, id: data.id, reqType: data.type})
				logger.error(`getTrackList failed: ${err.stack}`)
				return
			}
		}else if(data.type == "spotifyplaylist" && spotifySupport){
			try{
				let creds = await Spotify.clientCredentialsGrant()
				Spotify.setAccessToken(creds.body.access_token)
				let first = true
				let offset = 0
				do{
					let resp = await Spotify.getPlaylistTracks(data.id, {fields: "items(track(artists,name,duration_ms,preview_url,explicit)),total", offset: offset*100})
					if (first){
						var numPages=Math.floor((resp.body.total-1)/100)
						var response = new Array(resp.body.total)
						first = false
					}
					resp.body.items.forEach((t, index) => {
						response[index+offset*100]={
							explicit_lyrics: t.track.explicit,
							preview: t.track.preview_url,
							title: t.track.name,
							artist: {
								name: t.track.artists[0].name
							},
							duration: Math.floor(t.track.duration_ms/1000)
						}
					})
					offset++
				}while(offset<=numPages)
				s.emit("getTrackList", {response: {'data': response}, id: data.id, reqType: data.type})
			}catch(err){
				logger.error(`getTrackList failed: ${err.stack}`)
			}
		}else{
			let reqType = data.type.charAt(0).toUpperCase() + data.type.slice(1)
			try{
				let response = await s.Deezer["legacyGet" + reqType + "Tracks"](data.id)
				s.emit("getTrackList", {response: response, id: data.id, reqType: data.type})
			}catch(err){
				s.emit("getTrackList", {err: "wrong id "+reqType, response: {}, id: data.id, reqType: data.type})
				logger.error(`getTrackList failed: ${err.stack}`)
				return
			}
		}
	})

	s.on("getUserSettings", function () {
		let settings = configFile.userDefined;
		if (!settings.downloadLocation) {
			settings.downloadLocation = mainFolder;
		}
		s.emit('getUserSettings', {settings: settings});
	});

	s.on("saveSettings", function (settings) {
		if (settings.userDefined.downloadLocation == defaultDownloadFolder) {
			settings.userDefined.downloadLocation = "";
		} else {
			settings.userDefined.downloadLocation = path.resolve(settings.userDefined.downloadLocation + path.sep) + path.sep;
			mainFolder = settings.userDefined.downloadLocation;
		}

		if (settings.userDefined.queueConcurrency < 1) settings.userDefined.queueConcurrency = 1;

		if (settings.userDefined.queueConcurrency != s.trackQueue.concurrency){
			s.trackQueue.concurrency = settings.userDefined.queueConcurrency;
		}

		if (settings.userDefined.chartsCountry != configFile.userDefined.chartsCountry){
			s.emit("setChartsCountry", {selected: settings.userDefined.chartsCountry});
			getChartsTrackListByCountry(settings.userDefined.chartsCountry);
		}

		if (settings.userDefined.spotifyUser != configFile.userDefined.spotifyUser){
			getMyPlaylistList(settings.userDefined.spotifyUser);
		}

		configFile.userDefined = settings.userDefined;
		fs.outputFile(configFileLocation, JSON.stringify(configFile, null, 2), function (err) {
			if (err) return;
			logger.info("Settings updated");
			initFolders();
		});
	});

	/*
	// TODO: Make download progress not depend from the API
	s.Deezer.onDownloadProgress = function (track, progress) {
		if (!track.trackSocket) {
			return;
		}
		if(track.trackSocket.currentItem && track.trackSocket.currentItem.type == "track"){
			let complete;
			if (!track.trackSocket.currentItem.percentage) {
				track.trackSocket.currentItem.percentage = 0;
			}
			if (parseInt(track.SNG_ID)<0){
				complete = track.FILESIZE;
			}else if(track.format == 9){
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

	// TODO: Change queue system
	function addToQueue(object) {
		s.downloadQueue[object.queueId] = object;
		s.emit('addToQueue', object);
		queueDownload(getNextDownload());
	}

	// TODO: Change queue system
	function getNextDownload() {
		if (s.currentItem != null || Object.keys(s.downloadQueue).length == 0) {
			if (Object.keys(s.downloadQueue).length == 0 && s.currentItem == null) {
				s.emit("emptyDownloadQueue", {});
			}
			return null;
		}
		s.currentItem = s.downloadQueue[Object.keys(s.downloadQueue)[0]];
		return s.currentItem;
	}

	// TODO: Change queue system
	function socketDownloadTrack(data){
		if(parseInt(data.id)>0){
			s.Deezer.getTrack(data.id, data.settings.maxBitrate, data.settings.fallbackBitrate, function (track, err) {
				if (err) {
					logger.error(err)
					return;
				}
				let queueId = "id" + Math.random().toString(36).substring(2);
				let _track = {
					name: track["SNG_TITLE"],
					artist: track["ART_NAME"],
					size: 1,
					downloaded: 0,
					failed: 0,
					queueId: queueId,
					id: track["SNG_ID"],
					type: "track"
				};
				data.settings.trackInfo= slimDownTrackInfo(track);
				if (track["VERSION"]) _track.name = _track.name + " " + track["VERSION"];
				_track.settings = data.settings || {};
				addToQueue(JSON.parse(JSON.stringify(_track)));
			});
		}else{
			s.Deezer.getLocalTrack(data.id, function (track, err) {
				if (err) {
					logger.error(err)
					return;
				}
				let queueId = "id" + Math.random().toString(36).substring(2);
				let _track = {
					name: track["SNG_TITLE"],
					artist: track["ART_NAME"],
					size: 1,
					downloaded: 0,
					failed: 0,
					queueId: queueId,
					id: track["SNG_ID"],
					type: "track"
				};
				data.settings.trackInfo= slimDownTrackInfo(track);
				if (track["VERSION"]) _track.name = _track.name + " " + track["VERSION"];
				_track.settings = data.settings || {};
				addToQueue(JSON.parse(JSON.stringify(_track)));
			});
		}
	}
	s.on("downloadtrack", data=>{socketDownloadTrack(data)});

	// TODO: Change queue system
	function socketDownloadPlaylist(data){
		s.Deezer.getPlaylist(data.id, function (playlist, err) {
			if (err) {
				logger.error(err)
				return;
			}
			let queueId = "id" + Math.random().toString(36).substring(2);
			let _playlist = {
				name: playlist["title"],
				size: playlist.nb_tracks,
				downloaded: 0,
				artist: playlist.creator.name,
				failed: 0,
				queueId: queueId,
				id: playlist["id"],
				type: "playlist",
				cover: playlist["picture_small"],
			};
			_playlist.settings = data.settings || {};
			s.Deezer.getAdvancedPlaylistTracks(data.id, function (playlist, err) {
				if (err){
					logger.error(err)
					return;
				}
				_playlist.size = playlist.data.length
				_playlist.tracks = playlist.data
				addToQueue(JSON.parse(JSON.stringify(_playlist)));
			})
		});
	}
	s.on("downloadplaylist", data=>{socketDownloadPlaylist(data)});

	// TODO: Change queue system
	function socketDownloadAlbum(data){
		s.Deezer.getAlbum(data.id, function (album, err) {
			if (err) {
				logger.error(err)
				return;
			}
			let queueId = "id" + Math.random().toString(36).substring(2);
			let _album = {
				name: album["title"],
				label: album["label"],
				artist: album["artist"].name,
				size: album.tracks.data.length,
				downloaded: 0,
				failed: 0,
				queueId: queueId,
				id: album["id"],
				type: "album",
			};
			data.settings.albumInfo = slimDownAlbumInfo(album)
			_album.settings = data.settings || {};
			s.Deezer.getAdvancedAlbumTracks(data.id, function (album, err) {
				if (err){
					logger.error(err)
					return;
				}
				_album.size = album.data.length
				_album.tracks = album.data
				addToQueue(JSON.parse(JSON.stringify(_album)));
			})
		});
	}
	s.on("downloadalbum", data=>{socketDownloadAlbum(data)});

	// TODO: Change queue system
	function socketDownloadArtist(data){
		s.Deezer.getArtistAlbums(data.id, function (albums, err) {
			if (err) {
				logger.error(err)
				return;
			}
			(function sendAllAlbums(i) {
				setTimeout(function () {
		      data.id = albums.data[albums.data.length-1-i].id;
					socketDownloadAlbum(JSON.parse(JSON.stringify(data)));
		      if (--i+1) sendAllAlbums(i);
		   	}, 100)
			})(albums.data.length-1);
		});
	}
	s.on("downloadartist", data=>{socketDownloadArtist(data)});

	// TODO: Change queue system
	s.on("downloadspotifyplaylist", function (data) {
		if (spotifySupport){
			Spotify.clientCredentialsGrant().then(function(creds) {
				Spotify.setAccessToken(creds.body['access_token']);
				return Spotify.getPlaylist(data.id, {fields: "id,name,owner,images,tracks(total,items(track.artists,track.name,track.album))"})
			}).then(function(resp) {
				let queueId = "id" + Math.random().toString(36).substring(2);
				let _playlist = {
					name: resp.body["name"],
					artist: (resp.body["owner"]["display_name"] ? resp.body["owner"]["display_name"] : resp.body["owner"]["id"]),
					size: resp.body["tracks"]["total"],
					downloaded: 0,
					failed: 0,
					queueId: queueId,
					id: resp.body["id"],
					type: "spotifyplaylist",
					cover: (resp.body["images"] ? resp.body["images"][0]["url"] : null),
					tracks: resp.body["tracks"]["items"]
				};
				_playlist.settings = data.settings || {};
				addToQueue(JSON.parse(JSON.stringify(_playlist)));
			}).catch(err=>{
				logger.error(err)
				return;
			})
		}else{
			s.emit("message", {title: "Spotify Support is not enabled", msg: "You should add authCredentials.js in your config files to use this feature<br>You can see how to do that in <a href=\"https://notabug.org/RemixDevs/DeezloaderRemix/wiki/Spotify+Features\">this guide</a>"})
		}
	});

	// TODO: Change queue system
	//currentItem: the current item being downloaded at that moment such as a track or an album
	//downloadQueue: the tracks in the queue to be downloaded
	//lastQueueId: the most recent queueId
	//queueId: random number generated when user clicks download on something
	function queueDownload(downloading) {
		if (!downloading) return;

		// New batch emits new message
		if (s.lastQueueId != downloading.queueId) {
			if (downloading.type != "spotifyplaylist"){
				s.emit("downloadStarted", {queueId: downloading.queueId});
			}
			s.lastQueueId = downloading.queueId;
		}
		let filePath;
		logger.info(`Registered ${downloading.type}: ${downloading.id} | ${downloading.artist} - ${downloading.name}`);
		switch(downloading.type){
			case "track":
				let alternativeID = 0;
				if (downloading.settings.trackInfo.FALLBACK)
					if (downloading.settings.trackInfo.FALLBACK.SNG_ID)
						alternativeID = downloading.settings.trackInfo.FALLBACK.SNG_ID;
				downloadTrack({id: downloading.id, fallback: (alternativeID == 0 ? null : alternativeID), name: downloading.name, artist: downloading.artist, queueId: downloading.queueId}, downloading.settings, null, function (err, track) {
					if (err) {
						downloading.failed++;
					} else {
						downloading.downloaded++;
					}
					downloading.settings = null;
					s.emit("updateQueue", downloading);
					s.emit("downloadProgress", {
						queueId: downloading.queueId,
						percentage: 100
					});
					if (downloading && s.downloadQueue[Object.keys(s.downloadQueue)[0]] && (Object.keys(s.downloadQueue)[0] == downloading.queueId)) delete s.downloadQueue[Object.keys(s.downloadQueue)[0]];
					s.currentItem = null;
					queueDownload(getNextDownload());
				});
				break;
			case "album":
				downloading.playlistContent = downloading.tracks.map((t,i) => {
					if (t.FALLBACK){
						if (t.FALLBACK.SNG_ID)
							return {id: t.SNG_ID, fallback: t.FALLBACK.SNG_ID, name: (t.VERSION ? t.SNG_TITLE + " "+t.VERSION : t.SNG_TITLE), artist: t.ART_NAME, index: i+"", queueId: downloading.queueId}
					}else{
						return {id: t.SNG_ID, name: (t.VERSION ? t.SNG_TITLE+" "+t.VERSION : t.SNG_TITLE), artist: t.ART_NAME, index: i+"", queueId: downloading.queueId}
					}
				})
				downloading.settings.albName = downloading.name;
				downloading.settings.artName = downloading.artist;
				downloading.errorLog = "";
				downloading.searchedLog = "";
				downloading.playlistArr = Array(downloading.size);
				filePath = mainFolder;
				if (downloading.settings.createArtistFolder || downloading.settings.createAlbumFolder) {
					if (downloading.settings.createArtistFolder) {
						filePath += antiDot(fixName(downloading.settings.artName)) + path.sep;
					}
					if (downloading.settings.createAlbumFolder) {
						filePath += antiDot(fixName(settingsRegexAlbum(downloading.settings.foldername,downloading.settings.artName,downloading.settings.albName,downloading.settings.albumInfo.release_date.slice(0, 4),downloading.settings.albumInfo.record_type,downloading.settings.albumInfo.explicit_lyrics,downloading.settings.albumInfo.label))) + path.sep;
					}
				} else if (downloading.settings.artName) {
					filePath += antiDot(fixName(settingsRegexAlbum(downloading.settings.foldername,downloading.settings.artName,downloading.settings.albName,downloading.settings.albumInfo.release_date.slice(0, 4),downloading.settings.albumInfo.record_type,downloading.settings.albumInfo.explicit_lyrics,downloading.settings.albumInfo.label))) + path.sep;
				}
				downloading.finished = new Promise((resolve,reject)=>{
					downloading.playlistContent.every(function (t) {
						s.trackQueue.push(cb=>{
							if (!s.downloadQueue[downloading.queueId]) {
								reject();
								return false;
							}
							logger.info(`Now downloading: ${t.artist} - ${t.name}`)
							downloadTrack(t, downloading.settings, null, function (err, track) {
								if (!err) {
									downloading.downloaded++;
									downloading.playlistArr[track.playlistData[0]] = track.playlistData[1].split(filePath)[1];
									if (track.searched) downloading.searchedLog += `${t.artist} - ${t.name}\r\n`
								} else {
									downloading.failed++;
									downloading.errorLog += `${t.id} | ${t.artist} - ${t.name} | ${err}\r\n`;
								}
								s.emit("downloadProgress", {
									queueId: downloading.queueId,
									percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
								});
								s.emit("updateQueue", downloading);
								if (downloading.downloaded + downloading.failed == downloading.size)
									resolve();
								cb();
							});
						});
						return true;
					});
				})
				downloading.finished.then(()=>{
					if (downloading.countPerAlbum) {
						if (Object.keys(s.downloadQueue).length > 1 && Object.keys(s.downloadQueue)[1] == downloading.queueId) {
							s.downloadQueue[downloading.queueId].download = downloading.downloaded;
						}
						s.emit("updateQueue", downloading);
					}
					logger.info("Album finished "+downloading.name);
					s.emit("downloadProgress", {
						queueId: downloading.queueId,
						percentage: 100
					});
					if (downloading.settings.logErrors){
						if (downloading.errorLog != ""){
							if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);
							fs.writeFileSync(filePath+"notFound.txt",downloading.errorLog)
						}else{
							if (fs.existsSync(filePath+"notFound.txt")) fs.unlinkSync(filePath+"notFound.txt");
						}
					}
					if (downloading.settings.logSearched){
						if (downloading.searchedLog != ""){
							if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);
							fs.writeFileSync(filePath+"alternativeSongs.txt",downloading.searchedLog)
						}else{
							if (fs.existsSync(filePath+"alternativeSongs.txt")) fs.unlinkSync(filePath+"alternativeSongs.txt");
						}
					}
					if (downloading.settings.createM3UFile){
						fs.writeFileSync(filePath + "playlist.m3u", downloading.playlistArr.join("\r\n"));
					}
					if (downloading && s.downloadQueue[Object.keys(s.downloadQueue)[0]] && (Object.keys(s.downloadQueue)[0] == downloading.queueId)) delete s.downloadQueue[Object.keys(s.downloadQueue)[0]];
					s.currentItem = null;
					queueDownload(getNextDownload());
				}).catch((err)=>{
					if (err) return logger.error(err.stack);
					logger.info("Stopping the album queue");
					if (downloading && s.downloadQueue[Object.keys(s.downloadQueue)[0]] && (Object.keys(s.downloadQueue)[0] == downloading.queueId)) delete s.downloadQueue[Object.keys(s.downloadQueue)[0]];
					s.currentItem = null;
					queueDownload(getNextDownload());
				});
				break;
			case "playlist":
				downloading.playlistContent = downloading.tracks.map((t,i) => {
					if (t.FALLBACK){
						if (t.FALLBACK.SNG_ID)
							return {id: t.SNG_ID, fallback: t.FALLBACK.SNG_ID, name: (t.VERSION ? t.SNG_TITLE + " "+t.VERSION : t.SNG_TITLE), artist: t.ART_NAME, index: i+"", queueId: downloading.queueId}
					}else{
						return {id: t.SNG_ID, name: (t.VERSION ? t.SNG_TITLE+" "+t.VERSION : t.SNG_TITLE), artist: t.ART_NAME, index: i+"", queueId: downloading.queueId}
					}
				})
				downloading.settings.plName = downloading.name;
				downloading.errorLog = ""
				downloading.searchedLog = "";
				downloading.playlistArr = Array(downloading.size);
				downloading.settings.playlist = {
					fullSize: downloading.playlistContent.length
				};
				filePath = mainFolder+antiDot(fixName(downloading.settings.plName)) + path.sep
				downloading.finished = new Promise((resolve,reject)=>{
					downloading.playlistContent.every(function (t) {
						s.trackQueue.push(cb=>{
							if (!s.downloadQueue[downloading.queueId]) {
								reject();
								return false;
							}
							logger.info(`Now downloading: ${t.artist} - ${t.name}`)
							downloadTrack(t, downloading.settings, null, function (err, track) {
								if (!err) {
									downloading.downloaded++;
									downloading.playlistArr[track.playlistData[0]] = track.playlistData[1].split(filePath)[1];
									if (track.searched) downloading.searchedLog += `${t.artist} - ${t.name}\r\n`
								} else {
									downloading.failed++;
									downloading.errorLog += `${t.id} | ${t.artist} - ${t.name} | ${err}\r\n`;
								}
								s.emit("downloadProgress", {
									queueId: downloading.queueId,
									percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
								});
								s.emit("updateQueue", downloading);
								if (downloading.downloaded + downloading.failed == downloading.size)
									resolve();
								cb();
							});
						});
						return true;
					})
				});
				downloading.finished.then(()=>{
					logger.info("Playlist finished "+downloading.name);
					s.emit("downloadProgress", {
						queueId: downloading.queueId,
						percentage: 100
					});
					if (downloading.settings.logErrors){
						if (downloading.errorLog != ""){
							if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);
							fs.writeFileSync(filePath+"notFound.txt",downloading.errorLog)
						}else{
							if (fs.existsSync(filePath+"notFound.txt")) fs.unlinkSync(filePath+"notFound.txt");
						}
					}
					if (downloading.settings.logSearched){
						if (downloading.searchedLog != ""){
							if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);
							fs.writeFileSync(filePath+"alternativeSongs.txt",downloading.searchedLog)
						}else{
							if (fs.existsSync(filePath+"alternativeSongs.txt")) fs.unlinkSync(filePath+"alternativeSongs.txt");
						}
					}
					if (downloading.settings.createM3UFile){
						fs.writeFileSync(filePath + "playlist.m3u", downloading.playlistArr.join("\r\n"));
					}
					if (downloading.settings.saveArtwork){
						if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);
						let imgPath = filePath + antiDot(fixName(settingsRegexCover(downloading.settings.coverImageTemplate,downloading.artist,downloading.name)))+(downloading.settings.PNGcovers ? ".png" : ".jpg");
						if (downloading.cover){
							downloading.cover = downloading.cover.replace("56x56",`${downloading.settings.artworkSize}x${downloading.settings.artworkSize}`)
							request.get(downloading.cover, {strictSSL: false,encoding: 'binary'}, function(error,response,body){
								if(error){
									logger.error(error.stack);
									return;
								}
								fs.outputFile(imgPath,body,'binary',function(err){
									if(err){
										logger.error(err.stack);
										return;
									}
									logger.info(`Cover downloaded for: ${downloading.settings.plName}`)
								})
							});
						}
					}
					if (downloading && s.downloadQueue[Object.keys(s.downloadQueue)[0]] && (Object.keys(s.downloadQueue)[0] == downloading.queueId)) delete s.downloadQueue[Object.keys(s.downloadQueue)[0]];
					s.currentItem = null;
					queueDownload(getNextDownload());
				}).catch((err)=>{
					if (err) return logger.error(err.stack);
					logger.info("Stopping the playlist queue");
					if (downloading && s.downloadQueue[Object.keys(s.downloadQueue)[0]] && (Object.keys(s.downloadQueue)[0] == downloading.queueId)) delete s.downloadQueue[Object.keys(s.downloadQueue)[0]];
					s.currentItem = null;
					queueDownload(getNextDownload());
				});
				break;
			case "spotifyplaylist":
			if (spotifySupport){
				Spotify.clientCredentialsGrant().then(function(creds) {
					downloading.settings.plName = downloading.name;
					downloading.playlistArr = Array(downloading.size);
					Spotify.setAccessToken(creds.body['access_token']);
					numPages=Math.floor((downloading.size-1)/100);
					let pages = []
					downloading.playlistContent = new Array(downloading.size);
					downloading.tracks.map((t,i)=>{
						downloading.playlistContent[i]=new Promise(function(resolve, reject) {
							s.Deezer.track2ID(t.track.artists[0].name, t.track.name, t.track.album.name, function (response,err){
								resolve(response);
							});
						});
					})
					if (downloading.size>100){
						for (let offset = 1; offset<=numPages; offset++){
							pages.push(new Promise(function(resolvePage) {
								Spotify.getPlaylistTracks(downloading.id, {fields: "items(track.artists,track.name,track.album)", offset: offset*100}).then(function(resp) {
									resp.body['items'].forEach((t, index) => {
										downloading.playlistContent[(offset*100)+index] = new Promise(function(resolve, reject) {
											s.Deezer.track2ID(t.track.artists[0].name, t.track.name, t.track.album.name, function (response,err){
												resolve(response);
											});
										});
									});
									resolvePage();
								});
							}));
						}
					}
					logger.info("Waiting for all pages");
					Promise.all(pages).then((val)=>{
						logger.info("Waiting for all tracks to be converted");
						return Promise.all(downloading.playlistContent)
					}).then((values)=>{
						if (!s.downloadQueue[downloading.queueId]) {
							logger.info("Stopping the playlist queue");
							if (downloading && s.downloadQueue[Object.keys(s.downloadQueue)[0]] && (Object.keys(s.downloadQueue)[0] == downloading.queueId)) delete s.downloadQueue[Object.keys(s.downloadQueue)[0]];
							s.currentItem = null;
							queueDownload(getNextDownload());
							return;
						}
						logger.info("All tracks converted, starting download");
						s.emit("downloadStarted", {queueId: downloading.queueId});
						downloading.errorLog = "";
						downloading.searchedLog = "";
						downloading.settings.playlist = {
							fullSize: values.length
						};
						filePath = mainFolder+antiDot(fixName(downloading.settings.plName)) + path.sep
						downloading.finished = new Promise((resolve,reject)=>{
							values.every(function (t) {
								t.index = values.indexOf(t)+""
								t.queueId = downloading.queueId
								s.trackQueue.push(cb=>{
									if (!s.downloadQueue[downloading.queueId]) {
										reject();
										return false;
									}
									logger.info(`Now downloading: ${t.artist} - ${t.name}`)
									downloadTrack(t, downloading.settings, null, function (err, track) {
										if (!err) {
											downloading.downloaded++;
											downloading.playlistArr[track.playlistData[0]] = track.playlistData[1].split(filePath)[1];
											if (track.searched) downloading.searchedLog += `${t.artist} - ${t.name}\r\n`
										} else {
											downloading.failed++;
											downloading.errorLog += `${t.id} | ${t.artist} - ${t.name} | ${err}\r\n`;
										}
										s.emit("downloadProgress", {
											queueId: downloading.queueId,
											percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
										});
										if (downloading.downloaded + downloading.failed == downloading.size)
											resolve();
										s.emit("updateQueue", downloading);
										cb();
									});
								});
								return true;
							});
						});
						downloading.finished.then(()=>{
							logger.info("Playlist finished "+downloading.name);
							s.emit("downloadProgress", {
								queueId: downloading.queueId,
								percentage: 100
							});
							if (downloading.settings.logErrors){
								if (downloading.errorLog != ""){
									if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);
									fs.writeFileSync(filePath+"notFound.txt",downloading.errorLog)
								}else{
									if (fs.existsSync(filePath+"notFound.txt")) fs.unlinkSync(filePath+"notFound.txt");
								}
							}
							if (downloading.settings.logSearched){
								if (downloading.searchedLog != ""){
									if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);
									fs.writeFileSync(filePath+"alternativeSongs.txt",downloading.searchedLog)
								}else{
									if (fs.existsSync(filePath+"alternativeSongs.txt")) fs.unlinkSync(filePath+"alternativeSongs.txt");
								}
							}
							if (downloading.settings.createM3UFile){
								fs.writeFileSync(filePath + "playlist.m3u", downloading.playlistArr.join("\r\n"));
							}
							if (downloading.settings.saveArtwork){
								if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);
								let imgPath = filePath + antiDot(fixName(settingsRegexCover(downloading.settings.coverImageTemplate,downloading.artist,downloading.name)))+(downloading.settings.PNGcovers ? ".png" : ".jpg");
								if (downloading.cover){
									request.get(downloading.cover, {strictSSL: false,encoding: 'binary'}, function(error,response,body){
										if(error){
											logger.error(error.stack);
											return;
										}
										fs.outputFile(imgPath,body,'binary',function(err){
											if(err){
												logger.error(err.stack);
												return;
											}
											logger.info(`Cover downloaded for: ${downloading.settings.plName}`)
										})
									});
								}
							}
							if (downloading && s.downloadQueue[Object.keys(s.downloadQueue)[0]] && (Object.keys(s.downloadQueue)[0] == downloading.queueId)) delete s.downloadQueue[Object.keys(s.downloadQueue)[0]];
							s.currentItem = null;
							queueDownload(getNextDownload());
						}).catch((err)=>{
							if (err) return logger.error(err.stack);
							logger.info("Stopping the playlist queue");
							if (downloading && s.downloadQueue[Object.keys(s.downloadQueue)[0]] && (Object.keys(s.downloadQueue)[0] == downloading.queueId)) delete s.downloadQueue[Object.keys(s.downloadQueue)[0]];
							s.currentItem = null;
							queueDownload(getNextDownload());
						});
					}).catch((err)=>{
						logger.error('Something went wrong!'+err.stack);
					});
				}).catch((err)=>{
					logger.error('Something went wrong!'+err.stack);
				});
			}else{
				s.emit("message", {title: "Spotify Support is not enabled", msg: "You should add authCredentials.js in your config files to use this feature<br>You can see how to do that in <a href=\"https://notabug.org/RemixDevs/DeezloaderRemix/wiki/Spotify+Features\">this guide</a>"})
			}
			break;
		}
	}

	// TODO: Change queue system
	function socketCancelDownload(queueId){
		if (!queueId) {
			return;
		}
		let cancel = false;
		let cancelSuccess;
		if (s.downloadQueue[queueId]){
			cancel = true;
			delete s.downloadQueue[queueId];
		}
		if (s.currentItem && s.currentItem.queueId == queueId) {
			cancelSuccess = s.Deezer.cancelDecryptTrack(queueId);
			s.trackQueue = queue({
				autostart: true,
				concurrency: s.trackQueue.concurrency
			})
			cancel = cancel || cancelSuccess;
		}
		if (cancel) {
			s.emit("cancelDownload", {queueId: queueId});
		}
	}
	s.on("cancelDownload", function (data) {socketCancelDownload(data.queueId)});

	s.on("cancelAllDownloads", function(data){
		data.queueList.forEach(x=>{
			socketCancelDownload(x);
		})
	})

	s.on("downloadAlreadyInQueue", function (data) {
		if (data.id) {
			return;
		}
		let isInQueue = checkIfAlreadyInQueue(data.id);
		if (isInQueue) {
			s.emit("downloadAlreadyInQueue", {alreadyInQueue: true, id: data.id, queueId: isInQueue});
		} else {
			s.emit("downloadAlreadyInQueue", {alreadyInQueue: false, id: data.id});
		}
	});

	// TODO: Rewrite this entire function with awaits
	function downloadTrack(t, settings, altmetadata, callback) {
		if (!s.downloadQueue[t.queueId]) {
			logger.error(`Failed to download ${t.artist} - ${t.name}: Not in queue`);
			callback(new Error("Not in queue"));
			return;
		}
		if (t.id == 0){
			logger.error(`Failed to download ${t.artist} - ${t.name}: Wrong ID`);
			callback(new Error("Wrong ID"));
			return;
		}
		settings = settings || {};
		let temp;
		temp = new Promise((resolve, reject)=>{
			if (!settings.trackInfo){
				logger.info("Getting track data");
				if (parseInt(t.id)<0){
					s.Deezer.getLocalTrack(t.id, function (trackInfo, err) {
						if (err) {
							if(!t.searched){
								logger.warn("Failed to download track, searching for alternative");
								s.Deezer.track2ID(t.artist, t.name, null, data=>{
									if (t.id != 0){
										t.searched = true;
										t.id = data.id;
										t.artist = data.artist;
										t.name = data.name;
										downloadTrack(t, settings, null, callback);
									}else{
										logger.error(`Failed to download ${t.artist} - ${t.name}: Searched alternative; Not found`);
										callback(new Error("Searched alternative; Not found"));
									}
								});
							}else{
								logger.error(`Failed to download ${t.artist} - ${t.name}: ${err}`);
								callback(err);
							}
							return;
						}
						resolve(trackInfo);
					});
				}else{
					s.Deezer.getTrack(t.id, settings.maxBitrate, settings.fallbackBitrate, function (trackInfo, err) {
						if (err) {
							if(t.fallback){
								logger.warn("Failed to download track, falling on alternative");
								t.id = t.fallback
								t.fallback = 0
								downloadTrack(t, settings, null, callback);
							}else if(!t.searched){
								logger.warn("Failed to download track, searching for alternative");
								s.Deezer.track2ID(t.artist, t.name, null, data=>{
									if (t.id != 0){
										t.searched = true;
										t.id = data.id;
										t.artist = data.artist;
										t.name = data.name;
										downloadTrack(t, settings, null, callback);
									}else{
										logger.error(`Failed to download ${t.artist} - ${t.name}: Searched alternative; Not found`);
										callback(new Error("Searched alternative; Not found"));
									}
								});
							}else{
								logger.error(`Failed to download ${t.artist} - ${t.name}: ${err}`);
								callback(err);
							}
							return;
						}
						resolve(trackInfo);
					});
				}
			}else{
				resolve(settings.trackInfo);
			}
		})
		temp.then(data=>{
		let track = data;
		track.trackSocket = socket;
		temp = new Promise((resolve, reject)=>{
			if (parseInt(t.id)>0 && !altmetadata){
				if (!settings.albumInfo){
					logger.info("Getting album data");
					s.Deezer.getAlbum(track["ALB_ID"], function(res, err){
						if(err){
							logger.warn("Album not found, trying to reach deeper");
							s.Deezer.getAAlbum(track["ALB_ID"], function(res, err){
								if(err){
									if(t.fallback){
										logger.warn("Failed to download track, falling on alternative");
										t.id = t.fallback
										t.fallback = 0
										settings.trackInfo = null;
										downloadTrack(t, settings, null, callback);
									}else if(!t.searched){
										logger.warn("Failed to download track, searching for alternative");
										s.Deezer.track2ID(t.artist, t.name, null, data=>{
											if (t.id != 0){
												t.searched = true;
												t.id = data.id;
												t.artist = data.artist;
												t.name = data.name;
												downloadTrack(t, settings, null, callback);
											}else{
												logger.error(`Failed to download ${t.artist} - ${t.name}: Searched alternative album; Not found`);
												callback(new Error("Searched alternative album; Not found"));
											}
										});
									}else{
										logger.error(`Failed to download ${t.artist} - ${t.name}: ${err}`);
										callback(err);
									}
									return;
								}
								resolve(res);
							})
							return;
						}
						resolve(res);
					})
				}else{
					resolve(settings.albumInfo)
				}
			}else{
				resolve({artist:{}})
			}
		});
		temp.then(albumres=>{
		let ajson = albumres;
		if (ajson.totalDiskNumber){
			temp = new Promise((resolve, reject) =>{
				resolve(ajson.totalDiskNumber)
			})
		}else{
			if (((settings.tags.discTotal || settings.createCDFolder) && parseInt(t.id)>0) && !altmetadata){
				logger.info("Getting total disc number");
				temp = new Promise((resolve, reject) =>{
					s.Deezer.getATrack(ajson.tracks.data[ajson.tracks.data.length-1].id, function(tres){
						resolve(tres.disk_number);
					});
				})
			}else{
				temp = new Promise((resolve, reject) =>{
					resolve(null)
				})
			}
		}
		temp.then(discTotal=>{
		let totalDiskNumber = discTotal;
		if ((settings.tags.bpm && parseInt(t.id)>0) && !altmetadata){
			logger.info("Getting BPM");
			temp = new Promise((resolve, reject) =>{
				s.Deezer.getATrack(t.id, function(tres, err){
					if (err) resolve(0);
					resolve(tres.bpm);
				});
			})
		}else{
			temp = new Promise((resolve, reject) =>{
				resolve(0);
			})
		}
		temp.then(bpm=>{
		track.BPM = bpm;
		let metadata = parseMetadata(track, ajson, totalDiskNumber, settings, parseInt(t.index), altmetadata);
		if (settings.saveFullArtists && settings.multitagSeparator != null){
			let filename = fixName(`${metadata.artists} - ${metadata.title}`);
		}else{
			let filename = fixName(`${metadata.artist} - ${metadata.title}`);
		}
		if (settings.filename) {
			filename = fixName(settingsRegex(metadata, settings.filename, settings.playlist, settings.saveFullArtists && settings.multitagSeparator != null, settings.paddingSize));
		}
		let filepath = mainFolder;
		let artistPath;
		if (settings.createArtistFolder || settings.createAlbumFolder) {
			if(settings.plName){
				filepath += antiDot(fixName(settings.plName)) + path.sep;
			}
			if (settings.createArtistFolder) {
				if(settings.artName){
					filepath += antiDot(fixName(settings.artName)) + path.sep;
				}else{
					filepath += antiDot(fixName(metadata.albumArtist)) + path.sep;
				}
				artistPath = filepath;
			}

			if (settings.createAlbumFolder) {
				if(settings.artName){
					filepath += antiDot(fixName(settingsRegexAlbum(settings.foldername,settings.artName,settings.albName,metadata.year,metadata.rtype,metadata.albumExplicit,metadata.publisher))) + path.sep;
				}else{
					filepath += antiDot(fixName(settingsRegexAlbum(settings.foldername,metadata.albumArtist,metadata.album,metadata.year,metadata.rtype,metadata.albumExplicit,metadata.publisher))) + path.sep;
				}
			}
		} else if (settings.plName) {
			filepath += antiDot(fixName(settings.plName)) + path.sep;
		} else if (settings.artName) {
			filepath += antiDot(fixName(settingsRegexAlbum(settings.foldername,settings.artName,settings.albName,metadata.year,metadata.rtype,metadata.albumExplicit,metadata.publisher))) + path.sep;
		}
		let coverpath = filepath;
		if (metadata.discTotal > 1 && (settings.artName || settings.createAlbumFolder) && settings.createCDFolder){
			filepath += `CD${metadata.discNumber +  path.sep}`
		}
		let writePath;
		if(track.format == 9){
			writePath = filepath + filename + '.flac';
		}else{
			writePath = filepath + filename + '.mp3';
		}
		if(track["LYRICS_SYNC_JSON"] && settings.syncedlyrics){
			let lyricsbuffer = "";
			for(let i=0;i<track["LYRICS_SYNC_JSON"].length;i++){
				if(track["LYRICS_SYNC_JSON"][i].lrc_timestamp){
					lyricsbuffer += track["LYRICS_SYNC_JSON"][i].lrc_timestamp+track["LYRICS_SYNC_JSON"][i].line+"\r\n";
				}else if(i+1 < track["LYRICS_SYNC_JSON"].length){
					lyricsbuffer += track["LYRICS_SYNC_JSON"][i+1].lrc_timestamp+track["LYRICS_SYNC_JSON"][i].line+"\r\n";
				}
			}
			fs.outputFile(writePath.substring(0,writePath.lastIndexOf('.'))+".lrc",lyricsbuffer,function(){});
		}
		let playlistData = [0,""]
		if (settings.createM3UFile && (settings.plName || settings.albName)) {
			if (t.index){
				playlistData = [parseInt(t.index), writePath];
			}else{
				playlistData = [metadata.trackNumber-1, writePath];
			}
		}
		if (fs.existsSync(writePath)) {
			logger.info("Already downloaded: " + metadata.artist + ' - ' + metadata.title);
			callback(null, {playlistData: playlistData, searched: t.searched});
			return;
		}else{
			logger.info('Downloading file to ' + writePath);
		}
		//Get image
		temp = new Promise((resolve, reject)=>{
			if (metadata.image) {
				let imgPath;
				//If its not from an album but a playlist.
				if(!(settings.albName || settings.createAlbumFolder)){
					imgPath = coverArtFolder + (metadata.barcode ? fixName(metadata.barcode) : fixName(`${metadata.albumArtist} - ${metadata.album}`))+(settings.PNGcovers ? ".png" : ".jpg");
				}else{
					if (settings.saveArtwork)
						imgPath = coverpath + fixName(settingsRegexCover(settings.coverImageTemplate,settings.artName,settings.albName))+(settings.PNGcovers ? ".png" : ".jpg");
					else
						imgPath = coverArtFolder + fixName(metadata.barcode ? fixName(metadata.barcode) : fixName(`${metadata.albumArtist} - ${metadata.album}`))+(settings.PNGcovers ? ".png" : ".jpg");
				}
				if(fs.existsSync(imgPath)){
					metadata.imagePath = (imgPath).replace(/\\/g, "/");
					logger.info("Starting the download process CODE:1");
					resolve();
				}else{
					request.get(metadata.image, {strictSSL: false,encoding: 'binary'}, function(error,response,body){
						if(error){
							logger.error(error.stack);
							metadata.image = undefined;
							metadata.imagePath = undefined;
							return;
						}
						fs.outputFile(imgPath,body,'binary',function(err){
							if(err){
								logger.error(err.stack);
							metadata.image = undefined;
							metadata.imagePath = undefined;
								return;
							}
							metadata.imagePath = (imgPath).replace(/\\/g, "/");
							logger.info("Starting the download process CODE:2");
							resolve();
						})
					});
				}
			}else{
				metadata.image = undefined;
				logger.info("Starting the download process CODE:3");
				resolve();
			}
		})
		temp.then(()=>{
		temp = new Promise((resolve, reject)=>{
			if (metadata.artistImage && settings.saveArtworkArtist) {
				let imgPath;
				if(settings.createArtistFolder){
					imgPath = artistPath + antiDot(fixName(settingsRegexArtistCover(settings.artistImageTemplate,metadata.albumArtist)))+(settings.PNGcovers ? ".png" : ".jpg");
					if(fs.existsSync(imgPath)){
						resolve();
					}else{
						request.get(metadata.artistImage, {strictSSL: false,encoding: 'binary'}, function(error,response,body){
							if(error){
								logger.error(error.stack);
								return;
							}
							if (body.indexOf("unauthorized")>-1) return resolve();
							fs.outputFile(imgPath,body,'binary',function(err){
								if(err){
									logger.error(err.stack);
									return;
								}
								logger.info("Saved Artist Image");
								resolve();
							})
						});
					}
				}else{
					resolve();
				}
			}else{
				resolve();
			}
		})
		temp.then(()=>{
		let tempPath
		if(parseInt(t.id)>0)
			tempPath = writePath+".temp"
		else
			tempPath = writePath;
		logger.info("Downloading and decrypting");
		s.Deezer.decryptTrack(tempPath, track, t.queueId, function (err) {
			if (err && err.message == "aborted") {
				logger.info("Track got aborted");
				t.trackSocket = null
				callback(null, {playlistData: playlistData, searched: t.searched});
				return;
			}
			if (err) {
				if (t.fallback){
					logger.warn("Failed to download: " + metadata.artist + " - " + metadata.title+", falling on alternative");
					t.id = t.fallback
					t.fallback = 0
					settings.trackInfo = null;
					downloadTrack(t, settings, JSON.parse(JSON.stringify(metadata)), callback);
				}else if(!t.searched){
					logger.warn("Failed to download track, searching for alternative");
					s.Deezer.track2ID(t.artist, t.name, null, data=>{
						t.searched = true;
						t.id = data.id;
						t.artist = data.artist;
						t.name = data.name;
						downloadTrack(t, settings, JSON.parse(JSON.stringify(metadata)), callback);
					});
				}else{
					logger.error(`Failed to download ${t.artist} - ${t.name}: ${err}`);
					callback(err)
				}
				return;
			}
			logger.info("Downloaded: " + metadata.artist + " - " + metadata.title);
			// TODO: Move this part to a separate function
			if (parseInt(t.id)>0){
				if(track.format == 9){
					let flacComments = [];
					if (settings.tags.title)
						flacComments.push('TITLE=' + metadata.title);
					if (settings.tags.album)
						flacComments.push('ALBUM=' + metadata.album);
					if (settings.tags.albumArtist)
						flacComments.push('ALBUMARTIST=' + metadata.albumArtist);
					if (settings.tags.trackNumber)
						flacComments.push('TRACKNUMBER=' + metadata.trackNumber);
					if (settings.tags.discNumber)
						flacComments.push('DISCNUMBER=' + metadata.discNumber);
					if (settings.tags.trackTotal)
						flacComments.push('TRACKTOTAL=' + metadata.trackTotal);
					if (settings.tags.explicit)
						flacComments.push('ITUNESADVISORY=' + metadata.explicit);
					if (settings.tags.isrc)
						flacComments.push('ISRC=' + metadata.ISRC);
					if (settings.tags.artist && metadata.artists)
						if (Array.isArray(metadata.artists)){
							metadata.artists.forEach(x=>{
								flacComments.push('ARTIST=' + x);
							});
						}else{
							flacComments.push('ARTIST=' + metadata.artists);
						}
					if (settings.tags.discTotal)
						flacComments.push('DISCTOTAL='+splitNumber(metadata.discTotal,true));
					if (settings.tags.length)
						flacComments.push('LENGTH=' + metadata.length);
					if (settings.tags.barcode && metadata.barcode)
						flacComments.push('BARCODE=' + metadata.barcode);
					if (metadata.unsynchronisedLyrics && settings.tags.unsynchronisedLyrics)
						flacComments.push('LYRICS='+metadata.unsynchronisedLyrics.lyrics);
					if (metadata.genre && settings.tags.genre)
						if (Array.isArray(metadata.genre)){
							metadata.genre.forEach(x=>{
								flacComments.push('GENRE=' + x);
							});
						}else{
							flacComments.push('GENRE=' + metadata.genre);
						}
					if (metadata.copyright && settings.tags.copyright)
						flacComments.push('COPYRIGHT=' + metadata.copyright);
					if (0 < parseInt(metadata.year)){
						if (settings.tags.year)
							flacComments.push('YEAR=' + metadata.year);
						if (settings.tags.date)
						flacComments.push('DATE=' + metadata.date);
					}
					if (0 < parseInt(metadata.bpm) && settings.tags.bpm)
						flacComments.push('BPM=' + metadata.bpm);
					if(metadata.publisher && settings.tags.publisher)
						flacComments.push('PUBLISHER=' + metadata.publisher);
					if(metadata.composer && settings.tags.composer)
						if (Array.isArray(metadata.composer)){
							metadata.composer.forEach(x=>{
								flacComments.push('COMPOSER=' + x);
							});
						}else{
							flacComments.push('COMPOSER=' + metadata.composer);
						}
					if(metadata.musicpublisher && settings.tags.musicpublisher)
						if (Array.isArray(metadata.musicpublisher)){
							metadata.musicpublisher.forEach(x=>{
								flacComments.push('ORGANIZATION=' + x);
							});
						}else{
							flacComments.push('ORGANIZATION=' + metadata.musicpublisher);
						}
					if(metadata.mixer && settings.tags.mixer)
						if (Array.isArray(metadata.mixer)){
							metadata.mixer.forEach(x=>{
								flacComments.push('MIXER=' + x);
							});
						}else{
							flacComments.push('MIXER=' + metadata.mixer);
						}
					if(metadata.author && settings.tags.author)
						if (Array.isArray(metadata.author)){
							metadata.author.forEach(x=>{
								flacComments.push('AUTHOR=' + x);
							});
						}else{
							flacComments.push('AUTHOR=' + metadata.author);
						}
					if(metadata.writer && settings.tags.writer)
						if (Array.isArray(metadata.writer)){
							metadata.writer.forEach(x=>{
								flacComments.push('WRITER=' + x);
							});
						}else{
							flacComments.push('WRITER=' + metadata.writer);
						}
					if(metadata.engineer && settings.tags.engineer)
						if (Array.isArray(metadata.engineer)){
							metadata.engineer.forEach(x=>{
								flacComments.push('ENGINEER=' + x);
							});
						}else{
							flacComments.push('ENGINEER=' + metadata.engineer);
						}
					if(metadata.producer && settings.tags.producer)
						if (Array.isArray(metadata.producer)){
							metadata.producer.forEach(x=>{
								flacComments.push('PRODUCER=' + x);
							});
						}else{
							flacComments.push('PRODUCER=' + metadata.producer);
						}
					if(metadata.replayGain && settings.tags.replayGain)
						flacComments.push('REPLAYGAIN_TRACK_GAIN=' + metadata.replayGain);

					const reader = fs.createReadStream(tempPath);
					const writer = fs.createWriteStream(writePath);
					let processor = new mflac.Processor({parseMetaDataBlocks: true});
					let vendor = 'reference libFLAC 1.2.1 20070917';
					let cover = null;
					if(metadata.imagePath && settings.tags.cover){
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
							if(cover){
								mdbVorbisPicture = mflac.data.MetaDataBlockPicture.create(true, 3, `image/${(settings.PNGcovers ? "png" : "jpeg")}`, '', settings.artworkSize, settings.artworkSize, 24, 0, cover);
							}
							mdbVorbisComment = mflac.data.MetaDataBlockVorbisComment.create(!cover, vendor, flacComments);
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
					if (settings.tags.title)
						writer.setFrame('TIT2', metadata.title);
					if (settings.tags.artist)
						writer.setFrame('TPE1', [metadata.artists]);
					if (settings.tags.album)
						writer.setFrame('TALB', metadata.album)
					if (settings.tags.albumArtist && metadata.albumArtist)
						writer.setFrame('TPE2', metadata.albumArtist)
					if (settings.tags.trackNumber)
						writer.setFrame('TRCK', (settings.tags.trackTotal ? metadata.trackNumber+"/"+metadata.trackTotal : metadata.trackNumber))
					if (settings.tags.discNumber)
						writer.setFrame('TPOS', (settings.tags.discTotal ? metadata.discNumber+"/"+metadata.discTotal : metadata.discNumber))
					if (settings.tags.isrc)
						writer.setFrame('TSRC', metadata.ISRC);

					if (settings.tags.length)
						writer.setFrame('TLEN', metadata.length);
					if (settings.tags.barcode && metadata.barcode)
						writer.setFrame('TXXX', {
							description: 'BARCODE',
							value: metadata.barcode
						});
					if(metadata.imagePath && settings.tags.cover){
						const coverBuffer = fs.readFileSync(metadata.imagePath);
						writer.setFrame('APIC', {
							type: 3,
							data: coverBuffer,
							description: ''
						});
					}
					if(metadata.unsynchronisedLyrics && settings.tags.unsynchronisedLyrics)
						writer.setFrame('USLT', metadata.unsynchronisedLyrics);
					if(metadata.publisher && settings.tags.publisher)
						writer.setFrame('TPUB', metadata.publisher);
					if(metadata.genre && settings.tags.genre)
						writer.setFrame('TCON', [metadata.genre]);
					if(metadata.copyright && settings.tags.copyright)
						writer.setFrame('TCOP', metadata.copyright);
					if (0 < parseInt(metadata.year)) {
						if (settings.tags.date)
							writer.setFrame('TDAT', metadata.date);
						if (settings.tags.year)
							writer.setFrame('TYER', metadata.year);
					}
					if (0 < parseInt(metadata.bpm) && settings.tags.bpm)
						writer.setFrame('TBPM', metadata.bpm);
					if(metadata.composer && settings.tags.composer)
						writer.setFrame('TCOM', [metadata.composer]);
					if(metadata.replayGain && settings.tags.replayGain)
						writer.setFrame('TXXX', {
							description: 'REPLAYGAIN_TRACK_GAIN',
							value: metadata.replayGain
						});
					writer.addTag();
					const taggedSongBuffer = Buffer.from(writer.arrayBuffer);
					fs.writeFileSync(writePath, taggedSongBuffer);
					fs.remove(tempPath);
				}
			}
			callback(null, {playlistData: playlistData, searched: t.searched});
		})
	})
	})
	})
	})
	})
	})
	}

	// TODO: Change queue system
	function checkIfAlreadyInQueue(id) {
		let exists = false;
		Object.keys(s.downloadQueue).forEach(x=>{
			if (s.downloadQueue[x].id == id) {
				exists = s.downloadQueue[i].queueId;
			}
		});
		if (s.currentItem && (s.currentItem.id == id)) {
			exists = s.currentItem.queueId;
		}
		return exists;
	}
*/
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
		logger.info("Settings updated");

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
		mainFolder = defaultDownloadFolder;
		updateSettingsFile('downloadLocation', defaultDownloadFolder);
	}
	//fs.removeSync(coverArtFolder);
	//fs.ensureFolderSync(coverArtFolder);
}

/**
 * Creates the name of the tracks replacing wildcards to correct metadata
 * @param metadata
 * @param filename
 * @param playlist
 * @returns {XML|string|*}
 */
function settingsRegex(metadata, filename, playlist, saveFullArtists, paddingSize) {
	filename = filename.replace(/%title%/g, metadata.title);
	filename = filename.replace(/%album%/g, metadata.album);
	filename = filename.replace(/%artist%/g, (saveFullArtists ? metadata.artists : metadata.artist));
	filename = filename.replace(/%year%/g, metadata.year);
	filename = filename.replace(/%label%/g, metadata.publisher);
	if(typeof metadata.trackNumber != 'undefined'){
		if(configFile.userDefined.padtrck){
			 filename = filename.replace(/%number%/g, pad(metadata.trackNumber, (parseInt(paddingSize)>0 ? parseInt(paddingSize) : metadata.trackTotal)));
		}else{
			filename = filename.replace(/%number%/g, metadata.trackNumber);
		}
	} else {
		filename = filename.replace(/%number%/g, '');
	}
	filename = filename.replace(/%explicit%/g, (metadata.explicit==="1" ? (filename.indexOf(/[^%]explicit/g)>-1 ? "" : "(Explicit Version)") : ""));
	return filename.trim();
}

/**
 * Creates the name of the albums folder replacing wildcards to correct metadata
 * @param metadata
 * @param foldername
 * @returns {XML|string|*}
 */
function settingsRegexAlbum(foldername, artist, album, year, rtype, explicit, publisher) {
	foldername = foldername.replace(/%album%/g, album);
	foldername = foldername.replace(/%artist%/g, artist);
	foldername = foldername.replace(/%year%/g, year);
	if (rtype){
		foldername = foldername.replace(/%type%/g, rtype[0].toUpperCase() + rtype.substring(1));
	}else{
		foldername = foldername.replace(/%type%/g, "");
	}
	foldername = foldername.replace(/%label%/g, publisher);
	foldername = foldername.replace(/%explicit%/g, (explicit ? (foldername.indexOf(/[^%]explicit/g)>-1 ? "" : "(Explicit)") : ""));
	return foldername.trim();
}

function settingsRegexCover(foldername, artist, name) {
	foldername = foldername.replace(/%name%/g, name);
	foldername = foldername.replace(/%artist%/g, artist);
	return foldername;
}

function settingsRegexArtistCover(foldername, artist) {
	foldername = foldername.replace(/%artist%/g, artist);
	return foldername;
}

/**
 * Pad number with 0s so max and str have the same nuber of characters
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
	let i = str.indexOf("/");
	if(total && i > 0){
		return str.slice(i+1, str.length);
	}else if(i > 0){
		return str.slice(0, i);
	}else{
		return str;
	}
	return i > 0 ? str.slice(0, i) : str;
}

function swichReleaseType(id){
	switch (id) {
		case "0":
			return "Album";
		case "1":
			return "Single";
		case "3":
			return "EP";
		default:
			return id;
	}
}

function uniqueArray(origin, destination, removeDupes=true){
	Array.from(new Set(origin)).forEach(function(x){
		if(destination.indexOf(x) == -1)
			destination.push(x);
	});
	if (removeDupes){
		destination.forEach((name,index)=>{
			destination.forEach((name2,index2)=>{
				if(!(index===index2) && (name.indexOf(name2)!== -1)){
					destination.splice(index, 1);
				}
			})
		})
	}
}

/*
// TODO: Make the API do this
function slimDownTrackInfo(trackOld){
	let track = {};
	track['SNG_ID'] = trackOld["SNG_ID"]
	track['ARTISTS'] = trackOld["ARTISTS"]
	track["ALB_ID"] = trackOld["ALB_ID"]
	track["ALB_PICTURE"] = trackOld["ALB_PICTURE"]
	track["ART_PICTURE"] = trackOld["ART_PICTURE"]
	track["ALB_TITLE"] = trackOld["ALB_TITLE"]
	track["ART_NAME"] = trackOld["ART_NAME"]
	track["BPM"] = trackOld["BPM"]
	track["COPYRIGHT"] = trackOld["COPYRIGHT"]
	track["DISK_NUMBER"] = trackOld["DISK_NUMBER"]
	track["DURATION"] = trackOld["DURATION"]
	track["EXPLICIT_LYRICS"] = trackOld["EXPLICIT_LYRICS"]
	track["GAIN"] = trackOld["GAIN"]
	track["ISRC"] = trackOld["ISRC"]
	track["TYPE"] = trackOld["TYPE"]
	track["LYRICS_SYNC_JSON"] = trackOld["LYRICS_SYNC_JSON"]
	track["LYRICS_TEXT"] = trackOld["LYRICS_TEXT"]
	track["PHYSICAL_RELEASE_DATE"] = trackOld["PHYSICAL_RELEASE_DATE"]
	track["SNG_CONTRIBUTORS"] = trackOld["SNG_CONTRIBUTORS"]
	track["SNG_TITLE"] = trackOld["SNG_TITLE"]
	track["TRACK_NUMBER"] = trackOld["TRACK_NUMBER"]
	track["VERSION"] = trackOld["VERSION"]
	track["FILESIZE_FLAC"] = trackOld["FILESIZE_FLAC"]
	track["FILESIZE_MP3_320"] = trackOld["FILESIZE_MP3_320"]
	track["FILESIZE_MP3_256"] = trackOld["FILESIZE_MP3_256"]
	track["FILESIZE_MP3_128"] = trackOld["FILESIZE_MP3_128"]
	track.FILESIZE = trackOld.FILESIZE
	track["FALLBACK"] = trackOld["FALLBACK"]
	track.downloadUrl = trackOld.downloadUrl
	track.format = trackOld.format
	return track
}
// TODO: Make the API do this
function slimDownAlbumInfo(ajsonOld){
	let ajson = {};
	ajson.artist = {}
	ajson.artist.name = ajsonOld.artist.name
	ajson.artist.picture_small = ajsonOld.artist.picture_small
	ajson.nb_tracks = ajsonOld.nb_tracks
	ajson.upc = ajsonOld.upc
	ajson.record_type = ajsonOld.record_type
	ajson.label = ajsonOld.label
	ajson.genres = ajsonOld.genres
	ajson.explicit_lyrics = ajsonOld.explicit_lyrics
	ajson.release_date = ajsonOld.release_date
	ajson.tracks = {
		data: ajsonOld.tracks.data.map(x=>{
			return {id: x.id};
		})
	}
	ajson.tracks.total = ajsonOld.tracks.total
	return ajson
}

// TODO: Make the API do this
function parseMetadata(track, ajson, totalDiskNumber, settings, position, altmetadata){
	let metadata;
	if (track["VERSION"]) track["SNG_TITLE"] += " " + track["VERSION"];
	if (settings.removeAlbumVersion){
		if(track["SNG_TITLE"].indexOf("Album Version")>-1){
			track["SNG_TITLE"] = track["SNG_TITLE"].replace(/\(Album Version\)/g,"")
			track["SNG_TITLE"].trim()
		}
	}
	if(altmetadata){
		metadata = altmetadata;
		if(track["LYRICS_TEXT"] && !metadata.unsynchronisedLyrics){
			metadata.unsynchronisedLyrics = {
				description: "",
				lyrics: track["LYRICS_TEXT"]
			};
		}
	}else{
		let separator = settings.multitagSeparator;
		if (separator == "null") separator = String.fromCharCode(parseInt("\u0000",16));
		metadata = {
			title: track["SNG_TITLE"],
			artist: track["ART_NAME"],
			album: track["ALB_TITLE"],
			trackNumber: track["TRACK_NUMBER"],
			discNumber: track["DISK_NUMBER"],
			explicit: track["EXPLICIT_LYRICS"],
			ISRC: track["ISRC"],
			albumArtist: ajson.artist.name,
			trackTotal: ajson.nb_tracks,
			rtype: ajson.record_type,
			barcode: ajson.upc,
			length: track["DURATION"]
		};
		if(track["COPYRIGHT"]){
			metadata.copyright = track["COPYRIGHT"];
		}
		if (!metadata.rtype){
			metadata.rtype = swichReleaseType(track["TYPE"])
		}
		if (ajson.explicit_lyrics){
			metadata.albumExplicit = ajson.explicit_lyrics;
		}
		if(track["SNG_CONTRIBUTORS"]){
			if(track["SNG_CONTRIBUTORS"].composer){
				metadata.composer = [];
				uniqueArray(track["SNG_CONTRIBUTORS"].composer, metadata.composer, settings.removeDupedTags)
				if (!(track.format == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) metadata.composer = metadata.composer.join(separator);
			}
			if(track["SNG_CONTRIBUTORS"].musicpublisher){
				metadata.musicpublisher = [];
				uniqueArray(track["SNG_CONTRIBUTORS"].musicpublisher, metadata.musicpublisher, settings.removeDupedTags)
				if (!(track.format == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) metadata.musicpublisher = metadata.musicpublisher.join(separator);
			}
			if(track["SNG_CONTRIBUTORS"].producer){
				metadata.producer = [];
				uniqueArray(track["SNG_CONTRIBUTORS"].producer, metadata.producer, settings.removeDupedTags)
				if (!(track.format == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) metadata.producer = metadata.producer.join(separator);
			}
			if(track["SNG_CONTRIBUTORS"].engineer){
				metadata.engineer = [];
				uniqueArray(track["SNG_CONTRIBUTORS"].engineer, metadata.engineer, settings.removeDupedTags)
				if (!(track.format == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) metadata.engineer = metadata.engineer.join(separator);
			}
			if(track["SNG_CONTRIBUTORS"].writer){
				metadata.writer = [];
				uniqueArray(track["SNG_CONTRIBUTORS"].writer, metadata.writer, settings.removeDupedTags)
				if (!(track.format == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) metadata.writer = metadata.writer.join(separator);
			}
			if(track["SNG_CONTRIBUTORS"].author){
				metadata.author = [];
				uniqueArray(track["SNG_CONTRIBUTORS"].author, metadata.author, settings.removeDupedTags)
				if (!(track.format == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) metadata.author = metadata.author.join(separator);
			}
			if(track["SNG_CONTRIBUTORS"].mixer){
				metadata.mixer = [];
				uniqueArray(track["SNG_CONTRIBUTORS"].mixer, metadata.mixer, settings.removeDupedTags)
				if (!(track.format == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) metadata.mixer = metadata.mixer.join(separator);
			}
		}
		if(track["LYRICS_TEXT"]){
			metadata.unsynchronisedLyrics = {
				description: "",
				lyrics: track["LYRICS_TEXT"]
			};
		}
		if (track["GAIN"]) {
			metadata.replayGain = track["GAIN"];
		}
		if(ajson.label){
			metadata.publisher = ajson.label;
		}
		if (0 < parseInt(track["BPM"])) {
			metadata.bpm = track["BPM"];
		}
		if(track['ARTISTS']){
			metadata.artists = [];
			artistArray = []
			track['ARTISTS'].forEach(function(artist){
				artistArray.push(artist['ART_NAME']);
			});
			uniqueArray(artistArray, metadata.artists, settings.removeDupedTags)
			let posMainArtist = metadata.artists.indexOf(metadata.albumArtist)
			if (posMainArtist !== -1 && posMainArtist !== 0 && settings.removeDupedTags){
				let element = metadata.artists[posMainArtist];
    		metadata.artists.splice(posMainArtist, 1);
    		metadata.artists.splice(0, 0, element);
			}
			if (!(track.format == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) metadata.artists = metadata.artists.join(separator);
		}
		if(ajson.genres && ajson.genres.data[0] && ajson.genres.data[0].name){
			metadata.genre = [];
			genreArray = [];
			ajson.genres.data.forEach(function(genre){
				genreArray.push(genre.name);
			});
			uniqueArray(genreArray, metadata.genre, false)
			if (!(track.format == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) metadata.genre = metadata.genre.join(separator);
		}
		if (track["ALB_PICTURE"]) {
			metadata.image = s.Deezer.albumPicturesHost + track["ALB_PICTURE"]+"/"+settings.artworkSize+"x"+settings.artworkSize+"-000000-80-0-0"+(settings.PNGcovers ? ".png" : ".jpg");
		}
		if (ajson.artist.picture_small) {
			metadata.artistImage = ajson.artist.picture_small.split("56x56-000000-80-0-0.jpg")[0]+settings.artworkSize+"x"+settings.artworkSize+"-000000-80-0-0"+(settings.PNGcovers ? ".png" : ".jpg");
		}
		if (ajson.release_date) {
			metadata.year = ajson.release_date.slice(0, 4);
			metadata.date = {
				day: ajson.release_date.slice(8,10),
				month: ajson.release_date.slice(5,7),
				year: (settings.dateFormatYear == "2" ? ajson.release_date.slice(2, 4) : ajson.release_date.slice(0, 4))
			}
		} else if(track["PHYSICAL_RELEASE_DATE"]){
			metadata.year = track["PHYSICAL_RELEASE_DATE"].slice(0, 4);
			metadata.date = {
				day: track["PHYSICAL_RELEASE_DATE"].slice(8,10),
				month: track["PHYSICAL_RELEASE_DATE"].slice(5,7),
				year: (settings.dateFormatYear == "2" ? track["PHYSICAL_RELEASE_DATE"].slice(2, 4) : track["PHYSICAL_RELEASE_DATE"].slice(0, 4))
			}
		}
		if (metadata.date){
			let date
			switch (settings.dateFormat){
				case "0": date = `${metadata.date.year}-${metadata.date.month}-${metadata.date.day}`; break;
				case "1": date = `${metadata.date.day}-${metadata.date.month}-${metadata.date.year}`; break;
				case "2": date = `${metadata.date.month}-${metadata.date.day}-${metadata.date.year}`; break;
				case "3": date = `${metadata.date.year}-${metadata.date.day}-${metadata.date.month}`; break;
				case "4": date = `${metadata.date.day}${metadata.date.month}`; break;
				default: date = `${metadata.date.day}${metadata.date.month}`; break;
			}
			metadata.date = date;
		}
		if(settings.plName && !(settings.createArtistFolder || settings.createAlbumFolder) && !settings.numplaylistbyalbum){
			metadata.trackNumber = (position+1).toString();
			metadata.trackTotal = settings.playlist.fullSize;
			metadata.discNumber = "1";
			metadata.discTotal = "1";
		}
		if (totalDiskNumber){
			metadata.discTotal = totalDiskNumber;
		}
	}
	return metadata;
}
*/

// Show crash error in console for debugging
process.on('unhandledRejection', function (err) {
	logger.error(err.stack)
})
process.on('uncaughtException', function (err) {
	logger.error(err.stack)
})

// Exporting vars
module.exports.mainFolder = mainFolder
module.exports.defaultSettings = defaultSettings
module.exports.defaultDownloadFolder = defaultDownloadFolder
