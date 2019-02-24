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
	logger.info("Connection received!")

	// Check for updates
	request({
		url: "https://notabug.org/RemixDevs/DeezloaderRemix/raw/master/update.json",
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
			s.emit("message", {title: `Version ${lastVersion_MAJOR}.${lastVersion_MINOR}.${lastVersion_PATCH} is available!`, msg: body.changelog})
		}
	})
	.catch(error=>{
		logger.error(`UpdateCheck failed: ${error.stack ? error.stack : error}`)
	})

	// Connection dependet variables
	s.Deezer = new deezerApi()
	s.dqueue = new stq.SequentialTaskQueue()
	s.downloadQueue = {}
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
				try{
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

	// Sends settings saved by the user to the frontend
	s.on("getUserSettings", function () {
		let settings = configFile.userDefined
		if (!settings.downloadLocation) {
			settings.downloadLocation = mainFolder
		}
		s.emit('getUserSettings', {settings: settings})
	});

	// Saves locally the settings comming from the frontend
	s.on("saveSettings", function (settings) {
		if (settings.userDefined.downloadLocation == defaultDownloadFolder) {
			settings.userDefined.downloadLocation = ""
		} else {
			settings.userDefined.downloadLocation = path.resolve(settings.userDefined.downloadLocation + path.sep) + path.sep
			mainFolder = settings.userDefined.downloadLocation
		}

		if (settings.userDefined.queueConcurrency < 1) settings.userDefined.queueConcurrency = 1

		if (settings.userDefined.queueConcurrency != s.trackQueue.concurrency){
			s.trackQueue.concurrency = settings.userDefined.queueConcurrency
		}

		if (settings.userDefined.chartsCountry != configFile.userDefined.chartsCountry){
			s.emit("setChartsCountry", {selected: settings.userDefined.chartsCountry})
			getChartsTrackListByCountry(settings.userDefined.chartsCountry)
		}

		if (settings.userDefined.spotifyUser != configFile.userDefined.spotifyUser){
			getMyPlaylistList(settings.userDefined.spotifyUser)
		}

		configFile.userDefined = settings.userDefined;
		fs.outputFile(configFileLocation, JSON.stringify(configFile, null, 2), function (err) {
			if (err) return
			logger.info("Settings updated")
			initFolders()
		});
	});

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
				id: `${track.id}:${data.settings.maxBitrate}`,
				type: 'track',
				settings: data.settings || {},
				obj: track,
			}
			addToQueue(_track)
		}catch(err){
			logger.error(`downloadTrack failed: ${err.stack ? err.stack : err}`)
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
			if (album.nb_tracks == 1){
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
					id: `${track.id}:${data.settings.maxBitrate}`,
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
					id: `${album.id}:${data.settings.maxBitrate}`,
					type: 'album',
					settings: data.settings || {},
					obj: album,
				}
				addToQueue(_album)
			}
			return
		}catch(err){
			logger.error(`downloadAlbum failed: ${err.stack ? err.stack : err}`)
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
				id: `${playlist.id}:${data.settings.maxBitrate}`,
				type: "playlist",
				settings: data.settings || {},
				obj: playlist,
			}
			addToQueue(_playlist)
		}catch(err){
			logger.error(`downloadPlaylist failed: ${err.stack ? err.stack : err}`)
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
				id: `${artist.id}:${data.settings.maxBitrate}`,
				type: "playlist",
				settings: data.settings || {},
				obj: artist,
			}
			addToQueue(_playlist)
		}catch(err){
			logger.error(`downloadArtistTop failed: ${err.stack ? err.stack : err}`)
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
					id: `${resp.body.id}:${data.settings.maxBitrate}`,
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
				return
			}
		}else{
			s.emit("message", {title: "Spotify Support is not enabled", msg: "You should add authCredentials.js in your config files to use this feature<br>You can see how to do that in <a href=\"https://notabug.org/RemixDevs/DeezloaderRemix/wiki/Spotify+Features\">this guide</a>"})
		}
	}
	s.on("downloadspotifyplaylist", data=>{downloadSpotifyPlaylist(data)})

	// Converts the spotify track to a deezer one
	// It tries first with the isrc (best way of conversion)
	// Fallbacks to the old way, using search
	async function convertSpotify2Deezer(track){
		if (!track) return 0
		try{
			if (track.external_ids.isrc){
				let resp = await s.Deezer.legacyGetTrackByISRC(track.external_ids.isrc)
				return resp.id
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
			resp = await s.Deezer.legacySearch(`artist:"${artist}" track:"${track}"`, "track", 1)
		}catch(err){logger.err(`ConvertFromMetadata: ${err.stack ? err.stack : err}`)}
		if (resp.data[0]) return resp.data[0].id
		if (track.indexOf("(") < track.indexOf(")")){
			try{
				resp = await s.Deezer.legacySearch(`artist:"${artist}" track:"${track.split("(")[0]}"`, "track", 1)
			}catch(err){logger.err(`ConvertFromMetadata: ${err.stack ? err.stack : err}`)}
			if (resp.data[0]) return resp.data[0].id
		}else if (track.indexOf(" - ")>0){
			try{
				resp = await s.Deezer.legacySearch(`artist:"${artist}" track:"${track.split(" - ")[0]}"`, "track", 1)
			}catch(err){logger.err(`ConvertFromMetadata: ${err.stack ? err.stack : err}`)}
			if (resp.data[0]) return resp.data[0].id
		}else{
			return 0
		}
		return 0
	}

	// All the above functions call this function
	// It adds the object to an array and adds the promise for the download to the object itself
	function addToQueue(object) {
		s.downloadQueue[object.queueId] = object
		s.emit('addToQueue', object)
		s.downloadQueue[object.queueId].downloadQueuePromise = s.dqueue.push(addNextDownload, { args: object })
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
		if (s.downloadQueue[queueId]){
			cancel = true;
			if (s.downloadQueue[queueId].downloadQueuePromise) s.downloadQueue[queueId].downloadQueuePromise.cancel()
			if (s.downloadQueue[Object.keys(s.downloadQueue)[0]].queueId == queueId) {
				s.trackQueue = queue({
					autostart: true,
					concurrency: s.trackQueue.concurrency
				})
			}
			delete s.downloadQueue[queueId]
		}

		if (cancel) {
			s.emit("cancelDownload", {queueId: queueId, cleanAll: cleanAll});
		}
	}
	s.on("cancelDownload", function (data) {cancelDownload(data.queueId)});

	s.on("cancelAllDownloads", function(data){
		data.queueList.forEach(x=>{
			cancelDownload(x, true);
		})
		s.emit("cancelAllDownloads")
	})

	/*function getNextDownload() {
		if (s.currentItem != null || Object.keys(s.downloadQueue).length == 0) {
			if (Object.keys(s.downloadQueue).length == 0 && s.currentItem == null) {
				s.emit("emptyDownloadQueue", {})
			}
			return null
		}
		s.currentItem = s.downloadQueue[Object.keys(s.downloadQueue)[0]]
		return s.currentItem
	}*/

	//downloadQueue: the tracks in the queue to be downloaded
	//queueId: random number generated when user clicks download on something
	async function queueDownload(downloading) {
		if (!downloading) return

		if (downloading.type != "spotifyplaylist"){
			s.emit("downloadStarted", {queueId: downloading.queueId})
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
						downloading.failed++
					}
					s.emit("updateQueue", {
						name: downloading.name,
						artist: downloading.artist,
						size: downloading.size,
						downloaded: downloading.downloaded,
						failed: downloading.failed,
						queueId: downloading.queueId,
						id: downloading.id,
						type: downloading.type,
					})
					s.emit("downloadProgress", {
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
				if (downloading.settings.createArtistFolder || downloading.settings.createAlbumFolder) {
					if (downloading.settings.createArtistFolder) {
						filePath += antiDot(fixName(downloading.settings.artName)) + path.sep;
					}
					if (downloading.settings.createAlbumFolder) {
						filePath += antiDot(settingsRegexAlbum(downloading.settings.foldername,downloading.settings.artName,downloading.settings.albName,downloading.obj.release_date.slice(0, 4),downloading.obj.record_type,downloading.obj.explicit_lyrics,downloading.obj.label, downloading.obj.genres)) + path.sep;
					}
				} else if (downloading.settings.artName) {
					filePath += antiDot(settingsRegexAlbum(downloading.settings.foldername,downloading.settings.artName,downloading.settings.albName,downloading.obj.release_date.slice(0, 4),downloading.obj.record_type,downloading.obj.explicit_lyrics,downloading.obj.label, downloading.obj.genres)) + path.sep;
				}
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
				downloading.downloadPromise = new Promise((resolve,reject)=>{
					downloading.obj.tracks.every(function (t) {
						s.trackQueue.push(async cb=>{
							if (!s.downloadQueue[downloading.queueId]) {
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
							}
							s.emit("downloadProgress", {
								queueId: downloading.queueId,
								percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
							});
							s.emit("updateQueue", {
								name: downloading.name,
								artist: downloading.artist,
								size: downloading.size,
								downloaded: downloading.downloaded,
								failed: downloading.failed,
								queueId: downloading.queueId,
								id: downloading.id,
								type: downloading.type,
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
						fs.writeFileSync(filePath+"playlist.m3u", downloading.playlistArr.join("\r\n"));
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
						s.trackQueue.push(async cb=>{
							if (!s.downloadQueue[downloading.queueId]) {
								reject()
								return false
							}
							try{
								await downloadTrackObject(t, downloading.queueId, downloading.settings)
								downloading.downloaded++
								downloading.playlistArr[t.playlistData[0]] = t.playlistData[1].split(filePath)[1]
								if (t.searched) downloading.searchedLog += `${t.artist.name} - ${t.title}\r\n`
							}catch(err){
								logger.debug(err.stack ? err.stack : err)
								downloading.failed++
								downloading.errorLog += `${t.id} | ${t.artist.name} - ${t.title} | ${err}\r\n`
							}
							s.emit("downloadProgress", {
								queueId: downloading.queueId,
								percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
							});
							s.emit("updateQueue", {
								name: downloading.name,
								artist: downloading.artist,
								size: downloading.size,
								downloaded: downloading.downloaded,
								failed: downloading.failed,
								queueId: downloading.queueId,
								id: downloading.id,
								type: downloading.type,
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
						try{
							downloading.playlistContent[i] = await convertSpotify2Deezer(t)
						}catch(err){
							logger.error(`queueDownload:spotifyplaylist failed during conversion: ${err.stack ? err.stack : err}`)
						}
					})
				}
				await convert()
				if (!s.downloadQueue[downloading.queueId]) {
					logger.info("Stopping the playlist queue")
					break
				}
				downloading.trackList = await s.Deezer.getTracks(downloading.playlistContent)
				logger.info("All tracks converted, starting download")
				s.emit("downloadStarted", {queueId: downloading.queueId})
				downloading.settings.playlist = {
					fullSize: downloading.trackList.length
				}
				filePath = `${mainFolder}${antiDot(fixName(downloading.settings.plName))}${path.sep}`
				downloading.downloadPromise = new Promise((resolve,reject)=>{
					downloading.trackList.every(function (t, index) {
						s.trackQueue.push(async cb=>{
							if (!s.downloadQueue[downloading.queueId]) {
								reject()
								return false
							}
							t.position = index
							if (t.id==0){
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
							}
							s.emit("downloadProgress", {
								queueId: downloading.queueId,
								percentage: ((downloading.downloaded+downloading.failed) / downloading.size) * 100
							});
							s.emit("updateQueue", {
								name: downloading.name,
								artist: downloading.artist,
								size: downloading.size,
								downloaded: downloading.downloaded,
								failed: downloading.failed,
								queueId: downloading.queueId,
								id: downloading.id,
								type: downloading.type,
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
		if (downloading && s.downloadQueue[Object.keys(s.downloadQueue)[0]] && (Object.keys(s.downloadQueue)[0] == downloading.queueId)) delete s.downloadQueue[Object.keys(s.downloadQueue)[0]]
		if (Object.keys(s.downloadQueue).length == 0) {
			s.emit("emptyDownloadQueue", {})
		}
	}

	// This function takes the track object and does all the stuff to download it
	async function downloadTrackObject(track, queueId, settings) {
		if (!s.downloadQueue[queueId]) {
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
				if ((settings.tags.discTotal || settings.createCDFolder) && parseInt(track.id)>0){
					if (!ajson.discTotal){
						logger.info(`[${track.artist.name} - ${track.title}] Getting total disc number`);
						var discTotal = await s.Deezer.getAlbum(ajson.id)
						track.discTotal = discTotal.discTotal
					}else{
						track.discTotal = ajson.discTotal
					}
				}
				track.album.artist = {
					id: ajson.artist.id,
					name: ajson.artist.name,
					picture: ajson.artist.picture_small.split("/56x56-000000-80-0-0.jpg")[0].split(s.Deezer.artistPicturesHost)[1],
				}
				track.trackTotal = ajson.nb_tracks
				track.album.barcode = ajson.upc
				if (!ajson.record_type){
					track.recordType = swichReleaseType(track.recordType)
				}else{
					track.recordType = ajson.record_type
				}
				if (ajson.explicit_lyrics){
					track.album.explicit = ajson.explicit_lyrics;
				}
				if(ajson.label){
					track.publisher = ajson.label;
				}
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
					track.genre = [];
					genreArray = [];
					ajson.genres.data.forEach(function(genre){
						genreArray.push(genre.name);
					});
					track.genre = uniqueArray(genreArray, false)
				}
			}else{
				// Missing barcode, genre, recordType
				track.album = ajson
				track.date = track.album.date
				// TODO: Make a loop for each artist

			}

			// Acquiring bpm (only if necessary)
			if (settings.tags.bpm){
				logger.info(`[${track.artist.name} - ${track.title}] Getting BPM`);
				try{
					var bpm = await s.Deezer.legacyGetTrack(track.id)
					track.bpm = bpm.bpm
				}catch(err){
					track.bpm = 0
				}
			}else{
				track.bpm = 0
			}

			// Acquiring ReplayGain value (only if necessary)
			if (settings.tags.replayGain){
				logger.info(`[${track.artist.name} - ${track.title}] Getting track gain`);
				try{
					var gain = await s.Deezer.legacyGetTrack(track.id)
					track.replayGain = gain.gain
				}catch(err){
					track.replayGain = 0
				}
			}else{
				track.replayGain = 0
			}

			if (settings.tags.discNumber && !track.discNumber){
				logger.info(`[${track.artist.name} - ${track.title}] Getting disc number`);
				var discNumber = await s.Deezer.legacyGetTrack(track.id)
				track.discNumber = discNumber.disk_number
			}

			let separator = settings.multitagSeparator
			if (separator == "null") separator = String.fromCharCode(parseInt("\u0000",16))

			// Autoremoves (Album Version) from the title
			if (settings.removeAlbumVersion){
				if(track.title.indexOf("Album Version")>-1){
					track.title = track.title.replace(/\(Album Version\)/g,"")
					track.title.trim()
				}
			}

			track.album.artist.pictureUrl = `${s.Deezer.artistPicturesHost}${track.album.artist.picture}/${settings.artworkSize}x${settings.artworkSize}-000000-80-0-0${(settings.PNGcovers ? ".png" : ".jpg")}`
			track.album.pictureUrl = `${s.Deezer.albumPicturesHost}${track.album.picture}/${settings.artworkSize}x${settings.artworkSize}-000000-80-0-0${(settings.PNGcovers ? ".png" : ".jpg")}`
			if(track.contributor){
				if(track.contributor.composer){
					track.composerString = []
					track.composerString = uniqueArray(track.contributor.composer)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) track.composerString = track.composerString.join(separator)
				}
				if(track.contributor.musicpublisher){
					track.musicpublisherString = []
					track.musicpublisherString = uniqueArray(track.contributor.musicpublisher)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) track.musicpublisherString = track.musicpublisherString.join(separator)
				}
				if(track.contributor.producer){
					track.producerString = []
					track.producerString = uniqueArray(track.contributor.producer)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) track.producerString = track.producerString.join(separator)
				}
				if(track.contributor.engineer){
					track.engineerString = []
					track.engineerString = uniqueArray(track.contributor.engineer)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) track.engineerString = track.engineerString.join(separator)
				}
				if(track.contributor.writer){
					track.writerString = []
					track.writerString = uniqueArray(track.contributor.writer)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) track.writerString = track.writerString.join(separator)
				}
				if(track.contributor.author){
					track.authorString = []
					track.authorString = uniqueArray(track.contributor.author)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) track.authorString = track.authorString.join(separator)
				}
				if(track.contributor.mixer){
					track.mixerString = [];
					track.mixerString = uniqueArray(track.contributor.mixer)
					if (!(track.selectedFormat == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) track.mixerString = track.mixerString.join(separator)
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
				if (!(track.selectedFormat == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) track.artistsString = track.artistsString.join(separator)
			}
			if (track.genre){
				if (!(track.selectedFormat == 9 && separator==String.fromCharCode(parseInt("\u0000",16)))) track.genreString = track.genre.join(separator)
			}

			if (track.date){
				let date
				switch (settings.dateFormat){
					case "0": date = `${track.date.slicedYear}-${track.date.month}-${track.date.day}`; break;
					case "1": date = `${track.date.day}-${track.date.month}-${track.date.slicedYear}`; break;
					case "2": date = `${track.date.month}-${track.date.day}-${track.date.slicedYear}`; break;
					case "3": date = `${track.date.slicedYear}-${track.date.day}-${track.date.month}`; break;
					case "4": date = `${track.date.day}${track.date.month}`; break;
					default: date = `${track.date.day}${track.date.month}`; break;
				}
				track.dateString = date;
			}
		}else{
			track.date = {year: 0,day: 0,month: 0}
		}

		if(settings.plName && !(settings.createArtistFolder || settings.createAlbumFolder) && !settings.numplaylistbyalbum){
			track.trackNumber = (track.position+1).toString();
			track.trackTotal = settings.playlist.fullSize;
			track.discNumber = "1";
			track.discTotal = "1";
		}

		// Auto detect aviable track format from settings
		if (parseInt(track.id)>0){
			switch(settings.maxBitrate){
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
		}else{
			track.selectedFilesize = track.filesize
			track.selectedFormat = 3
		}

		// TODO: Move to a separate function
		// Generating file name
		if (settings.saveFullArtists && settings.multitagSeparator != null){
			let filename = fixName(`${track.artistsString} - ${track.title}`);
		}else{
			let filename = fixName(`${track.artist.name} - ${track.title}`);
		}
		if (settings.filename) {
			filename = settingsRegex(track, settings.filename, settings.playlist, settings.saveFullArtists && settings.multitagSeparator != null, settings.paddingSize);
		}

		// TODO: Move to a separate function
		// Generating file path
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
					filepath += antiDot(fixName(track.album.artist.name)) + path.sep;
				}
				artistPath = filepath;
			}

			if (settings.createAlbumFolder) {
				if(settings.artName){
					filepath += antiDot(settingsRegexAlbum(settings.foldername,settings.artName,settings.albName,track.date.year,track.recordType,track.album.explicit,track.publisher,track.genre)) + path.sep;
				}else{
					filepath += antiDot(settingsRegexAlbum(settings.foldername,track.album.artist.name,track.album.title,track.date.year,track.recordType,track.album.explicit,track.publisher,track.genre)) + path.sep;
				}
			}
		} else if (settings.plName) {
			filepath += antiDot(fixName(settings.plName)) + path.sep;
		} else if (settings.artName) {
			filepath += antiDot(settingsRegexAlbum(settings.foldername,settings.artName,settings.albName,track.date.year,track.recordType,track.album.explicit,track.publisher,track.genre)) + path.sep;
		}
		let coverpath = filepath;
		if (track.discTotal > 1 && (settings.artName || settings.createAlbumFolder) && settings.createCDFolder){
			filepath += `CD${track.discNumber +  path.sep}`
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
			if(!(settings.albName || settings.createAlbumFolder)){
				imgPath = coverArtFolder + (track.album.barcode ? fixName(track.album.barcode) : fixName(`${track.album.artist.name} - ${track.album.title}`))+(settings.PNGcovers ? ".png" : ".jpg")
			}else{
				if (settings.saveArtwork)
					imgPath = coverpath + settingsRegexCover(settings.coverImageTemplate,track.album.artist.name,track.album.title)+(settings.PNGcovers ? ".png" : ".jpg")
				else
					imgPath = coverArtFolder + fixName(track.album.barcode ? fixName(track.album.barcode) : fixName(`${track.album.artist.name} - ${track.album.title}`))+(settings.PNGcovers ? ".png" : ".jpg")
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
		if (parseInt(this.id)>0 && track.album.artist.picture && settings.saveArtworkArtist) {
			let imgPath;
			if(settings.createArtistFolder){
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
				if (!s.downloadQueue[queueId]){
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
				if (!s.downloadQueue[queueId]){
					reject("Not in Queue")
					return false
				}
			})
			if((s.downloadQueue[queueId]) && s.downloadQueue[queueId].type == "track"){
				let chunkLength = 0
				req.on("data", function(data) {
					if (!s.downloadQueue[queueId]){
						reject("Not in Queue")
					}
					chunkLength += data.length
					try{
						if (!s.downloadQueue[queueId].percentage) {
							s.downloadQueue[queueId].percentage = 0
						}
						let complete = track.selectedFilesize
						let percentage = (chunkLength / complete) * 100;
						if ((percentage - s.downloadQueue[queueId].percentage > 1) || (chunkLength == complete)) {
							s.downloadQueue[queueId].percentage = percentage
							s.emit("downloadProgress", {
								queueId: queueId,
								percentage: s.downloadQueue[queueId].percentage-5
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
					flacComments.push('TRACKTOTAL=' + track.trackTotal);
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
					flacComments.push('DISCTOTAL='+track.discTotal);
				if (settings.tags.length)
					flacComments.push('LENGTH=' + track.duration);
				if (settings.tags.barcode && track.album.barcode)
					flacComments.push('BARCODE=' + track.album.barcode);
				if (track.unsyncLyrics && settings.tags.unsynchronisedLyrics)
					flacComments.push('LYRICS='+track.unsyncLyrics.lyrics);
				if (track.genreString && settings.tags.genre)
					if (Array.isArray(track.genreString)){
						track.genreString.forEach(x=>{
							flacComments.push('GENRE=' + x);
						});
					}else{
						flacComments.push('GENRE=' + track.genreString);
					}
				if (track.copyright && settings.tags.copyright)
					flacComments.push('COPYRIGHT=' + track.copyright);
				if (0 < parseInt(track.date.year)){
					if (settings.tags.date)
						flacComments.push('DATE=' + track.dateString);
					if (settings.tags.year)
						flacComments.push('YEAR=' + track.date.year);
				}
				if (0 < parseInt(track.bpm) && settings.tags.bpm)
					flacComments.push('BPM=' + track.bpm);
				if(track.publisher && settings.tags.publisher)
					flacComments.push('PUBLISHER=' + track.publisher);
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
					writer.setFrame('TRCK', (settings.tags.trackTotal ? track.trackNumber+"/"+track.trackTotal : track.trackNumber))
				if (settings.tags.discNumber)
					writer.setFrame('TPOS', (settings.tags.discTotal ? track.discNumber+"/"+track.discTotal : track.discNumber))
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
				if(track.publisher && settings.tags.publisher)
					writer.setFrame('TPUB', track.publisher);
				if(track.genreString && settings.tags.genre)
					writer.setFrame('TCON', [track.genreString]);
				if(track.copyright && settings.tags.copyright)
					writer.setFrame('TCOP', track.copyright);
				if (0 < parseInt(track.date.year)) {
					if (settings.tags.date)
						writer.setFrame('TDAT', track.dateString);
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
function settingsRegex(track, filename, playlist, saveFullArtists, paddingSize) {
	try{
		filename = filename.replace(/%title%/g, fixName(track.title));
		filename = filename.replace(/%album%/g, fixName(track.album.title));
		filename = filename.replace(/%artist%/g, fixName((saveFullArtists ? track.artistsString : track.artist.name)));
		filename = filename.replace(/%year%/g, fixName(track.date.year));
		filename = filename.replace(/%label%/g, fixName(track.publisher));
		if(typeof track.trackNumber != 'undefined'){
			if(configFile.userDefined.padtrck){
				 filename = filename.replace(/%number%/g, fixName(pad(track.trackNumber, (parseInt(paddingSize)>0 ? parseInt(paddingSize) : track.trackTotal))));
			}else{
				filename = filename.replace(/%number%/g, fixName(track.trackNumber));
			}
		} else {
			filename = filename.replace(/%number%/g, '');
		}
		filename = filename.replace(/%explicit%/g, fixName((track.explicit==="1" ? (filename.indexOf(/[^%]explicit/g)>-1 ? "" : "(Explicit Version)") : "")));
		filename = filename.replace(/%label%/g, fixName(track.genre ? (Array.isArray(track.genre) ? track.genre[0] : track.genre) : "Unknown"));
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
function settingsRegexAlbum(foldername, artist, album, year, rtype, explicit, publisher, genres) {
	try{
		foldername = foldername.replace(/%album%/g, fixName(album))
		foldername = foldername.replace(/%artist%/g, fixName(artist))
		foldername = foldername.replace(/%year%/g, fixName(year))
		if (rtype){
			foldername = foldername.replace(/%type%/g, fixName(rtype[0].toUpperCase() + rtype.substring(1)))
		}else{
			foldername = foldername.replace(/%type%/g, "")
		}
		foldername = foldername.replace(/%label%/g, fixName(publisher))
		foldername = foldername.replace(/%explicit%/g, fixName((explicit ? (foldername.indexOf(/[^%]explicit/g)>-1 ? "" : "(Explicit)") : "")))
		foldername = foldername.replace(/%genre%/g, fixName(genres ? (Array.isArray(genres) ? genres[0] : genres) : "Unknown"))
		return foldername.trim();
	}catch(e){
		logger.error("settingsRegexAlbum failed: "+e)
	}

}

function settingsRegexCover(foldername, artist, name) {
	foldername = foldername.replace(/%name%/g, fixName(name));
	foldername = foldername.replace(/%artist%/g, fixName(artist));
	return foldername;
}

function settingsRegexArtistCover(foldername, artist) {
	foldername = foldername.replace(/%artist%/g, fixName(artist));
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
