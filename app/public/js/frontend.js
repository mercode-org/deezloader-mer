// Starting area, boot up the API and proceed to eat memory

// Variables & constants
const socket = io.connect(window.location.href)
const serverMode = typeof require === "undefined"
var defaultUserSettings = {}
var defaultDownloadLocation = ""
const localStorage = window.localStorage
var modalQuality = document.getElementById('modal_quality');
modalQuality.open = false
let userSettings = {}
let spotifySettings = {}

var downloadQueue = []
var loggedIn = false
var deezerNotAvailable = false

let preview_track = document.getElementById('preview-track')
let preview_stopped = true
const COUNTRIES = {"AF": "Afghanistan","AX": "\u00c5land Islands","AL": "Albania","DZ": "Algeria","AS": "American Samoa","AD": "Andorra","AO": "Angola","AI": "Anguilla","AQ": "Antarctica","AG": "Antigua and Barbuda","AR": "Argentina","AM": "Armenia","AW": "Aruba","AU": "Australia","AT": "Austria","AZ": "Azerbaijan","BS": "Bahamas","BH": "Bahrain","BD": "Bangladesh","BB": "Barbados","BY": "Belarus","BE": "Belgium","BZ": "Belize","BJ": "Benin","BM": "Bermuda","BT": "Bhutan","BO": "Bolivia, Plurinational State of","BQ": "Bonaire, Sint Eustatius and Saba","BA": "Bosnia and Herzegovina","BW": "Botswana","BV": "Bouvet Island","BR": "Brazil","IO": "British Indian Ocean Territory","BN": "Brunei Darussalam","BG": "Bulgaria","BF": "Burkina Faso","BI": "Burundi","KH": "Cambodia","CM": "Cameroon","CA": "Canada","CV": "Cape Verde","KY": "Cayman Islands","CF": "Central African Republic","TD": "Chad","CL": "Chile","CN": "China","CX": "Christmas Island","CC": "Cocos (Keeling) Islands","CO": "Colombia","KM": "Comoros","CG": "Congo","CD": "Congo, the Democratic Republic of the","CK": "Cook Islands","CR": "Costa Rica","CI": "C\u00f4te d'Ivoire","HR": "Croatia","CU": "Cuba","CW": "Cura\u00e7ao","CY": "Cyprus","CZ": "Czech Republic","DK": "Denmark","DJ": "Djibouti","DM": "Dominica","DO": "Dominican Republic","EC": "Ecuador","EG": "Egypt","SV": "El Salvador","GQ": "Equatorial Guinea","ER": "Eritrea","EE": "Estonia","ET": "Ethiopia","FK": "Falkland Islands (Malvinas)","FO": "Faroe Islands","FJ": "Fiji","FI": "Finland","FR": "France","GF": "French Guiana","PF": "French Polynesia","TF": "French Southern Territories","GA": "Gabon","GM": "Gambia","GE": "Georgia","DE": "Germany","GH": "Ghana","GI": "Gibraltar","GR": "Greece","GL": "Greenland","GD": "Grenada","GP": "Guadeloupe","GU": "Guam","GT": "Guatemala","GG": "Guernsey","GN": "Guinea","GW": "Guinea-Bissau","GY": "Guyana","HT": "Haiti","HM": "Heard Island and McDonald Islands","VA": "Holy See (Vatican City State)","HN": "Honduras","HK": "Hong Kong","HU": "Hungary","IS": "Iceland","IN": "India","ID": "Indonesia","IR": "Iran, Islamic Republic of","IQ": "Iraq","IE": "Ireland","IM": "Isle of Man","IL": "Israel","IT": "Italy","JM": "Jamaica","JP": "Japan","JE": "Jersey","JO": "Jordan","KZ": "Kazakhstan","KE": "Kenya","KI": "Kiribati","KP": "Korea, Democratic People's Republic of","KR": "Korea, Republic of","KW": "Kuwait","KG": "Kyrgyzstan","LA": "Lao People's Democratic Republic","LV": "Latvia","LB": "Lebanon","LS": "Lesotho","LR": "Liberia","LY": "Libya","LI": "Liechtenstein","LT": "Lithuania","LU": "Luxembourg","MO": "Macao","MK": "Macedonia, the Former Yugoslav Republic of","MG": "Madagascar","MW": "Malawi","MY": "Malaysia","MV": "Maldives","ML": "Mali","MT": "Malta","MH": "Marshall Islands","MQ": "Martinique","MR": "Mauritania","MU": "Mauritius","YT": "Mayotte","MX": "Mexico","FM": "Micronesia, Federated States of","MD": "Moldova, Republic of","MC": "Monaco","MN": "Mongolia","ME": "Montenegro","MS": "Montserrat","MA": "Morocco","MZ": "Mozambique","MM": "Myanmar","NA": "Namibia","NR": "Nauru","NP": "Nepal","NL": "Netherlands","NC": "New Caledonia","NZ": "New Zealand","NI": "Nicaragua","NE": "Niger","NG": "Nigeria","NU": "Niue","NF": "Norfolk Island","MP": "Northern Mariana Islands","NO": "Norway","OM": "Oman","PK": "Pakistan","PW": "Palau","PS": "Palestine, State of","PA": "Panama","PG": "Papua New Guinea","PY": "Paraguay","PE": "Peru","PH": "Philippines","PN": "Pitcairn","PL": "Poland","PT": "Portugal","PR": "Puerto Rico","QA": "Qatar","RE": "R\u00e9union","RO": "Romania","RU": "Russian Federation","RW": "Rwanda","BL": "Saint Barth\u00e9lemy","SH": "Saint Helena, Ascension and Tristan da Cunha","KN": "Saint Kitts and Nevis","LC": "Saint Lucia","MF": "Saint Martin (French part)","PM": "Saint Pierre and Miquelon","VC": "Saint Vincent and the Grenadines","WS": "Samoa","SM": "San Marino","ST": "Sao Tome and Principe","SA": "Saudi Arabia","SN": "Senegal","RS": "Serbia","SC": "Seychelles","SL": "Sierra Leone","SG": "Singapore","SX": "Sint Maarten (Dutch part)","SK": "Slovakia","SI": "Slovenia","SB": "Solomon Islands","SO": "Somalia","ZA": "South Africa","GS": "South Georgia and the South Sandwich Islands","SS": "South Sudan","ES": "Spain","LK": "Sri Lanka","SD": "Sudan","SR": "Suriname","SJ": "Svalbard and Jan Mayen","SZ": "Swaziland","SE": "Sweden","CH": "Switzerland","SY": "Syrian Arab Republic","TW": "Taiwan, Province of China","TJ": "Tajikistan","TZ": "Tanzania, United Republic of","TH": "Thailand","TL": "Timor-Leste","TG": "Togo","TK": "Tokelau","TO": "Tonga","TT": "Trinidad and Tobago","TN": "Tunisia","TR": "Turkey","TM": "Turkmenistan","TC": "Turks and Caicos Islands","TV": "Tuvalu","UG": "Uganda","UA": "Ukraine","AE": "United Arab Emirates","GB": "United Kingdom","US": "United States","UM": "United States Minor Outlying Islands","UY": "Uruguay","UZ": "Uzbekistan","VU": "Vanuatu","VE": "Venezuela, Bolivarian Republic of","VN": "Viet Nam","VG": "Virgin Islands, British","VI": "Virgin Islands, U.S.","WF": "Wallis and Futuna","EH": "Western Sahara","YE": "Yemen","ZM": "Zambia","ZW": "Zimbabwe"}

// Load language files
var currentLang = getCookie("lang")
if (currentLang === undefined){
	currentLang = "en"
}
socket.emit("getLang", currentLang)

window.addEventListener('offline', function(e) {
	M.toast({html: '<i class="material-icons left">warning</i>'+i18n("You are offline!"), displayLength: 5000, classes: 'rounded'})
});
window.addEventListener('online', function(e) {
	M.toast({html: '<i class="material-icons left">check</i>'+i18n("Back online!"), displayLength: 5000, classes: 'rounded'})
	if (!loggedIn) checkAutologin();
});

$.getJSON(`/locales/${currentLang}.json`, function(json) {
	i18n.translator.add({
		values: json
	})
})

// Popup message listener
socket.on("message", function(desc){
	message(desc.title, desc.msg)
})

socket.on("toast", function(message){
	M.toast({html: '<i class="material-icons left">error</i>'+message, displayLength: 5000, classes: 'rounded'})
})

socket.on("messageUpdate", function(desc){
	if (localStorage.getItem('updateModal') != desc.lastVersion){
		message(desc.title, desc.msg)
		localStorage.setItem('updateModal', desc.lastVersion)
	}
})

socket.on("deezerNotAvailable", function(){
	$("#deezerNotAvailable").slideDown()
	deezerNotAvailable = true
})

// Prints object obj into console
// For Debug purposes
socket.on("printObj", function(obj){
	console.log(obj)
})

socket.on("getDefaultSettings", function(defaultSettings, defaultDownloadFolder){
	defaultUserSettings = defaultSettings
	defaultDownloadLocation = defaultDownloadFolder
})

//Login button
$('#modal_login_btn_login').click(function () {
	$('#modal_login_btn_login').attr("disabled", true)
	$('#modal_login_btn_login').html(i18n("Logging in..."))
	var username = $('#modal_login_input_username').val()
	if (username === ""){
		$('#login-res-text').text(i18n("Error: email field is empty"))
		setTimeout(function(){$('#login-res-text').text("")},3000)
		$('#modal_login_btn_login').attr("disabled", false)
		$('#modal_login_btn_login').html(i18n("Log in"))
		return
	}
	var password = $('#modal_login_input_password').val()
	if (password === ""){
		$('#login-res-text').text(i18n("Error: Password field is empty"))
		setTimeout(function(){$('#login-res-text').text("")},3000)
		$('#modal_login_btn_login').attr("disabled", false)
		$('#modal_login_btn_login').html(i18n("Log in"))
		return
	}
	var captchaWindow = window.open('cap://deezer.com/', '_blank', 'nodeIntegration=no')
	var timer = setInterval(function() {
  	if (captchaWindow.closed) {
    	clearInterval(timer)
			var captchaResponse = $('#modal_login_input_captchaResponse').val()
			if (captchaResponse == ""){
				$('#login-res-text').text(i18n("Error: Captcha wasn't solved."))
				setTimeout(function(){$('#login-res-text').text("")},3000)
				$('#modal_login_btn_login').attr("disabled", false)
				$('#modal_login_btn_login').html(i18n("Log in"))
				return
			}
			localStorage.setItem('autologin_email', username)
			//Send to the software
		  socket.emit('login', username, password, captchaResponse)
    }
  }, 500);
})

