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
const deezerApi = require('deezer-api')
const spotifyApi = require('spotify-web-api-node')
// App stuff
const fs = require('fs-extra')
const async = require('async')
const request = require('request-promise')
const requestOld = require('request')
const os = require('os')
const path = require('path')
const logger = require('./utils/logger.js')
const queue = require('queue')
const localpaths = require('./utils/localpaths.js')
const package = require('./package.json')
const stq = require('sequential-task-queue')

// First run, create config file
if(!fs.existsSync(localpaths.user+"config.json")){
	fs.outputFileSync(localpaths.user+"config.json",fs.readFileSync(__dirname+path.sep+"default.json",'utf8'))
}

// Main Constants
// Files
const configFileLocation = localpaths.user+"config.json"
// Folders
var coverArtFolder = 'deezloader-imgs' + path.sep
var defaultDownloadFolder = path.sep + 'Deezloader Music' + path.sep

if(process.platform == "android"){
	coverArtFolder = localpaths.user + coverArtFolder
	fs.ensureFileSync(coverArtFolder + '.nomedia');
	defaultDownloadFolder = localpaths.home + path.sep + 'Music' + defaultDownloadFolder
}else{
	coverArtFolder = os.tmpdir() + path.sep + coverArtFolder
	defaultDownloadFolder = localpaths.home + defaultDownloadFolder
}

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

var dqueue = new stq.SequentialTaskQueue()
var downloadQueue = {}
var trackQueue = queue({
	autostart: true
})
trackQueue.concurrency = configFile.userDefined.queueConcurrency

