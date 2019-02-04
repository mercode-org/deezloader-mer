const Track = require('./Track.js')

module.exports = class Album {
  constructor(body){
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
		this.barcode = body.UPC
	  this.date = {
	    day: body.PHYSICAL_RELEASE_DATE.slice(8,10),
	    month: body.PHYSICAL_RELEASE_DATE.slice(5,7),
	    year: body.PHYSICAL_RELEASE_DATE.slice(0, 4)
	  }
		if (body.ARTISTS){
			body.ARTISTS.forEach(artist=>{
			 if (artist.__TYPE__ == "artist") this.artists.push({
				 id: artist.ART_ID,
				 name: artist.ART_NAME,
				 picture: artist.ART_PICTURE
			 })
		 })
		}
	 if (body.SONGS){
		 body.SONGS.data.forEach(track=>{
 	    this.tracks.push(new Track(track))
 	  })
	 }
  }
}
