const request = require('request-promise')
const tough = require('tough-cookie');
const Track = require('./obj/Track.js')
const Album = require('./obj/Album.js')
const getBlowfishKey = require('./utils.js').getBlowfishKey
const decryptChunk = require('./utils.js').decryptChunk
const sleep = require('./utils.js').sleep

module.exports = class Deezer {
  constructor(){
    this.apiUrl = `http://www.deezer.com/ajax/gw-light.php`
    this.legacyApiUrl = `https://api.deezer.com/`
    this.httpHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36",
      "Content-Language": "en-US",
      "Cache-Control": "max-age=0",
      "Accept": "*/*",
      "Accept-Charset": "utf-8,ISO-8859-1;q=0.7,*;q=0.3",
      "Accept-Language": "en-US,en;q=0.9,en-US;q=0.8,en;q=0.7",
      "Connection": 'keep-alive'
    }
    this.albumPicturesHost = `https://e-cdns-images.dzcdn.net/images/cover/`
    this.artistPictureHost = `https://e-cdns-images.dzcdn.net/images/artist/`
    this.user = {}
    this.jar = request.jar()
  }

  getCookies(){
    return this.jar.getCookies("https://www.deezer.com")
  }

  setCookies(cookies){
    JSON.parse("{\"a\": "+cookies+"}").a.forEach(x => {
      this.jar.setCookie(tough.Cookie.fromJSON(x), "https://www.deezer.com")
    })
  }

  async getToken(){
    var tokenData = await this.apiCall('deezer.getUserData')
    return tokenData.results.checkForm
  }

  // Simple function to request data from the hidden API (gw-light.php)
  async apiCall(method, args = {}){
    var result = await request({
      uri: this.apiUrl,
      method: 'POST',
      qs: {
        api_version: "1.0",
        api_token: (method === "deezer.getUserData" ? "null" : await this.getToken()),
        input: "3",
        method: method
      },
      body: args,
      jar: this.jar,
      json: true,
      headers: this.httpHeaders
    })
    return result
  }

  // Simple function to request data from the legacy API (api.deezer.com)
  async legacyApiCall(method, args = {}){
    var result = await request({
      uri: `${this.legacyApiUrl}${method}`,
      method: 'GET',
      qs: args,
      jar: this.jar,
      json: true,
      headers: this.httpHeaders
    })
    if (result.error){
      if (result.error.code == 4){
        await sleep(500)
        return await legacyApiCall(method, args)
      }else{
        throw new Error(`${result.error.type}: ${result.error.message}`)
      }
    }
    return result
  }

  // Login function
  async login(mail, password){
    try{
      // The new login page requires a checkFormLogin field
      // We can get that from the hidden API
      var checkFormLogin = await this.apiCall("deezer.getUserData")
      // Now we'll ask to login
      var login = await request({
        method: 'POST',
        url: `https://www.deezer.com/ajax/action.php`,
        form: {
          type:'login',
          mail: mail,
          password: password,
          checkFormLogin: checkFormLogin.results.checkFormLogin
        },
        headers: {
          ...this.httpHeaders,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        jar: this.jar,
        withCredentials: true
      })
      if (!login.includes('success'))
        throw new Error(`Wrong e-mail or password`)
      // Next we'll get the user data, so we can display playlists the name, images from the user
      var userData = await this.apiCall(`deezer.getUserData`)
      this.user = {
        email: mail,
        id: userData.results.USER.USER_ID,
        name: userData.results.USER.BLOG_NAME,
        picture: userData.results.USER.USER_PICTURE ? `https://e-cdns-images.dzcdn.net/images/user/${userData.results.USER.USER_PICTURE}/250x250-000000-80-0-0.jpg` : ""
      }
      return true
    } catch(err){
      throw new Error(`Can't connect to Deezer: ${err.message}`)
    }
  }

  // Login via cookie function
  async loginViaCookies(cookies, email){
    try{
      this.setCookies(cookies)
      var userData = await this.apiCall(`deezer.getUserData`)
      if (!userData.results.USER.USER_ID) throw new Error('Cookie expired, please login again.')
      this.user = {
        email: email,
        id: userData.results.USER.USER_ID,
        name: userData.results.USER.BLOG_NAME,
        picture: userData.results.USER.USER_PICTURE ? `https://e-cdns-images.dzcdn.net/images/user/${userData.results.USER.USER_PICTURE}/250x250-000000-80-0-0.jpg` : ""
      }
      return true
    } catch(err){
      throw new Error(`Can't connect to Deezer: ${err.message}`)
    }
  }

  async getTrack(id, settings = {}){
    var body
    if (id<0){
      body = await this.apiCall(`song.getData`, {sng_id: id})
      body.sourcePage = 'song.getData'
      body.type = -1
    }else{
      body = await this.apiCall(`deezer.pageTrack`, {sng_id: id})
      body.sourcePage = 'deezer.pageTrack'
      body.type = 0
    }
    return new Track(body)
  }

  async getAlbum(id){
    var body = await this.apiCall(`album.getData`, {alb_id: id})
    body.sourcePage = 'album.getData'
    /*
    Alternative query, currently not used
      var body = await this.apiCall(`deezer.pageAlbum`, {alb_id: id, lang: 'en'})
      body.sourcePage = 'deezer.pageAlbum'
    */
    return new Album(body)
  }

  async getAlbumTracks(id){
    var tracksArray = []
    var body = await this.apiCall(`song.getListByAlbum`, {alb_id: id, nb: -1})
    body.results.data.forEach(track=>{
      track.sourcePage = 'song.getListByAlbum'
      tracksArray.push(new Track(track))
    })
    return tracksArray
  }

  async getArtist(id){
    var body = await this.apiCall(`deezer.pageArtist`, {art_id: id})
    return body
  }

  async getPlaylist(id){
    var body = await this.apiCall(`deezer.pagePlaylist`, {playlist_id: id})
    return body
  }

  async getPlaylistTracks(id){
    var tracksArray = []
    var body = await this.apiCall(`playlist.getSongs`, {playlist_id: id, nb: -1})
    body.results.data.forEach((track, index)=>{
      track.sourcePage = 'playlist.getSongs'
      let _track = new Track(track)
      _track.position = index
      tracksArray.push(_track)
    })
    return tracksArray
  }

  async getLyrics(id){
    var body = await this.apiCall(`song.getLyrics`, {sng_id: id})
    let lyr
    lyr.unsyncLyrics = {
      description: "",
      lyrics: body.results.LYRICS_TEXT
    }
    lyr.syncLyrics = ""
    for(let i=0; i < body.results.LYRICS_SYNC_JSON.length; i++){
      if(body.results.LYRICS_SYNC_JSON[i].lrc_timestamp){
        this.syncLyrics += body.results.LYRICS_SYNC_JSON[i].lrc_timestamp + body.results.LYRICS_SYNC_JSON[i].line+"\r\n";
      }else if(i+1 < body.results.LYRICS_SYNC_JSON.length){
        this.syncLyrics += body.results.LYRICS_SYNC_JSON[i+1].lrc_timestamp + body.results.LYRICS_SYNC_JSON[i].line+"\r\n";
      }
    }
    return lyr
  }

  async legacyGetUserPlaylists(id){
    var body = await this.legacyApiCall(`user/${id}/playlists`, {limit: -1})
    return body
  }

  async legacyGetTrack(id){
    var body = await this.legacyApiCall(`track/${id}`)
    return body
  }

  async legacyGetChartsTopCountry(){
    return await this.legacyGetUserPlaylists('637006841')
  }

  async legacyGetPlaylist(id){
    var body = await this.legacyApiCall(`playlist/${id}`)
    return body
  }

  async legacyGetPlaylistTracks(id){
    var body = await this.legacyApiCall(`playlist/${id}/tracks`, {limit: -1})
    return body
  }

  async legacyGetAlbum(id){
    var body = await this.legacyApiCall(`album/${id}`)
    return body
  }

  async legacyGetAlbumTracks(id){
    var body = await this.legacyApiCall(`album/${id}/tracks`, {limit: -1})
    return body
  }

  async legacyGetArtistAlbums(id){
    var body = await this.legacyApiCall(`artist/${id}/albums`, {limit: -1})
    return body
  }

  async legacySearch(term, type){
    var body = await this.legacyApiCall(`search/${type}`, {q: term})
    if(body.error) {
      throw new Error("Wrong search type/text: " + text)
    }
    return body
  }

  decryptDownload(source, trackId) {
  	var chunk_size = 2048
  	var part_size = 0x1800
  	var blowFishKey = getBlowfishKey(trackId)
  	var i = 0
  	var position = 0

  	var destBuffer = Buffer.alloc(source.length)
  	destBuffer.fill(0)

  	while(position < source.length) {
  		var chunk
  		if ((source.length - position) >= 2048)
  			chunk_size = 2048
  		else
  			chunk_size = source.length - position
  		chunk = Buffer.alloc(chunk_size)
  		let chunkString
  		chunk.fill(0)
  		source.copy(chunk, 0, position, position + chunk_size)
  		if(i % 3 > 0 || chunk_size < 2048)
  			chunkString = chunk.toString('binary')
  		else
  			chunkString = decryptChunk(chunk, blowFishKey)
  		destBuffer.write(chunkString, position, chunkString.length, 'binary')
  		position += chunk_size
  		i++
  	}
  	return destBuffer
  }
}
