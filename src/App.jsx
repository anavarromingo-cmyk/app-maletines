// App principal: shell, router por rol, dispatch → Firestore.
// El estado llega en tiempo real vía window.subscribeAppState (src/state.js);
// cada acción que antes mutaba el reducer ahora llama a window.db.* (src/db.js).

const { useState: useState_M, useEffect: useEffect_M, useRef: useRef_M } = React;

function TopBar({ session, onLogout, state }) {
  const today = window.getEffectiveToday(state);
  const offset = state.settings.simulatedDateOffset;
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">M</div>
        <div>App Maletines</div>
        <div className="brand-meta">UCP · Hospitalización Domiciliaria</div>
      </div>
      <div className="topbar-right">
        <div className="topbar-clock">
          {today.toLocaleDateString('es-ES', { weekday:'short', day:'2-digit', month:'short', year:'numeric' })}
          {offset !== 0 && <span style={{color:'var(--warn)', marginLeft: 6}}>· simulado {offset>0?'+':''}{offset}d</span>}
        </div>
        {session && (
          <div className="user-chip">
            <div className="avatar">{session.name.split(' ').map(s=>s[0]).slice(0,2).join('').toUpperCase()}</div>
            <div>
              <div>{session.name}</div>
              <div className="role">{session.role}</div>
            </div>
            <button className="btn ghost sm" onClick={onLogout} title="Cerrar sesión">↪</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Sidebar({ session, page, setPage, state }) {
  const bag = session.bagId ? state.bags[session.bagId] : null;
  const allItems = Object.values(state.bags).flatMap(b => b.items || []);
  const pendientes = allItems.filter(i => i.pendingReplace > 0).length;
  const expSoon = allItems.filter(i => i.requiresExpiry && i.expiry && window.daysUntil(i.expiry, state) <= 15).length;

  if (session.role === 'medico' || session.role === 'enfermera') {
    const myItems = (bag && bag.items) || [];
    const myPend = myItems.filter(i => i.pendingReplace > 0).length;
    const myExp = myItems.filter(i => i.requiresExpiry && i.expiry && window.daysUntil(i.expiry, state) <= 15).length;
    return (
      <div className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-label">Mi maletín</div>
          <div className={`nav-item ${page==='inventario'?'active':''}`} onClick={()=>setPage('inventario')}>
            Inventario
            {myPend > 0 && <span className="nav-count alert">{myPend}</span>}
          </div>
          <div className={`nav-item ${page==='revision'?'active':''}`} onClick={()=>setPage('revision')}>
            Revisión semestral
          </div>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-label">Avisos</div>
          <div className="nav-item" style={{cursor:'default'}}>
            Caducidades ≤15d
            {myExp > 0 && <span className="nav-count warn">{myExp}</span>}
          </div>
        </div>
      </div>
    );
  }

  if (session.role === 'supervisora') {
    return (
      <div className="sidebar">
        <div className="sidebar-section">
          <div className="sidebar-label">Reposición</div>
          <div className={`nav-item ${page==='dashboard'?'active':''}`} onClick={()=>setPage('dashboard')}>
            Panel
            {pendientes > 0 && <span className="nav-count alert">{pendientes}</span>}
          </div>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-label">Maletines</div>
          {Object.values(state.bags).filter(b=>b.type==='medico').map(b => {
            const p = (b.items || []).filter(i => i.pendingReplace > 0).length;
            return (
              <div key={b.id} className={`nav-item ${page===`bag:${b.id}`?'active':''}`} onClick={()=>setPage(`bag:${b.id}`)}>
                <span style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>MED · {b.owner}</span>
                {p>0 && <span className="nav-count alert">{p}</span>}
              </div>
            );
          })}
          <div style={{height:6}}/>
          {Object.values(state.bags).filter(b=>b.type==='enfermera').map(b => {
            const p = (b.items || []).filter(i => i.pendingReplace > 0).length;
            return (
              <div key={b.id} className={`nav-item ${page===`bag:${b.id}`?'active':''}`} onClick={()=>setPage(`bag:${b.id}`)}>
                <span style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>ENF · {b.owner}</span>
                {p>0 && <span className="nav-count alert">{p}</span>}
              </div>
            );
          })}
        </div>
        <div className="sidebar-section">
          <div className="sidebar-label">Avisos</div>
          <div className="nav-item" style={{cursor:'default'}}>
            Caducidades ≤15d
            {expSoon > 0 && <span className="nav-count warn">{expSoon}</span>}
          </div>
        </div>
      </div>
    );
  }

  // Admin
  return (
    <div className="sidebar">
      <div className="sidebar-section">
        <div className="sidebar-label">Administración</div>
        <div className={`nav-item ${page==='admin'?'active':''}`} onClick={()=>setPage('admin')}>Usuarios y catálogo</div>
      </div>
    </div>
  );
}

function BagDetailForCristina({ state, bagId, dispatch, pushToast }) {
  const bag = state.bags[bagId];
  if (!bag) return <div className="muted" style={{padding: 24}}>Cargando maletín…</div>;
  const [search, setSearch] = useState_M('');
  const filt = (bag.items || []).filter(it => !search || it.name.toLowerCase().includes(search.toLowerCase()));
  const sections = [];
  const m = new Map();
  filt.forEach(it => { if (!m.has(it.section)) { m.set(it.section, []); sections.push(it.section); } m.get(it.section).push(it); });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{bag.label}</h1>
          <div className="page-sub">Próx. revisión <span className="mono">{window.fmtDate(bag.nextRevision)}</span> · {(bag.items || []).length} ítems</div>
        </div>
      </div>
      <div className="filter-bar">
        <div className="search-wrap" style={{flex:1, maxWidth: 360}}>
          <input className="input search" placeholder="Buscar en este maletín…" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
      </div>
      <div className="panel">
        {sections.map(section => (
          <div key={section} className="section-block open">
            <div className="section-head"><div className="title">{section} <span className="muted mono tiny">({m.get(section).length})</span></div></div>
            <div className="section-body">
              <table className="tbl">
                <thead><tr><th>Material</th><th>Caducidad</th><th>Estado</th><th className="num">Pendiente</th><th></th></tr></thead>
                <tbody>
                  {m.get(section).map(it => {
                    const exp = window.expiryStatus(it, state);
                    return (
                      <tr key={it.id}>
                        <td>{it.name}{it.incidentNote && <div className="item-meta" style={{color:'var(--danger)'}}>⚑ {it.incidentNote}</div>}</td>
                        <td className="mono tiny">{it.requiresExpiry ? window.fmtDateShort(it.expiry) : '—'}</td>
                        <td>{exp && exp.cls!=='ok' ? <span className={`pill ${exp.cls}`}><span className="dot"/>{exp.label}</span> : (it.pendingReplace>0?<span className="pill danger"><span className="dot"/>Falta</span>:<span className="pill ok"><span className="dot"/>OK</span>)}</td>
                        <td className="num mono">{it.pendingReplace || ''}</td>
                        <td>
                          {it.pendingReplace > 0 && <button className="btn sm primary" onClick={() => dispatch({ type: 'replace', bagId: bag.id, itemId: it.id, itemName: it.name, section: it.section, qty: it.pendingReplace, newExpiry: it.requiresExpiry ? new Date(Date.now()+365*24*3600*1000).toISOString().slice(0,10) : null })}>Reponer</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TweaksPanel({ state, dispatch, onClose }) {
  const [open, setOpen] = useState_M(true);
  if (!open) return null;
  const offset = state.settings.simulatedDateOffset;
  return (
    <div className="tweaks-panel">
      <h4>Tweaks <button onClick={() => { setOpen(false); onClose && onClose(); }}>✕</button></h4>
      <div className="field">
        <label>Adelantar el reloj (días): {offset}</label>
        <input type="range" min={-30} max={365} step={1} value={offset}
          onChange={e => dispatch({ type: 'set_date_offset', offset: parseInt(e.target.value) })} />
        <div className="muted tiny">Para ver cómo aparecen avisos de caducidad. Solo afecta a este navegador.</div>
      </div>
      <button className="btn sm" onClick={() => dispatch({ type: 'set_date_offset', offset: 0 })}>Reset reloj</button>
      <div className="muted tiny" style={{marginTop: 12}}>
        Para cambiar de rol: cierra sesión y entra como otra persona.
      </div>
    </div>
  );
}

function App() {
  const [state, setState] = useState_M(window.loadState()); // esqueleto síncrono
  const [page, setPage] = useState_M('inventario');
  const [toasts, setToasts] = useState_M([]);
  const [showTweaks, setShowTweaks] = useState_M(false);
  const tweaksAvailableRef = useRef_M(false);

  // Suscripción en tiempo real al estado de Firestore
  useEffect_M(() => {
    if (!window.subscribeAppState) {
      console.error('[App] window.subscribeAppState no existe. Revisa src/state.js.');
      return;
    }
    const unsub = window.subscribeAppState(setState);
    return () => { try { unsub && unsub(); } catch (_) {} };
  }, []);

  // Contrato de Tweaks con el host
  useEffect_M(() => {
    function handler(e) {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === '__activate_edit_mode') setShowTweaks(true);
      else if (e.data.type === '__deactivate_edit_mode') setShowTweaks(false);
    }
    window.addEventListener('message', handler);
    if (!tweaksAvailableRef.current) {
      try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch (_) {}
      tweaksAvailableRef.current = true;
    }
    return () => window.removeEventListener('message', handler);
  }, []);

  // Página por defecto al cambiar de sesión
  useEffect_M(() => {
    if (!state.session) return;
    if (state.session.role === 'supervisora') setPage('dashboard');
    else if (state.session.role === 'admin') setPage('admin');
    else setPage('inventario');
  }, [state.session && state.session.uid]);

  function pushToast(message, kind='info') {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }

  // Dispatch: traduce acciones del prototipo a llamadas a window.db.
  // Async pero con fire-and-forget: la UI se actualiza vía snapshot.
  async function dispatch(action) {
    try {
      switch (action.type) {
        case 'logout':
          await window.db.signOut();
          return;

        case 'log_usage':
          await window.db.logUsage({
            bagId: action.bagId,
            itemId: action.itemId,
            itemName: action.name || action.itemName,
            section: action.section,
            qty: action.qty,
            note: action.note || '',
          });
          return;

        case 'replace':
          await window.db.replace({
            bagId: action.bagId,
            itemId: action.itemId,
            itemName: action.itemName,
            section: action.section,
            qty: action.qty,
            newExpiry: action.newExpiry || null,
          });
          return;

        case 'set_expiry':
          await window.db.setExpiry({
            bagId: action.bagId,
            itemId: action.itemId,
            expiry: action.expiry,
          });
          return;

        case 'set_incident': {
          const bag = state.bags[action.bagId];
          const it  = bag && (bag.items || []).find(i => i.id === action.itemId);
          await window.db.setIncident({
            bagId: action.bagId,
            itemId: action.itemId,
            itemName: it ? it.name : '',
            section:  it ? it.section : '',
            note: action.note || '',
          });
          return;
        }

        case 'log_revision':
          await window.db.logRevision({
            bagId: action.bagId,
            summary: action.summary || {},
            supervisor: action.supervisor || null,
            supervisorUid: action.supervisorUid || null,
          });
          return;

        case 'set_pin': {
          // La "gestión de PIN" pasa a ser un reset por email (Firebase Auth).
          const email = window.emailForUser(action.name);
          await window.db.sendPasswordReset(email);
          pushToast(`Email de reset enviado a ${email}`, 'ok');
          return;
        }

        case 'set_date_offset':
          window.setSimOffset(action.offset);
          setState(s => ({ ...s, settings: { ...s.settings, simulatedDateOffset: action.offset } }));
          return;

        case 'login':
        case 'switch_role_demo':
        case 'replace_state':
          // No-ops: la sesión la gestiona Firebase Auth.
          return;

        default:
          console.warn('[dispatch] acción desconocida', action && action.type);
      }
    } catch (e) {
      console.error('[dispatch] error en', action && action.type, e);
      pushToast('Error guardando en Firebase. Revisa la consola.', 'err');
    }
  }

  function logout() { dispatch({ type: 'logout' }); }

  if (!state.session) {
    return (
      <>
        <window.LoginScreen />
        {showTweaks && <TweaksPanel state={state} dispatch={dispatch} />}
      </>
    );
  }

  let content = null;
  const session = state.session;
  if (session.role === 'medico' || session.role === 'enfermera') {
    if (page === 'revision') content = <window.RevisionView state={state} session={session} dispatch={dispatch} pushToast={pushToast} bagId={session.bagId} />;
    else content = <window.BagOwnerView state={state} session={session} dispatch={dispatch} pushToast={pushToast} />;
  } else if (session.role === 'supervisora') {
    if (page.startsWith('bag:')) {
      const bagId = page.slice(4);
      content = <BagDetailForCristina state={state} bagId={bagId} dispatch={dispatch} pushToast={pushToast} />;
    } else {
      content = <window.CristinaView state={state} session={session} dispatch={dispatch} pushToast={pushToast} />;
    }
  } else if (session.role === 'admin') {
    content = <window.AdminView state={state} dispatch={dispatch} pushToast={pushToast} />;
  }

  return (
    <div className="app">
      <TopBar session={session} state={state} onLogout={logout} />
      <Sidebar session={session} page={page} setPage={setPage} state={state} />
      <div className="main">{content}</div>

      <div className="toast-stack">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.kind==='ok'?'ok':''}${t.kind==='err'?'err':''}`}>{t.message}</div>
        ))}
      </div>

      {showTweaks && <TweaksPanel state={state} dispatch={dispatch} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
