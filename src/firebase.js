// Inicialización del SDK cliente de Firebase. Expone:
//   window.firebaseApp, window.firebaseAuth, window.firebaseDb
// En localhost conecta automáticamente con los emuladores declarados en firebase.json.

(function () {
  if (!window.firebase) {
    console.error('[firebase] SDK no cargado. Revisa los <script> de firebase-*-compat en index.html.');
    return;
  }
  if (!window.firebaseConfig) {
    console.error('[firebase] firebaseConfig ausente. Carga src/firebase-config.js antes de src/firebase.js.');
    return;
  }

  const app  = firebase.initializeApp(window.firebaseConfig);
  const auth = firebase.auth();
  const db   = firebase.firestore();

  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if (isLocal && !window.__FB_EMULATORS_CONNECTED__) {
    try {
      auth.useEmulator('http://localhost:9099', { disableWarnings: true });
      db.useEmulator('localhost', 8080);
      window.__FB_EMULATORS_CONNECTED__ = true;
      console.info('[firebase] emuladores locales conectados (auth:9099, firestore:8080)');
    } catch (e) {
      console.warn('[firebase] fallo al conectar con emuladores locales', e);
    }
  }

  window.firebaseApp  = app;
  window.firebaseAuth = auth;
  window.firebaseDb   = db;
})();
