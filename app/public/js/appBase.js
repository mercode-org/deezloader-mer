if(typeof require !== "undefined"){
	var shell = require('electron').shell;
	var remote = require('electron').remote;
	var dialog = remote.dialog;
	var packageFile = remote.require('./package.json');
	var mainApp = remote.require('./app');
	var path = remote.require('path');
}
const version = (typeof packageFile === 'undefined') ? $("#appVersionFallback").html() : packageFile.version;

(function () {
	//open links externally by default
	$(document).on('click', 'a[href^="http"]', function (event) {
		event.preventDefault();
		shell.openExternal(this.href);
	});

	// selectAll-"feature"...its really crappy to wait for document change
	// but since the materialize modal initialization is a fucking callback hell,
	// this is pretty much the only option...will (hopefully) be refactored in
	// version 2.4.0 when the entire rendering is switched to vue's...
	$(document).on('change', 'input:checkbox.selectAll', function(){
		$('input:checkbox.trackCheckbox').prop('checked', $(this).prop('checked'));
	});

	// Open DevTools when F12 is pressed
	// Reload page when F5 is pressed
	/*document.addEventListener("keydown", function (e) {
		if (e.which === 123) {
			if(typeof require !== "undefined"){
				remote.getCurrentWindow().toggleDevTools();
			}
		}

		if (e.which === 116) {
			if(typeof require !== "undefined"){
				remote.getCurrentWindow().reload();
			}
		}
	});*/

	// Function to make title-bar work
	function initTitleBar() {
		let $mainEl = $('#title-bar');
		if(typeof require !== "undefined"){
			const window = remote.getCurrentWindow();

			$mainEl.find('#min-btn').on('click', function () {
				window.minimize();
			});

			$mainEl.find('#max-btn').on('click', function () {
				if (!window.isMaximized()) {
					window.maximize();
				} else {
					window.unmaximize();
				}
			});

			$mainEl.find('#close-btn').on('click', function () {
				window.close();
			});
		}else{
			$mainEl.css('display','none');
			$('nav').css('top','0');
			$('nav').css('margin-top','0');
		}
		$mainEl.find('#application_version').text(version);
	}

	// Ready state of the page
	document.onreadystatechange = function () {
		if (document.readyState == "complete") {
			initTitleBar();
			$('#application_version_about').text(version);
			$('#application_version_logo').text(version.replace(/\.[^/.]+$/, ""));

			$('#modal_settings_input_downloadTracksLocation').on('click', function () {
				if(typeof require !== "undefined"){
					$(this).val(dialog.showOpenDialog({
						properties: ['openDirectory']
					}));
				}
			});
		}
	};
})(jQuery);
