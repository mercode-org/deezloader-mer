"use strict";

const builder = require("electron-builder");
const Platform = builder.Platform;

builder.build({
  targets: Platform.MAC.createTarget(),
  config: {
		"appId": "deezloader-rmx",
		"productName": "Deezloader Remix",
		"mac": {
			"category": "public.app-category.music"
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
