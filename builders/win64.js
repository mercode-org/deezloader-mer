"use strict";
const builder = require("electron-builder");
const Platform = builder.Platform;

builder.build({
  targets: Platform.WINDOWS.createTarget(),
  config: {
		"appId": "deezloader-rmx",
		"productName": "Deezloader Remix",
		"win": {
			{
				"target": "nsis",
				"arch": "x64"
			},
			{
				"target": "portable",
				"arch": "x64"
			}
		},
		"nsis": {
			"artifactName": "${productName} ${version} Setup.${ext}",
			"oneClick": false,
			"license": "LICENSE",
			"allowToChangeInstallationDirectory": true,
			"uninstallDisplayName": "${productName} ${version}",
			"deleteAppDataOnUninstall": true
		},
		"portable": {
			"artifactName": "${productName} ${version}.${ext}",
			"requestExecutionLevel": "user"
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
