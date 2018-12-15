
const crypto = require('crypto')

function _md5 (data) {
  let md5sum = crypto.createHash('md5')
  md5sum.update(new Buffer(data, 'binary'))
  return md5sum.digest('hex')
}

function _ecbCrypt (key, data) {
  let cipher = crypto.createCipheriv("aes-128-ecb", new Buffer(key), new Buffer(""));
  return Buffer.concat([cipher.update(data, 'binary'), cipher.final()]).toString("hex").toLowerCase();
}

module.exports = class Track {
  constructor(body){
    if (body.type == -1){
      this.id = body.results.SNG_ID
      this.title = body.results.SNG_TITLE
      this.duration = body.results.DURATION
      this.filesize = body.results.FILESIZE
      this.MD5 = body.results.MD5_ORIGIN
      this.mediaVersion = body.results.MEDIA_VERSION
      this.album = {id: 0, name: body.results.ALB_NAME, picture: body.results.ALB_PICTURE}
      this.mainArtist = {id: 0, name: body.results.ART_NAME}
      this.artist = {id: 0, name: body.results.ART_NAME}
      this.recordType = -1
    } else {
      this.id = body.results.DATA.SNG_ID
      this.title = `${body.results.DATA.SNG_TITLE}${body.results.DATA.VERSION ? ` ${body.results.DATA.VERSION}`: ""}`
      this.duration = body.results.DATA.DURATION
      this.filesize = {
        default: parseInt(body.results.DATA.FILESIZE),
        mp3_128: parseInt(body.results.DATA.FILESIZE_MP3_128),
        mp3_320: parseInt(body.results.DATA.FILESIZE_MP3_320),
        flac: parseInt(body.results.DATA.FILESIZE_FLAC),
      }
      this.MD5 = body.results.DATA.MD5_ORIGIN
      this.mediaVersion = body.results.DATA.MEDIA_VERSION
      this.fallbackId = (body.results.DATA.FALLBACK ? (body.results.DATA.FALLBACK.SNG_ID ? body.results.DATA.FALLBACK.SNG_ID : 0) : 0)
      this.album = {id: body.results.DATA.ALB_ID, name: body.results.DATA.ALB_NAME, picture: body.results.DATA.ALB_PICTURE}
      this.mainArtist = {id: body.results.DATA.ART_ID, name: body.results.DATA.ART_NAME, picture: body.results.DATA.ART_PICTURE}
      this.artist = []
      body.results.DATA.ARTISTS.forEach(artist=>{
        if (artist.__TYPE__ == "artist") this.artist.push({
          id: artist.ART_ID,
          name: artist.ART_NAME,
          picture: artist.ART_PICTURE
        })
      })
      this.gain = body.results.DATA.GAIN
      this.discNumber = body.results.DATA.DISK_NUMBER
      this.trackNumber = body.results.DATA.TRACK_NUMBER
      this.explicit = body.results.DATA.EXPLICIT_LYRICS
      this.ISRC = body.results.DATA.ISRC
      this.copyright = body.results.DATA.COPYRIGHT
      this.recordType = body.results.DATA.TYPE
      this.contributor = body.results.DATA.SNG_CONTRIBUTORS
      this.unsyncLyrics = {
  			description: "",
  			lyrics: body.results.LYRICS.LYRICS_TEXT
  		}
      this.syncLyrics = ""
      for(let i=0; i < body.results.LYRICS.LYRICS_SYNC_JSON.length; i++){
				if(body.results.LYRICS.LYRICS_SYNC_JSON[i].lrc_timestamp){
					this.syncLyrics += body.results.LYRICS.LYRICS_SYNC_JSON[i].lrc_timestamp + body.results.LYRICS.LYRICS_SYNC_JSON[i].line+"\r\n";
				}else if(i+1 < body.results.LYRICS.LYRICS_SYNC_JSON.length){
					this.syncLyrics += body.results.LYRICS.LYRICS_SYNC_JSON[i+1].lrc_timestamp + body.results.LYRICS.LYRICS_SYNC_JSON[i].line+"\r\n";
				}
			}
      this.date = {
        day: body.results.DATA.PHYSICAL_RELEASE_DATE.slice(8,10),
        month: body.results.DATA.PHYSICAL_RELEASE_DATE.slice(5,7),
        year: body.results.DATA.PHYSICAL_RELEASE_DATE.slice(0, 4)
      }
    }
  }

  getDownloadUrl(format){
    var urlPart = this.MD5+"¤"+format+"¤"+this.id+"¤"+this.mediaVersion
    var md5val = _md5(urlPart)
    urlPart = _ecbCrypt('jo6aey6haid2Teih', md5val+"¤"+urlPart+"¤")
    return "https://e-cdns-proxy-" + this.MD5.substring(0, 1) + ".dzcdn.net/mobile/1/" + urlPart
  }
}
