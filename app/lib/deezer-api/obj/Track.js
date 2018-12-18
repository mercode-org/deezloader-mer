const _md5 = require('../utils.js').md5
const _ecbCrypt = require('../utils.js').ecbCrypt

module.exports = class Track {
  constructor(body){
    switch(body.sourcePage){
      case 'song.getData':
        this.id = body.results.SNG_ID
        this.title = body.results.SNG_TITLE
        this.duration = body.results.DURATION
        this.MD5 = body.results.MD5_ORIGIN
        this.mediaVersion = body.results.MEDIA_VERSION
        if (body.type == -1){
          this.filesize = body.results.FILESIZE
          this.album = {id: 0, title: body.results.ALB_NAME, picture: body.results.ALB_PICTURE}
          this.artist = {id: 0, name: body.results.ART_NAME}
          this.artists = [{id: 0, name: body.results.ART_NAME}]
          this.recordType = -1
        }else{
          this.filesize = {
            default: parseInt(body.results.FILESIZE),
            mp3_128: parseInt(body.results.FILESIZE_MP3_128),
            mp3_320: parseInt(body.results.FILESIZE_MP3_320),
            flac: parseInt(body.results.FILESIZE_FLAC),
          }
          this.album = {id: body.results.ALB_ID, title: body.results.ALB_NAME, picture: body.results.ALB_PICTURE}
          this.artist = {id: body.results.ART_ID, name: body.results.ART_NAME}
          this.artists = []
          body.results.ARTISTS.forEach(artist=>{
            if (artist.__TYPE__ == "artist") this.artists.push({
              id: artist.ART_ID,
              name: artist.ART_NAME,
              picture: artist.ART_PICTURE
            })
          })
          this.gain = body.results.GAIN
          this.discNumber = body.results.DISK_NUMBER
          this.trackNumber = body.results.TRACK_NUMBER
          this.explicit = body.results.EXPLICIT_LYRICS
          this.ISRC = body.results.ISRC
          this.contributor = body.results.SNG_CONTRIBUTORS
          this.lyricsId = body.results.LYRICS_ID
          this.date = {
            day: body.results.PHYSICAL_RELEASE_DATE.slice(8,10),
            month: body.results.PHYSICAL_RELEASE_DATE.slice(5,7),
            year: body.results.PHYSICAL_RELEASE_DATE.slice(0, 4)
          }
        }
      break
      case 'deezer.pageTrack':
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
        this.album = {id: body.results.DATA.ALB_ID, title: body.results.DATA.ALB_TITLE, picture: body.results.DATA.ALB_PICTURE}
        this.artist = {id: body.results.DATA.ART_ID, name: body.results.DATA.ART_NAME, picture: body.results.DATA.ART_PICTURE}
        this.artists = []
        body.results.DATA.ARTISTS.forEach(artist=>{
          if (artist.__TYPE__ == "artist") this.artists.push({
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
        if (body.results.LYRICS){
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
        }
        this.date = {
          day: body.results.DATA.PHYSICAL_RELEASE_DATE.slice(8,10),
          month: body.results.DATA.PHYSICAL_RELEASE_DATE.slice(5,7),
          year: body.results.DATA.PHYSICAL_RELEASE_DATE.slice(0, 4)
        }
      break
      case 'deezer.pageAlbum':
        this.id = body.SNG_ID
        this.title = `${body.SNG_TITLE}${body.VERSION ? ` ${body.VERSION}`: ""}`
        this.duration = body.DURATION
        this.filesize = {
          default: parseInt(body.FILESIZE),
          mp3_128: parseInt(body.FILESIZE_MP3_128),
          mp3_320: parseInt(body.FILESIZE_MP3_320),
          flac: parseInt(body.FILESIZE_FLAC),
        }
        this.MD5 = body.MD5_ORIGIN
        this.mediaVersion = body.MEDIA_VERSION
        this.fallbackId = (body.FALLBACK ? (body.FALLBACK.SNG_ID ? body.FALLBACK.SNG_ID : 0) : 0)
        this.album = {id: body.ALB_ID, title: body.ALB_TITLE, picture: body.ALB_PICTURE}
        this.artist = {id: body.ART_ID, name: body.ART_NAME, picture: body.ART_PICTURE}
        this.artists = []
        body.ARTISTS.forEach(artist=>{
          if (artist.__TYPE__ == "artist") this.artists.push({
            id: artist.ART_ID,
            name: artist.ART_NAME,
            picture: artist.ART_PICTURE
          })
        })
        this.gain = body.GAIN
        this.discNumber = body.DISK_NUMBER
        this.trackNumber = body.TRACK_NUMBER
        this.explicit = body.EXPLICIT_LYRICS
        this.ISRC = body.ISRC
        this.recordType = body.TYPE
        this.contributor = body.SNG_CONTRIBUTORS
        this.lyricsId = body.LYRICS_ID
      break
      case 'song.getListByAlbum':
        this.id = body.SNG_ID
        this.title = `${body.SNG_TITLE}${body.VERSION ? ` ${body.VERSION}`: ""}`
        this.duration = body.DURATION
        this.filesize = {
          default: parseInt(body.FILESIZE),
          mp3_128: parseInt(body.FILESIZE_MP3_128),
          mp3_320: parseInt(body.FILESIZE_MP3_320),
          flac: parseInt(body.FILESIZE_FLAC),
        }
        this.MD5 = body.MD5_ORIGIN
        this.mediaVersion = body.MEDIA_VERSION
        this.fallbackId = (body.FALLBACK ? (body.FALLBACK.SNG_ID ? body.FALLBACK.SNG_ID : 0) : 0)
        this.album = {id: body.ALB_ID, title: body.ALB_TITLE, picture: body.ALB_PICTURE}
        this.artist = {id: body.ART_ID, name: body.ART_NAME, picture: body.ART_PICTURE}
        this.artistsString = []
        if (body.SNG_CONTRIBUTORS.main_artist) this.artistsString.join(body.SNG_CONTRIBUTORS.main_artist); else if (body.SNG_CONTRIBUTORS.mainartist) this.artistsString.join(body.SNG_CONTRIBUTORS.mainartist)
        if (body.SNG_CONTRIBUTORS.associatedperformer) this.artistsString.join(body.SNG_CONTRIBUTORS.associatedperformer)
        this.gain = body.GAIN
        this.discNumber = body.DISK_NUMBER
        this.trackNumber = body.TRACK_NUMBER
        this.explicit = body.EXPLICIT_LYRICS
        this.ISRC = body.ISRC
        this.recordType = body.TYPE
        this.contributor = body.SNG_CONTRIBUTORS
        this.lyricsId = body.LYRICS_ID
      break
    }
  }

  getDownloadUrl(format){
    var urlPart = this.MD5+"¤"+format+"¤"+this.id+"¤"+this.mediaVersion
    var md5val = _md5(urlPart)
    urlPart = _ecbCrypt('jo6aey6haid2Teih', md5val+"¤"+urlPart+"¤")
    return "https://e-cdns-proxy-" + this.MD5.substring(0, 1) + ".dzcdn.net/mobile/1/" + urlPart
  }
}
