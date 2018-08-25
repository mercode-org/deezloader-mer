const request = require('requestretry').defaults({maxAttempts: 2147483647, retryDelay: 1000, timeout: 8000});
const crypto = require('crypto');
const fs = require("fs-extra");
const logger = require('./utils/logger.js');

module.exports = new Deezer();

function Deezer() {
	this.apiUrl = "http://www.deezer.com/ajax/gw-light.php";
	this.httpHeaders = {
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36",
		"Content-Language": "en-US",
		"Cache-Control": "max-age=0",
		"Accept": "*/*",
		"Accept-Charset": "utf-8,ISO-8859-1;q=0.7,*;q=0.3",
		"Accept-Language": "en-US,en;q=0.9,en-US;q=0.8,en;q=0.7"
	}
	this.albumPicturesHost = "https://e-cdns-images.dzcdn.net/images/cover/";
	this.reqStream = {}
	this.delStream = []
}
console.log("hi");
Deezer.prototype.init = function(username, password, callback) {
	var self = this;
	request.post({
		url: self.apiUrl,
		strictSSL: false,
		qs: {
			api_version: "1.0",
			api_token: "null",
			input: "3",
			method: 'deezer.getUserData'
		},
		headers: self.httpHeaders,
		jar: true,
		json:true,
	}, function(err, res, body) {
		if(body.results.USER.USER_ID !== 0){
			// login already done
			callback(null, null);
			return;
		}
		request.post({
			url: "https://www.deezer.com/ajax/action.php",
			headers: this.httpHeaders,
			strictSSL: false,
			form: {
				type:'login',
				mail:username,
				password:password,
				checkFormLogin: body.results.checkFormLogin
			},
			jar: true
		}, function(err, res, body) {
			if(err || res.statusCode != 200) {
				callback(new Error(`Unable to load deezer.com: ${res ? (res.statusCode != 200 ? res.statusCode : "") : ""} ${err ? err.message : ""}`));
			}else if(body.indexOf("success") > -1){
				request.post({
					url: self.apiUrl,
					strictSSL: false,
					qs: {
						api_version: "1.0",
						api_token: "null",
						input: "3",
						method: 'deezer.getUserData'
					},
					headers: self.httpHeaders,
					jar: true,
					json:true,
				}, function(err, res, body) {
					if(!err && res.statusCode == 200) {
						const user = body.results.USER;
						self.userId = user.USER_ID;
						self.userName = user.BLOG_NAME;
						self.userPicture = `https:\/\/e-cdns-images.dzcdn.net\/images\/user\/${user.USER_PICTURE}\/250x250-000000-80-0-0.jpg`;
						callback(null, null);
					} else {
						callback(new Error(`Unable to load deezer.com: ${res ? (res.statusCode != 200 ? res.statusCode : "") : ""} ${err ? err.message : ""}`));
					}
				});
			}else{
				callback(new Error("Incorrect email or password."));
			}
		});
	})
}



Deezer.prototype.getPlaylist = function(id, callback) {
	getJSON("https://api.deezer.com/playlist/" + id, function(res, err){
		callback(res, err);
	});
}

Deezer.prototype.getAlbum = function(id, callback) {
	getJSON("https://api.deezer.com/album/" + id, function(res, err){
		callback(res, err);
	});
}

Deezer.prototype.getAAlbum = function(id, callback) {
	var self = this;
	self.getToken().then(data=>{
		request.post({
			url: self.apiUrl,
			headers: self.httpHeaders,
			strictSSL: false,
			qs: {
				api_version: "1.0",
				input: "3",
				api_token: data,
				method: "album.getData"
			},
			body: {alb_id:id},
			jar: true,
			json: true
		}, (function (err, res, body) {
			if(!err && res.statusCode == 200 && typeof body.results != 'undefined'){
				let ajson = {};
				ajson.artist = {}
				ajson.artist.name = body.results.ART_NAME
				ajson.nb_tracks = body.results.NUMBER_TRACK
				ajson.label = body.results.LABEL_NAME
				ajson.release_date = body.results.PHYSICAL_RELEASE_DATE
				ajson.totalDiskNumber = body.results.NUMBER_DISK
				callback(ajson);
			} else {
				callback(null, new Error("Unable to get Album" + id));
			}
		}).bind(self));
	})
}

