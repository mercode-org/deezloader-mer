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
var cookieParser = require('cookie-parser')
var i18n = require('./i18n');
// REST API
const socketclientio = require('socket.io-client')
const bodyParser = require('body-parser');	//for receiving req.body JSON

// Music tagging stuff
const metaflac = require('metaflac-js2')
const ID3Writer = require('./lib/browser-id3-writer')
const deezerApi = require('deezer-api')
const getBlowfishKey = require('deezer-api/utils.js').getBlowfishKey
const decryptChunk = require('deezer-api/utils.js').decryptChunk
const spotifyApi = require('spotify-web-api-node')

// App stuff
const fs = require('fs-extra')
const async = require('async')
const https = require('https')
const request = require('request-promise')
const os = require('os')
const path = require('path')
const logger = require('./utils/logger.js')
const queue = require('queue')
const localpaths = require('./utils/localpaths.js')
const package = require('./package.json')
const stq = require('sequential-task-queue')

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

// Setup the folders START
var mainFolder = defaultDownloadFolder

// First run, create config file
if(!fs.existsSync(configFileLocation)){
	logger.info("Can't find config.json, creating one now!")
	fs.outputFileSync(configFileLocation, fs.readFileSync(__dirname+path.sep+"default.json",'utf8'))
}

if(!fs.existsSync(localpaths.user+"authCredentials.json")){
	logger.info("Can't find authCredentials.json, creating one now!")
	fs.outputFileSync(localpaths.user+"authCredentials.json", JSON.stringify({clientId: "", clientSecret: ""}, null, 2))
}

// Spotify Files
var authCredentials = require(localpaths.user+'authCredentials.json')
if (authCredentials.clientId == "" || authCredentials.clientSecret == ""){
	spotifySupport = false
}else{
	spotifySupport = true
	var Spotify = new spotifyApi(authCredentials)
}

// See if all settings are there after update
var configFile = require(configFileLocation);
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
app.set('views', __dirname + '/views');
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(i18n.express);
server.listen(configFile.serverPort)
logger.info('Server is running @ localhost:' + configFile.serverPort)

app.get('/', function(req, res) {
	res.render('index.ejs');
});

var dqueue = new stq.SequentialTaskQueue()
var downloadQueue = {}
var localDownloadQueue = []
var trackQueue = queue({
	autostart: true
})
trackQueue.concurrency = configFile.userDefined.queueConcurrency

