const Track = require('./Track.js')

module.exports = class Album {
  constructor(body){
    switch (body.sourcePage){
      case 'album.getData':
        this.id = body.results.ALB_ID
        this.title = body.results.ALB_TITLE
        this.picture = body.results.ALB_PICTURE
        this.artist = {
          id: body.results.ART_ID,
          name: body.results.ART_NAME
        }
        this.label = body.results.LABEL_NAME
        this.discTotal = body.results.NUMBER_DISK
        this.trackTotal = body.results.NUMBER_TRACK
        this.explicit = body.results.EXPLICIT_ALBUM_CONTENT.EXPLICIT_LYRICS_STATUS > 0
        this.date = {
          day: body.results.PHYSICAL_RELEASE_DATE.slice(8,10),
          month: body.results.PHYSICAL_RELEASE_DATE.slice(5,7),
          year: body.results.PHYSICAL_RELEASE_DATE.slice(0, 4)
        }
      break
      case 'deezer.pageAlbum':
        this.id = body.results.DATA.ALB_ID
        this.title = body.results.DATA.ALB_TITLE
        this.picture = body.results.DATA.ALB_PICTURE
        this.artist = {
          id: body.results.DATA.ART_ID,
          name: body.results.DATA.ART_NAME
        }
        body.results.DATA.ARTISTS.forEach(artist=>{
          if (artist.__TYPE__ == "artist") this.artists.push({
            id: artist.ART_ID,
            name: artist.ART_NAME,
            picture: artist.ART_PICTURE
          })
        })
        this.label = body.results.DATA.LABEL_NAME
        this.date = {
          day: body.results.DATA.PHYSICAL_RELEASE_DATE.slice(8,10),
          month: body.results.DATA.PHYSICAL_RELEASE_DATE.slice(5,7),
          year: body.results.DATA.PHYSICAL_RELEASE_DATE.slice(0, 4)
        }
        this.explicit = body.results.DATA.EXPLICIT_ALBUM_CONTENT.EXPLICIT_LYRICS_STATUS > 0
        this.barcode = body.results.DATA.UPC
        this.trackTotal = body.results.SONGS.total
        this.tracks = []
        body.results.SONGS.data.forEach(track=>{
          track.sourcePage = 'deezer.pageAlbum'
          this.tracks.push(new Track(track))
        })
      break
    }
  }
}
