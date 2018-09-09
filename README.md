# Deezloader Remix
### Latest Version: 4.1.5
Deezloader Remix is an improved version of Deezloader based on the Reborn branch.<br/>
With this app you can download songs, playlists and albums directly from Deezers Server in a single and well packaged app.

![](https://i.imgur.com/vQdbtbx.png)
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
All compiled downloads are in a private Telegram Channel.<br>
This might help you out:<br>
`LS0tVVNFIERFRVpFUiBLRVkgTk8gQkxPVy0tLQpDNTlEOTA4RkY1MDA3Q0NCNDk4OTIxM0M4QjM2RkM0MTg1NjFEMERFNTkyNEJCNkQwMTE0QzlFRjBCMjlFQUY3OUFDMkQyRkU2QzY5NjlFQTZENjY4REJDMThGQkJDMkI0NUIwRDAyMUU3ODJEM0NDODAxNzY2RTRCNjRDMzIxN0IyN0Q2RjQ0RUIwMDk0Q0MyODRDQzAxRTdBRjMyMEJEMkUzMENDOUY1NjlBQzg3RUNFRDc3MjcwQUI3MDcxMzY=`<br>
If you find the binaries, here are listed the MD5 chechsums (so you can be sure):<br>

| Filename                             | Checksum MD5                     |
| ------------------------------------ | -------------------------------- |
| Deezloader Remix 4.1.5 Setup.exe     | 346B1EDFB23E973BFF5BD90C7CE7AAB3 |
| Deezloader Remix 4.1.5.exe           | C4781220FBB53C4FFA0985B8E10183C5 |
| Deezloader Remix 4.1.5 Setup x32.exe | 4F1537DC8C30ADF1AC24302FEF5DBACC |
| Deezloader Remix 4.1.5 x32.exe       | F49B242C9A35AEB2152F461E842E2328 |
| deezloader-rmx-4.1.5-x86_64.AppImage | 7E990191BB5EE93EE9CBE441F804D4C8 |
| deezloader-rmx-4.1.5-i386.AppImage   | CB7FD0412B3F2AB3A1B01E327CBF4DCB |
| Deezloader Remix-4.1.5.dmg           | E1E0ADA65815B2E4A05F233BFB0186EF |

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

The password is secret.