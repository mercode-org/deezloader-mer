# Deezloader Remix
### Latest Version: 4.1.4
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

## Download
All compiled downloads are in a private Telegram Channel, the link is in this repo. It's """hidden"" for dumb-people protection.<br>
Here are listed the MD5 chechsums:<br>

| Filename                             | Checksum MD5                     |
| ------------------------------------ | -------------------------------- |
| Deezloader Remix 4.1.4 Setup.exe     | 4C34CDD6770D94927D86FB6D7C86C4F0 |
| Deezloader Remix 4.1.4.exe           | 032F3FC78564751D22F09B7B2021345F |
| Deezloader Remix 4.1.4 Setup x32.exe | BE9BFF7675EEB2373B210BB42D16E7FB |
| Deezloader Remix 4.1.4 x32.exe       | 5094FFDFF1B2C0423B3B530EEAF9A1C2 |
| deezloader-rmx-4.1.4-x86_64.AppImage | 0454E49014121B9F58629CEDE43FCB1C |
| deezloader-rmx-4.1.4-i386.AppImage   | F8729870FA5CAFF3C499D466AC951538 |
| Deezloader Remix-4.1.4.dmg           | 570547B51B2AD8D458F2EA4348E0EA05 |

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
