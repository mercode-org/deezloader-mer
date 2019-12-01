"use strict";
const builder = require("electron-builder");
const Platform = builder.Platform;

builder.build({
  targets: Platform.WINDOWS.createTarget(),
  config: {
		"appId": "deezloader-rmx",
		"productName": "Deezloader Remix",
		"win": {
			"target": [
				"nsis",
				"portable"
			],
			"arch": "ia32"
		},
		"nsis": {
			"artifactName": "${productName} ${version} Setup x32.${ext}",
			"oneClick": false,
			"license": "LICENSE",
			"allowToChangeInstallationDirectory": true,
			"uninstallDisplayName": "${productName} ${version}",
			"deleteAppDataOnUninstall": true
		},
		"portable": {
			"artifactName": "${productName} ${version} x32.${ext}",
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
