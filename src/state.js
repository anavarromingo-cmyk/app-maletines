// Estado global en tiempo real desde Firestore — App Maletines UCP.
//
// Sustituye el antiguo modelo "todo en localStorage" por suscripciones vivas a
// Firestore vía window.db.*. Expone:
//
//   window.subscribeAppState(listener) → unsubscribe
//     El listener recibe en cada cambio un objeto `state` con EXACTAMENTE la
//     misma forma que usaba el prototipo:
//       { users, bags, usageEvents, replaceEvents, revisionsLog, incidents,
//         session, settings }
//
//   window.loadState() / saveState() / resetState()  [shims temporales]
//     loadState devuelve un state vacío síncrono (para que App.jsx mounte
//     antes de que llegue el primer snapshot). saveState es no-op. Se
//     eliminan en el paso 6, cuando App.jsx migra a subscribeAppState.
//
//   Helpers de fecha/hora (idénticos al prototipo): getEffectiveToday,
//   daysUntil, fmtDate, fmtDateShort, fmtTime.

(function () {
  const LS_OFFSET = 'maletines_sim_offset_v1';
  const EVENT_LIMIT = 2000;

  // --- Offset de fecha simulada (solo demo, se queda en el navegador) -----

  function getSimOffset() {
    try { return Number(localStorage.getItem(LS_OFFSET) || 0) || 0; }
    catch { return 0; }
  }
  function setSimOffset(n) {
    try { localStorage.setItem(LS_OFFSET, String(n || 0)); } catch {}
  }
  window.setSimOffset = setSimOffset;

  // --- Normalización de timestamps Firestore → ISO strings ---------------

  function tsToISO(ts) {
    if (!ts) return null;
    if (typeof ts === 'string') return ts;
    if (ts.toDate) return ts.toDate().toISOString();
    if (ts instanceof Date) return ts.toISOString();
    return null;
  }
  function normalizeEvent(ev) { return { ...ev, at: tsToISO(ev.at) }; }

  // --- Estado vacío con la forma que esperan los componentes --------------

  function emptyState() {
    return {
      users: [],
      bags: {},
      usageEvents: [],
      replaceEvents: [],
      revisionsLog: [],
      incidents: [],
      session: null,
      settings: { simulatedDateOffset: getSimOffset() },
    };
  }

  // --- Suscripción maestra: compone todas las subs de db.js --------------

  window.subscribeAppState = function subscribeAppState(listener) {
    if (!window.db) {
      console.error('[state] window.db no existe. ¿Cargó src/db.js?');
      listener(emptyState());
      return function () {};
    }

    // Estado interno mutable
    const S = {
      users: [],
      bags: {},               // { bagId: bagDoc sin items }
      itemsByBag: {},         // { bagId: [item...] }
      usageEvents: [],
      replaceEvents: [],
      revisionsLog: [],
      session: null,
    };
    const subs = [];                    // unsubs de las colecciones top-level
    const itemSubs = {};                // bagId → unsub de su subcolección items
    let authUnsub = null;

    function emit() {
      const mergedBags = {};
      Object.values(S.bags).forEach((bag) => {
        mergedBags[bag.id] = {
          ...bag,
          items: S.itemsByBag[bag.id] || [],
        };
      });
      listener({
        users: S.users,
        bags: mergedBags,
        usageEvents: S.usageEvents,
        replaceEvents: S.replaceEvents,
        revisionsLog: S.revisionsLog,
        incidents: [],
        session: S.session,
        settings: { simulatedDateOffset: getSimOffset() },
      });
    }

    function startDataSubscriptions(profile) {
      if (subs.length) return; // ya arrancadas

      subs.push(window.db.subscribeUsers((users) => {
        S.users = users;
        emit();
      }));

      subs.push(window.db.subscribeBags((bagsObj) => {
        S.bags = bagsObj;
        // Alta de listeners por maletín nuevo
        Object.keys(bagsObj).forEach((bagId) => {
          if (!itemSubs[bagId]) {
            itemSubs[bagId] = window.db.subscribeBagItems(bagId, (items) => {
              S.itemsByBag[bagId] = items;
              emit();
            });
          }
        });
        // Baja de listeners si algún maletín desapareció (no debería)
        Object.keys(itemSubs).forEach((bagId) => {
          if (!bagsObj[bagId]) {
            itemSubs[bagId]();
            delete itemSubs[bagId];
            delete S.itemsByBag[bagId];
          }
        });
        emit();
      }, { profile }));

      // Farmaceutico no lee usageEvents (reglas lo impedirían y no los usa).
      if (profile.role !== 'farmaceutico') {
        subs.push(window.db.subscribeUsageEvents((events) => {
          S.usageEvents = events.map(normalizeEvent);
          emit();
        }, { limit: EVENT_LIMIT, profile }));
      }

      subs.push(window.db.subscribeReplaceEvents((events) => {
        S.replaceEvents = events.map(normalizeEvent);
        emit();
      }, { limit: EVENT_LIMIT }));

      subs.push(window.db.subscribeRevisions((revs) => {
        S.revisionsLog = revs.map(normalizeEvent);
        emit();
      }));
    }

    function stopDataSubscriptions() {
      subs.forEach((u) => { try { u && u(); } catch {} });
      subs.length = 0;
      Object.values(itemSubs).forEach((u) => { try { u && u(); } catch {} });
      Object.keys(itemSubs).forEach((k) => delete itemSubs[k]);
      S.users = [];
      S.bags = {};
      S.itemsByBag = {};
      S.usageEvents = [];
      S.replaceEvents = [];
      S.revisionsLog = [];
    }

    authUnsub = window.db.onAuthChange((profile) => {
      if (profile && profile.role) {
        S.session = {
          uid: profile.uid,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          bagId: profile.bagId || null,
          bagLabel: profile.bagId ? `Maletín · ${profile.name}` : null,
        };
        startDataSubscriptions(profile);
      } else {
        S.session = null;
        stopDataSubscriptions();
      }
      emit();
    });

    return function unsubscribe() {
      if (authUnsub) authUnsub();
      stopDataSubscriptions();
    };
  };

  // --- Shims temporales (se retiran en el paso 6) ------------------------

  window.loadState = function () {
    // Esqueleto síncrono para que App.jsx pueda mountar antes del primer
    // snapshot Firestore. El reducer real lo sustituimos en paso 6.
    return emptyState();
  };
  window.saveState = function () { /* no-op: el persistente es Firestore */ };
  window.resetState = function () {
    // Limpia solo el offset de demo; los datos reales viven en Firestore.
    setSimOffset(0);
    return emptyState();
  };

  // --- Helpers de fecha (idénticos al prototipo) -------------------------

  window.getEffectiveToday = function (state) {
    const d = new Date();
    const offset = (state && state.settings && state.settings.simulatedDateOffset) ?? getSimOffset();
    d.setDate(d.getDate() + (offset || 0));
    return d;
  };

  window.daysUntil = function (isoDate, state) {
    if (!isoDate) return null;
    const today = window.getEffectiveToday(state);
    today.setHours(0, 0, 0, 0);
    const t = new Date(isoDate); t.setHours(0, 0, 0, 0);
    return Math.round((t - today) / (24 * 3600 * 1000));
  };

  window.fmtDate = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  window.fmtDateShort = function (iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
  };

  window.fmtTime = function (iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  };
})();
