// Capa de acceso a datos Firestore — App Maletines UCP.
// Depende de window.firebaseAuth / window.firebaseDb (creados por src/firebase.js).
//
// API expuesta en window.db:
//   auth:    onAuthChange, signIn, signOut, sendPasswordReset, getProfile
//   writes:  logUsage, replace, setExpiry, setIncident, logRevision
//   reads:   subscribeUsers, subscribeBags, subscribeBagItems,
//            subscribeUsageEvents, subscribeReplaceEvents, subscribeRevisions
//
// Convenciones:
//   · usageEvents, replaceEvents, revisions son append-only (firestore.rules lo fuerza).
//   · Timestamps (at, createdAt, updatedAt) → serverTimestamp() del SDK.
//   · Fechas civiles (expiry, lastRevision, nextRevision) → strings ISO 'YYYY-MM-DD'.
//   · Los writes rellenan by/byUid/byRole a partir del usuario autenticado.

(function () {
  if (!window.firebaseAuth || !window.firebaseDb) {
    console.error('[db] Firebase no inicializado. Carga src/firebase.js antes de src/db.js.');
    return;
  }

  const auth = window.firebaseAuth;
  const fs   = window.firebaseDb;
  const FV   = firebase.firestore.FieldValue;

  // ---------------- Sesión ----------------

  let currentProfile = null;              // { uid, email, name, role, bagId, ... }
  const profileListeners = new Set();

  function getProfile() { return currentProfile; }

  function requireProfile() {
    if (!currentProfile) throw new Error('[db] No hay sesión activa');
    return currentProfile;
  }

  async function loadProfile(authUser) {
    if (!authUser) { currentProfile = null; return null; }
    try {
      const snap = await fs.doc(`users/${authUser.uid}`).get();
      if (!snap.exists) {
        console.warn(`[db] users/${authUser.uid} no existe. Ejecuta scripts/seed-users.js.`);
        currentProfile = {
          uid: authUser.uid, email: authUser.email,
          name: authUser.email, role: null, bagId: null,
        };
      } else {
        currentProfile = { uid: authUser.uid, ...snap.data() };
      }
    } catch (e) {
      console.warn('[db] no se pudo leer el perfil de users/', authUser.uid, e);
      currentProfile = {
        uid: authUser.uid, email: authUser.email,
        name: authUser.email, role: null, bagId: null,
      };
    }
    return currentProfile;
  }

  auth.onAuthStateChanged(async (authUser) => {
    await loadProfile(authUser);
    profileListeners.forEach((l) => l(currentProfile));
  });

  function onAuthChange(cb) {
    profileListeners.add(cb);
    cb(currentProfile);
    return () => profileListeners.delete(cb);
  }

  async function signIn(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    await loadProfile(cred.user);
    profileListeners.forEach((l) => l(currentProfile));
    return currentProfile;
  }

  async function signOut() {
    await auth.signOut();
  }

  async function sendPasswordReset(email) {
    await auth.sendPasswordResetEmail(email);
  }

  // ---------------- Escrituras ----------------

  async function logUsage({ bagId, itemId, itemName, section, qty, note }) {
    const p = requireProfile();
    const batch = fs.batch();

    const evRef = fs.collection('usageEvents').doc();
    batch.set(evRef, {
      bagId, itemId, itemName, section,
      qty,
      by: p.name, byUid: p.uid, byRole: p.role,
      at: FV.serverTimestamp(),
      note: note || '',
    });

    const itemRef = fs.doc(`bags/${bagId}/items/${itemId}`);
    batch.update(itemRef, {
      pendingReplace: FV.increment(qty),
      stock: 'falta',
      updatedAt: FV.serverTimestamp(),
    });

    await batch.commit();
    return evRef.id;
  }

  async function replace({ bagId, itemId, itemName, section, qty, newExpiry }) {
    const p = requireProfile();
    const itemRef = fs.doc(`bags/${bagId}/items/${itemId}`);
    const evRef   = fs.collection('replaceEvents').doc();

    await fs.runTransaction(async (tx) => {
      const snap = await tx.get(itemRef);
      const cur  = snap.exists ? snap.data() : {};
      const prevExpiry = cur.expiry || null;
      const newPending = Math.max(0, (cur.pendingReplace || 0) - qty);
      const newStock   = newPending <= 0 ? 'ok' : 'falta';

      const itemUpdates = {
        pendingReplace: newPending,
        stock: newStock,
        updatedAt: FV.serverTimestamp(),
      };
      if (newExpiry) itemUpdates.expiry = newExpiry;
      tx.update(itemRef, itemUpdates);

      tx.set(evRef, {
        bagId, itemId, itemName, section,
        qty,
        by: p.name, byUid: p.uid, byRole: p.role,
        at: FV.serverTimestamp(),
        newExpiry: newExpiry || null,
        previousExpiry: prevExpiry,
      });
    });
    return evRef.id;
  }

  async function setExpiry({ bagId, itemId, expiry }) {
    requireProfile();
    await fs.doc(`bags/${bagId}/items/${itemId}`).update({
      expiry: expiry || null,
      updatedAt: FV.serverTimestamp(),
    });
  }

  async function setIncident({ bagId, itemId, itemName, section, note }) {
    const p = requireProfile();
    const batch = fs.batch();

    const itemRef = fs.doc(`bags/${bagId}/items/${itemId}`);
    batch.update(itemRef, {
      incidentNote: note || '',
      stock: note ? 'incidencia' : 'ok',
      updatedAt: FV.serverTimestamp(),
    });

    // Trazabilidad: logueamos la incidencia como usageEvent con qty=0 + nota.
    const evRef = fs.collection('usageEvents').doc();
    batch.set(evRef, {
      bagId, itemId, itemName: itemName || '', section: section || '',
      qty: 0,
      by: p.name, byUid: p.uid, byRole: p.role,
      at: FV.serverTimestamp(),
      note: note ? `Incidencia: ${note}` : 'Incidencia cerrada',
    });

    await batch.commit();
    return evRef.id;
  }

  async function logRevision({ bagId, summary, supervisor, supervisorUid }) {
    const p = requireProfile();
    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);
    const next = new Date(today);
    next.setMonth(next.getMonth() + 6);
    const nextISO = next.toISOString().slice(0, 10);

    const batch = fs.batch();
    const revRef = fs.collection('revisions').doc();
    batch.set(revRef, {
      bagId,
      by: p.name, byUid: p.uid,
      supervisor: supervisor || null,
      supervisorUid: supervisorUid || null,
      at: FV.serverTimestamp(),
      summary: summary || {},
    });

    const bagRef = fs.doc(`bags/${bagId}`);
    batch.update(bagRef, {
      lastRevision: todayISO,
      nextRevision: nextISO,
      updatedAt: FV.serverTimestamp(),
    });

    await batch.commit();
    return revRef.id;
  }

  // ---------------- Lecturas (tiempo real) ----------------

  function subscribeUsers(cb) {
    return fs.collection('users').onSnapshot((snap) => {
      cb(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    }, (err) => console.error('[db] subscribeUsers', err));
  }

  function subscribeBags(cb, { profile } = {}) {
    // Portadores (medico/enfermera) sólo pueden leer su propio bag por regla
    // (firestore.rules §bags). Una list query sobre `bags/` les fallaría con
    // permission-denied, así que los suscribimos al doc único.
    const isPortador = profile && (profile.role === 'medico' || profile.role === 'enfermera');
    if (isPortador) {
      if (!profile.bagId) { cb({}); return function () {}; }
      return fs.doc(`bags/${profile.bagId}`).onSnapshot((snap) => {
        const bags = {};
        if (snap.exists) bags[snap.id] = { id: snap.id, ...snap.data() };
        cb(bags);
      }, (err) => console.error('[db] subscribeBags(doc)', profile.bagId, err));
    }
    return fs.collection('bags').onSnapshot((snap) => {
      const bags = {};
      snap.forEach((d) => { bags[d.id] = { id: d.id, ...d.data() }; });
      cb(bags);
    }, (err) => console.error('[db] subscribeBags', err));
  }

  function subscribeBagItems(bagId, cb) {
    return fs.collection(`bags/${bagId}/items`).onSnapshot((snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('[db] subscribeBagItems', bagId, err));
  }

  function subscribeUsageEvents(cb, { limit = 500, profile } = {}) {
    // Portadores solo pueden leer events con byUid == uid (firestore.rules).
    // Sin el where la list query falla con permission-denied.
    const isPortador = profile && (profile.role === 'medico' || profile.role === 'enfermera');
    let q = fs.collection('usageEvents');
    if (isPortador) q = q.where('byUid', '==', profile.uid);
    q = q.orderBy('at', 'desc').limit(limit);
    return q.onSnapshot((snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('[db] subscribeUsageEvents', err));
  }

  function subscribeReplaceEvents(cb, { limit = 500 } = {}) {
    return fs.collection('replaceEvents').orderBy('at', 'desc').limit(limit)
      .onSnapshot((snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (err) => console.error('[db] subscribeReplaceEvents', err));
  }

  function subscribeRevisions(cb, { limit = 200 } = {}) {
    return fs.collection('revisions').orderBy('at', 'desc').limit(limit)
      .onSnapshot((snap) => {
        cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }, (err) => console.error('[db] subscribeRevisions', err));
  }

  // ---------------- Export ----------------

  window.db = {
    // auth
    onAuthChange, signIn, signOut, sendPasswordReset, getProfile,
    // writes
    logUsage, replace, setExpiry, setIncident, logRevision,
    // reads
    subscribeUsers, subscribeBags, subscribeBagItems,
    subscribeUsageEvents, subscribeReplaceEvents, subscribeRevisions,
  };
})();
