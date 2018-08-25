const NRrequest = require('request');
const request = require('requestretry').defaults({maxAttempts: 2147483647, retryDelay: 1000, timeout: 8000});
const crypto = require('crypto');
const fs = require("fs-extra");
const logger = require('./logger.js');

module.exports = new Deezer();

function Deezer() {
	this.apiUrl = "http://www.deezer.com/ajax/gw-light.php";
	this.apiQueries = {
		api_version: "1.0",
		api_token: "null",
		input: "3"
	};
	this.httpHeaders = {
		"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/62.0.3202.75 Safari/537.36",
		"Content-Language": "en-US",
		"Cache-Control": "max-age=0",
		"Accept": "*/*",
		"Accept-Charset": "utf-8,ISO-8859-1;q=0.7,*;q=0.3",
		"Accept-Language": "de-DE,de;q=0.8,en-US;q=0.6,en;q=0.4"
	}
	this.albumPicturesHost = "https://e-cdns-images.dzcdn.net/images/cover/";
	this.reqStream = null;
}

Deezer.prototype.init = function(username, password, callback) {
	var self = this;
	NRrequest.post({url: "https://www.deezer.com/ajax/action.php", headers: this.httpHeaders, form: {type:'login',mail:username,password:password}, jar: true}, (function(err, res, body) {
		if(err || res.statusCode != 200) {
			callback(new Error("Unable to load deezer.com"));
		}else if(body.indexOf("success") > -1){
			request.get({url: "https://www.deezer.com/", headers: this.httpHeaders, jar: true}, (function(err, res, body) {
				if(!err && res.statusCode == 200) {
					var regex = new RegExp(/((?!"api_key\\":\\").*(?=\\"))/g);
					var _token = regex.exec(body);
					if(_token instanceof Array && _token[1]) {
						self.apiQueries.api_token = _token[1];
						callback(null, null);
					} else {
						callback(new Error("Unable to initialize Deezer API"));
					}
				} else {
					callback(new Error("Unable to load deezer.com"));
				}
			}).bind(self));
		}else{
			callback(new Error("Incorrect email or password."));
		}
	}));
}



Deezer.prototype.getPlaylist = function(id, callback) {
	getJSON("https://api.deezer.com/playlist/" + id, function(res){
		if (!(res instanceof Error)){
			callback(res);
		} else {
			callback(null, res)
		}
	});
}

Deezer.prototype.getAlbum = function(id, callback) {
	getJSON("https://api.deezer.com/album/" + id, function(res){
		if (!(res instanceof Error)){
			callback(res);
		} else {
			callback(null, res)
		}
	});
}

Deezer.prototype.getATrack = function(id, callback) {
	getJSON("https://api.deezer.com/track/" + id, function(res){
		if (!(res instanceof Error)){
			callback(res);
		} else {
			callback(null, res)
		}
	});
}

Deezer.prototype.getArtist = function(id, callback) {
	getJSON("https://api.deezer.com/artist/" + id, function(res){
		if (!(res instanceof Error)){
			callback(res);
		} else {
			callback(null, res)
		}
	});

}

Deezer.prototype.getPlaylistSize = function(id, callback) {
	getJSON("https://api.deezer.com/playlist/" + id + "/tracks?limit=1", function(res){
		if (!(res instanceof Error)){
			callback(res.total);
		} else {
			callback(null, res)
		}
	});

}

Deezer.prototype.getPlaylistTracks = function(id, callback) {
	getJSON("https://api.deezer.com/playlist/" + id + "/tracks?limit=-1", function(res){
		if (!(res instanceof Error)){
			callback(res)
		} else {
			callback(null, res)
		}
	});
}

Deezer.prototype.getAlbumSize = function(id, callback) {
	getJSON("https://api.deezer.com/album/" + id + "/tracks?limit=1", function(res){
		if (!(res instanceof Error)){
			callback(res.total);
		} else {
			callback(null, res)
		}
	});

}

Deezer.prototype.getAlbumTracks = function(id, callback) {
	getJSON("https://api.deezer.com/album/" + id + "/tracks?limit=-1", function(res){
		if (!(res instanceof Error)){
			callback(res);
		} else {
			callback(null, res)
		}

	});
}

Deezer.prototype.getArtistAlbums = function(id, callback) {
	getJSON("https://api.deezer.com/artist/" + id + "/albums?limit=-1", function(res){
		if (!(res instanceof Error)){
			if(!res.data) {
				res.data = [];
			}
			callback(res);
		} else {
			callback(null, res)
		}
	});
}

/*
**	CHARTS
** 	From user https://api.deezer.com/user/637006841/playlists?limit=-1
*/
Deezer.prototype.getChartsTopCountry = function(callback) {
	getJSON("https://api.deezer.com/user/637006841/playlists?limit=-1", function(res){
		if (!(res instanceof Error)){
			if(!res.data) {
				res.data = [];
			} else {
				//Remove "Loved Tracks"
				res.data.shift();
			}
			callback(res);
		} else {
			callback(null, res)
		}
	});

}

