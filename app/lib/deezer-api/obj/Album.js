const Track = require('./Track.js')

module.exports = class Album {
  constructor(body){
    switch (body.sourcePage){
      case 'album.getData':
        this.id = body.ALB_ID
        this.title = body.ALB_TITLE
        this.picture = body.ALB_PICTURE
        this.artist = {
          id: body.ART_ID,
          name: body.ART_NAME
        }
        this.label = body.LABEL_NAME
        this.discTotal = body.NUMBER_DISK
        this.trackTotal = body.NUMBER_TRACK
        this.explicit = body.EXPLICIT_ALBUM_CONTENT.EXPLICIT_LYRICS_STATUS > 0
        this.date = {
          day: body.PHYSICAL_RELEASE_DATE.slice(8,10),
          month: body.PHYSICAL_RELEASE_DATE.slice(5,7),
          year: body.PHYSICAL_RELEASE_DATE.slice(0, 4)
        }
      break
      case 'deezer.pageAlbum':
        this.id = body.DATA.ALB_ID
        this.title = body.DATA.ALB_TITLE
        this.picture = body.DATA.ALB_PICTURE
        this.artist = {
          id: body.DATA.ART_ID,
          name: body.DATA.ART_NAME
        }
        body.DATA.ARTISTS.forEach(artist=>{
          if (artist.__TYPE__ == "artist") this.artists.push({
            id: artist.ART_ID,
            name: artist.ART_NAME,
            picture: artist.ART_PICTURE
          })
        })
        this.label = body.DATA.LABEL_NAME
        this.date = {
          day: body.DATA.PHYSICAL_RELEASE_DATE.slice(8,10),
          month: body.DATA.PHYSICAL_RELEASE_DATE.slice(5,7),
          year: body.DATA.PHYSICAL_RELEASE_DATE.slice(0, 4)
        }
        this.explicit = body.DATA.EXPLICIT_ALBUM_CONTENT.EXPLICIT_LYRICS_STATUS > 0
        this.barcode = body.DATA.UPC
        this.trackTotal = body.SONGS.total
        this.tracks = []
        body.SONGS.data.forEach(track=>{
          track.sourcePage = 'deezer.pageAlbum'
          this.tracks.push(new Track(track))
        })
      break
    }
  }
}
