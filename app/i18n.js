const i18n = require('i18n');
const path = require('path');
const fs = require('fs');
const directoryPath = path.join(__dirname, '/public/locales');
var locales = []
var files = fs.readdirSync(directoryPath)
files.forEach(function (file) {
		// Do whatever you want to do with the file
		locales.push(file.slice(0, -5))
});

i18n.configure({
  // setup some locales - other locales default to en silently
  locales: locales,

  // where to store json files - defaults to './locales' relative to modules directory
  directory: __dirname + '/public/locales',
  defaultLocale: 'en',

  // sets a custom cookie name to parse locale settings from  - defaults to NULL
  cookie: 'lang',
});

module.exports = i18n

module.exports.express = function(req, res, next) {
  i18n.init(req, res);
  var current_locale = i18n.getLocale();
  return next();
};