$('#modal_settings_btn_updateArl').click(function () {
	$('#modal_settings_btn_updateArl').attr("disabled", true)
	var currentArl = localStorage.getItem('userToken')
	var userToken = $('#modal_login_input_userToken').val()
	if (currentArl != userToken){
		if (navigator.onLine){
			socket.emit('logout')
			socket.emit('loginViaUserToken', userToken)
		}else{
			M.toast({html: '<i class="material-icons left">warning</i>'+i18n("You are offline!"), displayLength: 5000, classes: 'rounded'})
		}
	}
	$('#modal_settings_btn_updateArl').attr("disabled", false)
})

$("#modal_settings_btn_copyArl").click(function(){
	$("#modal_login_input_userToken").attr("type", "text");
	document.querySelector("#modal_login_input_userToken").select();
	document.execCommand("copy");
	$("#modal_login_input_userToken").attr("type", "password");
	M.toast({html: '<i class="material-icons left">assignment</i>'+i18n("userToken copied to clipboard"), displayLength: 5000, classes: 'rounded'})
})

// Get captcha response
socket.on('getCaptcha', function (data) {
	$('#modal_login_input_captchaResponse').val(data)
	console.log('captcha token received')
})

// New login system (uses cookies)
socket.on('getCookies', function(jar){
	localStorage.setItem('autologin', JSON.stringify(jar))
})

// After Login
socket.on("login", function (data) {
	if (!data.error) {
		$("#modal_settings_username").html(data.user.name)
		$("#modal_settings_picture").attr("src",data.user.picture)
		$("#side_user").text(data.user.name)
		$("#side_avatar").attr("src",data.user.picture)
		$("#side_email").text(data.user.email ? data.user.email : "id:"+data.user.id)
		if (data.user.id != 0){
			localStorage.setItem('userToken', data.user.arl)
			$("#modal_login_input_userToken").val(data.user.arl)
			// Load personal public playlists
			socket.emit("getMyPlaylistList", {spotifyUser: localStorage.getItem('spotifyUser')})
			$('#logged_in_info').removeClass('hide')
			$('#login_email_btn_container').addClass('hide')
			$('#modal_login').modal("close")
			M.toast({html: '<i class="material-icons left">check</i>'+i18n("Logged in successfully"), displayLength: 5000, classes: 'rounded'})
			loggedIn = true;
		}
	}else{
		if (deezerNotAvailable) data.error = "Error: "+i18n("Deezer is not available in your country")
		$('#login-res-text').text(data.error)
		setTimeout(function(){$('#login-res-text').text("")},3000)
		$('#login-res-text2').text(data.error)
		setTimeout(function(){$('#login-res-text2').text("")},3000)
		M.toast({html: '<i class="material-icons left">error</i>'+data.error, displayLength: 5000, classes: 'rounded'})
		$('#modal_login_input_password').val("")
		$('#modal_login_input_userToken').val("")
		loggedIn = false;
	}
	$('#modal_login_btn_login').attr("disabled", false)
	$('#modal_login_btn_login').html(i18n("Log in"))
	M.updateTextFields()
})

// Autologin
function checkAutologin(){
	if (navigator.onLine){
		if (localStorage.getItem('autologin')){
			M.toast({html: '<i class="material-icons left">info</i>'+i18n("Attempting Autologin..."), displayLength: 5000, classes: 'rounded'})
			socket.emit('autologin', localStorage.getItem('autologin'), localStorage.getItem('autologin_email'))
			$('#modal_login_btn_login').attr("disabled", true)
			$('#modal_login_btn_login').html(i18n("Logging in..."))
			if (serverMode){
				$('#modal_login_input_userToken').val(localStorage.getItem('userToken'))
			}else{
				$('#modal_login_input_username').val(localStorage.getItem('autologin_email'))
				$('#modal_login_input_password').val("password")
			}
			M.updateTextFields()
		}else{
			socket.emit('init')
		}
	}else{
		if (localStorage.getItem('autologin'))
			$('#modal_login_input_userToken').val(localStorage.getItem('userToken'))
		M.toast({html: '<i class="material-icons left">warning</i>'+i18n("You are offline!"), displayLength: 5000, classes: 'rounded'})
		loggedIn = false;
		socket.emit('init')
	}
}
socket.on('checkAutologin', function(){checkAutologin()})

// Logout Button
$('#modal_settings_btn_logout').click(function () {
	$('#modal_login_input_username').val("")
	$('#modal_login_input_password').val("")
	$('#modal_login_input_userToken').val("")
	$('#modal_login_input_captchaResponse').val("")
	$('#login_email_btn_container').removeClass('hide')
	$('#logged_in_info').addClass('hide')
	localStorage.removeItem("autologin")
	localStorage.removeItem("userToken")
	localStorage.removeItem("autologin_email")
	socket.emit('logout')
	loggedIn = false;
	M.updateTextFields()
})

// Open downloads folder
$('#openDownloadsFolder').on('click', function () {
	if(typeof shell !== "undefined"){
		shell.showItemInFolder(userSettings.downloadLocation + path.sep + '.')
	}else{
		alert(i18n("For security reasons, this button will do nothing."))
	}
})

// Alert for replayGain tag
$('#modal_tags_replayGain').on('click', function() {
	if ($(this).is(':checked')) {
		message(i18n('Warning'),i18n('Saving replay gain causes tracks to be quieter for some users.'))
	}
})

// Do misc stuff on page load
$(document).ready(function () {
	// Page Initializing
	console.log("Document ready")
	$("main.container").css('display', 'block')
	M.AutoInit()
	preview_track.volume = 0
	var tabs = M.Tabs.getInstance(document.getElementById("tab-nav"))
	$('.modal').modal()
	socket.emit("getUserSettings")
	$("main.container").addClass('animated fadeIn').on('webkitAnimationEnd', function () {
		$(this).removeClass('animated fadeOut')
	})

	// Load top charts list for countries
	if (localStorage.getItem('chartsCountry') == null)
		localStorage.setItem('chartsCountry', "Worldwide")
	chartCountry = localStorage.getItem('chartsCountry')
	socket.emit("getChartsCountryList", {selected: chartCountry})
	socket.emit("getChartsTrackListByCountry", {country: chartCountry})

	// Side Nav Stuff
	$('.sidenav').sidenav({
		edge: 'right',
		draggable: true
	})

	$('.sidenav_tab').click((e)=>{
		e.preventDefault()
		$(e.currentTarget).addClass("active")
		tabs.select($(e.currentTarget).attr('tab-id'))
		tabs.updateTabIndicator()
	})

	// scrollToTop FAB
	$(window).scroll(function () {
		if ($(this).scrollTop() > 100) {
			$('#btn_scrollToTop a').removeClass('scale-out').addClass('scale-in')
		} else {
			$('#btn_scrollToTop a').removeClass('scale-in').addClass('scale-out')
		}
	})

	$('#btn_scrollToTop').click(function () {
		$('html, body').animate({scrollTop: 0}, 800)
		return false
	})

	// Playlist Stuff
	$("#button_refresh_playlist_tab").click(function(){
		$("table_personal_playlists").html("")
		socket.emit("getMyPlaylistList", {spotifyUser: localStorage.getItem('spotifyUser')})
	})

	$('#downloadChartPlaylist').on('contextmenu', function(e){
    e.preventDefault();
		$(modalQuality).data("url", `https://www.deezer.com/playlist/${$(this).data("id")}`)
		$(modalQuality).css('display', 'block')
		$(modalQuality).addClass('animated fadeIn')
    return false;
	}).on('click', function(e){
    e.preventDefault();
    addToQueue(`https://www.deezer.com/playlist/${$(this).data("id")}`)
	})

	// Track Preview Feature
	$(preview_track).on('canplay', ()=>{
		preview_track.play()
		preview_stopped = false
		$(preview_track).animate({volume: 1}, 500)
	})

	$(preview_track).on('timeupdate', ()=>{
		if (preview_track.currentTime > preview_track.duration-1){
			$(preview_track).animate({volume: 0}, 800)
			preview_stopped = true
			$("*").removeAttr("playing")
			$('.preview_controls').text("play_arrow")
			$('.preview_playlist_controls').text("play_arrow")
		}
	})

	$('#modal_trackList, #modal_trackListSelective').modal({
		onCloseStart: ()=>{
			if ($('.preview_playlist_controls').filter(function(){return $(this).attr("playing")}).length > 0){
				$(preview_track).animate({volume: 0}, 800)
				preview_stopped = true
				$(".preview_playlist_controls").removeAttr("playing")
				$('.preview_playlist_controls').text("play_arrow")
			}
		}
	})

	// Night Theme Switch
	$('#nightTimeSwitcher').change(function(){
		if(this.checked){
			document.getElementsByTagName('link')[4].disabled = false
			$("#nightModeSwitch2").html(`<i class="material-icons">brightness_7</i>${i18n("Disable Night Mode")}`)
		}else{
			document.getElementsByTagName('link')[4].disabled = true
			$("#nightModeSwitch2").html(`<i class="material-icons">brightness_2</i>${i18n("Enable Night Mode")}`)
		}
		localStorage.darkMode = this.checked
	})

	$('#nightModeSwitch2').click((ev)=>{
		ev.preventDefault()
		$('#nightTimeSwitcher').prop('checked', !$('#nightTimeSwitcher').prop('checked'))
		$('#nightTimeSwitcher').change()
	})

	if (eval(localStorage.darkMode)){
		$('#nightTimeSwitcher').prop('checked', true)
		$('#nightTimeSwitcher').change()
	}else{
		$('#nightTimeSwitcher').prop('checked', false)
		$('#nightTimeSwitcher').change()
	}

	// Search on tab change
	$('input[name=searchMode][type=radio]').change(()=>{
		let url = $('#tab_search_form_search_input_searchString').val()
		if (url.indexOf('deezer.com/') < 0 && url.indexOf('open.spotify.com/') < 0 && url.indexOf('spotify:') < 0)
			$('#tab_search_form_search').submit()
	})
	$('#tab_search_form_search_input_searchString').on('input', function() {
		let url = $('#tab_search_form_search_input_searchString').val()
		if (url.indexOf('deezer.com/') < 0 && url.indexOf('open.spotify.com/') < 0 && url.indexOf('spotify:') < 0)
			$("#tab_search_button i").text("search")
		else
			$("#tab_search_button i").text("get_app")
	})

	// Enter on Link Analyzer and Link Download
	$('#link_analyzer_url').on("keyup", function(e) {
		if (e.keyCode == 13) {
			parseLinkAnalyzer($("#link_analyzer_url").val())
		}
	});

	// Button download all tracks in selective modal
	$('#download_all_tracks_selective, #download_all_tracks').on('contextmenu', function(e){
    e.preventDefault();
		$(modalQuality).data("url", $(this).attr("data-link"))
		$(modalQuality).css('display', 'block')
		$(modalQuality).addClass('animated fadeIn')
    return false;
	}).on('click', function(e){
    e.preventDefault();
		addToQueue($(this).attr("data-link"))
		$(this).parent().parent().modal("close")
	})

	// Quality Modal
	window.onclick = function(event) {
	  if (event.target == modalQuality && modalQuality.open) {
			$(modalQuality).addClass('animated fadeOut')
	  }
	}
	$(modalQuality).on('webkitAnimationEnd', function () {
		if (modalQuality.open){
			$(this).removeClass('animated fadeOut')
			$(this).css('display', 'none')
			modalQuality.open = false
		}else{
			$(this).removeClass('animated fadeIn')
			$(this).css('display', 'block')
			modalQuality.open = true
		}
	})

	// Link Analyzer
	$("#link_analyzer_go").click(function(){
		parseLinkAnalyzer($("#link_analyzer_url").val())
	})

	// Language options
	setCookie("lang", currentLang, 90)
	$('#modal_settings_select_lang').val(currentLang).formSelect()
	$("#modal_settings_select_lang").change(function(){
		selectedLang = $(this).val()
		if (currentLang !== selectedLang){
			setCookie("lang", selectedLang, 90)
			message(i18n('Please restart the app'), i18n('To change the language you need to refresh the page or restart the app!'))
		}
	})

	// Settings cleanup
	$('#modal_settings_cbox_createPlaylistFolder').change(function(){
		$('#modal_settings_input_playlistNameTemplate').parent().slideToggle()
	})
	$('#modal_settings_cbox_createArtistFolder').change(function(){
		$('#modal_settings_input_artistNameTemplate').parent().slideToggle()
	})
	$('#modal_settings_cbox_createAlbumFolder').change(function(){
		$('#modal_settings_input_albumNameTemplate').parent().slideToggle()
	})
	$('#modal_settings_cbox_saveArtwork').change(function(){
		$('#modal_settings_input_coverImageTemplate').parent().slideToggle()
	})
	$('#modal_settings_cbox_saveArtworkArtist').change(function(){
		$('#modal_settings_input_artistImageTemplate').parent().slideToggle()
	})

	// Close Banner
	$(".close-banner").click(function(e){
		e.preventDefault();
		$(this).parent().slideUp()
	})
})