// START sockets clusterfuck
io.sockets.on('connection', function (s) {
	logger.info("Connection received!")

	// Check for updates
	request({
		url: "https://notabug.org/RemixDevs/DeezloaderRemix/raw/master/update.json",
		rejectUnauthorized: false,
		json: true
	})
	.then(body=>{
		logger.info("Checking for updates")
		let [currentVersion_MAJOR, currentVersion_MINOR, currentVersion_PATCH] = package.version.split(".").map(x=>parseInt(x))
		let [lastVersion_MAJOR, lastVersion_MINOR, lastVersion_PATCH] = body.version.split(".").map(x=>parseInt(x))
		if (
			lastVersion_MAJOR>currentVersion_MAJOR ||
			lastVersion_MAJOR==currentVersion_MAJOR && lastVersion_MINOR>currentVersion_MINOR ||
			lastVersion_MAJOR==currentVersion_MAJOR && lastVersion_MINOR==currentVersion_MINOR && lastVersion_PATCH>currentVersion_PATCH
		){
			logger.info("Update Available")
			s.emit("messageUpdate", {title: `Version ${lastVersion_MAJOR}.${lastVersion_MINOR}.${lastVersion_PATCH} is available!`, msg: body.changelog, lastVersion: body.version})
		}else{
			logger.info("Running the latest version!")
		}
	})
	.catch(error=>{
		logger.error(`UpdateCheck failed: ${error.stack ? error.stack : error}`)
	})

	// Connection dependet variables
	s.Deezer = new deezerApi()
	s.spotifyUser = null

	s.emit("checkAutologin")
	s.emit("getDefaultSettings", defaultSettings, defaultDownloadFolder)
	s.emit("populateDownloadQueue", downloadQueue)

	if(process.platform != "android"){
		const captcha = require('./utils/captcha');
		captcha.callbackResponse = function (data) {
			s.emit("getCaptcha", data)
		};
	}

	// Function for logging in
	s.on("login", async function (username, password, captchaResponse) {
		try{
			logger.info("Logging in");
			await s.Deezer.login(username, password, captchaResponse)
			s.emit("login", {user: s.Deezer.user})
			logger.info("Logged in successfully")
			// Save session login so next time login is not needed
			// This is the same method used by the official website
			s.emit('getCookies', s.Deezer.getCookies())
		}catch(err){
			s.emit("login", {error: err.message})
			logger.error(`Login failed: ${err.message}`)
		}
	})

	// Function for login with userToken
	s.on("loginViaUserToken", async function (userToken) {
		try{
			logger.info("Logging in");
			await s.Deezer.loginViaArl(userToken)
			s.emit("login", {user: s.Deezer.user})
			logger.info("Logged in successfully")
			s.emit('getCookies', s.Deezer.getCookies())
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
				s.emit("getChartsTrackListByCountry", {err: "Country not found"})
				return
			}
			let playlistId = charts[countries.indexOf(country)].id
			await getChartsTrackListById(playlistId)
		}catch(err){
			logger.error(`getChartsTrackListByCountry failed: ${err.stack}`)
			return
		}
	}
	s.on("getChartsTrackListByCountry", function (data) {getChartsTrackListByCountry(data.country)})

	// Returns list of playlists
	async function getMyPlaylistList(spotUser=null){
		if (spotUser && s.spotifyUser != spotUser) s.spotifyUser = spotUser
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
			if (s.spotifyUser && spotifySupport){
				try{
					let creds = await Spotify.clientCredentialsGrant()
					Spotify.setAccessToken(creds.body['access_token'])
					let first = true
					let offset = 0
					do{
						let data = await Spotify.getUserPlaylists(s.spotifyUser, {fields: "items(images,name,owner.id,tracks.total,uri),total", offset: offset*20})
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
				}catch(err){
					logger.error(`Spotify playlist failed loading: ${err}`)
				}
			}
			logger.info(`Loaded ${playlists.length} Playlist${playlists.length>1 ? "s" : ""}`)
			s.emit("getMyPlaylistList", {playlists: playlists})
		}catch(err){
			logger.error(`getMyPlaylistList failed: ${err}`)
			return
		}
	}
	s.on("getMyPlaylistList", function (d) {getMyPlaylistList(d.spotifyUser)})

	// Returns search results from a query
	s.on("search", async function (data) {
		data.type = data.type || "track"
		if (["track", "playlist", "album", "artist"].indexOf(data.type) == -1) data.type = "track"

		// Remove "feat." "ft." and "&" (causes only problems)
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
				let response = await s.Deezer.legacyGetArtist(data.id)
				let tracks = await s.Deezer.legacyGetArtistAlbums(data.id)
				response.data = tracks.data
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
				var response = {}
				let resp0 = await Spotify.getPlaylist(data.id, {fields: "images,name,owner"})
				response.title = resp0.body.name
				response.image = resp0.body.images[0].url
				response.owner = resp0.body.owner.display_name
				do{
					let resp = await Spotify.getPlaylistTracks(data.id, {fields: "items(track(artists,name,duration_ms,preview_url,explicit)),total", offset: offset*100})
					if (first){
						var numPages=Math.floor((resp.body.total-1)/100)
						response.data = new Array(resp.body.total)
						first = false
					}
					resp.body.items.forEach((t, index) => {
						response.data[index+offset*100]={
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
				s.emit("getTrackList", {response: response, id: data.id, reqType: data.type})
			}catch(err){
				logger.error(`getTrackList failed: ${err.stack}`)
			}
		}else{
			let reqType = data.type.charAt(0).toUpperCase() + data.type.slice(1)
			try{
				let response = await s.Deezer["legacyGet" + reqType](data.id)
				let tracks = await s.Deezer["legacyGet" + reqType + "Tracks"](data.id)
				response.data = tracks.data
				s.emit("getTrackList", {response: response, id: data.id, reqType: data.type})
			}catch(err){
				s.emit("getTrackList", {err: "wrong id "+reqType, response: {}, id: data.id, reqType: data.type})
				logger.error(`getTrackList failed: ${err.stack}`)
				return
			}
		}
	})

	// Sends settings saved by the user to the frontend
	s.on("getUserSettings", function () {
		let settings = configFile.userDefined
		if (!settings.downloadLocation) {
			settings.downloadLocation = mainFolder
		}
		s.emit('getUserSettings', {settings: settings})
	});

	// Saves locally the settings comming from the frontend
	s.on("saveSettings", function (settings, spotifyUser) {
		if (settings.userDefined.downloadLocation == defaultDownloadFolder) {
			settings.userDefined.downloadLocation = ""
		} else {
			settings.userDefined.downloadLocation = path.resolve(settings.userDefined.downloadLocation + path.sep) + path.sep
			mainFolder = settings.userDefined.downloadLocation
		}

		if (settings.userDefined.queueConcurrency < 1) settings.userDefined.queueConcurrency = 1

		if (settings.userDefined.queueConcurrency != trackQueue.concurrency){
			trackQueue.concurrency = settings.userDefined.queueConcurrency
		}

		if (spotifyUser != s.spotifyUser){
			s.spotifyUser = spotifyUser
			getMyPlaylistList(spotifyUser)
		}

		configFile.userDefined = settings.userDefined;
		fs.outputFile(configFileLocation, JSON.stringify(configFile, null, 2), function (err) {
			if (err) return
			logger.info("Settings updated")
			initFolders()
		});
	});

	s.on("analyzetrack", async (id)=>{
		s.emit("analyzetrack", await s.Deezer.legacyGetTrack(id))
	})

	s.on("analyzealbum", async (id)=>{
		s.emit("analyzealbum", await s.Deezer.legacyGetAlbum(id))
	})

	/*
	 * Downloading section of the app
	*/

	// Gets data from the frontend and creates the track object
	async function downloadTrack(data){
		logger.info(`Added to Queue ${data.id}`)
		try{
			var track = await s.Deezer.getTrack(data.id)
			data.settings.filename = data.settings.trackNameTemplate
			data.settings.foldername = data.settings.albumNameTemplate
			let _track = {
				name: track.title,
				artist: track.artist.name,
				size: 1,
				downloaded: 0,
				failed: 0,
				queueId: `id${Math.random().toString(36).substring(2)}`,
				id: `${track.id}:${data.bitrate}`,
				bitrate: data.bitrate+"",
				type: 'track',
				settings: data.settings || {},
				obj: track,
			}
			addToQueue(_track)
		}catch(err){
			logger.error(`downloadTrack failed: ${err.stack ? err.stack : err}`)
			message = ""
			if (err.message){
				switch (err.message){
					case "DataException: no data":
						message = "Not Found"
					break
					default:
						message = err.message
					break
				}
			}
			s.emit("toast", `Track ${data.id} download failed: ${message}`)
			s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
			return
		}
	}
	s.on("downloadtrack", async data=>{await downloadTrack(data)})

	// Gets data from the frontend and creates the album object
	async function downloadAlbum(data){
		logger.info(`Added to Queue ${data.id}`)
		try{
			var album = await s.Deezer.legacyGetAlbum(data.id)
			if (data.settings.tags.discTotal || data.settings.createCDFolder){
				var discTotal = await s.Deezer.getAlbum(data.id)
				album.discTotal = discTotal.discTotal
			}
			if (album.nb_tracks == 1 && data.settings.downloadSinglesAsTracks){
				var track = await s.Deezer.getTrack(album.tracks.data[0].id)
				data.settings.filename = data.settings.trackNameTemplate
				data.settings.foldername = data.settings.albumNameTemplate
				let _track = {
					name: track.title,
					artist: track.artist.name,
					size: 1,
					downloaded: 0,
					failed: 0,
					queueId: `id${Math.random().toString(36).substring(2)}`,
					id: `${track.id}:${data.bitrate}`,
					urlId: data.id,
					bitrate: data.bitrate+"",
					type: 'track',
					settings: data.settings || {},
					obj: track,
				}
				addToQueue(_track)
			}else{
				album.tracks = await s.Deezer.getAlbumTracks(data.id)
				data.settings.filename = data.settings.albumTrackNameTemplate
				data.settings.foldername = data.settings.albumNameTemplate
				let _album = {
					name: album.title,
					artist: album.artist.name,
					size: album.tracks.length,
					downloaded: 0,
					failed: 0,
					queueId: `id${Math.random().toString(36).substring(2)}`,
					id: `${album.id}:${data.bitrate}`,
					bitrate: data.bitrate+"",
					type: 'album',
					settings: data.settings || {},
					obj: album,
				}
				addToQueue(_album)
			}
			return
		}catch(err){
			logger.error(`downloadAlbum failed: ${err.stack ? err.stack : err}`)
			message = ""
			if (err.message){
				switch (err.message){
					case "DataException: no data":
						message = "Not Found"
					break
					default:
						message = err.message
					break
				}
			}
			s.emit("toast", `Album ${data.id} download failed: ${message}`)
			s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
			return
		}
	}
	s.on("downloadalbum", async data=>{await downloadAlbum(data)});

	// Gets data from the frontend and creates for each album an album object
	async function downloadArtist(data){
		logger.info(`Added to Queue ${data.id}`)
		try{
			var albums = await s.Deezer.legacyGetArtistAlbums(data.id);
			(function sendAllAlbums(i) {
				setTimeout(function () {
					data.id = albums.data[albums.data.length-1-i].id
					downloadAlbum(JSON.parse(JSON.stringify(data)))
					if (--i+1) sendAllAlbums(i)
				}, 100)
			})(albums.data.length-1)
		}catch(err){
			logger.error(`downloadArtist failed: ${err.stack ? err.stack : err}`)
			message = ""
			if (err.message){
				switch (err.message){
					case "DataException: no data":
						message = "Not Found"
					break
					default:
						message = err.message
					break
				}
			}
			s.emit("toast", `Artist ${data.id} download failed: ${message}`)
			s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
			return
		}
	}
	s.on("downloadartist", async data=>{ await downloadArtist(data)});

	// Gets data from the frontend and creates the playlist object
	async function downloadPlaylist(data){
		logger.info(`Added to Queue ${data.id}`)
		try{
			var playlist = await s.Deezer.legacyGetPlaylist(data.id)
			data.settings.filename = data.settings.playlistTrackNameTemplate
			data.settings.foldername = data.settings.albumNameTemplate
			playlist.tracks = await s.Deezer.getPlaylistTracks(data.id)
			let _playlist = {
				name: playlist.title,
				artist: playlist.creator.name,
				size: playlist.tracks.length,
				downloaded: 0,
				failed: 0,
				queueId: `id${Math.random().toString(36).substring(2)}`,
				id: `${playlist.id}:${data.bitrate}`,
				bitrate: data.bitrate+"",
				type: "playlist",
				settings: data.settings || {},
				obj: playlist,
			}
			addToQueue(_playlist)
		}catch(err){
			logger.error(`downloadPlaylist failed: ${err.stack ? err.stack : err}`)
			message = ""
			if (err.message){
				switch (err.message){
					case "DataException: no data":
						message = "Not Found"
					break
					default:
						message = err.message
					break
				}
			}
			s.emit("toast", `Playlist ${data.id} download failed: ${message}`)
			s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
			return
		}
	}
	s.on("downloadplaylist", data=>{downloadPlaylist(data)});

	// Gets data from the frontend and creates the object fot the artist top tracks
	async function downloadArtistTop(data){
		logger.info(`Added to Queue ${data.id}`)
		try{
			var artist = await s.Deezer.legacyGetArtist(data.id)
			data.settings.filename = data.settings.playlistTrackNameTemplate
			data.settings.foldername = data.settings.albumNameTemplate
			artist.tracks = await s.Deezer.getArtistTopTracks(data.id)
			let _playlist = {
				name: artist.name + " Most played tracks",
				artist: artist.name,
				size: artist.tracks.length,
				downloaded: 0,
				failed: 0,
				queueId: `id${Math.random().toString(36).substring(2)}`,
				id: `${artist.id}:${data.bitrate}`,
				bitrate: data.bitrate+"",
				type: "playlist",
				settings: data.settings || {},
				obj: artist,
			}
			addToQueue(_playlist)
		}catch(err){
			logger.error(`downloadArtistTop failed: ${err.stack ? err.stack : err}`)
			message = ""
			if (err.message){
				switch (err.message){
					case "DataException: no data":
						message = "Not Found"
					break
					default:
						message = err.message
					break
				}
			}
			s.emit("toast", `ArtistTop ${data.id} download failed: ${message}`)
			s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
			return
		}
	}
	s.on("downloadartisttop", data=>{downloadArtistTop(data)});

	// Gets data from the frontend and creates the spotify playlist object
	async function downloadSpotifyPlaylist(data){
		logger.info(`Added to Queue ${data.id}`)
		if (spotifySupport){
			try{
				let creds = await Spotify.clientCredentialsGrant()
				Spotify.setAccessToken(creds.body['access_token'])
				var offset = 0
				data.settings.filename = data.settings.playlistTrackNameTemplate
				data.settings.foldername = data.settings.albumNameTemplate
				var resp = await Spotify.getPlaylist(data.id, {fields: "id,name,owner,images,tracks(total)"})
				var _playlist = {
					name: resp.body.name,
					artist: (resp.body.owner.display_name ? resp.body.owner.display_name : resp.body.owner.id),
					size: resp.body.tracks.total,
					downloaded: 0,
					failed: 0,
					queueId: `id${Math.random().toString(36).substring(2)}`,
					settings: data.settings || {},
					id: `${resp.body.id}:${data.bitrate}`,
					bitrate: data.bitrate+"",
					type: "spotifyplaylist",
					obj: resp.body
				}
				var numPages=Math.floor((_playlist.size-1)/100)
				var trackList = new Array(_playlist.size)
				do{
					var resp = await Spotify.getPlaylistTracks(data.id, {fields: "items(track(artists,name,album,external_ids))", offset: offset*100})
					resp.body.items.forEach((track, i) => {
						trackList[i+(offset*100)] = track.track
					})
					offset++
				}while(offset<=numPages)
				_playlist.obj.tracks = trackList
				addToQueue(_playlist)
			}catch(err){
				logger.error(`downloadSpotifyPlaylist failed: ${err.stack ? err.stack : err}`)
				if (err.message && err.message == "Bad Request"){
					s.emit("message", {title: "You setted it up wrong!", msg: "It seems like you setted the authCredentials.js file wrong...<br>Make sure you keep the ' around the IDs and that the Secret and Client ID are copied correctly<br>After that you should restart the app to make it work.<br><br>If you need the guide again <a href=\"https://notabug.org/RemixDevs/DeezloaderRemix/wiki/Spotify+Features\">Here it is</a>"})
				}else{
					s.emit("toast", `SpotifyPlaylist ${data.id} failed: ${err.message ? err.message : err}`)
				}
				s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
				return
			}
		}else{
			s.emit("message", {title: "Spotify Support is not enabled", msg: "You should add authCredentials.js in your config files and then restart the app to use this feature<br>You can see how to do that in <a href=\"https://notabug.org/RemixDevs/DeezloaderRemix/wiki/Spotify+Features\">this guide</a>"})
		}
	}
	s.on("downloadspotifyplaylist", data=>{downloadSpotifyPlaylist(data)})

	// Gets data from the frontend and creates data for the deezer track object
	async function downloadSpotifyTrack(data){
		logger.info(`Added to Queue ${data.id}`)
		if (spotifySupport){
			try{
				let creds = await Spotify.clientCredentialsGrant()
				Spotify.setAccessToken(creds.body['access_token'])
				var resp = await Spotify.getTrack(data.id, {fields: "external_ids,artists,album,name"})
				deezerId = await convertSpotify2Deezer(resp.body)
				if (deezerId != 0){
					data.id = deezerId
					downloadTrack(data)
				}else{
					s.emit("toast", "Can't find the track on Deezer!")
					s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
					logger.error(`Can't find the track on Deezer!`)
				}
			}catch(err){
				logger.error(`downloadSpotifyTrack failed: ${err.stack ? err.stack : err}`)
				return
			}
		}else{
			s.emit("message", {title: "Spotify Support is not enabled", msg: "You should add authCredentials.js in your config files and then restart the app to use this feature<br>You can see how to do that in <a href=\"https://notabug.org/RemixDevs/DeezloaderRemix/wiki/Spotify+Features\">this guide</a>"})
		}
	}
	s.on("downloadspotifytrack", data=>{downloadSpotifyTrack(data)})

	// Gets data from the frontend and creates data for the deezer track object
	async function downloadSpotifyAlbum(data){
		logger.info(`Added to Queue ${data.id}`)
		if (spotifySupport){
			try{
				let creds = await Spotify.clientCredentialsGrant()
				Spotify.setAccessToken(creds.body['access_token'])
				var resp = await Spotify.getAlbum(data.id, {fields: "external_ids,artists,name"})
				deezerId = await convertSpotifyAlbum2Deezer(resp.body)
				if (deezerId != 0){
					data.id = deezerId
					downloadAlbum(data)
				}else{
					s.emit("toast", "Can't find the album on Deezer!")
					s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
					logger.error(`Can't find the album on Deezer!`)
				}
			}catch(err){
				logger.error(`downloadSpotifyAlbum failed: ${err.stack ? err.stack : err}`)
				return
			}
		}else{
			s.emit("message", {title: "Spotify Support is not enabled", msg: "You should add authCredentials.js in your config files and then restart the app to use this feature<br>You can see how to do that in <a href=\"https://notabug.org/RemixDevs/DeezloaderRemix/wiki/Spotify+Features\">this guide</a>"})
		}
	}
	s.on("downloadspotifyalbum", data=>{downloadSpotifyAlbum(data)})

	// Converts the spotify track to a deezer one
	// It tries first with the isrc (best way of conversion)
	// Fallbacks to the old way, using search
	async function convertSpotify2Deezer(track){
		if (!track) return 0
		try{
			if (track.external_ids.isrc){
				let resp = await s.Deezer.legacyGetTrackByISRC(track.external_ids.isrc)
				if (resp.title)
					return resp.id
				else
					logger.warn("ISRC track is not on Deezer, falling back to old method")
			}
		}catch(err){
			logger.warn("ISRC not found, falling back to old method")
		}
		return convertMetadata2Deezer(track.artists[0].name, track.name, track.album.name)
	}

	// Tries to get track id from pure luck
	async function convertMetadata2Deezer(artist, track, album){
		let resp
		artist = artist.replace(/–/g,"-").replace(/’/g, "'")
		track = track.replace(/–/g,"-").replace(/’/g, "'")
		album = album.replace(/–/g,"-").replace(/’/g, "'")
		try{
			resp = await s.Deezer.legacySearch(`artist:"${artist}" track:"${track}" album:"${album}"`, "track", 1)
		}catch(err){logger.err(`ConvertFromMetadata: ${err.stack ? err.stack : err}`)}
		if (resp.data[0]) return resp.data[0].id
		try{
			resp = await s.Deezer.legacySearch(encodeURIComponent(`artist:"${artist}" track:"${track}"`), "track", 1)
		}catch(err){logger.err(`ConvertFromMetadata: ${err.stack ? err.stack : err}`)}
		if (resp.data[0]) return resp.data[0].id
		if (track.indexOf("(") < track.indexOf(")")){
			try{
				resp = await s.Deezer.legacySearch(encodeURIComponent(`artist:"${artist}" track:"${track.split("(")[0]}"`), "track", 1)
			}catch(err){logger.err(`ConvertFromMetadata: ${err.stack ? err.stack : err}`)}
			if (resp.data[0]) return resp.data[0].id
		}else if (track.indexOf(" - ")>0){
			try{
				resp = await s.Deezer.legacySearch(encodeURIComponent(`artist:"${artist}" track:"${track.split(" - ")[0]}"`), "track", 1)
			}catch(err){logger.err(`ConvertFromMetadata: ${err.stack ? err.stack : err}`)}
			if (resp.data[0]) return resp.data[0].id
		}else{
			return 0
		}
		return 0
	}

	// Converts the spotify album to a deezer one
	// It tries first with the upc (best way of conversion)
	// Fallbacks to the old way, using search
	async function convertSpotifyAlbum2Deezer(album){
		if (!album) return 0
		try{
			if (album.external_ids.upc){
				if (! isNaN(album.external_ids.upc)) album.external_ids.upc = parseInt(album.external_ids.upc)
				let resp = await s.Deezer.legacyGetAlbumByUPC(album.external_ids.upc)
				if (resp.title)
					return resp.id
				else
					logger.warn("UPC album is not on Deezer, falling back to old method")
			}
		}catch(err){
			logger.warn("UPC not found, falling back to old method")
		}
		return convertAlbumMetadata2Deezer(album.artists[0].name, album.name)
	}

	// Tries to get album id from pure luck
	async function convertAlbumMetadata2Deezer(artist, album){
		let resp
		artist = artist.replace(/–/g,"-").replace(/’/g, "'")
		album = album.replace(/–/g,"-").replace(/’/g, "'")
		try{
			resp = await s.Deezer.legacySearch(`artist:"${artist}" album:"${album}"`, "album", 1)
		}catch(err){logger.err(`ConvertAlbumFromMetadata: ${err.stack ? err.stack : err}`)}
		if (resp.data[0]) return resp.data[0].id
		return 0
	}

	// All the above functions call this function
	// It adds the object to an array and adds the promise for the download to the object itself
	function addToQueue(object) {
		downloadQueue[object.queueId] = object
		io.sockets.emit('addToQueue', object)
		downloadQueue[object.queueId].downloadQueuePromise = dqueue.push(addNextDownload, { args: object })
	}

	// Wrapper for queue download
	function addNextDownload(obj, token){
		return new Promise(async (resolve, reject) => {
			await queueDownload(obj)
			resolve()
		}).then(() => new Promise((resolve, reject) => {
			if (token.cancelled)
				reject()
			else
				resolve()
		}))
	}

	// Cancels download
	// TODO: Might check this one, could be a little buggy
	function cancelDownload(queueId, cleanAll=false){
		if (!queueId) return
		let cancel = false
		let cancelSuccess
		if (downloadQueue[queueId]){
			cancel = true;
			if (downloadQueue[queueId].downloadQueuePromise) downloadQueue[queueId].downloadQueuePromise.cancel()
			if (downloadQueue[Object.keys(downloadQueue)[0]].queueId == queueId) {
				trackQueue = queue({
					autostart: true,
					concurrency: trackQueue.concurrency
				})
			}
			delete downloadQueue[queueId]
		}

		if (cancel) {
			io.sockets.emit("cancelDownload", {queueId: queueId, cleanAll: cleanAll});
		}
	}
	s.on("cancelDownload", function (data) {cancelDownload(data.queueId)});

	s.on("cancelAllDownloads", function(data){
		data.queueList.forEach(x=>{
			cancelDownload(x, true);
		})
		io.sockets.emit("cancelAllDownloads")
	})

	/*function getNextDownload() {
		if (s.currentItem != null || Object.keys(downloadQueue).length == 0) {
			if (Object.keys(downloadQueue).length == 0 && s.currentItem == null) {
				s.emit("emptyDownloadQueue", {})
			}
			return null
		}
		s.currentItem = downloadQueue[Object.keys(downloadQueue)[0]]
		return s.currentItem
	}*/

	//downloadQueue: the tracks in the queue to be downloaded
	//queueId: random number generated when user clicks download on something
	async function queueDownload(downloading) {
		if (!downloading) return

		if (downloading.type != "spotifyplaylist"){
			io.sockets.emit("downloadStarted", {queueId: downloading.queueId})
		}

		downloading.errorLog = "";
		downloading.searchedLog = "";

		let filePath;
		logger.info(`Registered ${downloading.type}: ${downloading.id} | ${downloading.artist} - ${downloading.name}`);
		switch(downloading.type){
			/*
			*  TRACK DOWNLOAD
			*/
			case "track":
				var downloadPromise = new Promise(async (resolve,reject)=>{
					try{
						await downloadTrackObject(downloading.obj, downloading.queueId, downloading.settings)
						downloading.downloaded++
					}catch(err){
						logger.error(`[${downloading.obj.artist.name} - ${downloading.obj.title}] ${err}`)
						downloading.errorLog += `${t.id} | ${t.artist.name} - ${t.title} | ${err}\r\n`
						downloading.failed++
					}
					io.sockets.emit("updateQueue", {
						name: downloading.name,
						artist: downloading.artist,
						size: downloading.size,
						downloaded: downloading.downloaded,
						failed: downloading.failed,
						queueId: downloading.queueId,
						id: downloading.id,
						type: downloading.type,
						errorLog: downloading.errorLog,
					})
					io.sockets.emit("downloadProgress", {
						queueId: downloading.queueId,
						percentage: 100
					})
					resolve()
				})
				try{
					await downloadPromise
				}catch(err){
					if (err) logger.error(`queueDownload:track failed: ${err.stack ? err.stack : err}`)
					logger.info("Downloading Stopped")
				}
			break
			/*
			*  ALBUM DOWNLOAD
			*/
			case "album":
				downloading.settings.albName = downloading.name;
				downloading.settings.artName = downloading.artist;
				downloading.playlistArr = Array(downloading.size);
				filePath = mainFolder;
				downloading.obj.genresString = []
				downloading.obj.genres.data.map((x)=>{
					downloading.obj.genresString.push(x.name)
				})
				let ajson = {
					artist : downloading.obj.artist,
					nb_tracks : downloading.obj.nb_tracks,
					upc : downloading.obj.upc,
					record_type : downloading.obj.record_type,
					explicit_lyrics : downloading.obj.explicit_lyrics,
					label : downloading.obj.label,
					release_date : downloading.obj.release_date,
					genres : downloading.obj.genres,
					discTotal: downloading.obj.discTotal ? downloading.obj.discTotal : null
				}
				let tempDate = {
					day: ajson.release_date.slice(8,10),
					month: ajson.release_date.slice(5,7),
					year: ajson.release_date.slice(0, 4),
					slicedYear: (downloading.settings.dateFormatYear == "2" ? ajson.release_date.slice(2, 4) : ajson.release_date.slice(0, 4))
				}
				let date
				switch (downloading.settings.dateFormat){
					case "0": date = `${tempDate.slicedYear}-${tempDate.month}-${tempDate.day}`; break;
					case "1": date = `${tempDate.day}-${tempDate.month}-${tempDate.slicedYear}`; break;
					case "2": date = `${tempDate.month}-${tempDate.day}-${tempDate.slicedYear}`; break;
					case "3": date = `${tempDate.slicedYear}-${tempDate.day}-${tempDate.month}`; break;
					default: date = `${tempDate.slicedYear}-${tempDate.month}-${tempDate.day}`; break;
				}
				let albumObj = {
					title: downloading.name,
					artist: {name: downloading.artist},
					year: tempDate.year,
					date: date,
					recordType: ajson.record_type,
					label: ajson.label,
					explicit: ajson.explicit_lyrics,
					genres: downloading.obj.genresString
				}
				if (downloading.settings.createArtistFolder || downloading.settings.createAlbumFolder) {
					if (downloading.settings.createArtistFolder) {
						filePath += antiDot(fixName(downloading.settings.artName)) + path.sep;
					}
					if (downloading.settings.createAlbumFolder) {
						filePath += antiDot(settingsRegexAlbum(albumObj, downloading.settings.foldername)) + path.sep;
					}
				} else if (downloading.settings.artName) {
					filePath += antiDot(settingsRegexAlbum(albumObj, downloading.settings.foldername)) + path.sep;
				}
				downloading.downloadPromise = new Promise((resolve,reject)=>{
					downloading.obj.tracks.every(function (t) {
						trackQueue.push(async cb=>{
							if (!downloadQueue[downloading.queueId]) {
								reject()
								return false
							}
							t.ajson = ajson
							logger.info(`Now downloading: ${t.artist.name} - ${t.title}`)
							try{
								await downloadTrackObject(t, downloading.queueId, downloading.settings)
								downloading.downloaded++
								downloading.playlistArr[t.playlistData[0]] = t.playlistData[1].split(filePath)[1]
								if (t.searched) downloading.searchedLog += `${t.artist.name} - ${t.title}\r\n`
							}catch(err){
								downloading.failed++
								downloading.errorLog += `${t.id} | ${t.artist.name} - ${t.title} | ${err}\r\n`
								logger.error(`[${t.artist.name} - ${t.title}] ${err}`)
							}
							io.sockets.emit("downloadProgress", {
								queueId: downloading.queueId,
								percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
							});
							io.sockets.emit("updateQueue", {
								name: downloading.name,
								artist: downloading.artist,
								size: downloading.size,
								downloaded: downloading.downloaded,
								failed: downloading.failed,
								queueId: downloading.queueId,
								id: downloading.id,
								type: downloading.type,
								errorLog: downloading.errorLog,
							})
							if (downloading.downloaded + downloading.failed >= downloading.size) resolve()
							cb()
						})
						return true
					})
				})
				try{
					await downloading.downloadPromise
					logger.info("Album finished downloading: "+downloading.name);
					io.sockets.emit("downloadProgress", {
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
						fs.writeFileSync(filePath+"playlist.m3u8", downloading.playlistArr.join("\r\n"));
					}
				}catch(err){
					if (err) logger.error(`queueDownload:album failed: ${err.stack ? err.stack : err}`)
					logger.info("Stopping the album queue");
				}
			break
			/*
			*  PLAYLIST DOWNLOAD
			*/
			case "playlist":
				downloading.settings.plName = downloading.name;
				downloading.playlistArr = Array(downloading.size);
				downloading.settings.playlist = {
					fullSize: downloading.obj.tracks.length
				};
				filePath = mainFolder+antiDot(fixName(downloading.settings.plName)) + path.sep
				downloading.downloadPromise = new Promise((resolve,reject)=>{
					downloading.obj.tracks.every(function (t, index) {
						trackQueue.push(async cb=>{
							if (!downloadQueue[downloading.queueId]) {
								reject()
								return false
							}
							try{
								await downloadTrackObject(t, downloading.queueId, downloading.settings)
								downloading.downloaded++
								downloading.playlistArr[t.playlistData[0]] = t.playlistData[1].split(filePath)[1]
								if (t.searched) downloading.searchedLog += `${t.artist.name} - ${t.title}\r\n`
							}catch(err){
								downloading.failed++
								downloading.errorLog += `${t.id} | ${t.artist.name} - ${t.title} | ${err}\r\n`
								logger.error(`[${t.artist.name} - ${t.title}] ${err}`)
							}
							io.sockets.emit("downloadProgress", {
								queueId: downloading.queueId,
								percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
							});
							io.sockets.emit("updateQueue", {
								name: downloading.name,
								artist: downloading.artist,
								size: downloading.size,
								downloaded: downloading.downloaded,
								failed: downloading.failed,
								queueId: downloading.queueId,
								id: downloading.id,
								type: downloading.type,
								errorLog: downloading.errorLog,
							})
							if (downloading.downloaded + downloading.failed >= downloading.size) resolve()
							cb()
						})
						return true
					})
				})
				try{
					await downloading.downloadPromise
					logger.info("Playlist finished "+downloading.name);
					io.sockets.emit("downloadProgress", {
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
						fs.writeFileSync(filePath + "playlist.m3u8", downloading.playlistArr.join("\r\n"));
					}
					if (downloading.settings.saveArtwork){
						if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);
						let imgPath = filePath + antiDot(settingsRegexCover(downloading.settings.coverImageTemplate,downloading.artist,downloading.name))+(downloading.settings.PNGcovers ? ".png" : ".jpg");
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
				}catch(err){
					if (err) logger.error(`queueDownload:playlist failed: ${err.stack ? err.stack : err}`)
					logger.info("Stopping the playlist queue")
				}
			break
			/*
			*  SPOTIFY PLAYLIST DOWNLOAD
			*/
			case "spotifyplaylist":
				downloading.settings.plName = downloading.name
				downloading.playlistArr = Array(downloading.size)
				downloading.playlistContent = new Array(downloading.size)
				logger.info("Waiting for all tracks to be converted");
				const convert = async () =>{
					await asyncForEach(downloading.obj.tracks, async (t,i)=>{
						if (!downloadQueue[downloading.queueId]) return false
						try{
							downloading.playlistContent[i] = await convertSpotify2Deezer(t)
						}catch(err){
							logger.error(`queueDownload:spotifyplaylist failed during conversion: ${err.stack ? err.stack : err}`)
						}
					})
				}
				await convert()
				if (!downloadQueue[downloading.queueId]) {
					logger.info("Stopping the playlist queue")
					break
				}
				downloading.trackList = await s.Deezer.getTracks(downloading.playlistContent)
				logger.info("All tracks converted, starting download")
				io.sockets.emit("downloadStarted", {queueId: downloading.queueId})
				downloading.settings.playlist = {
					fullSize: downloading.trackList.length
				}
				filePath = `${mainFolder}${antiDot(fixName(downloading.settings.plName))}${path.sep}`
				downloading.downloadPromise = new Promise((resolve,reject)=>{
					downloading.trackList.every(function (t, index) {
						trackQueue.push(async cb=>{
							if (!downloadQueue[downloading.queueId]) {
								reject()
								return false
							}
							t.position = index
							if (t.id==0 && downloading.obj.tracks[t.position] != null){
								t.title = downloading.obj.tracks[t.position].name
								t.album = {id: 0, title: downloading.obj.tracks[t.position].album.name}
								t.artist = {id: 0, name: downloading.obj.tracks[t.position].artists[0].name}
							}
							try{
								await downloadTrackObject(t, downloading.queueId, downloading.settings)
								downloading.downloaded++
								downloading.playlistArr[t.playlistData[0]] = t.playlistData[1].split(filePath)[1]
								if (t.searched) downloading.searchedLog += `${t.artist.name} - ${t.title}\r\n`
							}catch(err){
								downloading.failed++
								downloading.errorLog += `${t.id} | ${t.artist.name} - ${t.title} | ${err}\r\n`
								logger.error(`[${t.artist.name} - ${t.title}] ${err}`)
							}
							io.sockets.emit("downloadProgress", {
								queueId: downloading.queueId,
								percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
							});
							io.sockets.emit("updateQueue", {
								name: downloading.name,
								artist: downloading.artist,
								size: downloading.size,
								downloaded: downloading.downloaded,
								failed: downloading.failed,
								queueId: downloading.queueId,
								id: downloading.id,
								type: downloading.type,
								errorLog: downloading.errorLog,
							})
							if (downloading.downloaded + downloading.failed >= downloading.size) resolve()
							cb()
						})
						return true
					})
				})
				try{
					await downloading.downloadPromise
					logger.info("Playlist finished "+downloading.name);
					io.sockets.emit("downloadProgress", {
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
						fs.writeFileSync(filePath + "playlist.m3u8", downloading.playlistArr.join("\r\n"));
					}
					if (downloading.settings.saveArtwork){
						if (!fs.existsSync(filePath)) fs.mkdirSync(filePath);
						let imgPath = filePath + antiDot(settingsRegexCover(downloading.settings.coverImageTemplate,downloading.artist,downloading.name))+(downloading.settings.PNGcovers ? ".png" : ".jpg");
						if (downloading.obj.images){
							downloading.cover = downloading.obj.images[0].url.replace("56x56",`${downloading.settings.artworkSize}x${downloading.settings.artworkSize}`)
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
				}catch(err){
					if (err) logger.error(`queueDownload:spotifyplaylist failed: ${err.stack ? err.stack : err}`)
					logger.info("Stopping the playlist queue")
				}
			break
		}
		if (downloading && downloadQueue[Object.keys(downloadQueue)[0]] && (Object.keys(downloadQueue)[0] == downloading.queueId)) delete downloadQueue[Object.keys(downloadQueue)[0]]
		if (Object.keys(downloadQueue).length == 0) {
			io.sockets.emit("emptyDownloadQueue", {})
		}
	}

	// This function takes the track object and does all the stuff to download it
	async function downloadTrackObject(track, queueId, settings) {
		if (!downloadQueue[queueId]) {
			logger.error(`[${track.artist.name} - ${track.title}] Failed to download: Not in queue`)
			throw new Error("Not in queue")
			return false
		}
		if (parseInt(track.id) == 0){
			logger.error(`[${track.artist.name} - ${track.title}] Failed to download: Song not Found`)
			throw new Error("Song not Found")
			return false
		}

		/* Album information is necessary for the following tags:
		 * album_artist
		 * album_artist_picture
		 * trackTotal
		 * recordType
		 * barcode
		 * explicit
		 * label
		 * genres
		 * date
		*/
		if (parseInt(track.id)>0){
			var ajson
			if (!track.ajson){
				try{
					logger.info(`[${track.artist.name} - ${track.title}] Getting album info`)
					ajson = await s.Deezer.legacyGetAlbum(track.album.id)
				}catch(err){
					logger.warn(`[${track.artist.name} - ${track.title}] Album not found, trying to reach deeper`)
					try{
						ajson = await s.Deezer.getAlbum(track.album.id)
						ajson.fromNewAPI = true
					} catch(err){
						if(track.fallbackId){
							logger.warn(`[${track.artist.name} - ${track.title}] Failed to download track, falling on alternative`)
							track = await s.Deezer.getTrack(track.fallbackId)
							return downloadTrackObject(track, queueId, settings)
						}else if(!track.searched){
							logger.warn(`[${track.artist.name} - ${track.title}] Failed to download track, searching for alternative`)
							var _trackID = await convertMetadata2Deezer(track.artist.name, track.title, track.album.title)
							if (_trackID != "0"){
								track = await s.Deezer.getTrack()
								track.searched = true
								return downloadTrackObject(track, queueId, settings)
							}else{
								logger.error(`[${track.artist.name} - ${track.title}] Failed to download: Alternative not found`)
								return
							}
						}else{
							logger.error(`[${track.artist.name} - ${track.title}] Failed to download: ${err}`)
							return
						}
					}
				}
			}else{
				ajson = track.ajson
			}
			if (!ajson.fromNewAPI){
				// Aquiring discTotal (only if necessary)
				if (settings.tags.discTotal || settings.createCDFolder){
					if (!ajson.discTotal){
						logger.info(`[${track.artist.name} - ${track.title}] Getting total disc number`);
						var discTotal = await s.Deezer.getAlbum(ajson.id)
						track.album.discTotal = discTotal.discTotal
					}else{
						track.album.discTotal = ajson.discTotal
					}
				}
				track.album.artist = {
					id: ajson.artist.id,
					name: ajson.artist.name,
					picture: ajson.artist.picture_small.substring(46,ajson.artist.picture_small.length-24),
				}
				track.album.trackTotal = ajson.nb_tracks
				track.album.barcode = ajson.upc
				if (ajson.record_type){
					track.album.recordType = ajson.record_type
				}else{
					track.album.recordType = switchReleaseType(track.album.recordType)
				}
				if (ajson.explicit_lyrics)
					track.album.explicit = ajson.explicit_lyrics;
				if(ajson.label)
					track.album.label = ajson.label;
				if (ajson.release_date) {
					track.date = {
						day: ajson.release_date.slice(8,10),
						month: ajson.release_date.slice(5,7),
						year: ajson.release_date.slice(0, 4),
						slicedYear: (settings.dateFormatYear == "2" ? ajson.release_date.slice(2, 4) : ajson.release_date.slice(0, 4))
					}
				}else if(!track.date){
					track.date = {
						day: 0,
						month: 0,
						year: 0,
						slicedYear: 0
					}
				}
				if(ajson.genres && ajson.genres.data[0] && ajson.genres.data[0].name){
					track.album.genre = []
					ajson.genres.data.forEach(function(genre){
						if (track.album.genre.indexOf(genre.name) == -1)
							track.album.genre.push(genre.name)
					})
				}
			}else{
				// Missing barcode, genre
				track.album = ajson
				track.date = track.album.date
				track.date.slicedYear = (settings.dateFormatYear == "2" ? track.date.year.slice(2, 4) : track.date.year.slice(0, 4))
				track.trackTotal = track.album.trackTotal
				track.album.recordType = "Album"
				// TODO: Make a loop for each artist
			}

			if (!track.date.slicedYear){
				track.date.slicedYear = settings.dateFormatYear == "2" ? track.date.year.slice(2, 4) : track.date.year.slice(0, 4)
			}

			// Acquiring bpm (only if necessary)
			if (settings.tags.bpm){
				logger.info(`[${track.artist.name} - ${track.title}] Getting BPM`);
				track.legacyTrack = await s.Deezer.legacyGetTrack(track.id)
				try{
					track.bpm = track.legacyTrack.bpm
				}catch(err){
					track.bpm = 0
				}
			}else{
				track.bpm = 0
			}

			// Acquiring ReplayGain value (only if necessary)
			if (settings.tags.replayGain){
				logger.info(`[${track.artist.name} - ${track.title}] Getting track gain`);
				if (!track.legacyTrack) track.legacyTrack = await s.Deezer.legacyGetTrack(track.id)
				try{
					track.replayGain = track.legacyTrack.gain
				}catch(err){
					track.replayGain = 0
				}
			}else{
				track.replayGain = 0
			}

			// Acquiring discNumber value (only if necessary)
			if (settings.tags.discNumber && !track.discNumber){
				logger.info(`[${track.artist.name} - ${track.title}] Getting disc number`);
				if (!track.legacyTrack) track.legacyTrack = await s.Deezer.legacyGetTrack(track.id)
				track.discNumber = track.legacyTrack.disk_number
			}

			let separator = settings.multitagSeparator
			if (separator == "null") separator = String.fromCharCode(0)

			// Autoremoves (Album Version) from the title
			if (settings.removeAlbumVersion){
				if(track.title.indexOf("Album Version")>-1){
					track.title = track.title.replace(/ ?\(Album Version\)/g,"")
				}
			}

			// See if you already have the artist picture
			if (!track.album.artist.picture && !settings.plName){
				if (track.artist.name == track.album.artist.name && !track.album.artist.picture){
					track.album.artist.picture = track.artist.picture
				}else{
					let found = false
					if (track.artists){
						track.artists.forEach(x=>{
							if(!found && x.name == track.album.artist.name){
								track.album.artist.picture = x.picture
								found = true
							}
						})
					}
					if(settings.saveArtworkArtist && !found){
						artist = await s.Deezer.legacyGetArtist(track.album.artist.id)
						track.album.artist.picture = artist.picture_small.substring(46,ajson.artist.picture_small.length-24)
					}
				}
			}
			if (!track.album.artist.picture) track.album.artist.picture = ""
			track.album.artist.pictureUrl = `${s.Deezer.artistPicturesHost}${track.album.artist.picture}/${settings.artworkSize}x${settings.artworkSize}-000000-80-0-0${(settings.PNGcovers ? ".png" : ".jpg")}`
			track.album.pictureUrl = `${s.Deezer.albumPicturesHost}${track.album.picture}/${settings.artworkSize}x${settings.artworkSize}-000000-80-0-0${(settings.PNGcovers ? ".png" : ".jpg")}`

			// Auto detect aviable track format from settings
			switch(downloadQueue[queueId].bitrate.toString()){
				case "9":
					track.selectedFormat = 9
					track.selectedFilesize = track.filesize.flac
					if (track.filesize.flac>0) break
					if (!settings.fallbackBitrate) throw new Error("Song not found at desired bitrate.")
				case "3":
					track.selectedFormat = 3
					track.selectedFilesize = track.filesize.mp3_320
					if (track.filesize.mp3_320>0) break
					if (!settings.fallbackBitrate) throw new Error("Song not found at desired bitrate.")
				case "1":
					track.selectedFormat = 1
					track.selectedFilesize = track.filesize.mp3_128
					if (track.filesize.mp3_128>0) break
					if (!settings.fallbackBitrate) throw new Error("Song not found at desired bitrate.")
				default:
					track.selectedFormat = 8
					track.selectedFilesize = track.filesize.default
			}
			track.album.bitrate = track.selectedFormat

			if(track.contributor){
				if(track.contributor.composer){
					track.composerString = uniqueArray(track.contributor.composer)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(0))) track.composerString = track.composerString.join(separator)
				}
				if(track.contributor.musicpublisher){
					track.musicpublisherString = uniqueArray(track.contributor.musicpublisher)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(0))) track.musicpublisherString = track.musicpublisherString.join(separator)
				}
				if(track.contributor.producer){
					track.producerString = uniqueArray(track.contributor.producer)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(0))) track.producerString = track.producerString.join(separator)
				}
				if(track.contributor.engineer){
					track.engineerString = uniqueArray(track.contributor.engineer)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(0))) track.engineerString = track.engineerString.join(separator)
				}
				if(track.contributor.writer){
					track.writerString = uniqueArray(track.contributor.writer)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(0))) track.writerString = track.writerString.join(separator)
				}
				if(track.contributor.author){
					track.authorString = uniqueArray(track.contributor.author)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(0))) track.authorString = track.authorString.join(separator)
				}
				if(track.contributor.mixer){
					track.mixerString = uniqueArray(track.contributor.mixer)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(0))) track.mixerString = track.mixerString.join(separator)
				}
			}

			if(track.artists || track.artistsString){
				if (!track.artistsString){
					track.artistsString = []
					artistArray = []
					track.artists.forEach(function(artist){
						artistArray.push(artist.name)
					})
				}else{
					if (! Array.isArray(track.artistsString)){
						track.artistsString = [track.artistsString,]
					}
					artistArray = track.artistsString
				}
				track.artistsString = uniqueArray(artistArray)
				let posMainArtist = track.artistsString.indexOf(track.album.artist.name)
				if (posMainArtist !== -1 && posMainArtist !== 0){
					let element = track.artistsString[posMainArtist]
					track.artistsString.splice(posMainArtist, 1)
					track.artistsString.splice(0, 0, element)
				}
				if (!(track.selectedFormat == 9 && separator==String.fromCharCode(0))) track.artistsString = track.artistsString.join(separator)
			}
			if (track.album.genre){
				if (!(track.selectedFormat == 9 && separator==String.fromCharCode(0)))
					track.album.genreString = track.album.genre.join(separator)
				else
					track.album.genreString = track.album.genre
			}

			if (track.date){
				let date
				switch (settings.dateFormat){
					case "0": date = `${track.date.slicedYear}-${track.date.month}-${track.date.day}`; break;
					case "1": date = `${track.date.day}-${track.date.month}-${track.date.slicedYear}`; break;
					case "2": date = `${track.date.month}-${track.date.day}-${track.date.slicedYear}`; break;
					case "3": date = `${track.date.slicedYear}-${track.date.day}-${track.date.month}`; break;
					default: date = `${track.date.slicedYear}-${track.date.month}-${track.date.day}`; break;
				}
				track.dateString = date;
				track.id3dateString = `${track.date.day}${track.date.month}`;
			}
		}else{
			track.date = {year: 0,day: 0,month: 0}
			track.selectedFilesize = track.filesize
			track.selectedFormat = 3
			track.album.bitrate = 3
		}
		track.album.date = track.dateString
		track.album.year = track.date.year

		// TODO: Move to a separate function
		// Generating file name
		if (settings.saveFullArtists && settings.multitagSeparator != null){
			let filename = antiDot(fixName(`${track.artistsString} - ${track.title}`));
		}else{
			let filename = antiDot(fixName(`${track.artist.name} - ${track.title}`));
		}
		if (settings.filename) {
			filename = antiDot(fixName(settingsRegex(track, settings.filename, settings.playlist, settings.saveFullArtists && settings.multitagSeparator != null, settings.paddingSize, settings.plName)))
		}

		filename = antiDot(fixName(filename))

		// TODO: Move to a separate function
		// Generating file path
		let filepath = mainFolder;
		let artistPath;
		if ((settings.createArtistFolder || settings.createAlbumFolder) && !settings.plName) {

			if(settings.plName){
				filepath += antiDot(fixName(settings.plName)) + path.sep;
			}

			if (settings.createArtistFolder) {
				if(settings.artName){
					filepath += antiDot(fixName(settings.artName)) + path.sep;
				}else{
					filepath += antiDot(fixName(track.album.artist.name)) + path.sep;
				}
				artistPath = filepath;
			}

			if (settings.createAlbumFolder) {
				if(settings.artName){
					filepath += antiDot(fixName(settingsRegexAlbum(track.album, settings.foldername))) + path.sep;
				}else{
					filepath += antiDot(fixName(settingsRegexAlbum(track.album, settings.foldername))) + path.sep;
				}
			}
		} else if (settings.plName) {
			filepath += antiDot(fixName(settings.plName)) + path.sep;
		} else if (settings.artName) {
			filepath += antiDot(fixName(settingsRegexAlbum(track.album, settings.foldername))) + path.sep;
		}
		let coverpath = filepath;
		if (track.album.discTotal > 1 && (settings.artName || settings.createAlbumFolder) && settings.createCDFolder){
			filepath += `CD${track.discNumber + path.sep}`
		}

		let writePath;
		if(track.selectedFormat == 9){
			writePath = filepath + filename + '.flac';
		}else{
			writePath = filepath + filename + '.mp3';
		}

		if ((settings.syncedlyrics || settings.tags.unsynchronisedLyrics) && track.lyricsId>0){
			let lyr = await s.Deezer.getLyrics(track.id)
			track.syncLyrics = lyr.syncLyrics
			track.unsyncLyrics = lyr.unsyncLyrics
		}

		if(track.syncLyrics && settings.syncedlyrics){
			fs.outputFile(writePath.substring(0,writePath.lastIndexOf('.'))+".lrc",track.syncLyrics,function(){});
		}

		track.playlistData = [0,""]
		if (settings.createM3UFile && (settings.plName || settings.albName)) {
			if (track.position){
				track.playlistData = [parseInt(track.position), writePath];
			}else{
				track.playlistData = [track.trackNumber-1, writePath];
			}
		}
		if (fs.existsSync(writePath)) {
			logger.info(`[${track.artist.name} - ${track.title}] Already downloaded`);
			return;
		}else{
			logger.info(`[${track.artist.name} - ${track.title}] Downloading file to ${writePath}`);
		}
		// Get cover image
		if (track.album.pictureUrl) {
			let imgPath;
			//If its not from an album but a playlist.
			if(settings.albName || settings.createAlbumFolder){
				if (settings.saveArtwork && ! settings.plName)
					imgPath = coverpath + settingsRegexCover(settings.coverImageTemplate,track.album.artist.name,track.album.title)+(settings.PNGcovers ? ".png" : ".jpg")
				else
					imgPath = coverArtFolder + fixName(track.album.barcode ? fixName(track.album.barcode) : fixName(`${track.album.artist.name} - ${track.album.title}`))+(settings.PNGcovers ? ".png" : ".jpg")
			}else{
				imgPath = coverArtFolder + (track.album.barcode ? fixName(track.album.barcode) : fixName(`${track.album.artist.name} - ${track.album.title}`))+(settings.PNGcovers ? ".png" : ".jpg")
			}
			if(fs.existsSync(imgPath)){
				track.album.picturePath = (imgPath).replace(/\\/g, "/")
				logger.info(`[${track.artist.name} - ${track.title}] Starting the download process CODE:1`)
			}else{
				try{
					var body = await request.get(track.album.pictureUrl, {strictSSL: false,encoding: 'binary'})
					fs.outputFileSync(imgPath,body,'binary')
					track.album.picturePath = (imgPath).replace(/\\/g, "/")
					logger.info(`[${track.artist.name} - ${track.title}] Starting the download process CODE:2`)
				}catch(error){
					logger.error(`[${track.artist.name} - ${track.title}] Cannot download Album Image: ${error}`)
					logger.error(`Album art link: ${track.album.pictureUrl}`)
					track.album.pictureUrl = undefined
					track.album.picturePath = undefined
				}
			}
		}else{
			track.album.pictureUrl = undefined
			logger.info(`[${track.artist.name} - ${track.title}] Starting the download process CODE:3`)
		}

		// Get Artist Image
		if (parseInt(track.id)>0 && track.album.artist.pictureUrl && settings.saveArtworkArtist) {
			let imgPath;
			if(settings.createArtistFolder && artistPath){
				imgPath = artistPath + antiDot(settingsRegexArtistCover(settings.artistImageTemplate,track.album.artist.name))+(settings.PNGcovers ? ".png" : ".jpg");
				if(!fs.existsSync(imgPath)){
					try{
						var body = await request.get(track.album.artist.pictureUrl, {strictSSL: false,encoding: 'binary'})
						if (body.indexOf("unauthorized")>-1) throw new Error("Unauthorized")
						fs.outputFileSync(imgPath,body,'binary')
						logger.info(`[${track.artist.name} - ${track.title}] Saved Artist Image`)
					}catch(err){
						logger.error(`[${track.artist.name} - ${track.title}] Cannot download Artist Image: ${err}`)
					}
				}
			}
		}

		let tempPath
		if(parseInt(track.id)>0)
			tempPath = `${filepath}${track.id}_${track.selectedFormat}.temp`
		else
			tempPath = writePath

		logger.info(`[${track.artist.name} - ${track.title}] Downloading track`)
		var downloadingPromise = new Promise((resolve, reject)=>{
			let req = requestOld.get({url: track.getDownloadUrl(track.selectedFormat), strictSSL: false, headers: s.Deezer.httpHeaders, encoding: 'binary'}, function (error, response, body) {
				if (error){
					logger.error(`[${track.artist.name} - ${track.title}] Downloading error: ${error}`)
					reject("Downloading error: "+error)
					return false
				}
				if (!downloadQueue[queueId]){
					fs.remove(tempPath)
					reject("Not in Queue")
					return false
				}
				if (body.length == 0){
					fs.remove(tempPath)
					reject("Track is Empty")
					return false
				}
				logger.info(`[${track.artist.name} - ${track.title}] Decrypting track`)
				var decryptedSource = s.Deezer.decryptDownload(Buffer.from(body, 'binary'), track.id)
				try{
					fs.outputFileSync(tempPath,decryptedSource)
					resolve()
				}catch(err){
					logger.error(`[${track.artist.name} - ${track.title}] Decryption error: ${err}`)
					reject(err)
					return false
				}
			}).on("data", function(data) {
				if (!downloadQueue[queueId]){
					reject("Not in Queue")
					return false
				}
			})
			if((downloadQueue[queueId]) && downloadQueue[queueId].type == "track"){
				let chunkLength = 0
				req.on("data", function(data) {
					if (!downloadQueue[queueId]){
						reject("Not in Queue")
					}
					chunkLength += data.length
					try{
						if (!downloadQueue[queueId].percentage) {
							downloadQueue[queueId].percentage = 0
						}
						let complete = track.selectedFilesize
						let percentage = (chunkLength / complete) * 100;
						if ((percentage - downloadQueue[queueId].percentage > 1) || (chunkLength == complete)) {
							downloadQueue[queueId].percentage = percentage
							io.sockets.emit("downloadProgress", {
								queueId: queueId,
								percentage: downloadQueue[queueId].percentage-5
							})
						}
					}catch(err){}
				})
			}
		})

		try{
			await downloadingPromise
		}catch(err){
			if (err==="Track is Empty"){
				if(track.fallbackId && track.fallbackId != "0"){
					logger.warn(`[${track.artist.name} - ${track.title}] Track is empty, falling on alternative`)
					var _track = await s.Deezer.getTrack(track.fallbackId)
					track.id = _track.id
					track.fallbackId = _track.fallbackId
					track.filesize = _track.filesize
					track.duration = _track.duration
					track.MD5 = _track.MD5
					track.mediaVersion = _track.mediaVersion
					return downloadTrackObject(track, queueId, settings)
				}else if(!track.searched){
					logger.warn(`[${track.artist.name} - ${track.title}] Track is empty, searching for alternative`)
					_trackId = await convertMetadata2Deezer(track.artist.name, track.title, track.album.title)
					if (_trackId != "0"){
						_track = await s.Deezer.getTrack(_trackId)
						track.id = _track.id
						track.fallbackId = _track.fallbackId
						track.filesize = _track.filesize
						track.duration = _track.duration
						track.MD5 = _track.MD5
						track.mediaVersion = _track.mediaVersion
						track.searched = true
						return downloadTrackObject(track, queueId, settings)
					}else{
						logger.error(`[${track.artist.name} - ${track.title}] No alternative found`)
						throw new Error("No Alternative Found")
						return
					}
				}else{
					logger.error(`[${track.artist.name} - ${track.title}] Downloading error: Track is Empty`)
					throw new Error("Track is Empty")
					return
				}
			}else{
				throw new Error(err)
				return
			}
		}

		logger.info(`[${track.artist.name} - ${track.title}] Adding Tags`)
		if (parseInt(track.id)>0){
			if(track.selectedFormat == 9){
				let flacComments = [];
				if (settings.tags.title)
					flacComments.push('TITLE=' + track.title);
				if (settings.tags.album)
					flacComments.push('ALBUM=' + track.album.title);
				if (settings.tags.albumArtist)
					flacComments.push('ALBUMARTIST=' + track.album.artist.name);
				if (settings.tags.trackNumber)
					flacComments.push('TRACKNUMBER=' + track.trackNumber);
				if (settings.tags.discNumber)
					flacComments.push('DISCNUMBER=' + track.discNumber);
				if (settings.tags.trackTotal)
					flacComments.push('TRACKTOTAL=' + track.album.trackTotal);
				if (settings.tags.explicit)
					flacComments.push('ITUNESADVISORY=' + track.explicit);
				if (settings.tags.isrc)
					flacComments.push('ISRC=' + track.ISRC);
				if (settings.tags.artist && track.artistsString)
					if (Array.isArray(track.artistsString)){
						track.artistsString.forEach(x=>{
							flacComments.push('ARTIST=' + x);
						});
					}else{
						flacComments.push('ARTIST=' + track.artistsString);
					}
				if (settings.tags.discTotal)
					flacComments.push('DISCTOTAL='+track.album.discTotal);
				if (settings.tags.length)
					flacComments.push('LENGTH=' + track.duration);
				if (settings.tags.barcode && track.album.barcode)
					flacComments.push('BARCODE=' + track.album.barcode);
				if (track.unsyncLyrics && settings.tags.unsynchronisedLyrics)
					flacComments.push('LYRICS='+track.unsyncLyrics.lyrics);
				if (track.album.genreString && settings.tags.genre)
					if (Array.isArray(track.album.genreString)){
						track.album.genreString.forEach(x=>{
							flacComments.push('GENRE=' + x);
						});
					}else{
						flacComments.push('GENRE=' + track.album.genreString);
					}
				if (track.copyright && settings.tags.copyright)
					flacComments.push('COPYRIGHT=' + track.copyright);
				if (0 < parseInt(track.date.year)){
					if (settings.tags.date)
						flacComments.push('DATE=' + track.dateString);
					else if (settings.tags.year)
						flacComments.push('DATE=' + track.date.year);
				}
				if (0 < parseInt(track.bpm) && settings.tags.bpm)
					flacComments.push('BPM=' + track.bpm);
				if(track.album.label && settings.tags.publisher)
					flacComments.push('PUBLISHER=' + track.album.label);
				if(track.composerString && settings.tags.composer)
					if (Array.isArray(track.composerString)){
						track.composerString.forEach(x=>{
							flacComments.push('COMPOSER=' + x);
						});
					}else{
						flacComments.push('COMPOSER=' + track.composerString);
					}
				if(track.musicpublisherString && settings.tags.musicpublisher)
					if (Array.isArray(track.musicpublisherString)){
						track.musicpublisherString.forEach(x=>{
							flacComments.push('ORGANIZATION=' + x);
						});
					}else{
						flacComments.push('ORGANIZATION=' + track.musicpublisherString);
					}
				if(track.mixerString && settings.tags.mixer)
					if (Array.isArray(track.mixerString)){
						track.mixerString.forEach(x=>{
							flacComments.push('MIXER=' + x);
						});
					}else{
						flacComments.push('MIXER=' + track.mixerString);
					}
				if(track.authorString && settings.tags.author)
					if (Array.isArray(track.authorString)){
						track.authorString.forEach(x=>{
							flacComments.push('AUTHOR=' + x);
						});
					}else{
						flacComments.push('AUTHOR=' + track.authorString);
					}
				if(track.writerString && settings.tags.writer)
					if (Array.isArray(track.writerString)){
						track.writerString.forEach(x=>{
							flacComments.push('WRITER=' + x);
						});
					}else{
						flacComments.push('WRITER=' + track.writerString);
					}
				if(track.engineerString && settings.tags.engineer)
					if (Array.isArray(track.engineerString)){
						track.engineerString.forEach(x=>{
							flacComments.push('ENGINEER=' + x);
						});
					}else{
						flacComments.push('ENGINEER=' + track.engineerString);
					}
				if(track.producerString && settings.tags.producer)
					if (Array.isArray(track.producerString)){
						track.producerString.forEach(x=>{
							flacComments.push('PRODUCER=' + x);
						});
					}else{
						flacComments.push('PRODUCER=' + track.producerString);
					}
				if(track.replayGain && settings.tags.replayGain)
					flacComments.push('REPLAYGAIN_TRACK_GAIN=' + track.replayGain);

				const reader = fs.createReadStream(tempPath);
				const writer = fs.createWriteStream(writePath);
				let processor = new mflac.Processor({parseMetaDataBlocks: true});
				let vendor = 'reference libFLAC 1.2.1 20070917';
				let cover = null;
				if(track.album.picturePath && settings.tags.cover){
					cover = fs.readFileSync(track.album.picturePath)
				}
				let mdbVorbisPicture
				let mdbVorbisComment
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
				await reader.pipe(processor).pipe(writer);
			}else{
				const songBuffer = fs.readFileSync(tempPath);
				const writer = new ID3Writer(songBuffer);
				if (settings.tags.title)
					writer.setFrame('TIT2', track.title)
				if (settings.tags.artist)
					writer.setFrame('TPE1', [track.artistsString])
				if (settings.tags.album)
					writer.setFrame('TALB', track.album.title)
				if (settings.tags.albumArtist && track.album.artist)
					writer.setFrame('TPE2', track.album.artist.name)
				if (settings.tags.trackNumber)
					writer.setFrame('TRCK', (settings.tags.trackTotal ? track.trackNumber+"/"+track.album.trackTotal : track.trackNumber))
				if (settings.tags.discNumber)
					writer.setFrame('TPOS', (settings.tags.discTotal ? track.discNumber+"/"+track.album.discTotal : track.discNumber))
				if (settings.tags.isrc)
					writer.setFrame('TSRC', track.ISRC);

				if (settings.tags.length)
					writer.setFrame('TLEN', track.duration);
				if (settings.tags.barcode && track.album.barcode)
					writer.setFrame('TXXX', {
						description: 'BARCODE',
						value: track.album.barcode
					});
				if(track.album.picturePath && settings.tags.cover){
					const coverBuffer = fs.readFileSync(track.album.picturePath);
					writer.setFrame('APIC', {
						type: 3,
						data: coverBuffer,
						description: ''
					});
				}
				if(track.unsyncLyrics && settings.tags.unsynchronisedLyrics)
					writer.setFrame('USLT', track.unsyncLyrics);
				if(track.album.label && settings.tags.publisher)
					writer.setFrame('TPUB', track.album.label);
				if(track.album.genreString && settings.tags.genre)
					writer.setFrame('TCON', [track.album.genreString]);
				if(track.copyright && settings.tags.copyright)
					writer.setFrame('TCOP', track.copyright);
				if (0 < parseInt(track.date.year)) {
					if (settings.tags.date)
						writer.setFrame('TDAT', track.id3dateString);
					if (settings.tags.year)
						writer.setFrame('TYER', track.date.year);
				}
				if (0 < parseInt(track.bpm) && settings.tags.bpm)
					writer.setFrame('TBPM', track.bpm);
				if(track.composerString && settings.tags.composer)
					writer.setFrame('TCOM', [track.composerString]);
				if(track.replayGain && settings.tags.replayGain)
					writer.setFrame('TXXX', {
						description: 'REPLAYGAIN_TRACK_GAIN',
						value: track.replayGain
					});
				writer.addTag();
				const taggedSongBuffer = Buffer.from(writer.arrayBuffer);
				fs.writeFileSync(writePath, taggedSongBuffer);
				fs.remove(tempPath);
			}
		}
		logger.info(`[${track.artist.name} - ${track.title}] Downloaded`)
	}
})

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
	txt = txt+""
	const regEx = /[\0\/\\:*?"<>|]/g;
	txt = txt.replace(regEx, '_');
	txt = txt.slice(0,200);
	return txt;
}

