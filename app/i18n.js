var i18n = require('i18n');

i18n.configure({
  // setup some locales - other locales default to en silently
  locales:['en', 'it', 'de', 'es'],

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