Deezer.prototype.getATrack = function(id, callback) {
	getJSON("https://api.deezer.com/track/" + id, function(res, err){
		callback(res, err);
	});
}

Deezer.prototype.getArtist = function(id, callback) {
	getJSON("https://api.deezer.com/artist/" + id, function(res, err){
		callback(res, err);
	});

}

Deezer.prototype.getPlaylistTracks = function(id, callback) {
	getJSON(`https://api.deezer.com/playlist/${id}/tracks?limit=-1`, function(res, err){
		callback(res, err);
	});
}

Deezer.prototype.getAlbumTracks = function(id, callback) {
	getJSON(`https://api.deezer.com/album/${id}/tracks?limit=-1`, function(res, err){
		callback(res, err);
	});
}

Deezer.prototype.getAdvancedPlaylistTracks = function(id, callback) {
	var self = this;
	self.getToken().then(data=>{
		request.post({
			url: self.apiUrl,
			headers: self.httpHeaders,
			strictSSL: false,
			qs: {
				api_version: "1.0",
				input: "3",
				api_token: data,
				method: "playlist.getSongs"
			},
			body: {playlist_id:id, nb:-1},
			jar: true,
			json: true
		}, (function (err, res, body) {
			if(!err && res.statusCode == 200 && typeof body.results != 'undefined'){
				callback(body.results);
			} else {
				callback(null, new Error("Unable to get Album" + id));
			}
		}).bind(self));
	})
}

Deezer.prototype.getAdvancedAlbumTracks = function(id, callback) {
	var self = this;
	self.getToken().then(data=>{
		request.post({
			url: self.apiUrl,
			headers: self.httpHeaders,
			strictSSL: false,
			qs: {
				api_version: "1.0",
				input: "3",
				api_token: data,
				method: "song.getListByAlbum"
			},
			body: {alb_id:id,nb:-1},
			jar: true,
			json: true
		}, (function (err, res, body) {
			if(!err && res.statusCode == 200 && typeof body.results != 'undefined'){
				callback(body.results);
			} else {
				callback(null, new Error("Unable to get Album" + id));
			}
		}).bind(self));
	})
}

Deezer.prototype.getArtistAlbums = function(id, callback) {
	getJSON("https://api.deezer.com/artist/" + id + "/albums?limit=-1", function(res, err){
		if(!res.data) {
			res.data = [];
		}
		callback(res, err);
	});
}

/*
**	CHARTS
** 	From user https://api.deezer.com/user/637006841/playlists?limit=-1
*/
Deezer.prototype.getChartsTopCountry = function(callback) {
	getJSON("https://api.deezer.com/user/637006841/playlists?limit=-1", function(res, err){
		if(!res.data) {
			res.data = [];
		} else {
			//Remove "Loved Tracks"
			res.data.shift();
		}
		callback(res, err);
	});

}

Deezer.prototype.getMePlaylists = function(callback) {
	getJSON("https://api.deezer.com/user/"+this.userId+"/playlists?limit=-1", function(res, err){
		if(!res.data) {
			res.data = [];
		}
		callback(res, err);
	});
}

Deezer.prototype.getLocalTrack = function(id, callback) {
	var scopedid = id;
	var self = this;
	self.getToken().then(data=>{
		request.post({
			url: self.apiUrl,
			headers: self.httpHeaders,
			strictSSL: false,
			qs: {
				api_version: "1.0",
				input: "3",
				api_token: data,
				method: "song.getData"
			},
			body: {sng_id:scopedid},
			jar: true,
			json: true
		}, (function (err, res, body) {
			if(!err && res.statusCode == 200 && typeof body.results != 'undefined'){
				var json = body.results;
				json.format = (json["MD5_ORIGIN"].split('.').pop() == "flac" ? "9" : "3");
				json.downloadUrl = self.getDownloadUrl(json["MD5_ORIGIN"], json["SNG_ID"], 0 ,parseInt(json["MEDIA_VERSION"]));
				callback(json);
			} else {
				callback(null, new Error("Unable to get Track " + id));
			}
		}).bind(self));
	})
}