function antiDot(str){
	while(str[str.length-1] == "." || str[str.length-1] == " " || str[str.length-1] == "\n"){
		str = str.substring(0,str.length-1);
	}
	if(str.length < 1){
		str = "dot";
	}
	return str;
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
 * @param track
 * @param filename
 * @param playlist
 * @returns {XML|string|*}
 */
function settingsRegex(track, filename, playlist, saveFullArtists, paddingSize, playlistNumbering) {
	try{
		filename = filename.replace(/%title%/g, fixName(track.title));
		filename = filename.replace(/%album%/g, fixName(track.album.title));
		filename = filename.replace(/%artist%/g, fixName((saveFullArtists ? track.artistsString : track.artist.name)));
		filename = filename.replace(/%year%/g, fixName(track.date.year));
		filename = filename.replace(/%label%/g, fixName(track.album.label));
		let tNumber = playlistNumbering ? track.position+1 : track.trackNumber
		let tTotal = playlistNumbering ? playlist.fullSize : track.album.trackTotal
		if(typeof tNumber != 'undefined'){
			if(configFile.userDefined.padtrck){
				 filename = filename.replace(/%number%/g, fixName(pad(tNumber, (parseInt(paddingSize)>0 ? parseInt(paddingSize) : tTotal))));
			}else{
				filename = filename.replace(/%number%/g, fixName(tNumber));
			}
		} else {
			filename = filename.replace(/%number%/g, '');
		}
		filename = filename.replace(/%disc%/g, fixName(track.discNumber));
		filename = filename.replace(/%explicit%/g, fixName((track.explicit==="1" ? (filename.indexOf(/[^%]explicit/g)>-1 ? "" : "(Explicit Version)") : "")));
		filename = filename.replace(/%genre%/g, fixName(track.album.genre ? (Array.isArray(track.album.genre) ? track.album.genre[0] : track.album.genre) : "Unknown"));
		filename = filename.replace(/[/\\]/g, path.sep)
		return filename.trim();
	}catch(e){
		logger.error("settingsRegex failed: "+e)
	}
}

/**
 * Creates the name of the albums folder replacing wildcards to correct metadata
 * @param metadata
 * @param foldername
 * @returns {XML|string|*}
 */
function settingsRegexAlbum(album, foldername) {
	try{
		foldername = foldername.replace(/%album%/g, fixName(album.title))
		foldername = foldername.replace(/%artist%/g, fixName(album.artist.name))
		foldername = foldername.replace(/%year%/g, fixName(album.year))
		foldername = foldername.replace(/%date%/g, fixName(album.date))
		if (album.recordType){
			foldername = foldername.replace(/%type%/g, fixName(album.recordType[0].toUpperCase() + album.recordType.substring(1)))
		}else{
			foldername = foldername.replace(/%type%/g, "")
		}
		foldername = foldername.replace(/%label%/g, fixName(album.label))
		foldername = foldername.replace(/%explicit%/g, fixName((album.explicit ? (foldername.indexOf(/[^%]explicit/g)>-1 ? "" : "(Explicit) ") : "")))
		foldername = foldername.replace(/%genre%/g, fixName(album.genres ? (Array.isArray(album.genres) ? album.genres[0] : album.genres) : "Unknown"))
		foldername = foldername.replace(/[/\\]/g, path.sep)
		return foldername.trim();
	}catch(e){
		logger.error("settingsRegexAlbum failed: "+e)
	}

}

function settingsRegexCover(foldername, artist, name) {
	foldername = foldername.replace(/%name%/g, fixName(name));
	foldername = foldername.replace(/%artist%/g, fixName(artist));
	foldername = foldername.replace(/[/\\]/g, path.sep)
	return foldername;
}

function settingsRegexArtistCover(foldername, artist) {
	foldername = foldername.replace(/%artist%/g, fixName(artist));
	foldername = foldername.replace(/[/\\]/g, path.sep)
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

function switchReleaseType(id){
	switch (id.toString()) {
		case "0":
			return "Album";
		case "1":
			return "Single";
		case "3":
			return "EP";
		default:
			return "Album";
	}
}

function uniqueArray(origin, removeDupes=true){
	destination = []
	Array.from(new Set(origin)).forEach(function(x){
		if(destination.indexOf(x) == -1)
			destination.push(x);
	})
	if (removeDupes){
		destination.forEach((name,index)=>{
			destination.forEach((name2,index2)=>{
				if(!(index===index2) && (name.toLowerCase().indexOf(name2.toLowerCase())!== -1)){
					destination.splice(index, 1);
				}
			})
		})
	}
	return destination
}

async function asyncForEach(array, callback) {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array);
	}
}

// Show crash error in console for debugging
process.on('unhandledRejection', function (err) {
	if (err) logger.error(err.stack ? err.stack : err)

})
process.on('uncaughtException', function (err) {
	if (err) logger.error(err.stack ? err.stack : err)
})

// Exporting vars
module.exports.mainFolder = mainFolder
module.exports.defaultSettings = defaultSettings
module.exports.defaultDownloadFolder = defaultDownloadFolder
