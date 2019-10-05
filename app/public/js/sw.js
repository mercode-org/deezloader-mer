self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open('deezloader').then(function(cache) {
      return cache.addAll([
        '/',
        '/index.html',
        '/js/socket.io.js',
        '/js/jquery-3.3.1.min.js',
        '/js/materialize.min.js',
        '/js/vue.min.js',
        '/js/appBase.js',
        '/js/frontend.js',
        '/css/animate.css',
        '/css/darkMode.css',
        '/css/material-icons.css',
        '/css/materialize.min.css',
        '/css/style.css',
        '/fonts/icons/MaterialIcons-Regular.woff2',
        '/fonts/roboto/Roboto-Bold.woff2',
        '/fonts/roboto/Roboto-Light.woff2',
        '/fonts/roboto/Roboto-Medium.woff2',
        '/fonts/roboto/Roboto-Regular.woff2',
        '/fonts/roboto/Roboto-Thin.woff2'
      ]);
    })
  );
 });