// START sockets clusterfuck
io.sockets.on('connection', function (s) {
	const req = s.request
	i18n.init(req)

	request({
		url: "https://www.deezer.com/",
		rejectUnauthorized: false,
		headers: {Cookie: `dz_lang=en; Domain=deezer.com; Path=/; Secure; hostOnly=false;`}
	})
	.then(body=>{
		logger.info("Checking for country")
		let re = /(<\s*title[^>]*>(.+?)<\s*\/\s*title)>/gi;
		let match = re.exec(body);
		if (match && match[2]) {
			let title = match[2]
			if (title === "Deezer will soon be available in your country."){
				s.emit("deezerNotAvailable")
			}
		}
	})
	.catch(err=>{
		logger.error(`CountryCheck failed: ${err}`)
	})

	logger.info("Connection received!")

	// Connection dependet variables
	s.Deezer = new deezerApi()
	s.spotifyUser = null

	s.emit("getDefaultSettings", defaultSettings, defaultDownloadFolder)
	s.emit("populateDownloadQueue", downloadQueue)
	s.emit("checkAutologin")

	if(process.platform != "android"){
		const captcha = require('./utils/captcha');
		captcha.callbackResponse = function (data) {
			s.emit("getCaptcha", data)
		};
	}

	s.on("getLang", (lang)=>{
		req.setLocale(lang)
		logger.info("Connection language set to: "+lang)
	})

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
		logger.error(`UpdateCheck failed: ${error}`)
	})

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
			// Save session login so next time login is not needed
			// This is the same method used by the official website
			s.emit('getCookies', s.Deezer.getCookies())
		}catch(err){
			s.emit("login", {error: err.message})
			logger.error(`Login failed: ${err.message}`)
		}
	});

	// Function for autologin
	s.on("autologin", async function(jar, email){
		try{
			logger.info("Logging in");
			await s.Deezer.loginViaCookies(jar, email)
			s.emit('login', {user: s.Deezer.user})
			logger.info("Logged in successfully")
		}catch(err){
			s.emit('login', {error: err.message})
			logger.error(`Autologin failed: ${err.message}`)
		}
	})

	// Function for when there is no autologin
	s.on("init", async function(){
		s.emit('login', {user: s.Deezer.user})
		logger.info("Not logged in")
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
			charts.sort((a, b) => a.title.localeCompare(b.title));
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
			let playlists = []
			if (s.Deezer.user.id != 0){
				let data = await s.Deezer.legacyGetUserPlaylists(s.Deezer.user.id)
				data = data.data || []
				for (let i = 0; i < data.length; i++) {
					let obj = {
						title: data[i].title,
						image: data[i].picture_small,
						songs: data[i].nb_tracks,
						link: data[i].link
					}
					playlists.push(obj)
				}
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
	async function search(type, text){
		type = type || "track"
		if (["track", "playlist", "album", "artist"].indexOf(type) == -1) type = "track"

		// Remove "feat." "ft." and "&" (causes only problems)
		text = text
			.replace(/ feat[\.]? /g, " ")
			.replace(/ ft[\.]? /g, " ")
			.replace(/\(feat[\.]? /g, " ")
			.replace(/\(ft[\.]? /g, " ")
			.replace(/\&/g, "")
			.replace(/–/g, "-")
			.replace(/—/g, "-")

		try {
			let searchObject = await s.Deezer.legacySearch(encodeURIComponent(text), type)
			return {type: type, items: searchObject.data}
		} catch (err) {
			logger.error(`search failed: ${err.stack}`)
			return {type: type, items: []}
		}
	}
	s.on("search", async function (data) {
		s.emit("search", await search(data.type, data.text))
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
					let resp = await Spotify.getPlaylistTracks(data.id, {fields: "items(track(artists,name,duration_ms,preview_url,explicit,uri)),total", offset: offset*100})
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
							duration: Math.floor(t.track.duration_ms/1000),
							link: t.track.uri
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
		s.emit('getUserSettings', {settings: settings, spotify: spotifySupport ? authCredentials : {clientId:"", clientSecret:""}})
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

	// Save spotify features settings
	s.on("saveSpotifyFeatures", function (settings){
		if (spotifySupport){
			if (authCredentials.clientId != settings.clientId || authCredentials.clientSecret != settings.clientSecret){
				fs.outputFile(localpaths.user+"authCredentials.json", JSON.stringify(settings, null, 2), function (err) {
					if (err) return
					logger.info("Spotify Features settings updated")
					initFolders()
				})
			}
		}else{
			if (settings.clientId != "" || settings.clientSecret != ""){
				fs.outputFile(localpaths.user+"authCredentials.json", JSON.stringify(settings, null, 2), function (err) {
					if (err) return
					logger.info("Spotify Features settings updated")
					initFolders()
				})
				s.emit("message", {title: req.__("You need to restart the app to apply the changes"), msg: req.__("Changing the spotify settings id and secret requires an app restart")})
			}
		}
	})

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
		localDownloadQueue.push(`${data.id}:${data.bitrate}`)
		try{
			var track = await s.Deezer.getTrack(data.id)
			data.settings.filename = data.settings.trackNameTemplate
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
				cover: `${s.Deezer.albumPicturesHost}${track.album.picture}/250x250-000000-80-0-0.jpg`,
			}
			if (data.spotifyId) _track.spotifyId = `${data.spotifyId}:${data.bitrate}`
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
			localDownloadQueue.splice(localDownloadQueue.indexOf(`${track.id}:${data.bitrate}`), 1);
			return
		}
	}
	s.on("downloadtrack", async data=>{await downloadTrack(data)})

	// Gets data from the frontend and creates the album object
	async function downloadAlbum(data){
		logger.info(`Added to Queue ${data.id}`)
		localDownloadQueue.push(`${data.id}:${data.bitrate}`)
		try{
			var album = await s.Deezer.legacyGetAlbum(data.id)
			if (data.settings.tags.discTotal || data.settings.createCDFolder){
				var discTotal = await s.Deezer.getAlbum(data.id)
				album.discTotal = discTotal.discTotal
			}
			if (album.nb_tracks == 1 && data.settings.downloadSinglesAsTracks){
				var track = await s.Deezer.getTrack(album.tracks.data[0].id)
				data.settings.filename = data.settings.trackNameTemplate
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
					cover: `${s.Deezer.albumPicturesHost}${track.album.picture}/250x250-000000-80-0-0.jpg`,
				}
				if (data.spotifyId) _track.spotifyId = `${data.spotifyId}:${data.bitrate}`
				addToQueue(_track)
			}else{
				album.tracks = await s.Deezer.getAlbumTracks(data.id)
				data.settings.filename = data.settings.albumTrackNameTemplate
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
					cover: album.cover_medium,
				}
				if (data.spotifyId) _album.spotifyId = `${data.spotifyId}:${data.bitrate}`
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
			localDownloadQueue.splice(localDownloadQueue.indexOf(`${track.id}:${data.bitrate}`), 1);
			return
		}
	}
	s.on("downloadalbum", async data=>{await downloadAlbum(data)});

	// Gets data from the frontend and creates for each album an album object
	async function downloadArtist(data){
		logger.info(`Added to Queue ${data.id}`)
		localDownloadQueue.push(`${data.id}:${data.bitrate}`)
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
			localDownloadQueue.splice(localDownloadQueue.indexOf(`${track.id}:${data.bitrate}`), 1);
			return
		}
	}
	s.on("downloadartist", async data=>{ await downloadArtist(data)});

	// Gets data from the frontend and creates the playlist object
	async function downloadPlaylist(data){
		logger.info(`Added to Queue ${data.id}`)
		localDownloadQueue.push(`${data.id}:${data.bitrate}`)
		try{
			var playlist = await s.Deezer.legacyGetPlaylist(data.id)
			data.settings.filename = data.settings.playlistTrackNameTemplate
			playlist.tracks = await s.Deezer.getPlaylistTracks(data.id)
			let _playlist = {
				name: playlist.title,
				artist: playlist.creator.name,
				artistId: playlist.creator.id,
				size: playlist.tracks.length,
				downloaded: 0,
				failed: 0,
				queueId: `id${Math.random().toString(36).substring(2)}`,
				id: `${playlist.id}:${data.bitrate}`,
				bitrate: data.bitrate+"",
				type: "playlist",
				settings: data.settings || {},
				obj: playlist,
				cover: playlist.picture_medium,
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
			localDownloadQueue.splice(localDownloadQueue.indexOf(`${track.id}:${data.bitrate}`), 1);
			return
		}
	}
	s.on("downloadplaylist", data=>{downloadPlaylist(data)});

	// Gets data from the frontend and creates the object fot the artist top tracks
	async function downloadArtistTop(data){
		logger.info(`Added to Queue ${data.id}`)
		localDownloadQueue.push(`${data.id}:${data.bitrate}`)
		try{
			var artist = await s.Deezer.legacyGetArtist(data.id)
			data.settings.filename = data.settings.playlistTrackNameTemplate
			artist.tracks = await s.Deezer.getArtistTopTracks(data.id)
			let _playlist = {
				name: artist.name + " Most played tracks",
				artist: artist.name,
				artistId: artist.id,
				size: artist.tracks.length,
				downloaded: 0,
				failed: 0,
				queueId: `id${Math.random().toString(36).substring(2)}`,
				id: `${artist.id}:${data.bitrate}`,
				bitrate: data.bitrate+"",
				type: "playlist",
				settings: data.settings || {},
				obj: artist,
				cover: artist.picture_medium,
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
			localDownloadQueue.splice(localDownloadQueue.indexOf(`${track.id}:${data.bitrate}`), 1);
			return
		}
	}
	s.on("downloadartisttop", data=>{downloadArtistTop(data)});

	// Gets data from the frontend and creates the spotify playlist object
	async function downloadSpotifyPlaylist(data){
		if (spotifySupport){
			logger.info(`Added to Queue ${data.id}`)
			localDownloadQueue.push(`${data.id}:${data.bitrate}`)
			try{
				let creds = await Spotify.clientCredentialsGrant()
				Spotify.setAccessToken(creds.body['access_token'])
				var offset = 0
				data.settings.filename = data.settings.playlistTrackNameTemplate
				var resp = await Spotify.getPlaylist(data.id, {fields: "id,name,owner,images,tracks(total)"})
				var _playlist = {
					name: resp.body.name,
					artist: (resp.body.owner.display_name ? resp.body.owner.display_name : resp.body.owner.id),
					artistId: resp.body.owner.id,
					size: resp.body.tracks.total,
					downloaded: 0,
					failed: 0,
					queueId: `id${Math.random().toString(36).substring(2)}`,
					settings: data.settings || {},
					id: `${resp.body.id}:${data.bitrate}`,
					bitrate: data.bitrate+"",
					type: "spotifyplaylist",
					obj: resp.body,
					cover: resp.body.images[0].url,
				}
				var numPages=Math.floor((_playlist.size-1)/100)
				var trackList = new Array(_playlist.size)
				var creationDate = ""
				do{
					var resp = await Spotify.getPlaylistTracks(data.id, {fields: "items(track(artists,name,album,external_ids),added_at)", offset: offset*100})
					resp.body.items.forEach((track, i) => {
						if (creationDate === "")
							creationDate = track.added_at
						if (Date.parse(track.added_at) < Date.parse(creationDate))
							creationDate = track.added_at
						trackList[i+(offset*100)] = track.track
					})
					offset++
				}while(offset<=numPages)
				_playlist.obj.tracks = trackList
				_playlist.obj.creation_date = creationDate
				addToQueue(_playlist)
			}catch(err){
				logger.error(`downloadSpotifyPlaylist failed: ${err.stack ? err.stack : err}`)
				if (err.message && err.message == "Bad Request"){
					s.emit("message", {title: req.__("You setted it up wrong!"), msg: req.__("Somehow you managed to fuck it up. Good job.<br>Now go do the guide again.<br><br>If you need the link again <a href=\"https://notabug.org/RemixDevs/DeezloaderRemix/wiki/Spotify+Features\">Here it is</a>")})
				}else{
					s.emit("toast", `SpotifyPlaylist ${data.id} failed: ${err.message ? err.message : err}`)
				}
				s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
				localDownloadQueue.splice(localDownloadQueue.indexOf(`${track.id}:${data.bitrate}`), 1);
				return
			}
		}else{
			s.emit("message", {title: req.__("Spotify Features is not enabled"), msg: req.__("spotifyFeaturesMessage")})
			s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
		}
	}
	s.on("downloadspotifyplaylist", data=>{downloadSpotifyPlaylist(data)})

	// Gets data from the frontend and creates data for the deezer track object
	async function downloadSpotifyTrack(data){
		if (spotifySupport){
			logger.info(`Added to Queue ${data.id}, converting...`)
			localDownloadQueue.push(`${data.id}:${data.bitrate}`)
			try{
				let creds = await Spotify.clientCredentialsGrant()
				Spotify.setAccessToken(creds.body['access_token'])
				var resp = await Spotify.getTrack(data.id, {fields: "external_ids,artists,album,name"})
				deezerId = await convertSpotify2Deezer(resp.body)
				if (deezerId != 0){
					data.spotifyId = data.id
					data.id = deezerId
					downloadTrack(data)
				}else{
					s.emit("toast", req.__("Can't find the track on Deezer!"))
					s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
					logger.error(`Can't find the track on Deezer!`)
				}
			}catch(err){
				logger.error(`downloadSpotifyTrack failed: ${err.stack ? err.stack : err}`)
				s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
				localDownloadQueue.splice(localDownloadQueue.indexOf(`${track.id}:${data.bitrate}`), 1);
				return
			}
		}else{
			s.emit("message", {title: req.__("Spotify Features is not enabled"), msg: req.__("spotifyFeaturesMessage")})
			s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
		}
	}
	s.on("downloadspotifytrack", data=>{downloadSpotifyTrack(data)})

	// Gets data from the frontend and creates data for the deezer track object
	async function downloadSpotifyAlbum(data){
		if (spotifySupport){
			logger.info(`Added to Queue ${data.id}, converting...`)
			localDownloadQueue.push(`${data.id}:${data.bitrate}`)
			try{
				let creds = await Spotify.clientCredentialsGrant()
				Spotify.setAccessToken(creds.body['access_token'])
				var resp = await Spotify.getAlbum(data.id, {fields: "external_ids,artists,name"})
				deezerId = await convertSpotifyAlbum2Deezer(resp.body)
				if (deezerId != 0){
					data.spotifyId = data.id
					data.id = deezerId
					downloadAlbum(data)
				}else{
					s.emit("toast", req.__("Can't find the album on Deezer!"))
					s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
					logger.error(`Can't find the album on Deezer!`)
				}
			}catch(err){
				logger.error(`downloadSpotifyAlbum failed: ${err.stack ? err.stack : err}`)
				s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
				localDownloadQueue.splice(localDownloadQueue.indexOf(`${track.id}:${data.bitrate}`), 1);
				return
			}
		}else{
			s.emit("message", {title: req.__("Spotify Features is not enabled"), msg: req.__("spotifyFeaturesMessage")})
			s.emit("silentlyCancelDownload", `${data.id}:${data.bitrate}`)
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
			localDownloadQueue.splice(localDownloadQueue.indexOf(downloadQueue[queueId].id), 1);
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

	//downloadQueue: the tracks in the queue to be downloaded
	//queueId: random number generated when user clicks download on something
	async function queueDownload(downloading) {
		if (!downloading) return

		if (downloading.type != "spotifyplaylist"){
			io.sockets.emit("downloadStarted", {queueId: downloading.queueId})
		}

		downloading.errorLog = "";
		downloading.searchedLog = "";

		logger.info(`Registered ${downloading.type}: ${downloading.id} | ${downloading.artist} - ${downloading.name}`);
		switch(downloading.type){
			/*
			* TRACK DOWNLOAD
			*/
			case "track":
				var downloadPromise = new Promise(async (resolve,reject)=>{
					downloading.settings.singleTrack = true;
					try{
						await downloadTrackObject(downloading.obj, downloading.queueId, downloading.settings)
						downloading.downloaded++
					}catch(err){
						logger.error(`[${downloading.obj.artist.name} - ${downloading.obj.title}] ${err}`)
						downloading.errorLog += `${downloading.obj.id} | ${downloading.obj.artist.name} - ${downloading.obj.title} | ${err}\r\n`
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
						cover: downloading.cover,
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
			* ALBUM DOWNLOAD
			*/
			case "album":
				downloading.settings.albName = downloading.name;
				downloading.settings.artName = downloading.artist;
				downloading.playlistArr = Array(downloading.size);
				downloading.tracksData = Array(downloading.size);
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
				date = {
					day: downloading.obj.release_date.slice(8,10),
					month: downloading.obj.release_date.slice(5,7),
					year: downloading.obj.release_date.slice(0, 4),
					slicedYear: (downloading.settings.dateFormatYear == "2" ? downloading.obj.release_date.slice(2, 4) : downloading.obj.release_date.slice(0, 4))
				}
				switch (downloading.settings.dateFormat){
					case "1": dateString = `${date.day}-${date.month}-${date.slicedYear}`; break;
					case "2": dateString = `${date.month}-${date.day}-${date.slicedYear}`; break;
					case "3": dateString = `${date.slicedYear}-${date.day}-${date.month}`; break;
					case "0":default: dateString = `${date.slicedYear}-${date.month}-${date.day}`; break;
				}
				downloading.settings.album = {
					title: downloading.name,
					artist: {
						name: downloading.artist
					},
					year: date.year,
					date: dateString,
					recordType: downloading.obj.record_type,
					label: downloading.obj.label,
					barcode: downloading.obj.upc,
					id: downloading.id.split(":")[0],
					explicit: downloading.obj.explicit_lyrics
				}
				if(downloading.obj.genres && downloading.obj.genres.data[0] && downloading.obj.genres.data[0].name){
					downloading.settings.album.genre = []
					downloading.obj.genres.data.forEach(function(genre){
						if (downloading.settings.album.genre.indexOf(genre.name) == -1)
							downloading.settings.album.genre.push(genre.name)
					})
				}
				downloading.downloadPromise = new Promise((resolve,reject)=>{
					downloading.obj.tracks.every(function (t, index) {
						downloading.tracksData[index] = {
							artist: t.artist.name,
							title: t.title,
							progress: 0,
						}
						trackQueue.push(async cb=>{
							if (!downloadQueue[downloading.queueId]) {
								reject()
								return false
							}
							t.ajson = ajson
							t.position = index
							logger.info(`Now downloading: ${t.artist.name} - ${t.title}`)
							try{
								await downloadTrackObject(t, downloading.queueId, downloading.settings)
								downloading.downloaded++
								downloading.playlistArr[t.playlistData[0]] = t.playlistData[1].split(downloading.filePath)[1]
								if (t.searched) downloading.searchedLog += `${t.artist.name} - ${t.title}\r\n`
							}catch(err){
								downloading.failed++
								downloading.errorLog += `${t.id} | ${t.artist.name} - ${t.title} | ${err}\r\n`
								logger.error(`[${t.artist.name} - ${t.title}] ${err}`)
							}
							/*io.sockets.emit("downloadProgress", {
								queueId: downloading.queueId,
								percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
							});*/
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
								tracksData: downloading.tracksData,
								cover: downloading.cover
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
							if (!fs.existsSync(downloading.filePath)) fs.mkdirpSync(downloading.filePath);
							fs.writeFileSync(downloading.filePath+"notFound.txt",downloading.errorLog)
						}else{
							if (fs.existsSync(downloading.filePath+"notFound.txt")) fs.unlinkSync(downloading.filePath+"notFound.txt");
						}
					}
					if (downloading.settings.logSearched){
						if (downloading.searchedLog != ""){
							if (!fs.existsSync(downloading.filePath)) fs.mkdirpSync(downloading.filePath);
							fs.writeFileSync(downloading.filePath+"alternativeSongs.txt",downloading.searchedLog)
						}else{
							if (fs.existsSync(downloading.filePath+"alternativeSongs.txt")) fs.unlinkSync(downloading.filePath+"alternativeSongs.txt");
						}
					}
					if (downloading.settings.createM3UFile){
						let path = ""
						if (downloading.settings.changePlaylistName)
							path = downloading.filePath + antiDot(fixName(settingsRegexAlbum(downloading.settings.album, downloading.settings.albumNameTemplate)))+".m3u8"
						else
							path = downloading.filePath+"playlist.m3u8"
						fs.writeFileSync(path, downloading.playlistArr.join("\r\n"));
					}
				}catch(err){
					if (err) logger.error(`queueDownload:album failed: ${err.stack ? err.stack : err}`)
					logger.info("Stopping the album queue");
				}
			break
			/*
			* PLAYLIST DOWNLOAD
			*/
			case "playlist":
				downloading.settings.plName = downloading.name;
				downloading.playlistArr = Array(downloading.size);
				downloading.tracksData = Array(downloading.size);
				date = {
					day: downloading.obj.creation_date.slice(8,10),
					month: downloading.obj.creation_date.slice(5,7),
					year: downloading.obj.creation_date.slice(0, 4),
					slicedYear: (downloading.settings.dateFormatYear == "2" ? downloading.obj.creation_date.slice(2, 4) : downloading.obj.creation_date.slice(0, 4))
				}
				switch (downloading.settings.dateFormat){
					case "1": dateString = `${date.day}-${date.month}-${date.slicedYear}`; break;
					case "2": dateString = `${date.month}-${date.day}-${date.slicedYear}`; break;
					case "3": dateString = `${date.slicedYear}-${date.day}-${date.month}`; break;
					case "0":default: dateString = `${date.slicedYear}-${date.month}-${date.day}`; break;
				}
				downloading.settings.playlist = {
					title: downloading.name,
					artist: {
						name: downloading.artist,
						id: downloading.artistId,
						picture: ""
					},
					year: date.year,
					date: dateString,
					dateObj: date,
					recordType: "Playlist",
					label: "",
					barcode: "None",
					id: downloading.id.split(":")[0],
					explicit: false,
					compilation: true,
					discTotal: 1,
					cover: downloading.obj.picture_small.replace("56x56",`${downloading.settings.embeddedArtworkSize}x${downloading.settings.embeddedArtworkSize}`),
					fullSize: downloading.obj.tracks.length,
				}
				downloading.downloadPromise = new Promise((resolve,reject)=>{
					downloading.obj.tracks.every(function (t, index) {
						downloading.tracksData[index] = {
							artist: t.artist.name,
							title: t.title,
							progress: 0,
						}
						trackQueue.push(async cb=>{
							if (!downloadQueue[downloading.queueId]) {
								reject()
								return false
							}
							try{
								await downloadTrackObject(t, downloading.queueId, downloading.settings)
								downloading.downloaded++
								downloading.playlistArr[t.playlistData[0]] = t.playlistData[1].split(downloading.filePath)[1]
								if (t.searched) downloading.searchedLog += `${t.artist.name} - ${t.title}\r\n`
							}catch(err){
								downloading.failed++
								downloading.errorLog += `${t.id} | ${t.artist.name} - ${t.title} | ${err}\r\n`
								logger.error(`[${t.artist.name} - ${t.title}] ${err}`)
							}
							/*io.sockets.emit("downloadProgress", {
								queueId: downloading.queueId,
								percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
							});*/
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
								tracksData: downloading.tracksData,
								cover: downloading.cover
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
							if (!fs.existsSync(downloading.filePath)) fs.mkdirpSync(downloading.filePath);
							fs.writeFileSync(downloading.filePath+"notFound.txt",downloading.errorLog)
						}else{
							if (fs.existsSync(downloading.filePath+"notFound.txt")) fs.unlinkSync(downloading.filePath+"notFound.txt");
						}
					}
					if (downloading.settings.logSearched){
						if (downloading.searchedLog != ""){
							if (!fs.existsSync(downloading.filePath)) fs.mkdirpSync(downloading.filePath);
							fs.writeFileSync(downloading.filePath+"alternativeSongs.txt",downloading.searchedLog)
						}else{
							if (fs.existsSync(downloading.filePath+"alternativeSongs.txt")) fs.unlinkSync(downloading.filePath+"alternativeSongs.txt");
						}
					}
					if (downloading.settings.createM3UFile){
						let path = ""
						if (downloading.settings.changePlaylistName)
							path = downloading.filePath + antiDot(fixName(settingsRegexPlaylist(downloading.settings.playlist, downloading.settings.playlistNameTemplate)))+".m3u8"
						else
							path = downloading.filePath+"playlist.m3u8"
						fs.writeFileSync(path, downloading.playlistArr.join("\r\n"));
					}
					if (downloading.settings.saveArtwork){
						if (!fs.existsSync(downloading.filePath)) fs.mkdirpSync(downloading.filePath);
						let imgPath = downloading.filePath + antiDot(fixName(settingsRegexAlbum(downloading.settings.playlist, downloading.settings.coverImageTemplate)))+(downloading.settings.PNGcovers ? ".png" : ".jpg");
						if (downloading.obj.picture_small){
							downloading.cover = downloading.obj.picture_small.replace("56x56",`${downloading.settings.localArtworkSize}x${downloading.settings.localArtworkSize}`)
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
			* SPOTIFY PLAYLIST DOWNLOAD
			*/
			case "spotifyplaylist":
				downloading.settings.plName = downloading.name
				downloading.playlistArr = Array(downloading.size)
				downloading.tracksData = Array(downloading.size)
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
				date = {
					day: downloading.obj.creation_date.slice(8,10),
					month: downloading.obj.creation_date.slice(5,7),
					year: downloading.obj.creation_date.slice(0, 4),
					slicedYear: (downloading.settings.dateFormatYear == "2" ? downloading.obj.creation_date.slice(2, 4) : downloading.obj.creation_date.slice(0, 4))
				}
				switch (downloading.settings.dateFormat){
					case "1": dateString = `${date.day}-${date.month}-${date.slicedYear}`; break;
					case "2": dateString = `${date.month}-${date.day}-${date.slicedYear}`; break;
					case "3": dateString = `${date.slicedYear}-${date.day}-${date.month}`; break;
					case "0":default: dateString = `${date.slicedYear}-${date.month}-${date.day}`; break;
				}
				downloading.settings.playlist = {
					title: downloading.name,
					artist: {
						name: downloading.artist,
						id: downloading.artistId,
						picture: ""
					},
					year: date.year,
					date: dateString,
					dateObj: date,
					recordType: "Playlist",
					label: "",
					barcode: "None",
					id: downloading.id.split(":")[0],
					explicit: false,
					compilation: true,
					discTotal: 1,
					cover: downloading.obj.images[0].url.replace("56x56",`${downloading.settings.embeddedArtworkSize}x${downloading.settings.embeddedArtworkSize}`),
					fullSize: downloading.trackList.length,
				}
				downloading.downloadPromise = new Promise((resolve,reject)=>{
					downloading.trackList.every(function (t, index) {
						downloading.tracksData[index] = {
							artist: t.artist.name,
							title: t.title,
							progress: 0,
						}
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
								downloading.playlistArr[t.playlistData[0]] = t.playlistData[1].split(downloading.filePath)[1]
								if (t.searched) downloading.searchedLog += `${t.artist.name} - ${t.title}\r\n`
							}catch(err){
								downloading.failed++
								downloading.errorLog += `${t.id} | ${t.artist.name} - ${t.title} | ${err}\r\n`
								logger.error(`[${t.artist.name} - ${t.title}] ${err.stack ? err.stack : err}`)
							}
							/*io.sockets.emit("downloadProgress", {
								queueId: downloading.queueId,
								percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
							});*/
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
								tracksData: downloading.tracksData,
								cover: downloading.cover
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
							if (!fs.existsSync(downloading.filePath)) fs.mkdirpSync(downloading.filePath);
							fs.writeFileSync(downloading.filePath+"notFound.txt",downloading.errorLog)
						}else{
							if (fs.existsSync(downloading.filePath+"notFound.txt")) fs.unlinkSync(downloading.filePath+"notFound.txt");
						}
					}
					if (downloading.settings.logSearched){
						if (downloading.searchedLog != ""){
							if (!fs.existsSync(downloading.filePath)) fs.mkdirpSync(downloading.filePath);
							fs.writeFileSync(downloading.filePath+"alternativeSongs.txt",downloading.searchedLog)
						}else{
							if (fs.existsSync(downloading.filePath+"alternativeSongs.txt")) fs.unlinkSync(downloading.filePath+"alternativeSongs.txt");
						}
					}
					if (downloading.settings.createM3UFile){
						let path = ""
						if (downloading.settings.changePlaylistName)
							path = downloading.filePath + antiDot(fixName(settingsRegexPlaylist(downloading.settings.playlist, downloading.settings.playlistNameTemplate)))+".m3u8"
						else
							path = downloading.filePath+"playlist.m3u8"
						fs.writeFileSync(path, downloading.playlistArr.join("\r\n"));
					}
					if (downloading.settings.saveArtwork){
						if (!fs.existsSync(downloading.filePath)) fs.mkdirpSync(downloading.filePath);
						let imgPath = downloading.filePath + antiDot(fixName(settingsRegexAlbum(downloading.settings.playlist, downloading.settings.coverImageTemplate)))+(downloading.settings.PNGcovers ? ".png" : ".jpg");
						if (downloading.obj.images){
							downloading.cover = downloading.obj.images[0].url
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
		if (downloading && downloadQueue[Object.keys(downloadQueue)[0]] && (Object.keys(downloadQueue)[0] == downloading.queueId)){
			localDownloadQueue.splice(localDownloadQueue.indexOf(downloading.id), 1);
			if (downloading.spotifyId) localDownloadQueue.splice(localDownloadQueue.indexOf(downloading.spotifyId), 1);
			delete downloadQueue[Object.keys(downloadQueue)[0]]
		}
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
						}else if(!track.searched && settings.fallbackSearch){
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
					if (settings.savePlaylistAsCompilation && settings.plName){
						track.album.discTotal = 1
					}else{
						if (!ajson.discTotal){
							logger.info(`[${track.artist.name} - ${track.title}] Getting total disc number`);
							var discTotal = await s.Deezer.getAlbum(ajson.id)
							track.album.discTotal = discTotal.discTotal
						}else{
							track.album.discTotal = ajson.discTotal
						}
					}
				}
				if (settings.savePlaylistAsCompilation && settings.plName){
					track.album = settings.playlist
					track.trackNumber = track.position+1
					if (track.album.dateObj) {
						track.date = track.album.dateObj
					}else if(!track.date){
						track.date = {
							day: 0,
							month: 0,
							year: 0,
							slicedYear: 0
						}
					}
				}else{
					track.album.artist = {
						id: ajson.artist.id,
						name: ajson.artist.name,
						picture: ajson.artist.picture_small.substring(46,ajson.artist.picture_small.length-24),
					}
					track.album.trackTotal = ajson.nb_tracks
					if (ajson.record_type){
						track.album.recordType = ajson.record_type
					}else{
						track.album.recordType = switchReleaseType(track.album.recordType)
					}
					track.album.barcode = ajson.upc
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
				if (settings.savePlaylistAsCompilation && settings.plName){
					track.album = settings.playlist
					track.trackNumber = track.position+1
					if (track.album.dateObj) {
						track.date = track.album.dateObj
					}else if(!track.date){
						track.date = {
							day: 0,
							month: 0,
							year: 0,
							slicedYear: 0
						}
					}
				}else{
					track.trackTotal = track.album.trackTotal
					track.album.recordType = "Album"
				}
				// TODO: Make a loop for each artist
			}

			if (!track.date.slicedYear){
				track.date.slicedYear = settings.dateFormatYear == "2" ? track.date.year.slice(2, 4) : track.date.year.slice(0, 4)
			}

			// Auto detect aviable track format from settings
			let bitrateNotFound = false
			if (parseInt(downloadQueue[queueId].bitrate) <= 9){
				switch(downloadQueue[queueId].bitrate.toString()){
					case "9":
					track.selectedFormat = 9
					track.selectedFilesize = track.filesize.flac
					if (track.filesize.flac>0) break
					if (!settings.fallbackBitrate){bitrateNotFound = true; break;}
					case "3":
					track.selectedFormat = 3
					track.selectedFilesize = track.filesize.mp3_320
					if (track.filesize.mp3_320>0) break
					if (!settings.fallbackBitrate){bitrateNotFound = true; break;}
					case "1":
					track.selectedFormat = 1
					track.selectedFilesize = track.filesize.mp3_128
					if (track.filesize.mp3_128>0) break
					if (!settings.fallbackBitrate){bitrateNotFound = true; break;}
					default:
					track.selectedFormat = 8
					track.selectedFilesize = track.filesize.default
				}
			}else{
				switch(downloadQueue[queueId].bitrate.toString()){
					case "15":
					track.selectedFormat = 15
					track.selectedFilesize = track.filesize.mp4_ra3
					if (track.filesize.mp4_ra3>0) break
					if (!settings.fallbackBitrate){bitrateNotFound = true; break;}
					case "14":
					track.selectedFormat = 14
					track.selectedFilesize = track.filesize.mp4_ra2
					if (track.filesize.mp4_ra2>0) break
					if (!settings.fallbackBitrate){bitrateNotFound = true; break;}
					case "13":
					track.selectedFormat = 13
					track.selectedFilesize = track.filesize.mp4_ra1
					if (track.filesize.mp4_ra1>0) break
					if (!settings.fallbackBitrate){bitrateNotFound = true; break;}
					default:
					throw new Error("Song is not available in 360 mode.")
				}
			}
			if (bitrateNotFound){
				if(track.fallbackId && track.fallbackId != "0"){
					logger.warn(`[${track.artist.name} - ${track.title}] Song not found at desired bitrate, falling on alternative`)
					var _track = await s.Deezer.getTrack(track.fallbackId)
					track.id = _track.id
					track.fallbackId = _track.fallbackId
					track.filesize = _track.filesize
					track.duration = _track.duration
					track.MD5 = _track.MD5
					track.mediaVersion = _track.mediaVersion
					return downloadTrackObject(track, queueId, settings)
				}else if(!track.searched && settings.fallbackSearch){
					logger.warn(`[${track.artist.name} - ${track.title}] Song not found at desired bitrate, searching for alternative`)
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
						logger.error(`[${track.artist.name} - ${track.title}] Song not found at desired bitrate and no alternative found`)
						throw new Error("Song not found at desired bitrate and no alternative found")
						return
					}
				}else{
					logger.error(`[${track.artist.name} - ${track.title}] Downloading error: Song not found at desired bitrate.`)
					throw new Error("Song not found at desired bitrate.")
					return
				}
			}
			track.album.bitrate = track.selectedFormat
			if (settings.albName && !settings.album.bitrate) settings.album.bitrate = track.selectedFormat

			// Acquiring bpm (only if necessary)
			if (settings.tags.bpm){
				logger.info(`[${track.artist.name} - ${track.title}] Getting BPM`);
				if (!track.legacyTrack) track.legacyTrack = await s.Deezer.legacyGetTrack(track.id)
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
					track.replayGain = ((track.legacyTrack.gain + 18.4) * -1).toFixed(2)+" dB"
				}catch(err){
					track.replayGain = false
				}
			}else{
				track.replayGain = false
			}

			// Acquiring discNumber value (only if necessary)
			if (settings.tags.discNumber && !track.discNumber){
				if (settings.savePlaylistAsCompilation && settings.plName){
					track.discNumber = 1
				}else{
					logger.info(`[${track.artist.name} - ${track.title}] Getting disc number`);
					if (!track.legacyTrack) track.legacyTrack = await s.Deezer.legacyGetTrack(track.id)
					track.discNumber = track.legacyTrack.disk_number
				}
			}

			// Acquiring Explicit tag (only if necessary)
			if (!track.explicit && (settings.tags.explicit || settings.filename.includes("%explicit%"))){
				logger.info(`[${track.artist.name} - ${track.title}] Is track explicit? Checking now`);
				if (!track.legacyTrack) track.legacyTrack = await s.Deezer.legacyGetTrack(track.id)
				track.explicit = track.legacyTrack.explicit_lyrics;
			}


			var separator = settings.multitagSeparator
			if (separator == "null") separator = String.fromCharCode(0)

			// Autoremoves (Album Version) from the title
			if (settings.removeAlbumVersion){
				if(track.title.indexOf("Album Version")>-1){
					track.title = track.title.replace(/ ?\(Album Version\)/g,"")
				}
			}

			// See if you already have the artist picture
			if (!track.album.artist.picture && !(settings.savePlaylistAsCompilation && settings.plName)){
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
			track.album.artist.pictureUrl = `${s.Deezer.artistPicturesHost}${track.album.artist.picture}/${settings.localArtworkSize}x${settings.localArtworkSize}-000000-80-0-0${(settings.PNGcovers ? ".png" : ".jpg")}`
			if (settings.savePlaylistAsCompilation && settings.plName){
				track.album.pictureUrl = settings.playlist.cover
			}else{
				track.album.pictureUrl = `${s.Deezer.albumPicturesHost}${track.album.picture}/${settings.embeddedArtworkSize}x${settings.embeddedArtworkSize}-000000-80-0-0${(settings.PNGcovers ? ".png" : ".jpg")}`
			}


			if(track.contributor){
				if(track.contributor.composer){
					track.composerString = uniqueArray(track.contributor.composer)
					if (!(track.selectedFormat == 9 && settings.multitagSeparator == "null")) track.composerString = track.composerString.join(separator)
				}
				if(track.contributor.musicpublisher){
					track.musicpublisherString = uniqueArray(track.contributor.musicpublisher)
					if (!(track.selectedFormat == 9 && settings.multitagSeparator == "null")) track.musicpublisherString = track.musicpublisherString.join(separator)
				}
				if(track.contributor.producer){
					track.producerString = uniqueArray(track.contributor.producer)
					if (!(track.selectedFormat == 9 && settings.multitagSeparator == "null")) track.producerString = track.producerString.join(separator)
				}
				if(track.contributor.engineer){
					track.engineerString = uniqueArray(track.contributor.engineer)
					if (!(track.selectedFormat == 9 && settings.multitagSeparator == "null")) track.engineerString = track.engineerString.join(separator)
				}
				if(track.contributor.writer){
					track.writerString = uniqueArray(track.contributor.writer)
					if (!(track.selectedFormat == 9 && settings.multitagSeparator == "null")) track.writerString = track.writerString.join(separator)
				}
				if(track.contributor.author){
					track.authorString = uniqueArray(track.contributor.author)
					if (!(track.selectedFormat == 9 && settings.multitagSeparator == "null")) track.authorString = track.authorString.join(separator)
				}
				if(track.contributor.mixer){
					track.mixerString = uniqueArray(track.contributor.mixer)
					if (!(track.selectedFormat == 9 && settings.multitagSeparator == "null")) track.mixerString = track.mixerString.join(separator)
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
				track.mainArtist = track.artistsString[0]
				if (!(track.selectedFormat == 9 && settings.multitagSeparator == "null")) track.artistsString = track.artistsString.join(separator)
			}
			if (track.album.genre){
				if (!(track.selectedFormat == 9 && settings.multitagSeparator == "null"))
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
		let filename = ""
		if (settings.saveFullArtists){
			if (settings.multitagSeparator == "null"){
				if (Array.isArray(track.artistsString)){
					filename = antiDot(fixName(`${track.artistsString.join(", ")} - ${track.title}`));
				}else{
					filename = antiDot(fixName(`${track.artistsString.split(String.fromCharCode(0)).join(", ")} - ${track.title}`))
				}
			}else{
				filename = antiDot(fixName(`${track.artistsString} - ${track.title}`));
			}
		}else{
			filename = antiDot(fixName(`${track.artist.name} - ${track.title}`));
		}
		if (settings.filename) {
			filename = antiDot(fixName(settingsRegex(track, settings.filename, settings.playlist)))
		}

		filename = antiDot(fixName(filename))

		// TODO: Move to a separate function
		// Generating file path
		let filepath = mainFolder;
		let artistPath;
		let coverPath;

		if (settings.createPlaylistFolder && settings.plName && !settings.savePlaylistAsCompilation)
			filepath += antiDot(fixName(settingsRegexPlaylist(settings.playlist, settings.playlistNameTemplate))) + path.sep;

		if (settings.plName && !settings.savePlaylistAsCompilation)
			downloadQueue[queueId].filePath = filepath

		if (
			settings.createArtistFolder && !settings.plName ||
			(settings.createArtistFolder && settings.plName && settings.savePlaylistAsCompilation) ||
			(settings.createArtistFolder && settings.plName && settings.createStructurePlaylist)
		){
			filepath += antiDot(fixName(settingsRegexArtist(track.album.artist, settings.artistNameTemplate))) + path.sep;
			artistPath = filepath;
		}
		if (settings.createAlbumFolder &&
			(!settings.singleTrack || (settings.singleTrack && settings.createSingleFolder)) &&
			(!settings.plName || (settings.plName && settings.savePlaylistAsCompilation) || (settings.plName && settings.createStructurePlaylist))
		){
			filepath += antiDot(fixName(settingsRegexAlbum(track.album, settings.albumNameTemplate))) + path.sep;
			coverPath = filepath;
		}
		if (!(settings.plName && !settings.savePlaylistAsCompilation))
			downloadQueue[queueId].filePath = filepath

		if (
			track.album.discTotal > 1 && (
			(settings.createAlbumFolder && settings.createCDFolder) && (!settings.plName ||
			(settings.plName && settings.savePlaylistAsCompilation) ||
			(settings.plName && settings.createStructurePlaylist))
		)){
			filepath += `CD${track.discNumber + path.sep}`
		}

		let writePath;
		if(track.selectedFormat == 9){
			writePath = filepath + filename + '.flac';
		}else if (track.selectedFormat == 13 || track.selectedFormat == 14 || track.selectedFormat == 15){
			writePath = filepath + filename + '.mp4';
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
			if (typeof track.position != 'undefined'){
				track.playlistData = [parseInt(track.position), writePath];
			}else{
				track.playlistData = [track.trackNumber-1, writePath];
			}
		}

		if (fs.existsSync(writePath)) {
			logger.info(`[${track.artist.name} - ${track.title}] Already downloaded`);
			if (!downloadQueue[queueId].percentage) {
				downloadQueue[queueId].percentage = 0
				downloadQueue[queueId].lastPercentage = 0
			}
			downloadQueue[queueId].percentage += 100/downloadQueue[queueId].size
			if (Math.round(downloadQueue[queueId].percentage) != downloadQueue[queueId].lastPercentage) {
				if (Math.round(downloadQueue[queueId].percentage) % 5 == 0) {
					downloadQueue[queueId].lastPercentage = Math.round(downloadQueue[queueId].percentage)
					io.sockets.emit("downloadProgress", {
						queueId: queueId,
						percentage: downloadQueue[queueId].lastPercentage
					})
				}
			}
			return;
		}else{
			logger.info(`[${track.artist.name} - ${track.title}] Downloading file to ${writePath}`);
		}

		// Get cover image
		if (track.album.pictureUrl) {
			let imgPath;
			imgPath = coverArtFolder + ((settings.savePlaylistAsCompilation && settings.plName) ? fixName(`${track.album.artist.name} - ${track.album.title}`) : track.album.barcode ? fixName(track.album.barcode) : fixName(`${track.album.artist.name} - ${track.album.title}`))+"_"+settings.embeddedArtworkSize+(settings.PNGcovers ? ".png" : ".jpg")
			if(fs.existsSync(imgPath)){
				track.album.picturePath = (imgPath).replace(/\\/g, "/")
				logger.info(`[${track.artist.name} - ${track.title}] Cover already downloaded`)
			}else{
				try{
					var body = await request.get(track.album.pictureUrl, {strictSSL: false,encoding: 'binary'})
					fs.outputFileSync(imgPath,body,'binary')
					track.album.picturePath = (imgPath).replace(/\\/g, "/")
					logger.info(`[${track.artist.name} - ${track.title}] Cover downloaded!`)
				}catch(error){
					logger.error(`[${track.artist.name} - ${track.title}] Cannot download Album Image: ${error}`)
					logger.error(`Album art link: ${track.album.pictureUrl}`)
					track.album.pictureUrl = undefined
					track.album.picturePath = undefined
				}
			}

			if (settings.saveArtwork && coverPath){
				imgPath = coverPath + antiDot(fixName(settingsRegexAlbum(track.album, settings.coverImageTemplate)))+(settings.PNGcovers ? ".png" : ".jpg")
				if (!fs.existsSync(coverPath)) fs.mkdirpSync(coverPath);
				if(!fs.existsSync(imgPath)){
					try{
						var body = await request.get(track.album.pictureUrl.replace(`${settings.embeddedArtworkSize}x${settings.embeddedArtworkSize}`,`${settings.localArtworkSize}x${settings.localArtworkSize}`), {strictSSL: false,encoding: 'binary'})
						fs.outputFileSync(imgPath,body,'binary')
						logger.info(`[${track.artist.name} - ${track.title}] Local Cover downloaded!`)
					}catch(error){
						logger.error(`[${track.artist.name} - ${track.title}] Cannot download Local Cover: ${error}`)
					}
				}
			}
		}else{
			track.album.pictureUrl = undefined
			logger.info(`[${track.artist.name} - ${track.title}] No cover found`)
		}

		// Get Artist Image
		if (parseInt(track.id)>0 && track.album.artist.pictureUrl && settings.saveArtworkArtist) {
			if(settings.createArtistFolder && artistPath){
				let imgPath = artistPath + antiDot(settingsRegexArtist(track.album.artist, settings.artistImageTemplate))+(settings.PNGcovers ? ".png" : ".jpg");
				if (!fs.existsSync(artistPath)) fs.mkdirpSync(artistPath);
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
		if (!track.MD5)
			track.MD5 = await s.Deezer.getTrackMD5(track.id)
		logger.info(`[${track.artist.name} - ${track.title}] Starting the download process`)
		var downloadingPromise = new Promise((resolve, reject)=>{
			if (!fs.existsSync(`${filepath}`)) fs.mkdirpSync(`${filepath}`)
			let url = new URL(track.getDownloadUrl(track.selectedFormat));
			let options = {
				host: url.hostname,
				path: url.pathname,
				headers: s.Deezer.httpHeaders,
				rejectUnauthorized: false,
				strictSSL: false
			}

			let req = https.get(options, function (response) {
				if (200 === response.statusCode) {
					const fileStream = fs.createWriteStream(writePath);
					if (track.id > 0){
						if (track.selectedFormat == 9){
							var flacBuffer = Buffer.alloc(0);
						}else if (track.selectedFormat <= 9){
							fileStream.write(getID3(track, settings));
						}
					}

					let i = 0;
					let chunkLength = 0;
					let tagSize = 0;
					response.on('readable', () => {
						const blowFishKey = getBlowfishKey(track.id);
						let chunk;
						while (chunk = response.read(2048)) {
							chunkLength += 2048;

							// Progress bar advancement for single tracks
							if(downloadQueue[queueId]){
								if (downloadQueue[queueId].type == "track"){
									if (!downloadQueue[queueId]){
										reject("Not in Queue")
									}
									try{
										if (!downloadQueue[queueId].percentage) {
											downloadQueue[queueId].percentage = 0
											downloadQueue[queueId].lastPercentage = 0
										}
										let complete = track.selectedFilesize
										let percentage = (chunkLength / complete) * 100;
										if ((percentage - downloadQueue[queueId].percentage > 1) || (chunkLength == complete)) {
											downloadQueue[queueId].percentage = percentage
											if (Math.round(downloadQueue[queueId].percentage) != downloadQueue[queueId].lastPercentage) {
												if (Math.round(downloadQueue[queueId].percentage) % 5 == 0) {
													downloadQueue[queueId].lastPercentage = Math.round(downloadQueue[queueId].percentage)
													io.sockets.emit("downloadProgress", {
														queueId: queueId,
														percentage: downloadQueue[queueId].lastPercentage
													})
													//logger.info("Updating download progress to: " + downloadQueue[queueId].lastPercentage)
												}
											}
										}
									}catch(err){}
								}else{
									if (!downloadQueue[queueId]){
										reject("Not in Queue")
									}
									try{
										if (!downloadQueue[queueId].percentage) {
											downloadQueue[queueId].percentage = 0
											downloadQueue[queueId].lastPercentage = 0
										}
										let complete = track.selectedFilesize
										let percentage = (chunkLength / complete) * 100;
										if ((percentage - downloadQueue[queueId].tracksData[track.position].progress > 1) || (chunkLength == complete)) {
											downloadQueue[queueId].tracksData[track.position].progress = percentage
										}
										let chunkProgres = ((chunk.length / complete)) / downloadQueue[queueId].size * 100
										downloadQueue[queueId].percentage += chunkProgres
										if (Math.round(downloadQueue[queueId].percentage) != downloadQueue[queueId].lastPercentage) {
											if (Math.round(downloadQueue[queueId].percentage) % 5 == 0) {
												downloadQueue[queueId].lastPercentage = Math.round(downloadQueue[queueId].percentage)
												io.sockets.emit("downloadProgress", {
													queueId: queueId,
													percentage: downloadQueue[queueId].lastPercentage
												})
												//logger.info("Updating download progress to: " + downloadQueue[queueId].lastPercentage)
											}
										}
									}catch(err){}
								}
							}

							// Thanks to Generalo for the improved download function
							if (track.selectedFormat == 9){
								if (i % 3 > 0 || chunk.length < 2048) {
									if (i < 1000){
										flacBuffer += chunk.toString('binary');
									}else if (i == 1000){
										let buf = Buffer.from(flacBuffer, 'binary');
										if (track.id > 0) fileStream.write(getMetadata(buf, track, settings));
										fileStream.write(chunk);
									}else{
										fileStream.write(chunk, 'binary');
									}
								} else {
									let chunkDec = decryptChunk(chunk, blowFishKey);
									if (i < 1000){
										flacBuffer += chunkDec.toString('binary');
									}else{
										fileStream.write(chunkDec, 'binary');
									}
								}
							}else{
								if (i % 3 > 0 || chunk.length < 2048) {
									tagSize = saveChunk(tagSize, chunkLength, chunk, fileStream);
								}else{
									let chunkDec = decryptChunk(chunk, blowFishKey);
									if (chunkLength == 2048 && chunkDec.substring(0, 3) == 'ID3') {
										tagSize = (chunkDec[6].charCodeAt(0) << 21) + (chunkDec[7].charCodeAt(0) << 14) + (chunkDec[8].charCodeAt(0) << 7) + chunkDec[9].charCodeAt(0) + 10;
									}
									tagSize = saveChunk(tagSize, chunkLength, chunkDec, fileStream);
								}
							}
							i++;
						}
					});

					response.on('end', () => {
						try{
							if (track.selectedFormat != 9 && settings.saveID3v1 && track.id > 0 && track.selectedFormat <= 9){
								fileStream.write(getID3v1(track, settings))
							}
							if (track.selectedFormat == 9 && i < 1000){
								let buf = Buffer.from(flacBuffer, 'binary');
								fileStream.write(getMetadata(buf, track, settings));
							}
							fileStream.end();
							resolve()
						}catch(err){
							logger.error(`[${track.artist.name} - ${track.title}] Decryption error: ${err}`)
							reject(err)
							return false
						}
					});
				} else {
					reject("Track is no longer provided by deezer")
					return false
				}
			})
		})

		try{
			await downloadingPromise
		}catch(err){
			if (err==="Track is no longer provided by deezer"){
				if (track.selectedFormat == 9){
					track.filesize.flac = 0
					logger.warn(`[${track.artist.name} - ${track.title}] Track is no longer provided by deezer in FLAC, searching for lower bitrate`)
					return downloadTrackObject(track, queueId, settings)
				}
				if(track.fallbackId && track.fallbackId != "0"){
					logger.warn(`[${track.artist.name} - ${track.title}] Track is no longer provided by deezer, falling on alternative`)
					var _track = await s.Deezer.getTrack(track.fallbackId)
					track.id = _track.id
					track.fallbackId = _track.fallbackId
					track.filesize = _track.filesize
					track.duration = _track.duration
					track.MD5 = _track.MD5
					track.mediaVersion = _track.mediaVersion
					return downloadTrackObject(track, queueId, settings)
				}else if(!track.searched && settings.fallbackSearch){
					logger.warn(`[${track.artist.name} - ${track.title}] Track is no longer provided by deezer, searching for alternative`)
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
						logger.error(`[${track.artist.name} - ${track.title}] Track is no longer provided by deezer and no alternative found`)
						throw new Error("Track is no longer provided by deezer and no alternative found")
						return
					}
				}else{
					logger.error(`[${track.artist.name} - ${track.title}] Downloading error: Track is no longer provided by deezer`)
					throw new Error("Track is no longer provided by deezer")
					return
				}
			}else{
				throw new Error(err)
				return
			}
		}
		logger.info(`[${track.artist.name} - ${track.title}] Downloaded`)
	}
})

//local client socket for use by rest API
let clientsocket = socketclientio.connect('http://localhost:' + configFile.serverPort)

// REST API
app.all('/api/download/', function (req, res) {
	//accepts a deezer url or array of urls, and adds it to download
	//expecting {"url": "https://www.deezer.com/playlist/xxxxxxxxxx" }
	// or &url="https://www.deezer.com/playlist/xxxxxxxxxx"
	//Optionally, also accepts "quality"="flac"
	if (req.method != 'POST' && req.method != 'GET') {
		res.status(400).send({"Error": `${req.url} only accepts GET and POST`});
	} else {
		let receivedData
		if (req.method == 'POST') {
			receivedData = req.body
		} else if (req.method == 'GET') {
			receivedData = req.query
			if (receivedData.url.includes(',')) {	//if multiple urls
				receivedData.url = receivedData.url.split(',')
			}
		}
		let forceBitrate
		if (receivedData.quality) {
			switch(receivedData.quality.toLowerCase()) {
				case '360':
				case '360_hq':
					forceBitrate = 15
				break;
				case '360_mq':
					forceBitrate = 14
				break;
				case '360_lq':
					forceBitrate = 13
				break;
				case 'flac':
				case 'lossless':
					forceBitrate = 9
				break;
				case '320':
				case 'mp3':
					forceBitrate = 3
				break;
				case '128':
					forceBitrate = 1
				break;
			}
		}
		let bitrate = forceBitrate ? forceBitrate : configFile.userDefined.maxBitrate
		if (Object.keys(receivedData).length == 0) {
			res.status(200).send({"Error": `Empty ${req.method} received`});	//returning 200 for "TEST" functions of other software
		} else {
			let response = ""
			if (Array.isArray(receivedData.url)) {
				response = []
				for (let x in receivedData.url) {
					response.push(`${receivedData.url[x]}: ${clientaddToQueue(receivedData.url[x],bitrate)}`)
				}
			} else {
				response += `${receivedData.url}: ${clientaddToQueue(receivedData.url,bitrate)}`
			}

			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({'Message': response}));
		}
	}
});

app.all('/api/search/', function (req, res) {
	//accepts a mode (as a key) and search string, returns Deezer JSON
	//expecting {"album": "discovery - daft punk"}
	// or &album=discovery - daft punk
	if (req.method != 'POST' && req.method != 'GET') {
		res.status(400).send({"Error": `${req.url} only accepts GET and POST`});
	} else {
		let receivedData
		if (req.method == 'POST') {
			receivedData = req.body
		} else if (req.method == 'GET') {
			receivedData = req.query
		}
		if (Object.keys(receivedData).length == 0) {
			res.status(200).send({"Error": `Empty ${req.method} received`});	//returning 200 for "TEST" functions of other software
		} else {
			let mode = Object.keys(receivedData)[0] //"album", playlist, album, artist
			let searchString = receivedData[mode]
			clientsocket.emit("search", {type: mode, text: searchString})

			clientsocket.on("search", function (data) {
				if (!(res.headersSent)) {	//no clue why I need this check but without, 2nd+ request breaks
					res.writeHead(200, { 'Content-Type': 'application/json' });
				}
				res.end(JSON.stringify(data));
			})
		}
	}
});

app.all('/api/tracks/', function (req, res) {
	//accepts a type (as a key) and an ID, returns tracklist,	format: {"album": "302127"}
	//expecting "playlist" or "album" or "artist" or "spotifyplaylist"
	// or &album=302127
	if (req.method != 'POST' && req.method != 'GET') {
		res.status(400).send({"Error": `${req.url} only accepts GET and POST`});
	} else {
		let receivedData
		if (req.method == 'POST') {
			receivedData = req.body
		} else if (req.method == 'GET') {
			receivedData = req.query
		}
		if (Object.keys(receivedData).length == 0) {
			res.status(400).send({"Error": `Empty ${req.method} received`});
		} else {
			let type = Object.keys(receivedData)[0] //"album", playlist, album, artist
			let id = receivedData[type]
			clientsocket.emit('getTrackList', {id: id, type: type})

			clientsocket.on("getTrackList", function (data) {
				//data.err			-> undefined/err
				//data.id				-> passed id
				//data.response -> API response
				if (data.err){
					if (!(res.headersSent)) {	//no clue why I need this check but without, 2nd+ request breaks
						res.writeHead(400, { 'Content-Type': 'application/json' });
					}
					res.end(JSON.stringify({"Error": data.err}));
				} else {
					if (!(res.headersSent)) {	//no clue why I need this check but without, 2nd+ request breaks
						res.writeHead(200, { 'Content-Type': 'application/json' });
					}
					res.end(JSON.stringify(data.response));
				}
			})
		}
	}
});

app.get('/api/queue/', function (req, res) {
	//accepts nothing, returns length of, and items in download queue
	let itemsInQueue = Object.keys(downloadQueue).length
	let queueItems = []
	for (let item in downloadQueue) {
		queueItems.push(downloadQueue[item])
	}
	res.status(200).send({"length": itemsInQueue, "items": queueItems});
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

// Fixes the name removing characters that could cause problems on the system
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
function settingsRegex(track, filename, playlist) {
	try{
		filename = filename.replace(/%title%/g, fixName(track.title));
		filename = filename.replace(/%album%/g, fixName(track.album.title));
		if (configFile.userDefined.saveFullArtists){
			let artistString
			if (Array.isArray(track.artistsString)){
				artistString = track.artistsString.join(", ")
			}else if (configFile.userDefined.multitagSeparator == "null"){
				artistString = track.artistsString.split(String.fromCharCode(0)).join(", ")
			}else{
				artistString = track.artistsString
			}
			filename = filename.replace(/%artist%/g, fixName(artistString));
		}else{
			filename = filename.replace(/%artist%/g, fixName(track.artist.name));
		}
		filename = filename.replace(/%track_id%/g, fixName(track.id));
		filename = filename.replace(/%album_id%/g, fixName(track.album.id));
		filename = filename.replace(/%year%/g, fixName(track.date.year));
		filename = filename.replace(/%date%/g, fixName(track.album.date));
		filename = filename.replace(/%label%/g, fixName(track.album.label));
		if(typeof track.trackNumber != 'undefined'){
			if(configFile.userDefined.padtrck){
				 filename = filename.replace(/%number%/g, fixName(pad(track.trackNumber, (parseInt(configFile.userDefined.paddingSize)>0 ? parseInt(configFile.userDefined.paddingSize) : track.album.trackTotal))));
			}else{
				filename = filename.replace(/%number%/g, fixName(track.trackNumber));
			}
		} else {
			filename = filename.replace(/%number%/g, '');
		}
		if (playlist){
			filename = filename.replace(/%playlist_id%/g, fixName(playlist.id));
		}
		if (playlist && typeof track.position != 'undefined'){
			if(configFile.userDefined.padtrck){
				 filename = filename.replace(/%position%/g, fixName(pad(track.position+1, (parseInt(configFile.userDefined.paddingSize)>0 ? parseInt(configFile.userDefined.paddingSize) : playlist.fullSize))));
			}else{
				filename = filename.replace(/%position%/g, fixName(track.position+1));
			}
		} else {
			filename = filename.replace(/%position%/g, '');
		}
		filename = filename.replace(/%disc%/g, fixName(track.discNumber));
		filename = filename.replace(/%isrc%/g, fixName(track.ISRC ? track.ISRC : "Unknown"));
		filename = filename.replace(/%explicit%/g, fixName((track.explicit ? (filename.indexOf(/[^%]explicit/g)>-1 ? "" : "(Explicit)") : "")));
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
		foldername = foldername.replace(/%upc%/g, fixName(album.barcode ? album.barcode : "Unknown"));
		foldername = foldername.replace(/%album_id%/g, fixName(album.id));
		foldername = foldername.replace(/%explicit%/g, fixName((album.explicit ? (foldername.indexOf(/[^%]explicit/g)>-1 ? "" : "(Explicit) ") : "")))
		if (album.compilation){
			foldername = foldername.replace(/%bitrate%/g, "Variable")
			foldername = foldername.replace(/%genre%/g, fixName("Compilation"))
		}else{
			switch(album.bitrate){
				case 15:
					foldername = foldername.replace(/%bitrate%/g, "360 HQ")
				break
				case 14:
					foldername = foldername.replace(/%bitrate%/g, "360 MQ")
				break
				case 13:
					foldername = foldername.replace(/%bitrate%/g, "360 LQ")
				break
				case 9:
					foldername = foldername.replace(/%bitrate%/g, "FLAC")
				break
				case 3:
					foldername = foldername.replace(/%bitrate%/g, "320")
				break
				case 1:
					foldername = foldername.replace(/%bitrate%/g, "128")
				break
				default:
					foldername = foldername.replace(/%bitrate%/g, "128")
			}
			foldername = foldername.replace(/%genre%/g, fixName(album.genre ? (Array.isArray(album.genre) ? album.genre[0] : album.genre) : "Unknown"))
		}
		foldername = foldername.replace(/[/\\]/g, path.sep)
		return foldername.trim();
	}catch(e){
		logger.error("settingsRegexAlbum failed: "+e)
	}

}

function settingsRegexArtist(artist, foldername) {
	foldername = foldername.replace(/%name%/g, fixName(artist.name));
	foldername = foldername.replace(/%artist_id%/g, fixName(artist.id));
	foldername = foldername.replace(/[/\\]/g, path.sep)
	return foldername.trim();
}

function settingsRegexPlaylist(playlist, foldername){
	foldername = foldername.replace(/%owner%/g, fixName(playlist.artist.name));
	foldername = foldername.replace(/%name%/g, fixName(playlist.title));
	foldername = foldername.replace(/%year%/g, fixName(playlist.year));
	foldername = foldername.replace(/%date%/g, fixName(playlist.date));
	foldername = foldername.replace(/%playlist_id%/g, fixName(playlist.id));
	foldername = foldername.replace(/[/\\]/g, path.sep)
	return foldername.trim();
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

// Using gwlight api this changes the int into the correct string
// Defaults to Album
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

// removes all duplicate entries from an array
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

function saveChunk(tagSize, chunkLength, chunk, fileStream){
	if (tagSize == 0){
		fileStream.write(chunk, 'binary');
	}else if (tagSize < chunkLength){
		chunk = chunk.slice(tagSize % 2048);
		fileStream.write(chunk, 'binary');
		tagSize = 0;
	}else if (tagSize == chunkLength){
		tagSize = 0;
	}
	return tagSize;
}

// Tag creator function for FLACs
function getMetadata(buf, track, settings){
	const flac = new metaflac(buf);
	flac.removeAllTags();
	if (settings.tags.title)
		flac.setTag('TITLE=' + changeCase(track.title, settings.titleCasing));
	if (settings.tags.album)
		flac.setTag('ALBUM=' + track.album.title);
	if (settings.tags.albumArtist)
		flac.setTag('ALBUMARTIST=' + changeCase(track.album.artist.name, settings.artistCasing));
	if (settings.tags.trackNumber)
		flac.setTag('TRACKNUMBER=' + track.trackNumber);
	if (settings.tags.discNumber)
		flac.setTag('DISCNUMBER=' + track.discNumber);
	if (settings.tags.trackTotal)
		flac.setTag('TRACKTOTAL=' + track.album.trackTotal);
	if (settings.tags.explicit)
		flac.setTag('ITUNESADVISORY=' + (track.explicit ? "1" : "0"));
	if (settings.tags.isrc)
		flac.setTag('ISRC=' + track.ISRC);
	if (settings.tags.artist && track.artistsString)
		if (Array.isArray(track.artistsString)){
			track.artistsString.forEach(x=>{
				flac.setTag('ARTIST=' + changeCase(x, settings.artistCasing));
			});
		}else{
			flac.setTag('ARTIST=' + changeCase(track.artistsString, settings.artistCasing));
		}
	if (settings.tags.discTotal)
		flac.setTag('DISCTOTAL='+track.album.discTotal);
	if (settings.tags.length)
		flac.setTag('LENGTH=' + track.duration);
	if (settings.tags.barcode && track.album.barcode)
		flac.setTag('BARCODE=' + track.album.barcode);
	if (track.unsyncLyrics && settings.tags.unsynchronisedLyrics)
		flac.setTag('LYRICS='+track.unsyncLyrics.lyrics);
	if (track.album.genreString && settings.tags.genre)
		if (Array.isArray(track.album.genreString)){
			track.album.genreString.forEach(x=>{
				flac.setTag('GENRE=' + x);
			});
		}else{
			flac.setTag('GENRE=' + track.album.genreString);
		}
	if (track.copyright && settings.tags.copyright)
		flac.setTag('COPYRIGHT=' + track.copyright);
	if (0 < parseInt(track.date.year)){
		if (settings.tags.date)
			flac.setTag('DATE=' + track.dateString);
		else if (settings.tags.year)
			flac.setTag('DATE=' + track.date.year);
	}
	if (0 < parseInt(track.bpm) && settings.tags.bpm)
		flac.setTag('BPM=' + track.bpm);
	if(track.album.label && settings.tags.publisher)
		flac.setTag('PUBLISHER=' + track.album.label);
	if(track.composerString && settings.tags.composer)
		if (Array.isArray(track.composerString)){
			track.composerString.forEach(x=>{
				flac.setTag('COMPOSER=' + x);
			});
		}else{
			flac.setTag('COMPOSER=' + track.composerString);
		}
	if(track.musicpublisherString && settings.tags.musicpublisher)
		if (Array.isArray(track.musicpublisherString)){
			track.musicpublisherString.forEach(x=>{
				flac.setTag('ORGANIZATION=' + x);
			});
		}else{
			flac.setTag('ORGANIZATION=' + track.musicpublisherString);
		}
	if(track.mixerString && settings.tags.mixer)
		if (Array.isArray(track.mixerString)){
			track.mixerString.forEach(x=>{
				flac.setTag('MIXER=' + x);
			});
		}else{
			flac.setTag('MIXER=' + track.mixerString);
		}
	if(track.authorString && settings.tags.author)
		if (Array.isArray(track.authorString)){
			track.authorString.forEach(x=>{
				flac.setTag('AUTHOR=' + x);
			});
		}else{
			flac.setTag('AUTHOR=' + track.authorString);
		}
	if(track.writerString && settings.tags.writer)
		if (Array.isArray(track.writerString)){
			track.writerString.forEach(x=>{
				flac.setTag('WRITER=' + x);
			});
		}else{
			flac.setTag('WRITER=' + track.writerString);
		}
	if(track.engineerString && settings.tags.engineer)
		if (Array.isArray(track.engineerString)){
			track.engineerString.forEach(x=>{
				flac.setTag('ENGINEER=' + x);
			});
		}else{
			flac.setTag('ENGINEER=' + track.engineerString);
		}
	if(track.producerString && settings.tags.producer)
		if (Array.isArray(track.producerString)){
			track.producerString.forEach(x=>{
				flac.setTag('PRODUCER=' + x);
			});
		}else{
			flac.setTag('PRODUCER=' + track.producerString);
		}
	if(track.replayGain && settings.tags.replayGain)
		flac.setTag('REPLAYGAIN_TRACK_GAIN=' + track.replayGain);

	if(track.album.picturePath && settings.tags.cover){
		flac.importPicture(track.album.picturePath);
	}
	return Buffer.from(flac.save());
}

// Tag creator function for MP3s
function getID3(track, settings){
	const writer = new ID3Writer(Buffer.alloc(0));
	if (settings.tags.title)
		writer.setFrame('TIT2', changeCase(track.title, settings.titleCasing))
	if (settings.tags.artist)
		writer.setFrame('TPE1', [changeCase(track.artistsString, settings.artistCasing)])
	if (settings.tags.album)
		writer.setFrame('TALB', track.album.title)
	if (settings.tags.albumArtist && track.album.artist)
		writer.setFrame('TPE2', changeCase(track.album.artist.name, settings.artistCasing))
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
	if(track.explicit && settings.tags.explicit)
		writer.setFrame('TXXX', {
			description: 'ITUNESADVISORY',
			value: track.explicit ? "1" : "0"
		});
	writer.addTag();
	return Buffer.from(writer.arrayBuffer);
}

id3v1Genres = ["Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "Rhythm and Blues", "Rap", "Reggae", "Rock", "Techno", "Industrial", "Alternative", "Ska", "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop", "Vocal", "Jazz & Funk", "Fusion", "Trance", "Classical", "Instrumental", "Acid", "House", "Game", "Sound clip", "Gospel", "Noise", "Alternative Rock", "Bass", "Soul", "Punk", "Space", "Meditative", "Instrumental Pop", "Instrumental Rock", "Ethnic", "Gothic", "Darkwave", "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream", "Southern Rock", "Comedy", "Cult", "Gangsta", "Top 40", "Christian Rap", "Pop/Funk", "Jungle music", "Native US", "Cabaret", "New Wave", "Psychedelic", "Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal", "Acid Punk", "Acid Jazz", "Polka", "Retro", "Musical", "Rock ’n’ Roll", "Hard Rock", "Folk", "Folk-Rock", "National Folk", "Swing", "Fast Fusion", "Bebop", "Latin", "Revival", "Celtic", "Bluegrass", "Avantgarde", "Gothic Rock", "Progressive Rock", "Psychedelic Rock", "Symphonic Rock", "Slow Rock", "Big Band", "Chorus", "Easy Listening", "Acoustic", "Humour", "Speech", "Chanson", "Opera", "Chamber Music", "Sonata", "Symphony", "Booty Bass", "Primus", "Porn Groove", "Satire", "Slow Jam", "Club", "Tango", "Samba", "Folklore", "Ballad", "Power Ballad", "Rhythmic Soul", "Freestyle", "Duet", "Punk Rock", "Drum Solo", "A cappella", "Euro-House", "Dance Hall", "Goa music", "Drum & Bass", "Club-House", "Hardcore Techno", "Terror", "Indie", "BritPop", "Negerpunk", "Polsk Punk", "Beat", "Christian Gangsta Rap", "Heavy Metal", "Black Metal", "Crossover", "Contemporary Christian", "Christian Rock", "Merengue", "Salsa", "Thrash Metal", "Anime", "Jpop", "Synthpop", "Abstract", "Art Rock", "Baroque", "Bhangra", "Big beat", "Breakbeat", "Chillout", "Downtempo", "Dub", "EBM", "Eclectic", "Electro", "Electroclash", "Emo", "Experimental", "Garage", "Global", "IDM", "Illbient", "Industro-Goth", "Jam Band", "Krautrock", "Leftfield", "Lounge", "Math Rock", "New Romantic", "Nu-Breakz", "Post-Punk", "Post-Rock", "Psytrance", "Shoegaze", "Space Rock", "Trop Rock", "World Music", "Neoclassical", "Audiobook", "Audio Theatre", "Neue Deutsche Welle", "Podcast", "Indie-Rock", "G-Funk", "Dubstep", "Garage Rock", "Psybient"]
// Tag creator for ID3v1
function getID3v1(track, settings){
	let tagBuffer = Buffer.alloc(128)
	tagBuffer.write('TAG',0)
	if (settings.tags.title){
		let trimmedTitle = extAsciiFilter(track.title.substring(0, 30))
		tagBuffer.write(trimmedTitle,3)
	}
	if (settings.tags.artist){
		let selectedArtist
		if (track.artist.name)
			selectedArtist = track.artist.name
		else
			selectedArtist = track.mainArtist
		let trimmedArtist = extAsciiFilter(selectedArtist.substring(0, 30))
		tagBuffer.write(trimmedArtist,33)
	}
	if (settings.tags.album){
		let trimmedAlbum = extAsciiFilter(track.album.title.substring(0, 30))
		tagBuffer.write(trimmedAlbum,63)
	}
	if (settings.tags.year){
		let trimmedYear = track.date.year.substring(0,4)
		tagBuffer.write(trimmedYear,93)
	}
	if (settings.tags.trackNumber){
		if (track.trackNumber <= 65535)
			if (track.trackNumber > 255)
				tagBuffer.writeUInt8(parseInt(track.trackNumber),125)
			else
				tagBuffer.writeUInt8(parseInt(track.trackNumber),126)
	}
	if (settings.tags.genre){
		let selectedGenre = Array.isArray(track.album.genre) ? track.album.genre[0] : track.album.genre;
		if (id3v1Genres.indexOf(selectedGenre) != -1)
			tagBuffer.writeUInt8(id3v1Genres.indexOf(selectedGenre),127)
		else
			tagBuffer.writeUInt8(255,127)
	}else{
		tagBuffer.writeUInt8(255,127)
	}
	return tagBuffer
}

function updateProgressBar(queueId, progress) {
	if (Math.round(progress) % 5 == 0) {
		io.sockets.emit("downloadProgress", {
			queueId: queueId,
			percentage: progress
		})
		logger.info("Updating download progress to: " + progress)
	}
}

// Filters only Extended Ascii characters
function extAsciiFilter(string){
	let output = ""
	string.split('').forEach((x)=>{
		if (x.charCodeAt(0) > 255)
			output += "?"
		else
			output += x
	})
	return output
}

// Like for each but async
async function asyncForEach(array, callback) {
	for (let index = 0; index < array.length; index++) {
		await callback(array[index], index, array);
	}
}

// rest API url parsing + adding to queue (taken from frontend.js)
function clientaddToQueue(url, forceBitrate=null) {
	let userSettings = configFile.userDefined
	bitrate = forceBitrate ? forceBitrate : userSettings.maxBitrate
	var type = getTypeFromLink(url), id = getIDFromLink(url, type)
	if (['track', 'spotifytrack', 'playlist', 'spotifyplaylist', 'album', 'spotifyalbum', 'artist', 'artisttop'].indexOf(type) == -1) {
		return "Wrong Type!: " + type
	}
	if (alreadyInQueue(id, bitrate)) {
		return "Already in download-queue!"
	}
	if (id.match(/^-?[0-9]+$/) == null && type.indexOf("spotify")<-1) {
		return "Wrong ID!: " + id
	}
	clientsocket.emit("download" + type, {id: id, settings: userSettings, bitrate: bitrate})
	return "Added to queue"
}

function alreadyInQueue(id, bitrate){
	for (var i of localDownloadQueue) {
		if(i == `${id}:${bitrate}`){
			return true
		}
	}
	return false
}

function getIDFromLink(link, type) {
	if (link.indexOf('?') > -1) {
		link = link.substring(0, link.indexOf("?"))
	}
	// Spotify
	if ((link.startsWith("http") && link.indexOf('open.spotify.com/') >= 0)){
		switch (type){
			case "spotifyplaylist":
				return link.slice(link.indexOf("/playlist/")+10)
				break
			case "spotifytrack":
				return link.slice(link.indexOf("/track/")+7)
				break
			case "spotifyalbum":
				return link.slice(link.indexOf("/album/")+7)
				break
		}
	} else if (link.startsWith("spotify:")){
		switch (type){
			case "spotifyplaylist":
				return link.slice(link.indexOf("playlist:")+9)
				break
			case "spotifytrack":
				return link.slice(link.indexOf("track:")+6)
				break
			case "spotifyalbum":
				return link.slice(link.indexOf("album:")+6)
				break
		}

	// Deezer
	} else if(type == "artisttop") {
		return link.match(/\/artist\/(\d+)\/top_track/)[1];
	} else {
		return link.substring(link.lastIndexOf("/") + 1)
	}
}

function changeCase(str, type){
	switch (type) {
		case "lower":
			return str.toLowerCase()
		case "upper":
			return str.toUpperCase()
		case "start":
			if (str.indexOf(String.fromCharCode(0))>-1){
				artists = str.split(String.fromCharCode(0))
				artists.forEach((artist, i)=>{
					artist = artist.split(" ")
					artist.forEach((value, index)=>{
						artist[index] = value[0].toUpperCase() + value.substring(1).toLowerCase()
					})
					artists[i] = artist.join(" ")
				})
				res = artists.join(String.fromCharCode(0))
			}else{
				str = str.split(" ")
				res = []
				str.forEach((value, index)=>{
					res.push(value[0].toUpperCase() + value.substring(1).toLowerCase())
				})
				res = res.join(" ")
			}
			return res
		case "sentence":
			if (str.indexOf(String.fromCharCode(0))>-1){
				artists = str.split(String.fromCharCode(0))
				artists.forEach((artist, i)=>{
					artists[i] = artist[0].toUpperCase() + artist.substring(1).toLowerCase()
				})
				res = artists.join(String.fromCharCode(0))
			}else{
				res = str[0].toUpperCase() + str.substring(1).toLowerCase()
			}
			return res
		case "nothing":
		default:
			return str;
	}
}

function getTypeFromLink(link) {
	var type
	if (link.indexOf('spotify') > -1){
		type = "spotify"
		if (link.indexOf('playlist') > -1) type += "playlist"
		else if (link.indexOf('track') > -1) type += "track"
		else if (link.indexOf('album') > -1) type += "album"
	} else if (link.indexOf('/track') > -1) {
		type = "track"
	} else if (link.indexOf('/playlist') > -1) {
		type = "playlist"
	} else if (link.indexOf('/album') > -1) {
		type = "album"
	} else if (link.match(/\/artist\/(\d+)\/top_track/)) {
		type = "artisttop";
	} else if (link.indexOf('/artist')) {
		type = "artist"
	}
	return type
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