// Load settings
socket.on('getUserSettings', function (data) {
	userSettings = data.settings
	spotifySettings = data.spotify
	console.log('Settings refreshed')
})

/**
 *	Modal Area START
 */

// Prevent default behavior of closing button
$('.modal-close').click(function (e) {
	e.preventDefault()
})

// Settings Modal START
const $settingsAreaParent = $('#modal_settings')

// Open settings panel
$('#nav_btn_openSettingsModal, #sidenav_settings').click(function () {
	fillSettingsModal(userSettings, spotifySettings)
})

// Save settings button
$('#modal_settings_btn_saveSettings').click(function () {
	let settings = {}
	// Save
	settings.userDefined = {
		downloadLocation: $('#modal_settings_input_downloadTracksLocation').val(),
		trackNameTemplate: $('#modal_settings_input_trackNameTemplate').val(),
		albumTrackNameTemplate: $('#modal_settings_input_albumTrackNameTemplate').val(),
		playlistTrackNameTemplate: $('#modal_settings_input_playlistTrackNameTemplate').val(),
		createPlaylistFolder: $('#modal_settings_cbox_createPlaylistFolder').is(':checked'),
		playlistNameTemplate: $('#modal_settings_input_playlistNameTemplate').val(),
		createArtistFolder: $('#modal_settings_cbox_createArtistFolder').is(':checked'),
		artistNameTemplate: $('#modal_settings_input_artistNameTemplate').val(),
		createAlbumFolder: $('#modal_settings_cbox_createAlbumFolder').is(':checked'),
		albumNameTemplate: $('#modal_settings_input_albumNameTemplate').val(),
		createCDFolder: $('#modal_settings_cbox_createCDFolder').is(':checked'),
		createStructurePlaylist: $('#modal_settings_cbox_createStructurePlaylist').is(':checked'),
		createSingleFolder: $('#modal_settings_cbox_createSingleFolder').is(':checked'),
		saveFullArtists : $('#modal_settings_cbox_saveFullArtists').is(':checked'),
		padtrck: $('#modal_settings_cbox_padtrck').is(':checked'),
		paddingSize: $('#modal_settings_number_paddingSize').val(),
		queueConcurrency: parseInt($('#modal_settings_number_queueConcurrency').val()),
		maxBitrate: $('#modal_settings_select_maxBitrate').val(),
		fallbackBitrate : $('#modal_settings_cbox_fallbackBitrate').is(':checked'),
		fallbackSearch : $('#modal_settings_cbox_fallbackSearch').is(':checked'),
		downloadSinglesAsTracks: $('#modal_settings_cbox_downloadSinglesAsTracks').is(':checked'),
		logErrors: $('#modal_settings_cbox_logErrors').is(':checked'),
		logSearched: $('#modal_settings_cbox_logSearched').is(':checked'),
		createM3UFile: $('#modal_settings_cbox_createM3UFile').is(':checked'),
		changePlaylistName: $('#modal_settings_cbox_changePlaylistName').is(':checked'),
		syncedlyrics: $('#modal_settings_cbox_syncedlyrics').is(':checked'),
		minimizeToTray : $('#modal_settings_cbox_minimizeToTray').is(':checked'),
		embeddedArtworkSize: parseInt($('#modal_settings_select_embeddedArtworkSize').val()),
		localArtworkSize: parseInt($('#modal_settings_select_localArtworkSize').val()),
		saveArtwork: $('#modal_settings_cbox_saveArtwork').is(':checked'),
		coverImageTemplate: $('#modal_settings_input_coverImageTemplate').val(),
		saveArtworkArtist: $('#modal_settings_cbox_saveArtworkArtist').is(':checked'),
		artistImageTemplate: $('#modal_settings_input_artistImageTemplate').val(),
		PNGcovers: $('#modal_settings_cbox_PNGcovers').is(':checked'),
		multitagSeparator: $('#modal_settings_select_multitagSeparator').val(),
		dateFormat: $('#modal_settings_select_dateFormat').val(),
		dateFormatYear: $('#modal_settings_select_dateFormatYear').val(),
		savePlaylistAsCompilation: $('#modal_settings_cbox_savePlaylistAsCompilation').is(':checked'),
		removeAlbumVersion : $('#modal_settings_cbox_removeAlbumVersion').is(':checked'),
		saveID3v1 : $('#modal_settings_cbox_saveID3v1').is(':checked'),
		titleCasing : $('#modal_settings_select_titleCasing').val(),
		artistCasing : $('#modal_settings_select_artistCasing').val(),
		tags: {
			title: $('#modal_tags_title').is(':checked'),
			artist: $('#modal_tags_artist').is(':checked'),
			album: $('#modal_tags_album').is(':checked'),
			cover: $('#modal_tags_cover').is(':checked'),
			trackNumber: $('#modal_tags_trackNumber').is(':checked'),
			trackTotal: $('#modal_tags_trackTotal').is(':checked'),
			discNumber: $('#modal_tags_discNumber').is(':checked'),
			discTotal: $('#modal_tags_discTotal').is(':checked'),
			albumArtist: $('#modal_tags_albumArtist').is(':checked'),
			genre: $('#modal_tags_genre').is(':checked'),
			year: $('#modal_tags_year').is(':checked'),
			date: $('#modal_tags_date').is(':checked'),
			explicit: $('#modal_tags_explicit').is(':checked'),
			isrc: $('#modal_tags_isrc').is(':checked'),
			length: $('#modal_tags_length').is(':checked'),
			barcode: $('#modal_tags_barcode').is(':checked'),
			bpm: $('#modal_tags_bpm').is(':checked'),
			replayGain: $('#modal_tags_replayGain').is(':checked'),
			publisher: $('#modal_tags_publisher').is(':checked'),
			unsynchronisedLyrics: $('#modal_tags_unsynchronisedLyrics').is(':checked'),
			copyright: $('#modal_tags_copyright').is(':checked'),
			musicpublisher: $('#modal_tags_musicpublisher').is(':checked'),
			composer: $('#modal_tags_composer').is(':checked'),
			mixer: $('#modal_tags_mixer').is(':checked'),
			author: $('#modal_tags_author').is(':checked'),
			writer: $('#modal_tags_writer').is(':checked'),
			engineer: $('#modal_tags_engineer').is(':checked'),
			producer: $('#modal_tags_producer').is(':checked')
		}
	}
	let spotifyUser = $('#modal_settings_input_spotifyUser').val()
	let spotifyFeatures = {
		clientId: $('#modal_settings_input_spotifyClientID').val(),
		clientSecret: $('#modal_settings_input_spotifyClientSecret').val()
	}
	localStorage.setItem('spotifyUser', spotifyUser)
	// Send updated settings to be saved into config file
	socket.emit('saveSettings', settings, spotifyUser)
	socket.emit('saveSpotifyFeatures', spotifyFeatures)
	socket.emit('getUserSettings')
})

// Reset defaults button
$('#modal_settings_btn_defaultSettings').click(function () {
	if(typeof defaultDownloadLocation !== 'undefined'){
		defaultUserSettings.downloadLocation = defaultDownloadLocation
		fillSettingsModal(defaultUserSettings, spotifySettings)
	}
})

// Sign Up Button
$('#modal_login_btn_signup').click(function(){
	if(typeof shell != 'undefined'){
		shell.openExternal("https://www.deezer.com/register")
	}else{
		window.open("https://www.deezer.com/register")
	}
})