Deezer.prototype.getTrack = function(id, maxBitrate, fallbackBitrate, callback) {
	var scopedid = id;
	var self = this;
	self.getToken().then(data=>{
		request.post({
			url: self.apiUrl,
			headers: self.httpHeaders,
			strictSSL: false,
			qs: {
				api_version: "1.0",
				input: "3",
				api_token: data,
				method: "deezer.pageTrack"
			},
			body: {sng_id:scopedid},
			jar: true,
			json: true
		}, (function (err, res, body) {
			if(!err && res.statusCode == 200 && typeof body.results != 'undefined'){
				var json = body.results.DATA;
				if (body.results.LYRICS){
					json.LYRICS_SYNC_JSON = body.results.LYRICS.LYRICS_SYNC_JSON;
					json.LYRICS_TEXT = body.results.LYRICS.LYRICS_TEXT;
				}
				if(json["TOKEN"]) {
					callback(null, new Error("Uploaded Files are currently not supported"));
					return;
				}
				var id = json["SNG_ID"];
				var md5Origin = json["MD5_ORIGIN"];
				var format;
				switch(maxBitrate){
					case "9":
						format = 9;
						if (json["FILESIZE_FLAC"]>0) break;
						if (!fallbackBitrate) return callback(null, new Error("Song not found at desired bitrate."))
					case "3":
						format = 3;
						if (json["FILESIZE_MP3_320"]>0) break;
						if (!fallbackBitrate) return callback(null, new Error("Song not found at desired bitrate."))
					case "5":
						format = 5;
						if (json["FILESIZE_MP3_256"]>0) break;
						if (!fallbackBitrate) return callback(null, new Error("Song not found at desired bitrate."))
					case "1":
						format = 1;
						if (json["FILESIZE_MP3_128"]>0) break;
						if (!fallbackBitrate) return callback(null, new Error("Song not found at desired bitrate."))
					default:
						format = 8;
				}
				json.format = format;
				var mediaVersion = parseInt(json["MEDIA_VERSION"]);
				json.downloadUrl = self.getDownloadUrl(md5Origin, id, format, mediaVersion);
				callback(json);
			} else {
				callback(null, new Error("Unable to get Track " + id));
			}
		}).bind(self));
	})
}

Deezer.prototype.search = function(text, type, callback) {
	if(typeof type === "function") {
		callback = type;
		type = "";
	} else {
		type += "?";
	}

	request.get({url: "https://api.deezer.com/search/" + type + "q=" + text, strictSSL: false, headers: this.httpHeaders, jar: true}, function(err, res, body) {
		if(!err && res.statusCode == 200) {
			var json = JSON.parse(body);
			if(json.error) {
				callback(new Error("Wrong search type/text: " + text));
				return;
			}
			callback(json);
		} else {
			callback(new Error("Unable to reach Deezer API"));
		}
	});
}

