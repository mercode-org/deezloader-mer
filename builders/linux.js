"use strict";
const builder = require("electron-builder");
const Platform = builder.Platform;

builder.build({
  targets: Platform.LINUX.createTarget(),
  config: {
		"appId": "deezloader-rmx",
		"productName": "Deezloader Remix",
		"linux": {
			"target": [
				{
					"target": "AppImage",
					"arch": [
						"x64",
						"ia32"
					]
				}
			],
			"category": "Network",
			"artifactName": "Deezloader_Remix_${version}-${arch}.${ext}"
		}
  }
})
.then(() => {
  // handle result
  console.log('Build OK!');
})
.catch((error) => {
  // handle error
  console.log(error);
})