// Populate settings fields
function fillSettingsModal(settings, spotifySettings = {clientId: "", clientSecret: ""}) {
	$('#modal_settings_input_downloadTracksLocation').val(settings.downloadLocation)
	$('#modal_settings_input_trackNameTemplate').val(settings.trackNameTemplate)
	$('#modal_settings_input_albumTrackNameTemplate').val(settings.albumTrackNameTemplate)
	$('#modal_settings_input_playlistTrackNameTemplate').val(settings.playlistTrackNameTemplate)

	$('#modal_settings_cbox_createPlaylistFolder').prop('checked', settings.createPlaylistFolder)
	$('#modal_settings_input_playlistNameTemplate').val(settings.playlistNameTemplate)
	if (settings.createPlaylistFolder)
		$('#modal_settings_input_playlistNameTemplate').parent().slideDown()
	else
		$('#modal_settings_input_playlistNameTemplate').parent().slideUp()

	$('#modal_settings_cbox_createArtistFolder').prop('checked', settings.createArtistFolder)
	$('#modal_settings_input_artistNameTemplate').val(settings.artistNameTemplate)
	if (settings.createArtistFolder)
		$('#modal_settings_input_artistNameTemplate').parent().slideDown()
	else
		$('#modal_settings_input_artistNameTemplate').parent().slideUp()

	$('#modal_settings_cbox_createAlbumFolder').prop('checked', settings.createAlbumFolder)
	$('#modal_settings_input_albumNameTemplate').val(settings.albumNameTemplate)
	if (settings.createAlbumFolder)
		$('#modal_settings_input_albumNameTemplate').parent().slideDown()
	else
		$('#modal_settings_input_albumNameTemplate').parent().slideUp()

	$('#modal_settings_cbox_createCDFolder').prop('checked', settings.createCDFolder)
	$('#modal_settings_cbox_createStructurePlaylist').prop('checked', settings.createStructurePlaylist)
	$('#modal_settings_cbox_createSingleFolder').prop('checked', settings.createSingleFolder)
	$('#modal_settings_cbox_saveFullArtists').prop('checked', settings.saveFullArtists)
	$('#modal_settings_cbox_padtrck').prop('checked', settings.padtrck)
	$('#modal_settings_number_paddingSize').val(settings.paddingSize)
	$('#modal_settings_number_queueConcurrency').val(settings.queueConcurrency)
	$('#modal_settings_select_maxBitrate').val(settings.maxBitrate).formSelect()
	$('#modal_settings_cbox_fallbackBitrate').prop('checked', settings.fallbackBitrate)
	$('#modal_settings_cbox_fallbackSearch').prop('checked', settings.fallbackSearch)
	$('#modal_settings_cbox_downloadSinglesAsTracks').prop('checked', settings.downloadSinglesAsTracks)
	$('#modal_settings_cbox_logErrors').prop('checked', settings.logErrors)
	$('#modal_settings_cbox_logSearched').prop('checked', settings.logSearched)
	$('#modal_settings_cbox_createM3UFile').prop('checked', settings.createM3UFile)
	$('#modal_settings_cbox_changePlaylistName').prop('checked', settings.changePlaylistName)
	$('#modal_settings_cbox_syncedlyrics').prop('checked', settings.syncedlyrics)
	$('#modal_settings_cbox_minimizeToTray').prop('checked', settings.minimizeToTray)
	$('#modal_settings_select_embeddedArtworkSize').val(settings.embeddedArtworkSize).formSelect()
	$('#modal_settings_select_localArtworkSize').val(settings.localArtworkSize).formSelect()

	$('#modal_settings_cbox_saveArtwork').prop('checked', settings.saveArtwork)
	$('#modal_settings_input_coverImageTemplate').val(settings.coverImageTemplate)
	if (settings.saveArtwork)
		$('#modal_settings_input_coverImageTemplate').parent().slideDown()
	else
		$('#modal_settings_input_coverImageTemplate').parent().slideUp()

	$('#modal_settings_cbox_saveArtworkArtist').prop('checked', settings.saveArtworkArtist)
	$('#modal_settings_input_artistImageTemplate').val(settings.artistImageTemplate)
	if (settings.saveArtworkArtist)
		$('#modal_settings_input_artistImageTemplate').parent().slideDown()
	else
		$('#modal_settings_input_artistImageTemplate').parent().slideUp()

	$('#modal_settings_cbox_PNGcovers').prop('checked', settings.PNGcovers)
	$('#modal_settings_select_multitagSeparator').val(settings.multitagSeparator).formSelect()
	$('#modal_settings_select_dateFormat').val(settings.dateFormat).formSelect()
	$('#modal_settings_select_dateFormatYear').val(settings.dateFormatYear).formSelect()
	$('#modal_settings_cbox_savePlaylistAsCompilation').prop('checked', settings.savePlaylistAsCompilation)
	$('#modal_settings_cbox_removeAlbumVersion').prop('checked', settings.removeAlbumVersion)
	$('#modal_settings_cbox_saveID3v1').prop('checked', settings.saveID3v1)
	$('#modal_settings_select_titleCasing').val(settings.titleCasing).formSelect()
	$('#modal_settings_select_artistCasing').val(settings.artistCasing).formSelect()


	$('#modal_settings_input_spotifyUser').val(localStorage.getItem('spotifyUser'))
	$('#modal_settings_input_spotifyClientID').val(spotifySettings.clientId)
	$('#modal_settings_input_spotifyClientSecret').val(spotifySettings.clientSecret)

	$('#modal_tags_title').prop('checked', settings.tags.title)
	$('#modal_tags_artist').prop('checked', settings.tags.artist)
	$('#modal_tags_album').prop('checked', settings.tags.album)
	$('#modal_tags_cover').prop('checked', settings.tags.cover)
	$('#modal_tags_trackNumber').prop('checked', settings.tags.trackNumber)
	$('#modal_tags_trackTotal').prop('checked', settings.tags.trackTotal)
	$('#modal_tags_discNumber').prop('checked', settings.tags.discNumber)
	$('#modal_tags_discTotal').prop('checked', settings.tags.discTotal)
	$('#modal_tags_albumArtist').prop('checked', settings.tags.albumArtist)
	$('#modal_tags_genre').prop('checked', settings.tags.genre)
	$('#modal_tags_year').prop('checked', settings.tags.year)
	$('#modal_tags_date').prop('checked', settings.tags.date)
	$('#modal_tags_explicit').prop('checked', settings.tags.explicit)
	$('#modal_tags_isrc').prop('checked', settings.tags.isrc)
	$('#modal_tags_length').prop('checked', settings.tags.length)
	$('#modal_tags_barcode').prop('checked', settings.tags.barcode)
	$('#modal_tags_bpm').prop('checked', settings.tags.bpm)
	$('#modal_tags_replayGain').prop('checked', settings.tags.replayGain)
	$('#modal_tags_publisher').prop('checked', settings.tags.publisher)
	$('#modal_tags_unsynchronisedLyrics').prop('checked', settings.tags.unsynchronisedLyrics)
	$('#modal_tags_copyright').prop('checked', settings.tags.copyright)
	$('#modal_tags_musicpublisher').prop('checked', settings.tags.musicpublisher)
	$('#modal_tags_composer').prop('checked', settings.tags.composer)
	$('#modal_tags_mixer').prop('checked', settings.tags.mixer)
	$('#modal_tags_author').prop('checked', settings.tags.author)
	$('#modal_tags_writer').prop('checked', settings.tags.writer)
	$('#modal_tags_engineer').prop('checked', settings.tags.engineer)
	$('#modal_tags_producer').prop('checked', settings.tags.producer)

	M.updateTextFields()
}


//#############################################MODAL_MSG##############################################\\
function message(title, message) {
	$('#modal_msg_title').html(title)
	$('#modal_msg_message').html(message)
	$('#modal_msg').modal('open')
}

//****************************************************************************************************\\
//************************************************TABS************************************************\\
//****************************************************************************************************\\

//#############################################TAB_SEARCH#############################################\\

// Submit Search Form
$('#tab_search_form_search').submit(function (ev) {
	ev.preventDefault()
	var searchString = $('#tab_search_form_search_input_searchString').val().trim()
	if (searchString.indexOf('deezer.com/') < 0 && searchString.indexOf('open.spotify.com/') < 0 && searchString.indexOf('spotify:') < 0) {
		var mode = $('#tab_search_form_search').find('input[name=searchMode]:checked').val()

		if (searchString.length == 0) {return}

		// Clean Table and show loading indicator
		$('#tab_search_table_results').find('thead').find('tr').addClass('hide')
		$('#tab_search_table_results_tbody_results').addClass('hide')
		$('#tab_search_table_results_tbody_noResults').addClass('hide')
		$('#tab_search_table_results_tbody_loadingIndicator').removeClass('hide')

		socket.emit("search", {type: mode, text: searchString})
	}else{
		parseDownloadFromURL($('#tab_search_form_search_input_searchString').val().trim())
	}
})

$("#tab_search_button").on('contextmenu', function(e){
	e.preventDefault()
	var urls = $("#tab_search_form_search_input_searchString").val()
	if (urls.indexOf('deezer.com/') < 0 && urls.indexOf('open.spotify.com/') < 0 && urls.indexOf('spotify:') < 0) {
		return false;
	}
	let urlsArray = urls.split(";")
	if(urlsArray.length != 0){
		$(modalQuality).data("url", urls)
		$(modalQuality).css('display', 'block')
		$(modalQuality).addClass('animated fadeIn')
	}
	return false;
})

function parseDownloadFromURL(urlsString){
	urls = urlsString.split(";")
	for(var i = 0; i < urls.length; i++){
		var url = urls[i]
		//Validate URL
		if (url.indexOf('deezer.com/') < 0 && url.indexOf('open.spotify.com/') < 0 && url.indexOf('spotify:') < 0) {
			return false
		}
		if (url.indexOf('?') > -1) {
			url = url.substring(0, url.indexOf("?"))
		}
		addToQueue(url)
	}
}

// Parse data from search
socket.on('search', function (data) {
	// Remove loading indicator
	$('#tab_search_table_results_tbody_loadingIndicator').addClass('hide')

	// If no data, display No Results Found
	if (data.items.length == 0) {
		$('#tab_search_table_results_tbody_noResults').removeClass('hide')
		return
	}

	// Populate table and show results
	if (data.type == 'track') {
		showResults_table_track(data.items)
	} else if (data.type == 'album') {
		showResults_table_album(data.items)
	} else if (data.type == 'artist') {
		showResults_table_artist(data.items)
	} else if (data.type == 'playlist') {
		showResults_table_playlist(data.items)
	}
	$('#tab_search_table_results_tbody_results').removeClass('hide')
})