Deezer.prototype.track2ID = function(artist, track, album, callback, trim=false) {
	var self = this;
	artist = artist.replace(/–/g,"-").replace(/’/g, "'");
	track = track.replace(/–/g,"-").replace(/’/g, "'");
	if (album) album = album.replace(/–/g,"-").replace(/’/g, "'");
	if (album){
		request.get({url: 'https://api.deezer.com/search/?q=track:"'+encodeURIComponent(track)+'" artist:"'+encodeURIComponent(artist)+'" album:"'+encodeURIComponent(album)+'"&limit=1&strict=on', strictSSL: false, headers: this.httpHeaders, jar: true}, function(err, res, body) {
			if(!err && res.statusCode == 200) {
				var json = JSON.parse(body);
				if(json.error) {
					if (json.error.code == 4){
						self.track2ID(artist, track, album, callback, trim);
						return;
					}else{
						callback({id:0, name: track, artist: artist}, new Error(json.error.code+" - "+json.error.message));
						return;
					}
				}
				if (json.data && json.data[0]){
					if (json.data[0].title_version && json.data[0].title.indexOf(json.data[0].title_version) == -1){
						json.data[0].title += " "+json.data[0].title_version
					}
					callback({id:json.data[0].id, name: json.data[0].title, artist: json.data[0].artist.name});
				}else {
					if (!trim){
						if (track.indexOf("(") < track.indexOf(")")){
							self.track2ID(artist, track.split("(")[0], album, callback, true);
							return;
						}else if (track.indexOf(" - ")>0){
							self.track2ID(artist, track.split(" - ")[0], album, callback, true);
							return;
						}else{
							self.track2ID(artist, track, null, callback, true);
						}
					}else{
						self.track2ID(artist, track, null, callback, true);
					}
				}
			} else {
				self.track2ID(artist, track, album, callback, trim);
				return;
			}
		});
	}else{
		request.get({url: 'https://api.deezer.com/search/?q=track:"'+encodeURIComponent(track)+'" artist:"'+encodeURIComponent(artist)+'"&limit=1&strict=on', strictSSL: false, headers: this.httpHeaders, jar: true}, function(err, res, body) {
			if(!err && res.statusCode == 200) {
				var json = JSON.parse(body);
				if(json.error) {
					if (json.error.code == 4){
						self.track2ID(artist, track, null, callback, trim);
						return;
					}else{
						callback({id:0, name: track, artist: artist}, new Error(json.error.code+" - "+json.error.message));
						return;
					}
				}
				if (json.data && json.data[0]){
					if (json.data[0].title_version && json.data[0].title.indexOf(json.data[0].title_version) == -1){
						json.data[0].title += " "+json.data[0].title_version
					}
					callback({id:json.data[0].id, name: json.data[0].title, artist: json.data[0].artist.name});
				}else {
					if (!trim){
						if (track.indexOf("(") < track.indexOf(")")){
							self.track2ID(artist, track.split("(")[0], null, callback, true);
							return;
						}else if (track.indexOf(" - ")>0){
							self.track2ID(artist, track.split(" - ")[0], null, callback, true);
							return;
						}else{
							callback({id:0, name: track, artist: artist}, new Error("Track not Found"));
							return;
						}
					}else{
						callback({id:0, name: track, artist: artist}, new Error("Track not Found"));
						return;
					}
				}
			} else {
				self.track2ID(artist, track, null, callback, trim);
				return;
			}
		});
	}
}

Deezer.prototype.hasTrackAlternative = function(id, callback) {
	var scopedid = id;
	var self = this;
	request.get({url: "https://www.deezer.com/track/"+id,strictSSL: false, headers: this.httpHeaders, jar: true}, (function(err, res, body) {
		var regex = new RegExp(/<script>window\.__DZR_APP_STATE__ = (.*)<\/script>/g);
		var rexec = regex.exec(body);
		var _data;
		try{
			_data = rexec[1];
		}catch(e){
			callback(null, new Error("Unable to get Track " + scopedid));
		}
		if(!err && res.statusCode == 200 && typeof JSON.parse(_data)["DATA"] != 'undefined') {
			var json = JSON.parse(_data)["DATA"];
			if(json.FALLBACK){
				callback(json.FALLBACK);
			}else{
				callback(null, new Error("Unable to get Track " + scopedid));
			}
		} else {
			callback(null, new Error("Unable to get Track " + scopedid));
		}
	}).bind(self));
}

Deezer.prototype.getDownloadUrl = function(md5Origin, id, format, mediaVersion) {
	var urlPart = md5Origin + "¤" + format + "¤" + id + "¤" + mediaVersion;
	var md5sum = crypto.createHash('md5');
	md5sum.update(new Buffer(urlPart, 'binary'));
	md5val = md5sum.digest('hex');
	urlPart = md5val + "¤" + urlPart + "¤";
	var cipher = crypto.createCipheriv("aes-128-ecb", new Buffer("jo6aey6haid2Teih"), new Buffer(""));
	var buffer = Buffer.concat([cipher.update(urlPart, 'binary'), cipher.final()]);
	return "https://e-cdns-proxy-" + md5Origin.substring(0, 1) + ".dzcdn.net/mobile/1/" + buffer.toString("hex").toLowerCase();
}

