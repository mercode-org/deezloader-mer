# Deezloader Remix
### Latest Version: 4.1.3
Deezloader Remix is an improved version of Deezloader based on the Reborn branch.<br/>
With this app you can download songs, playlists and albums directly from Deezers Server in a single and well packaged app.

![](https://i.imgur.com/7Qbvu1f.png)
## Features
### Base Features
* Download MP3s and FLACs directly from Deezer Servers
* Search and Discover music from the App
* Download music directly from a URL
* Download entire Artists library
* See your public playlist on Deezer
* Tagged music files (ID3s and Vorbis Comments)
* Great UI and UX

### Exclusive to Remix
* Implementation with Spotify APIs (No third party services)
* Improved download speed
* Extensive set of options for a personalized ｅｘｐｅｒｉｅｎｃｅ
* Server mode to launch the app headless
* MOAR Optimizations

## Build
If you want to buid it yourself you will need Node.js installed and npm or yarn.<br/>
There is a missing file containing the clientSecret e clientId of my SpotifyApp (for spotify integration).<br/>
You need to get them [here](https://developer.spotify.com/dashboard/applications) and change the values from here.<br/>
```module.exports = {
  clientId: 'CLIENTID_HERE',
  clientSecret: 'CLIENTSECRET_HERE'
}```<br/>
The file should be put into `./app/authCredentials.js` (the same folder where `deezer-api.js` is).<br/>
Then to build it you just need to run `npm install` or `yarn install` and after that `compile<OS>.sh` or `.bat`.<br/>

## Disclaimer
I am not responsible for the usage of this program by other people.<br/>
I do not recommend you doing this illegally or against Deezer's terms of service.<br/>
This project is licensed under [GNU GPL v3](https://www.gnu.org/licenses/gpl-3.0.html)