function showResults_table_track(tracks) {
	var tableBody = $('#tab_search_table_results_tbody_results')
	$(tableBody).html('')
	$('#tab_search_table_results_thead_track').removeClass('hide')
	for (var i = 0; i < tracks.length; i++) {
		var currentResultTrack = tracks[i]
		$(tableBody).append(
			`<tr>
			<td><a href="#" class="rounded ${(currentResultTrack.preview ? `single-cover" preview="${currentResultTrack.preview}"><i class="material-icons preview_controls white-text">play_arrow</i>` : '">')}<img style="width:56px;" class="rounded" src="${(currentResultTrack.album.cover_small ? currentResultTrack.album.cover_small : "img/noCover.jpg" )}"/></a></td>
			<td class="hide-on-med-and-up">
				<p class="remove-margin">${(currentResultTrack.explicit_lyrics ? ' <i class="material-icons valignicon tiny materialize-red-text">explicit</i>' : '')} ${currentResultTrack.title}</p>
				<p class="remove-margin secondary-text">${currentResultTrack.artist.name}</p>
				<p class="remove-margin secondary-text">${currentResultTrack.album.title}</p>
			</td>
			<td class="hide-on-small-only breakline">${(currentResultTrack.explicit_lyrics ? ' <i class="material-icons valignicon tiny materialize-red-text">explicit</i>' : '')} ${currentResultTrack.title}</td>
			<td class="hide-on-small-only breakline"><span class="resultArtist resultLink" data-link="${currentResultTrack.artist.link}">${currentResultTrack.artist.name}</span></td>
			<td class="hide-on-small-only breakline"><span class="resultAlbum resultLink" data-link="https://www.deezer.com/album/${currentResultTrack.album.id}">${currentResultTrack.album.title}</span></td>
			<td>${convertDuration(currentResultTrack.duration)}</td>
			</tr>`)
		generateDownloadLink(currentResultTrack.link).appendTo(tableBody.children('tr:last')).wrap('<td>')
		addPreviewControlsHover(tableBody.children('tr:last').find('.preview_controls'))
		addPreviewControlsClick(tableBody.children('tr:last').find('.single-cover'))
		tableBody.children('tr:last').find('.resultArtist').click(function (ev){
			ev.preventDefault()
			showTrackList($(this).data("link"))
		})
		tableBody.children('tr:last').find('.resultAlbum').click(function (ev){
			ev.preventDefault()
			showTrackListSelective($(this).data("link"))
		})
	}
}

function showResults_table_album(albums) {
	var tableBody = $('#tab_search_table_results_tbody_results')
	$(tableBody).html('')
	$('#tab_search_table_results_thead_album').removeClass('hide')
	for (var i = 0; i < albums.length; i++) {
		var currentResultAlbum = albums[i]
		$(tableBody).append(
				`<tr>
				<td><img style="width:56px;" src="${(currentResultAlbum.cover_small ? currentResultAlbum.cover_small : "img/noCover.jpg")}" class="rounded" /></td>
				<td class="hide-on-med-and-up">
					<p class="remove-margin">${(currentResultAlbum.explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')} ${currentResultAlbum.title}</p>
					<p class="remove-margin secondary-text">${currentResultAlbum.artist.name}</p>
					<p class="remove-margin secondary-text">${currentResultAlbum.nb_tracks == "1" ? `1 Track` : `${currentResultAlbum.nb_tracks} Tracks`} • ${currentResultAlbum.record_type[0].toUpperCase() + currentResultAlbum.record_type.substring(1)}</p>
				</td>
				<td class="hide-on-small-only breakline">${(currentResultAlbum.explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')} ${currentResultAlbum.title}</td>
				<td class="hide-on-small-only breakline"><span class="resultArtist resultLink" data-link="${currentResultAlbum.artist.link}">${currentResultAlbum.artist.name}</span></td>
				<td class="hide-on-small-only">${currentResultAlbum.nb_tracks}</td>
				<td class="hide-on-small-only">${currentResultAlbum.record_type[0].toUpperCase() + currentResultAlbum.record_type.substring(1)}</td>
				</tr>`)
		generateShowTracklistSelectiveButton(currentResultAlbum.link).appendTo(tableBody.children('tr:last')).wrap('<td>')
		generateDownloadLink(currentResultAlbum.link).appendTo(tableBody.children('tr:last')).wrap('<td>')
		tableBody.children('tr:last').find('.resultArtist').click(function (ev){
			ev.preventDefault()
			showTrackList($(this).data("link"))
		})
	}
	$('.tooltipped').tooltip({delay: 100})
}

function showResults_table_artist(artists) {
	var tableBody = $('#tab_search_table_results_tbody_results')
	$(tableBody).html('')
	$('#tab_search_table_results_thead_artist').removeClass('hide')
	for (var i = 0; i < artists.length; i++) {
		var currentResultArtist = artists[i]
		$(tableBody).append(
				`<tr>
				<td><img style="width:56px;" src="${(currentResultArtist.picture_small ? currentResultArtist.picture_small : "img/noCover.jpg")}" class="rounded" /></td>
				<td class="breakline">${currentResultArtist.name}</td>
				<td>${currentResultArtist.nb_album}</td>
				</tr>`)
		generateShowTracklistButton(currentResultArtist.link).appendTo(tableBody.children('tr:last')).wrap('<td>')
		generateDownloadLink(currentResultArtist.link).appendTo(tableBody.children('tr:last')).wrap('<td>')
	}
}

function showResults_table_playlist(playlists) {
	var tableBody = $('#tab_search_table_results_tbody_results')
	$(tableBody).html('')
	$('#tab_search_table_results_thead_playlist').removeClass('hide')
	for (var i = 0; i < playlists.length; i++) {
		var currentResultPlaylist = playlists[i]
		$(tableBody).append(
				`<tr>
				<td><img style="width:56px;" src="${(currentResultPlaylist.picture_small ? currentResultPlaylist.picture_small : "img/noCover.jpg")}" class="rounded" /></td>
				<td class="breakline">${currentResultPlaylist.title}</td>
				<td>${currentResultPlaylist.nb_tracks}</td>
				</tr>`)
		generateShowTracklistSelectiveButton(currentResultPlaylist.link).appendTo(tableBody.children('tr:last')).wrap('<td>')
		generateDownloadLink(currentResultPlaylist.link).appendTo(tableBody.children('tr:last')).wrap('<td>')
	}
	$('.tooltipped').tooltip({delay: 100})
}

// TODO: Finish Vue.js Implementation
var trackListSelectiveModalApp = new Vue({
	el: '#modal_trackListSelective',
	data: {
		title: "",
		metadata : "",
		release_date: "",
		label: "",
		explicit: false,
		image: "",
		type: "",
		link: "",
		head: null,
		body: []
	}
})

var trackListModalApp = new Vue({
	el: '#modal_trackList',
	data: {
		title: "",
		metadata : {},
		release_date: "",
		label: "",
		image: "",
		type: "",
		link: "",
		head: null,
		body: []
	}
})

// Generate Button for tracklist with selection
function generateShowTracklistSelectiveButton(link) {
	var btn_showTrackListSelective = $('<button class="waves-effect btn-flat"><i class="material-icons">list</i></button>')
	$(btn_showTrackListSelective).click(function (ev){
		ev.preventDefault()
		showTrackListSelective(link)
	})
	return btn_showTrackListSelective
}

function showTrackListSelective(link) {
	$('#modal_trackListSelective_table_trackListSelective_tbody_trackListSelective').addClass('hide')
	$('#modal_trackListSelective_table_trackListSelective_tbody_loadingIndicator').removeClass('hide')
	trackListSelectiveModalApp.title = i18n("Loading...")
	trackListSelectiveModalApp.image = ""
	trackListSelectiveModalApp.metadata = ""
	trackListSelectiveModalApp.label = ""
	trackListSelectiveModalApp.release_date = ""
	trackListSelectiveModalApp.explicit = false
	trackListSelectiveModalApp.type = ""
	trackListSelectiveModalApp.head = []
	trackListSelectiveModalApp.body = []
	$('#modal_trackListSelective').modal('open')
	let type = getTypeFromLink(link)
	let id = getIDFromLink(link, type)
	socket.emit('getTrackList', {id: id, type: type})
}

$('#download_track_selection').on('contextmenu', function(e){
	e.preventDefault();
	var urls = []
	$("input:checkbox.trackCheckbox:checked").each(function(){
		urls.push($(this).val())
	})
	if(urls.length != 0){
		urls = urls.join(";")
		$(modalQuality).data("url", urls)
		$(modalQuality).css('display', 'block')
		$(modalQuality).addClass('animated fadeIn')
	}
	return false;
}).on('click', function(e){
	e.preventDefault()
	var urls = []
	$("input:checkbox.trackCheckbox:checked").each(function(){
		urls.push($(this).val())
	})
	if(urls.length != 0){
		for (var ia = 0; ia < urls.length; ia++) {
			addToQueue(urls[ia])
		}
	$('#modal_trackListSelective').modal('close')
	}
})

// Generate Button for tracklist without selection
function generateShowTracklistButton(link) {
	var btn_showTrackList = $('<button class="waves-effect btn-flat"><i class="material-icons">list</i></button>')
	$(btn_showTrackList).click(function (ev) {
		ev.preventDefault()
		showTrackList(link)
	})
	return btn_showTrackList
}

function showTrackList(link) {
	$('#modal_trackList_table_trackList_tbody_trackList').addClass('hide')
	$('#modal_trackList_table_trackList_tbody_loadingIndicator').removeClass('hide')
	trackListModalApp.title = i18n("Loading...")
	trackListModalApp.image = ""
	trackListModalApp.metadata = ""
	trackListModalApp.release_date = ""
	trackListModalApp.type = ""
	trackListModalApp.head = []
	trackListModalApp.body = []
	$('#modal_trackList').modal('open')
	let type = getTypeFromLink(link)
	let id = getIDFromLink(link, type)
	socket.emit('getTrackList', {id: id, type: type})
}

socket.on("getTrackList", function (data) {
	//data.err			-> undefined/err
	//data.id			  -> passed id
	//data.response -> API response
	if (data.err){
		trackListSelectiveModalApp.title = i18n("Can't get data")
		console.log(data.err)
		return
	}
	if (data.response){
		var trackList = data.response.data, content = ''
		var trackListSelective = data.response.data, content = ''
		if (typeof trackList == 'undefined') {
			alert(i18n('Well, there seems to be a problem with this part of the app. Please notify the developer.'))
			return
		}

		// ########################################
		if(data.reqType == 'album' || data.reqType == 'playlist' || data.reqType == 'spotifyplaylist'){
			var tableBody = $('#modal_trackListSelective_table_trackListSelective_tbody_trackListSelective')
		} else {
			var tableBody = $('#modal_trackList_table_trackList_tbody_trackList')
		}
		$(tableBody).html('')
		//############################################
		if (data.reqType == 'artist') {
			trackListModalApp.title = data.response.name
			trackListModalApp.image = data.response.picture_xl
			trackListModalApp.type = i18n(data.reqType[0].toUpperCase() + data.reqType.substring(1))
			trackListModalApp.link = `https://www.deezer.com/${data.reqType}/${data.id}`
			trackListModalApp.head = [
				{title: '', smallonly:true},
				{title: i18n('Album Title'), hideonsmall:true},
				{title: i18n('Release Date'), hideonsmall:true},
				{title: i18n('Record Type'), hideonsmall:true},
				{title: '', width: "56px"}
			]
			for (var i = 0; i < trackList.length; i++) {
				$(tableBody).append(
					`<tr>
					<td class="hide-on-med-and-up">
						<a href="#" class="album_chip" data-link="${trackList[i].link}"><div class="chip"><img src="${trackList[i].cover_small}"/>${(trackList[i].explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')}${trackList[i].title}</div></a>
						<p class="remove-margin secondary-text">${trackList[i].record_type[0].toUpperCase() + trackList[i].record_type.substring(1)} • ${trackList[i].release_date}</p>
					</td>
					<td class="hide-on-small-only breakline"><a href="#" class="album_chip" data-link="${trackList[i].link}"><div class="chip"><img src="${trackList[i].cover_small}"/>${(trackList[i].explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')}${trackList[i].title}</div></a></td>
					<td class="hide-on-small-only">${trackList[i].release_date}</td>
					<td class="hide-on-small-only">${trackList[i].record_type[0].toUpperCase() + trackList[i].record_type.substring(1)}</td>
					</tr>`
				)
				generateDownloadLink(trackList[i].link).appendTo(tableBody.children('tr:last')).wrap('<td>')
			}
			$('.album_chip').click(function(e){
				e.preventDefault();
				showTrackListSelective($(this).data('link'), true)
			})
		} else if(data.reqType == 'playlist') {
			trackListSelectiveModalApp.type = i18n(data.reqType[0].toUpperCase() + data.reqType.substring(1))
			trackListSelectiveModalApp.link = `https://www.deezer.com/${data.reqType}/${data.id}`
			trackListSelectiveModalApp.title = data.response.title
			trackListSelectiveModalApp.image = data.response.picture_xl
			trackListSelectiveModalApp.release_date = data.response.creation_date.substring(0,10)
			trackListSelectiveModalApp.metadata = `${i18n("by %{name}", {name: data.response.creator.name})} • ${i18n("%n songs", trackList.length)}`
			trackListSelectiveModalApp.head = [
				{title: '<i class="material-icons">music_note</i>', width: "24px"},
				{title: '#'},
				{title: i18n('Song')},
				{title: i18n('Artist'), hideonsmall:true},
				{title: i18n('Album'), hideonsmall:true},
				{title: '<i class="material-icons">timer</i>', width: "40px"},
				{title: '<div class="valign-wrapper"><label><input class="selectAll" type="checkbox" id="selectAll"><span></span></label></div>', width: "24px"}
			]
			$('.selectAll').prop('checked', false)
			let totalDuration = 0
			for (var i = 0; i < trackList.length; i++) {
				totalDuration += trackList[i].duration
				$(tableBody).append(
					`<tr>
					<td><i class="material-icons ${(trackList[i].preview ? `preview_playlist_controls" preview="${trackList[i].preview}"` : 'grey-text"')}>play_arrow</i></td>
					<td>${(i + 1)}</td>
					<td class="hide-on-med-and-up">
						<p class="remove-margin">${(trackList[i].explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')}${trackList[i].title}</p>
						<p class="remove-margin secondary-text">${trackList[i].artist.name}</p>
					</td>
					<td class="hide-on-small-only breakline">${(trackList[i].explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')}${trackList[i].title}</td>
					<td class="hide-on-small-only breakline"><span class="resultArtist resultLink" data-link="${trackList[i].artist.link}">${trackList[i].artist.name}</span></td>
					<td class="hide-on-small-only breakline"><span class="resultAlbum resultLink" data-link="https://www.deezer.com/album/${trackList[i].album.id}">${trackList[i].album.title}</span></td>
					<td>${convertDuration(trackList[i].duration)}</td>
					<td>
						<div class="valign-wrapper">
						<label>
						<input class="trackCheckbox valign" type="checkbox" id="trackChk${i}" value="${trackList[i].link}"><span></span>
						</label>
						</div>
					</td>
					</tr>`
				)
				addPreviewControlsClick(tableBody.children('tr:last').find('.preview_playlist_controls'))
				tableBody.children('tr:last').find('.resultArtist').click(function (ev){
					ev.preventDefault()
					showTrackList($(this).data("link"))
				})
				tableBody.children('tr:last').find('.resultAlbum').click(function (ev){
					ev.preventDefault()
					showTrackListSelective($(this).data("link"))
				})
			}
			var [hh,mm,ss] = convertDurationSeparated(totalDuration)
			trackListSelectiveModalApp.metadata += `, ${hh>0 ? `${hh} hr` : ""} ${mm} min`
		} else if(data.reqType == 'album') {
			trackListSelectiveModalApp.type = i18n(data.reqType[0].toUpperCase() + data.reqType.substring(1))
			trackListSelectiveModalApp.link = `https://www.deezer.com/${data.reqType}/${data.id}`
			trackListSelectiveModalApp.title = data.response.title
			trackListSelectiveModalApp.explicit = data.response.explicit_lyrics
			trackListSelectiveModalApp.label = data.response.label
			trackListSelectiveModalApp.metadata = `${data.response.artist.name} • ${i18n("%n songs", trackList.length)}`
			trackListSelectiveModalApp.release_date = data.response.release_date.substring(0,10)
			trackListSelectiveModalApp.image = data.response.cover_xl
			trackListSelectiveModalApp.head = [
				{title: '<i class="material-icons">music_note</i>', width: "24px"},
				{title: '#'},
				{title: i18n('Song')},
				{title: i18n('Artist'), hideonsmall:true},
				{title: '<i class="material-icons">timer</i>', width: "40px"},
				{title: '<div class="valign-wrapper"><label><input class="selectAll" type="checkbox" id="selectAll"><span></span></label></div>', width: "24px"}
			]
			$('.selectAll').prop('checked', false)
			if (trackList[trackList.length-1].disk_number != 1){
				baseDisc = 0
			} else {
				baseDisc =1
			}
			let totalDuration = 0
			for (var i = 0; i < trackList.length; i++) {
				totalDuration += trackList[i].duration
				discNum = trackList[i].disk_number
				if (discNum != baseDisc){
					$(tableBody).append(`<tr><td colspan="4" style="opacity: 0.54;"><i class="material-icons valignicon tiny">album</i>${discNum}</td></tr>`)
					baseDisc = discNum
				}
				$(tableBody).append(
					`<tr>
					<td><i class="material-icons ${(trackList[i].preview ? `preview_playlist_controls" preview="${trackList[i].preview}"` : 'grey-text"')}>play_arrow</i></td>
					<td>${trackList[i].track_position}</td>
					<td class="hide-on-med-and-up">
						<p class="remove-margin">${(trackList[i].explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')}${trackList[i].title}</p>
						<p class="remove-margin secondary-text">${trackList[i].artist.name}</p>
					</td>
					<td class="hide-on-small-only breakline">${(trackList[i].explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')}${trackList[i].title}</td>
					<td class="hide-on-small-only breakline">${trackList[i].artist.name}</td>
					<td>${convertDuration(trackList[i].duration)}</td>
					<td>
						<div class="valign-wrapper">
						<label>
						<input class="trackCheckbox valign" type="checkbox" id="trackChk${i}" value="${trackList[i].link}"><span></span>
						</label>
						</div>
					</td>
					</tr>`
				)
				addPreviewControlsClick(tableBody.children('tr:last').find('.preview_playlist_controls'))
			}
			var [hh,mm,ss] = convertDurationSeparated(totalDuration)
			trackListSelectiveModalApp.metadata += `, ${hh>0 ? `${hh} hr` : ""} ${mm} min`
		} else if(data.reqType == 'spotifyplaylist') {
			trackListSelectiveModalApp.type = i18n("Spotify Playlist")
			trackListSelectiveModalApp.link = 'spotify:playlist:'+data.id
			trackListSelectiveModalApp.title = data.response.title
			trackListSelectiveModalApp.image = data.response.image
			trackListSelectiveModalApp.metadata = `${i18n("by %{name}", {name: data.response.owner})} • ${i18n("%n songs", trackList.length)}`
			trackListSelectiveModalApp.head = [
				{title: '<i class="material-icons">music_note</i>', width: "24px"},
				{title: '#'},
				{title: i18n('Song')},
				{title: i18n('Artist'), hideonsmall:true},
				{title: '<i class="material-icons">timer</i>', width: "40px"},
				{title: '<div class="valign-wrapper"><label><input class="selectAll" type="checkbox" id="selectAll"><span></span></label></div>', width: "24px"}
			]
			let totalDuration = 0
			for (var i = 0; i < trackList.length; i++) {
				totalDuration += trackList[i].duration
				$(tableBody).append(
					`<tr>
					<td><i class="material-icons ${(trackList[i].preview ? `preview_playlist_controls" preview="${trackList[i].preview}"` : 'grey-text"')}>play_arrow</i></td>
					<td>${(i + 1)}</td>
					<td class="hide-on-med-and-up">
						<p class="remove-margin">${(trackList[i].explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')}${trackList[i].title}</p>
						<p class="remove-margin secondary-text">${trackList[i].artist.name}</p>
					</td>
					<td class="hide-on-small-only breakline">${(trackList[i].explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')}${trackList[i].title}</td>
					<td class="hide-on-small-only breakline">${trackList[i].artist.name}</td>
					<td>${convertDuration(trackList[i].duration)}</td>
					<td>
						<div class="valign-wrapper">
						<label>
						<input class="trackCheckbox valign" type="checkbox" id="trackChk${i}" value="${trackList[i].link}"><span></span>
						</label>
						</div>
					</td>
					</tr>`
				)
				addPreviewControlsClick(tableBody.children('tr:last').find('.preview_playlist_controls'))
			}
			var [hh,mm,ss] = convertDurationSeparated(totalDuration)
			trackListSelectiveModalApp.metadata += `, ${hh>0 ? `${hh} hr` : ""} ${mm} min`
		} else {
			trackListModalApp.type = null
			trackListModalApp.title = 'Tracklist'
			trackListModalApp.head = [
				{title: '<i class="material-icons">music_note</i>'},
				{title: '#'},
				{title: 'Song'},
				{title: 'Artist'},
				{title: '<i class="material-icons">timer</i>'}
			]
			for (var i = 0; i < trackList.length; i++) {
				$(tableBody).append(
					`<tr>
					<td><i class="material-icons ${(trackList[i].preview ? `preview_playlist_controls" preview="${trackList[i].preview}"` : 'grey-text"')}>play_arrow</i></td>
					<td>${(i + 1)}</td>
					<td>${(trackList[i].explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')}${trackList[i].title}</td>
					<td>${trackList[i].artist.name}</td>
					<td>${convertDuration(trackList[i].duration)}</td>
					</tr>`
				)
				addPreviewControlsClick(tableBody.children('tr:last').find('.preview_playlist_controls'))
			}
		}
		if(data.reqType == 'album' || data.reqType == 'playlist' || data.reqType == 'spotifyplaylist'){
			$('#modal_trackListSelective_table_trackListSelective_tbody_loadingIndicator').addClass('hide')
			$('#modal_trackListSelective_table_trackListSelective_tbody_trackListSelective').removeClass('hide')
		} else {
			$('#modal_trackList_table_trackList_tbody_loadingIndicator').addClass('hide')
			$('#modal_trackList_table_trackList_tbody_trackList').removeClass('hide')
		}
		//$('#modal_trackList_table_trackList_tbody_trackList').html(content)
	}
})

//#############################################TAB_CHARTS#############################################\\
socket.on("getChartsCountryList", function (data) {
	//data.countries		-> Array
	//data.countries[0].country -> String (country name)
	//data.countries[0].picture_small/picture_medium/picture_big -> url to cover
	for (var i = 0; i < data.countries.length; i++) {
		$('#tab_charts_select_country').append('<option value="' + data.countries[i]['country'] + '" data-icon="' + data.countries[i]['picture_small'] + '" class="left rounded">' + data.countries[i]['country'] + '</option>')
		$('#modal_settings_select_chartsCounrty').append('<option value="' + data.countries[i]['country'] + '" data-icon="' + data.countries[i]['picture_small'] + '" class="left rounded">' + data.countries[i]['country'] + '</option>')
	}
	$('#tab_charts_select_country').find('option[value="' + data.selected + '"]').attr("selected", true)
	$('select').formSelect()
})

$('#tab_charts_select_country').on('change', function () {
	var country = $(this).find('option:selected').val()
	localStorage.setItem('chartsCountry', country)
	$('#tab_charts_table_charts_tbody_charts').addClass('hide')
	$('#tab_charts_table_charts_tbody_loadingIndicator').removeClass('hide')
	socket.emit("getChartsTrackListByCountry", {country: country})
})

socket.on("getChartsTrackListByCountry", function (data) {
	//data.playlist		-> Object with Playlist information
	//data.tracks			-> Array
	//data.tracks[0]	 -> Object of track 0
	$("#downloadChartPlaylist").data("id", data.playlistId)
	var chartsTableBody = $('#tab_charts_table_charts_tbody_charts'), currentChartTrack
	chartsTableBody.html('')
	for (var i = 0; i < data.tracks.length; i++) {
		currentChartTrack = data.tracks[i]
		$(chartsTableBody).append(
				`<tr>
				<td>${(i + 1)}</td>
				<td><a href="#" class="rounded ${(currentChartTrack.preview ? `single-cover" preview="${currentChartTrack.preview}"><i class="material-icons preview_controls white-text">play_arrow</i>` : '">')}<img style="width:56px;" src="${(currentChartTrack.album.cover_small ? currentChartTrack.album.cover_small : "img/noCover.jpg")}" class="rounded" /></a></td>
				<td class="hide-on-med-and-up">
					<p class="remove-margin">${(currentChartTrack.explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')}${currentChartTrack.title}</p>
					<p class="remove-margin secondary-text">${currentChartTrack.artist.name}</p>
					<p class="remove-margin secondary-text">${currentChartTrack.album.title}</p>
				</td>
				<td class="hide-on-small-only breakline">${(currentChartTrack.explicit_lyrics ? `<i class="material-icons valignicon tiny materialize-red-text tooltipped" data-tooltip="${i18n("Explicit")}">explicit</i> ` : '')}${currentChartTrack.title}</td>
				<td class="hide-on-small-only breakline"><span class="resultArtist resultLink" data-link="${currentChartTrack.artist.link}">${currentChartTrack.artist.name}</span></td>
				<td class="hide-on-small-only breakline"><span class="resultAlbum resultLink" data-link="https://www.deezer.com/album/${currentChartTrack.album.id}">${currentChartTrack.album.title}</span></td>
				<td>${convertDuration(currentChartTrack.duration)}</td>
				</tr>`)
		generateDownloadLink(currentChartTrack.link).appendTo(chartsTableBody.children('tr:last')).wrap('<td>')
		addPreviewControlsHover(chartsTableBody.children('tr:last').find('.preview_controls'))
		addPreviewControlsClick(chartsTableBody.children('tr:last').find('.single-cover'))
		chartsTableBody.children('tr:last').find('.resultArtist').click(function (ev){
			ev.preventDefault()
			showTrackList($(this).data("link"))
		})
		chartsTableBody.children('tr:last').find('.resultAlbum').click(function (ev){
			ev.preventDefault()
			showTrackListSelective($(this).data("link"))
		})
	}
	$('#tab_charts_table_charts_tbody_loadingIndicator').addClass('hide')
	chartsTableBody.removeClass('hide')
})

//#############################################TAB_PLAYLISTS############################################\\
socket.on("getMyPlaylistList", function (data) {
	var tableBody = $('#table_personal_playlists')
	$(tableBody).html('')
	for (var i = 0; i < data.playlists.length; i++) {
		var currentResultPlaylist = data.playlists[i]
		$(tableBody).append(
				`<tr>
				<td><img src="${currentResultPlaylist.image}" class="rounded" width="56px" /></td>
				<td>${currentResultPlaylist.title}</td>
				<td>${currentResultPlaylist.songs}</td>
				</tr>`)
		generateShowTracklistSelectiveButton(currentResultPlaylist.link).appendTo(tableBody.children('tr:last')).wrap('<td>')

		generateDownloadLink(currentResultPlaylist.link).appendTo(tableBody.children('tr:last')).wrap('<td>')
	}
	$('.tooltipped').tooltip({delay: 100})
})

//###############################################TAB_LINK#############################################\\

var linkAnalyzerSong = new Vue({
	el: '#link_analyzer_song',
	data: {
		d:{}
	},
	methods:{
		showArtist: function(){
			showTrackList(this.d.artist.link)
		},
		showAlbum: function(){
			showTrackListSelective(`https://www.deezer.com/album/${this.d.album.id}`)
		}
	}
})

var linkAnalyzerAlbum = new Vue({
	el: '#link_analyzer_album',
	data: {
		d:{}
	},
	methods:{
		showArtist: function(){
			showTrackList(`https://www.deezer.com/artist/${this.d.artist.id}`)
		}
	}
})

var linkAnalyzerCountryModal = new Vue({
	el: '#modal_link_analyzer_country',
	data: {
		title: "",
		countries: []
	}
})

function parseLinkAnalyzer(link){
	type = getTypeFromLink(link)
	if (["track","album"].indexOf(type) == -1){
		toast(i18n("Wrong Type!"))
		return False
	}
	id = getIDFromLink(link)
	$("#link_analyzer_start").hide()
	$("#link_analyzer_album").hide()
	$("#link_analyzer_song").hide()
	$("#link_analyzer_loading").show()
	socket.emit("analyze"+type, id)
}

socket.on("analyzetrack", (data)=>{
	data.countries_string = ""
	let countries = []
	data.available_countries.forEach((cc)=>{
		let temp = []
		let chars = [...cc].map(c => c.charCodeAt() + 127397)
		temp.push(String.fromCodePoint(...chars))
		temp.push(COUNTRIES[cc])
		countries.push(temp)
	})
	data.duration_string = convertDuration(data.duration)
	linkAnalyzerCountryModal.title = `${data.title}${data.title_version ? ` ${data.title_version}`: ""}`
	linkAnalyzerCountryModal.countries = countries
	linkAnalyzerSong.d = data
	$("#link_analyzer_loading").hide()
	$("#link_analyzer_song").show()
})

socket.on("analyzealbum", (data)=>{
	let genres = []
	data.genres.data.forEach((genre)=>{
		genres.push(genre.name)
	})
	data.genres_string = genres.join(", ")
	data.duration_string = convertDuration(data.duration)
	data.tracks_string = i18n("%n songs", parseInt(data.nb_tracks))
	linkAnalyzerAlbum.d = data
	$("#link_analyzer_loading").hide()
	$("#link_analyzer_album").show()
})

//############################################TAB_DOWNLOADS###########################################\\
function addToQueue(url, forceBitrate=null) {
	bitrate = forceBitrate ? forceBitrate : userSettings.maxBitrate
	var type = getTypeFromLink(url), id = getIDFromLink(url, type)
	if (['track', 'spotifytrack', 'playlist', 'spotifyplaylist', 'album', 'spotifyalbum', 'artist', 'artisttop'].indexOf(type) == -1) {
		M.toast({html: `<i class="material-icons left">error</i> ${i18n("Wrong Type!")}`, displayLength: 5000, classes: 'rounded'})
		return false
	}
	if (alreadyInQueue(id, bitrate)) {
		M.toast({html: `<i class="material-icons left">playlist_add_check</i> ${i18n("Already in download-queue!")}`, displayLength: 5000, classes: 'rounded'})
		return false
	}
	if (id.match(/^-?[0-9]+$/) == null && type.indexOf("spotify")<-1) {
		M.toast({html: `<i class="material-icons left">error</i> ${i18n("Wrong ID!")}`, displayLength: 5000, classes: 'rounded'})
		return false
	}
	socket.emit("download" + type, {id: id, settings: userSettings, bitrate: bitrate})
	downloadQueue.push(`${id}:${bitrate}`)
	M.toast({html: `<i class="material-icons left">add</i> ${i18n("Added to download-queue")}`, displayLength: 5000, classes: 'rounded'})
}

function alreadyInQueue(id, bitrate) {
	var alreadyInQueue = false
	downloadQueue.forEach(function(x){
		if(x == `${id}:${bitrate}`){
			alreadyInQueue = true
			return false
		}
	})
	if (!alreadyInQueue){
		$('#tab_downloads_table_downloads').find('tbody').find('tr').each(function () {
			if ($(this).data('deezerid') == `${id}:${bitrate}` || $(this).data('urlid') == id) {
				alreadyInQueue = true
				return false
			}
		})
	}
	return alreadyInQueue
}

function addObjToQueue(data){
	if (!data.id in downloadQueue) downloadQueue.push(data.id)
	var tableBody = $('#tab_downloads_table_downloads').find('tbody')

	// If we're downloading a single track album, we create a `data-urlid` property
	// containing the album ID that's the same on the URL. Example:
	//
	// https://www.deezer.com/us/album/6389674 --> data-urlid is 6389674
	//
	// That way we can properly detect if a single track albums in the queue. See issue #224
	var url_id = ('urlId' in data) ? data.urlId : ''

	$(tableBody).append(
			`<tr class="downloadInfo" id="${data.queueId}" data-deezerid="${data.id}" data-urlid="${url_id}">
				<td class="downloadInfo-cover">
					<img width="75px" src="${data.cover}" alt="Cover ${data.name}"/>
				</td>
				<td class="downloadInfo-meta">
					${data.name}<br>
					<span class="secondary-text">${data.artist}</span>
				</td>
				<td class="downloadInfo-info">
					<span class="queueDownloaded">${data.downloaded + data.failed}</span>/<span class="queueSize">${data.size}</span><br>
					<span class="secondary-text"><span class="queueFailed">${data.failed}</span> ${i18n("Failed")}</span>
				</td>
			</tr>
			<tr class="downloadBar" id="bar-${data.queueId}">
				<td colspan="4" class="progress"><div class="changeThis indeterminate"></div></td>
			</tr>`)

	var btn_remove = $('<button class="btn-flat waves-effect"><i class="material-icons">remove</i></button>')

	$(btn_remove).click(function (ev) {
		ev.preventDefault()
		socket.emit("cancelDownload", {queueId: data.queueId})
	})

	btn_remove.appendTo(tableBody.children('tr.downloadInfo:last')).wrap('<td class="eventBtn center">')

}

socket.on('addToQueue', function(data){addObjToQueue(data)})
socket.on('populateDownloadQueue', function(data){
	Object.keys(data).forEach(function(x) {
		downloadQueue.push(`${data[x].id}:${data[x].bitrate}`)
		if ($('#' + data[x].queueId).length == 0){
			addObjToQueue(data[x])
		}
	})
})

socket.on("downloadStarted", function (data) {
	//data.queueId -> queueId of started download

	//Switch progress type indeterminate to determinate
	$('#bar-' + data.queueId).find('.changeThis').removeClass('indeterminate').addClass('determinate')
	$('#' + data.queueId).find('.eventBtn').find('a').html('<i class="material-icons">clear</i>')

})

socket.on('updateQueue', function (data) {

	if (data.cancelFlag) {
		return
	}

	$('#' + data.queueId).find('.queueDownloaded').html(data.downloaded + data.failed)
	$('#' + data.queueId).find('.queueFailed').html(data.failed)

	if (data.failed == 0 && ((data.downloaded + data.failed) >= data.size)) {
		$('#' + data.queueId).find('.eventBtn').html('<i class="material-icons">done</i>')
		$('#' + data.queueId+',#bar-' + data.queueId).addClass('finished')
		M.toast({html: `<i class="material-icons left">done</i>${quoteattr(data.name)} - ${i18n("Completed!")}`, displayLength: 5000, classes: 'rounded'})
	} else if (data.downloaded == 0 && ((data.downloaded + data.failed) >= data.size)) {
		$('#' + data.queueId).find('.eventBtn').html('<i class="material-icons">error</i>')
		$('#' + data.queueId+',#bar-' + data.queueId).addClass('error')
		M.toast({html: `<i class="material-icons left">error</i>${quoteattr(data.name)} - ${i18n("Failed!")}`, displayLength: 5000, classes: 'rounded'})
	} else if ((data.downloaded + data.failed) >= data.size) {
		$('#' + data.queueId).find('.eventBtn').html('<i class="material-icons">warning</i>')
		$('#' + data.queueId+',#bar-' + data.queueId).addClass('error')
		M.toast({html: `<i class="material-icons left">warning</i>${quoteattr(data.name)} - ${i18n("Completed with errors!")}`, displayLength: 5000, classes: 'rounded'})
	}
	if (data.errorLog != ""){
		var errorLog = `<table><tr><th>${i18n("ID")}</th><th>${i18n("Song")}</th><th>${i18n("Error")}</th></tr><tr><td>`
		errorLog += data.errorLog.split("\r\n").join("</td></tr><tr><td>").split(" | ").join("</td><td>")
		errorLog = errorLog.slice(0, errorLog.length-8)+"</table>"
		$('#' + data.queueId).find('.eventBtn').click(()=>{
			message(`Errors for ${quoteattr(data.name)}`, errorLog)
		})
	}
})

socket.on("downloadProgress", function (data) {
	//data.queueId -> id (string)
	//data.percentage -> float/double, percentage
	//updated in 1% steps
	let progressbar = $('#bar-' + data.queueId).find('.changeThis')
	if (progressbar.hasClass('indeterminate')) progressbar.removeClass('indeterminate').addClass('determinate')
	$('#bar-' + data.queueId).find('.changeThis').css('width', data.percentage + '%')
})

socket.on("emptyDownloadQueue", function () {
	M.toast({html: `<i class="material-icons left">done_all</i>${i18n("All downloads completed!")}`, displayLength: 5000, classes: 'rounded'})
})

socket.on("cancelDownload", function (data) {
	//data.queueId		-> queueId of item which was canceled
	$('#' + data.queueId+',#bar-' + data.queueId).addClass('animated fadeOutRight').on('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function () {
		downloadQueue.splice( downloadQueue.indexOf(data.id), 1)
		$(this).remove()
		if (!data.cleanAll) M.toast({html: `<i class="material-icons left">clear</i>${i18n("One download removed!")}`, displayLength: 5000, classes: 'rounded'})
	})
})

socket.on("silentlyCancelDownload", function(id){
	if (downloadQueue.indexOf(id)>-1)
		downloadQueue.splice( downloadQueue.indexOf(id), 1)
})

$('#clearTracksTable').click(function (ev) {
	$('#tab_downloads_table_downloads').find('tbody').find('.finished, .error').addClass('animated fadeOutRight').on('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function () {
		downloadQueue.splice( downloadQueue.indexOf($(this).data('deezerid')), 1)
		$(this).remove()
	})
	return false
})

$('#cancelAllTable').click(function (ev) {
	let listOfIDs = $('#tab_downloads_table_downloads').find('tbody').find('tr').map((x,i)=>{
		return $(i).attr('id')
	}).get()
	listOfIDs.forEach(function(x){
		downloadQueue.splice( listOfIDs.indexOf(x), 1)
	})
	socket.emit('cancelAllDownloads', {queueList: listOfIDs})
})

socket.on("cancelAllDownloads", function () {
	M.toast({html: `<i class="material-icons left">clear</i>${i18n("All downloads removed!")}`, displayLength: 5000, classes: 'rounded'})
})

//****************************************************************************************************\\
//******************************************HELPER-FUNCTIONS******************************************\\
//****************************************************************************************************\\
/**
 * Replaces special characters with HTML friendly counterparts
 * @param s string
 * @param preserveCR preserves the new line character
 * @returns {string}
 */
function quoteattr(s, preserveCR) {
  preserveCR = preserveCR ? '&#13;' : '\n'
  return ('' + s) /* Forces the conversion to string. */
  	.replace(/&/g, '&amp;') /* This MUST be the 1st replacement. */
    .replace(/'/g, '&apos;') /* The 4 other predefined entities, required. */
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    /*
    You may add other replacements here for HTML only
    (but it's not necessary).
    Or for XML, only if the named entities are defined in its DTD.
    */
    .replace(/\r\n/g, preserveCR) /* Must be before the next replacement. */
    .replace(/[\r\n]/g, preserveCR)

}

function getIDFromLink(link, type) {
	if (link.indexOf('?') > -1) {
		link = link.substring(0, link.indexOf("?"))
	}
	// Spotify
	if ((link.startsWith("http") && link.indexOf('open.spotify.com/') >= 0)){
		switch (type){
			case "spotifyplaylist":
				return link.slice(link.indexOf("/playlist/")+10)
				break
			case "spotifytrack":
				return link.slice(link.indexOf("/track/")+7)
				break
			case "spotifyalbum":
				return link.slice(link.indexOf("/album/")+7)
				break
		}
	} else if (link.startsWith("spotify:")){
		switch (type){
			case "spotifyplaylist":
				return link.slice(link.indexOf("playlist:")+9)
				break
			case "spotifytrack":
				return link.slice(link.indexOf("track:")+6)
				break
			case "spotifyalbum":
				return link.slice(link.indexOf("album:")+6)
				break
		}


	// Deezer
	} else if(type == "artisttop") {
		return link.match(/\/artist\/(\d+)\/top_track/)[1];
	} else {
		return link.substring(link.lastIndexOf("/") + 1)
	}
}

function getTypeFromLink(link) {
	var type
	if (link.indexOf('spotify') > -1){
		type = "spotify"
		if (link.indexOf('playlist') > -1) type += "playlist"
		else if (link.indexOf('track') > -1) type += "track"
		else if (link.indexOf('album') > -1) type += "album"
	} else	if (link.indexOf('/track') > -1) {
		type = "track"
	} else if (link.indexOf('/playlist') > -1) {
		type = "playlist"
	} else if (link.indexOf('/album') > -1) {
		type = "album"
	} else if (link.match(/\/artist\/(\d+)\/top_track/)) {
		type = "artisttop";
	} else if (link.indexOf('/artist')) {
		type = "artist"
	}
	return type
}

function generateDownloadLink(url) {
	var btn_download = $('<button class="waves-effect btn-flat" oncontextmenu="return false;"><i class="material-icons">file_download</i></button>')
	$(btn_download).on('contextmenu', function(e){
    e.preventDefault();
		$(modalQuality).data("url", url)
		$(modalQuality).css('display', 'block')
		$(modalQuality).addClass('animated fadeIn')
    return false;
	}).on('click', function(e){
	    e.preventDefault();
	    addToQueue(url)
	})
	return btn_download
}

function modalQualityButton(bitrate){
	var url=$(modalQuality).data("url")
	if (url.indexOf(";") != -1){
		urls = url.split(";")
		urls.forEach(url=>{
			addToQueue(url, bitrate)
		})
	}else{
		addToQueue(url, bitrate)
	}
	$('#modal_trackListSelective').modal('close')
	$(modalQuality).addClass('animated fadeOut')
}

function addPreviewControlsHover(el){
	el.hover( function () {
		$(this).css({opacity: 1})
	}, function () {
		if (($(this).parent().attr("playing") && preview_stopped) || !$(this).parent().attr("playing")){
			$(this).css({opacity: 0}, 200)
		}
	})
}

function addPreviewControlsClick(el){
	el.click(function (e) {
		e.preventDefault()
		var icon = (this.tagName == "I" ? $(this) : $(this).children('i'))
		if ($(this).attr("playing")){
			if (preview_track.paused){
				preview_track.play()
				preview_stopped = false
				icon.text("pause")
				$(preview_track).animate({volume: 1}, 500)
			}else{
				preview_stopped = true
				icon.text("play_arrow")
				$(preview_track).animate({volume: 0}, 250, "swing", ()=>{ preview_track.pause() })
			}
		}else{
			$("*").removeAttr("playing")
			$(this).attr("playing",true)
			$('.preview_controls').text("play_arrow")
			$('.preview_playlist_controls').text("play_arrow")
			$('.preview_controls').css({opacity:0})
			icon.text("pause")
			icon.css({opacity: 1})
			preview_stopped = false
			$(preview_track).animate({volume: 0}, 250, "swing", ()=>{
				preview_track.pause()
				$('#preview-track_source').prop("src", $(this).attr("preview"))
				preview_track.load()
			})
		}
	})
}

function convertDuration(duration) {
	//convert from seconds only to mm:ss format
	var mm, ss
	mm = Math.floor(duration / 60)
	ss = duration - (mm * 60)
	//add leading zero if ss < 0
	if (ss < 10) {
		ss = "0" + ss
	}
	return mm + ":" + ss
}

function convertDurationSeparated(duration){
	var hh, mm, ss
	mm = Math.floor(duration / 60)
	hh = Math.floor(mm / 60)
	ss = duration - (mm * 60)
	mm -= hh*60
	return [hh, mm, ss]
}

function sleep(milliseconds) {
  var start = new Date().getTime()
  for (var i = 0; i < 1e7; i++) {
    if ((new Date().getTime() - start) > milliseconds){
      break
		}
  }
}
