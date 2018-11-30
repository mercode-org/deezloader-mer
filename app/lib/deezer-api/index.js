const request = require('request-promise-native')
const tough = require('tough-cookie')
const querystring = require('querystring')
const Track = require('./obj/Track.js')

module.exports = class Deezer {
  constructor(){
    this.apiUrl = `http://www.deezer.com/ajax/gw-light.php`
    this.httpHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/67.0.3396.99 Safari/537.36",
      "Content-Language": "en-US",
      "Cache-Control": "max-age=0",
      "Accept": "*/*",
      "Accept-Charset": "utf-8,ISO-8859-1;q=0.7,*;q=0.3",
      "Accept-Language": "en-US,en;q=0.9,en-US;q=0.8,en;q=0.7"
    }
    this.albumPicturesHost = `https://e-cdns-images.dzcdn.net/images/cover/`
    this.user = {}
    this.jar = new tough.CookieJar()
  }
  
  getCookies(){
    return this.jar.getCookiesSync("https://www.deezer.com")
  }

  setCookies(cookies){
    JSON.parse("{\"a\": "+cookies+"}").a.forEach(x => {
      this.jar.setCookieSync(tough.Cookie.fromJSON(x), "https://www.deezer.com")
    })
  }

  async getToken(){
    var tokenData = await this.apiCall('deezer.getUserData')
    return tokenData.results.checkForm
  }

  // Simple function to request data from the hidden API (gw-light.php)
  async apiCall(method, args = {}){
    var result = await request.post(this.apiUrl, args,{
      params: {
        api_version: "1.0",
        api_token: (method === "deezer.getUserData" ? "null" : await this.getToken()),
        input: "3",
        method: method
      },
      jar: this.jar,
      withCredentials: true,
      headers: this.httpHeaders
    })
    result.data.statusCode = result.status
    return result.data
  }

  // Login function
  async login(mail, password){
    try{
      // The new login page requires a checkFormLogin field
      // We can get that from the hidden API
      var checkFormLogin = await this.apiCall("deezer.getUserData")
      if (checkFormLogin.statusCode != 200)
        throw new Error(`Can't connect to Deezer: ${checkFormLogin.statusCode}`)
      // Now we'll ask to login
      var loginForm = querystring.stringify({
        type:'login',
        mail: mail,
        password: password,
        checkFormLogin: checkFormLogin.results.checkFormLogin
      })
      try{
        var login = await request({
          method: 'POST',
          url: `https://www.deezer.com/ajax/action.php`,
          data: loginForm,
          headers: {
            ...this.httpHeaders,
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'Content-Length': loginForm.length,
          },
          jar: this.jar,
          withCredentials: true
        })
      } catch(err){
        throw new Error(`Can't connect to Deezer: ${err.message}`)
      }
      if (login.status != 200)
        throw new Error(`Can't connect to Deezer: ${login.status}`)
      if (!login.data.includes('success'))
        throw new Error(`Wrong e-mail or password`)
      // Next we'll get the user data, so we can display playlists the name, images from the user
      var userData = await this.apiCall("deezer.getUserData")
      if (userData.statusCode != 200)
        throw new Error(`Can't connect to Deezer: ${userData.statusCode}`)
      let user = {
        email: mail,
        id: userData.results.USER.USER_ID,
        name: userData.results.USER.BLOG_NAME,
        picture: userData.results.USER.USER_PICTURE ? `https://e-cdns-images.dzcdn.net/images/user/${userData.results.USER.USER_PICTURE}/250x250-000000-80-0-0.jpg` : ""
      }
      return user
    } catch(err){
      throw new Error(`Can't connect to Deezer: ${err.message}`)
    }
  }

  // Login via cookie function
  async loginViaCookies(cookies){
    try{
      this.setCookies(cookies)
      var userData = await this.apiCall("deezer.getUserData")
      if (userData.statusCode != 200)
        throw new Error(`Can't connect to Deezer: ${userData.statusCode}`)
      console.log(userData.results.USER)
      let user = {
        email: userData.results.USER.EMAIL,
        id: userData.results.USER.USER_ID,
        name: userData.results.USER.BLOG_NAME,
        picture: userData.results.USER.USER_PICTURE ? `https://e-cdns-images.dzcdn.net/images/user/${userData.results.USER.USER_PICTURE}/250x250-000000-80-0-0.jpg` : ""
      }
      return user
    } catch(err){
      throw new Error(`Can't connect to Deezer: ${err.message}`)
    }
  }

  async getTrack(id, settings = {}){
    var body
    if (id<0){
      body = await this.apiCall('song.getData', {sng_id: id})
      body.type = -1
    }else{
      body = await this.apiCall('deezer.pageTrack', {sng_id: id})
      body.type = 0
    }
    return new Track(body)
  }

  async getAlbum(id){
    var body = await this.apiCall('album.getData', {alb_id: id})
    return body
  }

  async getAlbumTracks(id){
    var body = await this.apiCall('song.getListByAlbum', {alb_id: id, nb: -1})
    return body.results
  }

  async getArtist(id){
    var body = await this.apiCall('deezer.pageArtist', {art_id: id})
    return body
  }

  async getPlaylist(id){
    var body = await this.apiCall('deezer.pagePlaylist', {playlist_id: id})
    return body
  }

  async getPlaylistTracks(id){
    var body = await this.apiCall('playlist.getSongs', {playlist_id: id, nb: -1})
    return body.results
  }
}
