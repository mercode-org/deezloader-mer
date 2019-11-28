# Deezloader Remix
### Latest Version: 4.2.2
Deezloader Remix is an improved version of Deezloader based on the Reborn branch.<br/>
With this app you can download songs, playlists and albums directly from Deezer's Server in a single and well packaged app.

![](https://i.imgur.com/NeOg9YU.png)
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
* REST API

## Download
All compiled downloads are on Telegram.<br>
News: [@RemixDevs](https://t.me/RemixDevs)<br>
Downloads: [@DeezloaderRemix](https://t.me/DeezloaderRemix)<br>
Mirros: [Wiki/Downloads](https://notabug.org/RemixDevs/DeezloaderRemix/wiki/Downloads)<br>
Chat: [@DeezloaderRemixCommunity](https://t.me/DeezloaderRemixCommunity)<br>
Here are listed the MD5 checksums (so you can be sure the files were not tampered):<br>

| Checksum MD5                       | Filename                               |
| ---------------------------------- | -------------------------------------- |
| `2d2f5b1f9a34f4f81098c4ca027b40bc` | Deezloader Remix 4.2.2.exe             |
| `c2d85c932886bef5d57d1d5ede6293e0` | Deezloader_Remix_4.2.2-i386.AppImage   |
| `e3ae0b76e339b8a0748e251aeed37c9b` | Deezloader Remix 4.2.2 Setup.exe       |
| `0697636e2aedfca50e58f3d5db319b14` | Deezloader Remix 4.2.2 Setup x32.exe   |
| `616c30413dc860f1be0cc03558d536fe` | Deezloader Remix 4.2.2 x32.exe         |
| `64f784e408c7d07fc468aa66cedde0d8` | Deezloader_Remix_4.2.2-x86_64.AppImage |
| `ba947707318b41e0d844a98bf1b81eeb` | Deezloader Remix-4.2.2.dmg             |

## Build
If you want to buid it yourself you will need Node.js installed, git and npm or yarn.<br/>
To start utilizing the app you should open a terminal inside the project folder and run `npm install`.<br/>
If you want to start the app, without compiling it you can use `npm start`<br/>
To run it in server mode you can use `npm start -- -s` or go inside the `app` folder and use `node app.js`<br/>
To build the app for other OSs follow the table below

| OS                 | Command              |
| ------------------ | -------------------- |
| Windows x64        | `npm run dist:win64` |
| Windows x32 or x86 | `npm run dist:win32` |
| Linux              | `npm run dist:linux` |
| macOS              | `npm run dist:macOS` |

## REST API
### Add URLs to download queue via POST request:
``` JSON
POST http://localhost:1730/api/download/
Content-Type: application/json

{
    "url": "https://www.deezer.com/album/115542362"
}
    or
{
    "url": ["https://www.deezer.com/track/812778162","https://www.deezer.com/playlist/708702152","https://www.deezer.com/track/813185722"]
}
```

### Search for a track, album, playlist or artist
``` JSON
POST http://localhost:1730/api/search/
Content-Type: application/json

{
    "album": "my favourite album - my favouite artist"
}
    or
{
    "artist": "my favouite artist"
}
```

## Disclaimer
I am not responsible for the usage of this program by other people.<br/>
I do not recommend you doing this illegally or against Deezer's terms of service.<br/>
This project is licensed under [GNU GPL v3](https://www.gnu.org/licenses/gpl-3.0.html)