Deezer.prototype.decryptTrack = function(writePath, track, queueId, callback) {
	var self = this;
	var chunkLength = 0;
	if (self.delStream.indexOf(queueId) == -1){
		if (typeof self.reqStream[queueId] != "object") self.reqStream[queueId] = [];
		self.reqStream[queueId].push(
			request.get({url: track.downloadUrl,strictSSL: false, headers: self.httpHeaders, encoding: 'binary'}, function(err, res, body) {
				if(!err && res.statusCode == 200) {
					var decryptedSource = decryptDownload(new Buffer(body, 'binary'), track);
					fs.outputFile(writePath,decryptedSource,function(err){
						if(err){callback(err);return;}
						callback();
					});
					if (self.reqStream[queueId]) self.reqStream[queueId].splice(self.reqStream[queueId].indexOf(this),1);
				} else {
					logger.error("Decryption error"+(err ? " | "+err : "")+ (res ? ": "+res.statusCode : ""));
					if (self.reqStream[queueId]) self.reqStream[queueId].splice(self.reqStream[queueId].indexOf(this),1);
					callback(err || new Error("Can't download the track"));
				}
			}).on("data", function(data) {
				chunkLength += data.length;
				self.onDownloadProgress(track, chunkLength);
			}).on("abort", function() {
				logger.error("Decryption aborted");
				if (self.reqStream[queueId]) self.reqStream[queueId].splice(self.reqStream[queueId].indexOf(this),1);
				callback(new Error("aborted"));
			})
		);
	}else{
		logger.error("Decryption aborted");
		callback(new Error("aborted"));
	}
}

function decryptDownload(source, track) {
	var chunk_size = 2048;
	var part_size = 0x1800;
	var blowFishKey = getBlowfishKey(track["SNG_ID"]);
	var i = 0;
	var position = 0;

	var destBuffer = new Buffer(source.length);
	destBuffer.fill(0);

	while(position < source.length) {
		var chunk;
		if ((source.length - position) >= 2048) {
			chunk_size = 2048;
		} else {
			chunk_size = source.length - position;
		}
		chunk = new Buffer(chunk_size);
		let chunkString
		chunk.fill(0);
		source.copy(chunk, 0, position, position + chunk_size);
		if(i % 3 > 0 || chunk_size < 2048){
				chunkString = chunk.toString('binary')
		}else{
			var cipher = crypto.createDecipheriv('bf-cbc', blowFishKey, new Buffer([0, 1, 2, 3, 4, 5, 6, 7]));
			cipher.setAutoPadding(false);
			chunkString = cipher.update(chunk, 'binary', 'binary') + cipher.final();
		}
		destBuffer.write(chunkString, position, chunkString.length, 'binary');
		position += chunk_size
		i++;
	}
	return destBuffer;
}


function getBlowfishKey(trackInfos) {
	const SECRET = 'g4el58wc0zvf9na1';

	const idMd5 = crypto.createHash('md5').update(trackInfos.toString(), 'ascii').digest('hex');
	let bfKey = '';

	for (let i = 0; i < 16; i++) {
		bfKey += String.fromCharCode(idMd5.charCodeAt(i) ^ idMd5.charCodeAt(i + 16) ^ SECRET.charCodeAt(i));
	}

	return bfKey;
}

Deezer.prototype.cancelDecryptTrack = function(queueId) {
	if(Object.keys(this.reqStream).length != 0) {
		if (this.reqStream[queueId]){
			while (this.reqStream[queueId][0]){
				this.reqStream[queueId][0].abort();
			}
			delete this.reqStream[queueId];
			this.delStream.push(queueId);
			return true;
		}
		return true;
	} else {
		false;
	}
}

Deezer.prototype.onDownloadProgress = function(track, progress) {
	return;
}

Deezer.prototype.getToken = async function(){
	const res = await request.get({
		url: this.apiUrl,
		headers: this.httpHeaders,
		strictSSL: false,
		qs: {
			api_version: "1.0",
			api_token: "null",
			input: "3",
			method: 'deezer.getUserData'
		},
		json: true,
		jar: true,
	})
	return res.body.results.checkForm;
}

function getJSON(url, callback){
	request.get({url: url, headers: this.httpHeaders, strictSSL: false, jar: true, json: true}, function(err, res, body) {
		if(err || res.statusCode != 200 || !body) {
			callback(null, new Error("Unable to initialize Deezer API"));
		} else {
			if (body.error) {
				if (body.error.message == "Quota limit exceeded"){
					logger.warn("Quota limit exceeded, retrying in 500ms");
					setTimeout(function(){ getJSON(url, callback); }, 500);
					return;
				}
				callback(null, new Error(body.error.message));
				return;
			}
			callback(body);
		}
	});
}