Deezer.prototype.getTrack = function(id, wantFlac, callback) {
	var scopedid = id;
	var self = this;
	request.get({url: "https://www.deezer.com/track/"+id, headers: this.httpHeaders, jar: true}, (function(err, res, body) {
		var regex = new RegExp(/<script>window\.__DZR_APP_STATE__ = (.*)<\/script>/g);
		var rexec = regex.exec(body);
		var _data;
		try{
			_data = rexec[1];
		}catch(e){
			callback(new Error("Unable to get Track"));
			return;
		}
		if(!err && res.statusCode == 200 && typeof JSON.parse(_data)["DATA"] != 'undefined') {
			var json = JSON.parse(_data)["DATA"];
			var lyrics = JSON.parse(_data)["LYRICS"];
			if(lyrics){
				json["LYRICS_TEXT"] = lyrics["LYRICS_TEXT"];
				json["LYRICS_SYNC_JSON"] = lyrics["LYRICS_SYNC_JSON"];
				json["LYRICS_COPYRIGHTS"] = lyrics["LYRICS_COPYRIGHTS"];
				json["LYRICS_WRITERS"] = lyrics["LYRICS_WRITERS"];
			}
			if(json["TOKEN"]) {
				callback(new Error("Uploaded Files are currently not supported"));
				return;
			}
			var id = json["SNG_ID"];
			var md5Origin = json["MD5_ORIGIN"];
			var format;
			if(wantFlac && json["FILESIZE_FLAC"] > 0){
				format = 9;
			}else{
				format = 3;
				if(json["FILESIZE_MP3_320"] <= 0) {
					if(json["FILESIZE_MP3_256"] > 0) {
						format = 5;
					} else {
						format = 1;
					}
				}
			}
			json.format = format;
			var mediaVersion = parseInt(json["MEDIA_VERSION"]);
			json.downloadUrl = self.getDownloadUrl(md5Origin, id, format, mediaVersion);
			self.getATrack(id,function(trckjson, err){
				if (err)
					json["BPM"] = 0;
				else
					json["BPM"] = trckjson["bpm"];
				callback(json);
			});
		} else {
			callback(new Error("Unable to get Track " + id));
		}
	}).bind(self));
}

Deezer.prototype.search = function(text, type, callback) {
	if(typeof type === "function") {
		callback = type;
		type = "";
	} else {
		type += "?";
	}
	request.get({url: "https://api.deezer.com/search/" + type + "q=" + text, headers: this.httpHeaders, jar: true}, function(err, res, body) {
		if(!err && res.statusCode == 200) {
			var json = JSON.parse(body);
			if(json.error) {
				callback(null, new Error("Wrong search type/text: " + text));
				return;
			}
			callback(json);
		} else {
			callback(null, new Error("Unable to reach Deezer API"));
		}
	});
}

Deezer.prototype.track2ID = function(artist, track, callback, trim=false) {
	var self = this;
	request.get({url: 'https://api.deezer.com/search/?q=track:"'+encodeURIComponent(track)+'" artist:"'+encodeURIComponent(artist)+'"&limit=1', headers: this.httpHeaders, jar: true}, function(err, res, body) {
		if(!err && res.statusCode == 200) {
			var json = JSON.parse(body);
			if(json.error) {
				if (json.error.code == 4){
					self.track2ID(artist, track, callback, trim);
					return;
				}else{
					callback(0, new Error(json.error.code+" - "+json.error.message));
					return;
				}
			}
			if (json.total>0){
				callback(json.data[0].id);
			}else {
				if (!trim){
					if (track.indexOf("(") < track.indexOf(")")){
						self.track2ID(artist, track.split("(")[0], callback, true);
						return;
					}else if (track.indexOf(" - ")>0){
						self.track2ID(artist, track.split(" - ")[0], callback, true);
						return;
					}else{
						callback(0, new Error("Track not Found"));
						return;
					}
				}else{
					callback(0, new Error("Track not Found"));
					return;
				}
			}
		} else {
			self.track2ID(artist, track, callback, trim);
			return;
		}
	});
}

Deezer.prototype.hasTrackAlternative = function(id, callback) {
	var scopedid = id;
	var self = this;
	request.get({url: "https://www.deezer.com/track/"+id, headers: this.httpHeaders, jar: true}, (function(err, res, body) {
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

Deezer.prototype.decryptTrack = function(writePath, track, callback) {
	var self = this;
	var chunkLength = 0;
	this.reqStream = request.get({url: track.downloadUrl, headers: this.httpHeaders, jar: true, encoding: null}, function(err, res, body) {
		if(!err && res.statusCode == 200) {
			var decryptedSource = decryptDownload(new Buffer(body, 'binary'), track);
			fs.outputFile(writePath,decryptedSource,function(err){
				if(err){callback(err);return;}
				callback();
			});
		} else {
			logger.logs("Error","Decryption error");
			callback(err || new Error("Can't download the track"));
		}
	}).on("data", function(data) {
		chunkLength += data.length;
		self.onDownloadProgress(track, chunkLength);
	}).on("abort", function() {
		logger.logs("Error","Decryption aborted");
		callback(new Error("aborted"));
	});
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
		chunk.fill(0);
		source.copy(chunk, 0, position, position + chunk_size);
		if(i % 3 > 0 || chunk_size < 2048){
			//Do nothing
		}else{
			var cipher = crypto.createDecipheriv('bf-cbc', blowFishKey, new Buffer([0, 1, 2, 3, 4, 5, 6, 7]));
			cipher.setAutoPadding(false);
			chunk = cipher.update(chunk, 'binary', 'binary') + cipher.final();
		}
		destBuffer.write(chunk.toString("binary"), position, 'binary');
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

Deezer.prototype.cancelDecryptTrack = function() {
	if(this.reqStream) {
		this.reqStream.abort();
		this.reqStream = null;
		return true;
	} else {
		false;
	}
}

Deezer.prototype.onDownloadProgress = function(track, progress) {
	return;
}

function getJSON(url, callback){
	request.get({url: url, headers: this.httpHeaders, jar: true}, function(err, res, body) {
		if(err || res.statusCode != 200 || !body) {
			logger.logs("Error","Unable to initialize Deezer API");
			callback(new Error());
		} else {
			var json = JSON.parse(body);
			if (json.error) {
				logger.logs("Error","Wrong id");
				callback(new Error());
				return;
			}
			callback(json);
		}
	});
}
