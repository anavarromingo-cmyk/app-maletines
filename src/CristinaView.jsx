// Vista de Cristina (supervisora): pendientes, por maletín, caducidades, historial, calendario, stats
const { useState: useState_C, useMemo: useMemo_C } = React;

function CristinaView({ state, session, dispatch, pushToast }) {
  const [tab, setTab] = useState_C('pendientes');
  const [bagFilter, setBagFilter] = useState_C('all');
  const [search, setSearch] = useState_C('');
  const [replaceModal, setReplaceModal] = useState_C(null);

  // Aggregations
  const allItems = useMemo_C(() => {
    const arr = [];
    Object.values(state.bags).forEach(bag => {
      bag.items.forEach(it => arr.push({ ...it, bagId: bag.id, bagLabel: bag.label, bagOwner: bag.owner, bagType: bag.type }));
    });
    return arr;
  }, [state.bags]);

  const pendientes = allItems.filter(i => i.pendingReplace > 0);
  const expiringSoon = allItems.filter(i => {
    if (!i.requiresExpiry || !i.expiry) return false;
    const d = window.daysUntil(i.expiry, state);
    return d !== null && d <= 15;
  }).sort((a,b) => window.daysUntil(a.expiry, state) - window.daysUntil(b.expiry, state));

  const expired = expiringSoon.filter(i => window.daysUntil(i.expiry, state) < 0);
  const incidents = allItems.filter(i => i.incidentNote);

  const counts = {
    pendientes: pendientes.length,
    caducidades: expiringSoon.length,
    maletines: Object.keys(state.bags).length,
    incidencias: incidents.length,
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Panel de reposición</h1>
          <div className="page-sub">
            Hola, {session.name} · {Object.keys(state.bags).length} maletines bajo tu supervisión
          </div>
        </div>
        <div className="flex" style={{gap:8}}>
          <button className="btn" onClick={() => window.print()}>Imprimir</button>
          <button className="btn primary" onClick={() => setTab('pendientes')}>Ver pendientes ({counts.pendientes})</button>
        </div>
      </div>

      {expired.length > 0 && (
        <div className="banner danger">
          <span>●</span>
          <span><strong>{expired.length}</strong> {expired.length===1?'producto caducado':'productos caducados'} pendientes de retirar y reponer.</span>
          <button className="btn sm" style={{marginLeft:'auto'}} onClick={() => setTab('caducidades')}>Ver</button>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi danger">
          <div className="label">Pendientes de reponer</div>
          <div className="value">{counts.pendientes}</div>
          <div className="sub">en {new Set(pendientes.map(i=>i.bagId)).size} maletines</div>
        </div>
        <div className="kpi warn">
          <div className="label">Caducan ≤15 días</div>
          <div className="value">{counts.caducidades}</div>
          <div className="sub">{expired.length} ya caducados</div>
        </div>
        <div className="kpi">
          <div className="label">Maletines</div>
          <div className="value">{counts.maletines}</div>
          <div className="sub">7 médicos · 7 enfermería</div>
        </div>
        <div className="kpi">
          <div className="label">Incidencias abiertas</div>
          <div className="value">{counts.incidencias}</div>
          <div className="sub">reportadas por el equipo</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab==='pendientes'?'active':''}`} onClick={() => setTab('pendientes')}>Pendientes <span className="badge">{counts.pendientes}</span></button>
        <button className={`tab ${tab==='maletines'?'active':''}`} onClick={() => setTab('maletines')}>Maletines</button>
        <button className={`tab ${tab==='caducidades'?'active':''}`} onClick={() => setTab('caducidades')}>Caducidades <span className="badge">{counts.caducidades}</span></button>
        <button className={`tab ${tab==='historial'?'active':''}`} onClick={() => setTab('historial')}>Historial</button>
        <button className={`tab ${tab==='calendario'?'active':''}`} onClick={() => setTab('calendario')}>Calendario</button>
        <button className={`tab ${tab==='stats'?'active':''}`} onClick={() => setTab('stats')}>Consumo</button>
        <button className={`tab ${tab==='incidencias'?'active':''}`} onClick={() => setTab('incidencias')}>Incidencias <span className="badge">{counts.incidencias}</span></button>
      </div>

      {tab === 'pendientes' && (
        <PendientesTab
          state={state} pendientes={pendientes}
          search={search} setSearch={setSearch}
          bagFilter={bagFilter} setBagFilter={setBagFilter}
          onReplace={(it) => setReplaceModal(it)}
        />
      )}
      {tab === 'maletines' && <MaletinesTab state={state} onPick={(bagId) => { setBagFilter(bagId); setTab('pendientes'); }} />}
      {tab === 'caducidades' && <CaducidadesTab state={state} expiringSoon={expiringSoon} onReplace={(it) => setReplaceModal(it)} />}
      {tab === 'historial' && <HistorialTab state={state} />}
      {tab === 'calendario' && <CalendarioTab state={state} />}
      {tab === 'stats' && <StatsTab state={state} />}
      {tab === 'incidencias' && <IncidenciasTab state={state} incidents={incidents} dispatch={dispatch} pushToast={pushToast} />}

      {replaceModal && (
        <ReplaceModal
          item={replaceModal} state={state}
          onClose={() => setReplaceModal(null)}
          onConfirm={(payload) => {
            dispatch({ type: 'replace', ...payload });
            setReplaceModal(null);
            pushToast(`Repuesto: ${payload.itemName}`, 'ok');
          }}
        />
      )}
    </div>
  );
}

function PendientesTab({ state, pendientes, search, setSearch, bagFilter, setBagFilter, onReplace }) {
  const filtered = pendientes.filter(i => {
    if (bagFilter !== 'all' && i.bagId !== bagFilter) return false;
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <>
      <div className="filter-bar">
        <div className="search-wrap" style={{flex:1, maxWidth: 360}}>
          <input className="input search" placeholder="Buscar material…" value={search} onChange={e=>setSearch(e.target.value)} />
        </div>
        <select className="input" style={{maxWidth: 240}} value={bagFilter} onChange={e=>setBagFilter(e.target.value)}>
          <option value="all">Todos los maletines</option>
          <optgroup label="Médicos">
            {Object.values(state.bags).filter(b=>b.type==='medico').map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </optgroup>
          <optgroup label="Enfermería">
            {Object.values(state.bags).filter(b=>b.type==='enfermera').map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </optgroup>
        </select>
        <span className="muted tiny mono">{filtered.length} ítems</span>
      </div>

      <div className="panel">
        <table className="tbl">
          <thead>
            <tr>
              <th>Material</th>
              <th>Maletín</th>
              <th>Sección</th>
              <th>Caducidad</th>
              <th className="num">Cantidad</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6}><div className="empty"><div className="em-icon">✓</div>Sin pendientes con estos filtros</div></td></tr>
            )}
            {filtered.map(it => {
              const exp = window.expiryStatus(it, state);
              return (
                <tr key={`${it.bagId}-${it.id}`}>
                  <td>
                    <div className="item-name">{it.name}</div>
                    {it.incidentNote && <div className="item-meta" style={{color:'var(--danger)'}}>⚑ {it.incidentNote}</div>}
                  </td>
                  <td>
                    <span className={`pill ${it.bagType==='medico'?'info':'muted'}`}>{it.bagType==='medico'?'MED':'ENF'} · {it.bagOwner}</span>
                  </td>
                  <td className="muted tiny">{it.section}</td>
                  <td>
                    {it.requiresExpiry ? (
                      <div>
                        <span className="mono tiny">{window.fmtDateShort(it.expiry)}</span>
                        {exp && exp.cls !== 'ok' && <div><span className={`pill ${exp.cls}`}><span className="dot"/>{exp.label}</span></div>}
                      </div>
                    ) : <span className="muted">—</span>}
                  </td>
                  <td className="num"><strong className="mono">× {it.pendingReplace}</strong></td>
                  <td><button className="btn primary sm" onClick={() => onReplace(it)}>Reponer</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function MaletinesTab({ state, onPick }) {
  const meds = Object.values(state.bags).filter(b=>b.type==='medico');
  const enfs = Object.values(state.bags).filter(b=>b.type==='enfermera');

  function bagSummary(bag) {
    const pend = bag.items.filter(i=>i.pendingReplace>0).length;
    const exp = bag.items.filter(i => i.requiresExpiry && i.expiry && window.daysUntil(i.expiry, state) <= 15).length;
    const inc = bag.items.filter(i => i.incidentNote).length;
    return { pend, exp, inc };
  }

  function BagCard({ bag }) {
    const s = bagSummary(bag);
    const initials = bag.owner.slice(0,2).toUpperCase();
    return (
      <div className={`bag-card ${bag.type==='enfermera'?'enf':''}`} onClick={() => onPick(bag.id)}>
        <div className="bag-avatar">{initials}</div>
        <div>
          <div className="bag-name">{bag.owner} <span className="muted tiny">· {bag.type === 'medico' ? 'Maletín médico' : 'Maletín enfermería'}</span></div>
          <div className="bag-sub">Próx. revisión {window.fmtDateShort(bag.nextRevision)} · {bag.items.length} ítems</div>
        </div>
        <div className="bag-stats">
          {s.pend > 0 && <span className="pill danger"><span className="dot"/>{s.pend} pend.</span>}
          {s.exp > 0 && <span className="pill warn"><span className="dot"/>{s.exp} cad.</span>}
          {s.inc > 0 && <span className="pill info"><span className="dot"/>{s.inc} inc.</span>}
          {s.pend === 0 && s.exp === 0 && s.inc === 0 && <span className="pill ok"><span className="dot"/>OK</span>}
        </div>
      </div>
    );
  }

  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
      <div className="panel">
        <div className="panel-head">Maletines de Médicos<span className="meta">{meds.length}</span></div>
        <div>{meds.map(b => <BagCard key={b.id} bag={b} />)}</div>
      </div>
      <div className="panel">
        <div className="panel-head">Maletines de Enfermería<span className="meta">{enfs.length}</span></div>
        <div>{enfs.map(b => <BagCard key={b.id} bag={b} />)}</div>
      </div>
    </div>
  );
}

function CaducidadesTab({ state, expiringSoon, onReplace }) {
  return (
    <div className="panel">
      <div className="panel-head">Caducidades · próximos 15 días<span className="meta">{expiringSoon.length} ítems</span></div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Material</th><th>Maletín</th><th>Caducidad</th><th>Estado</th><th></th>
          </tr>
        </thead>
        <tbody>
          {expiringSoon.length === 0 && <tr><td colSpan={5}><div className="empty"><div className="em-icon">✓</div>Sin caducidades inminentes</div></td></tr>}
          {expiringSoon.map(it => {
            const exp = window.expiryStatus(it, state);
            return (
              <tr key={`${it.bagId}-${it.id}`}>
                <td><div className="item-name">{it.name}</div><div className="item-meta">{it.section}</div></td>
                <td><span className={`pill ${it.bagType==='medico'?'info':'muted'}`}>{it.bagType==='medico'?'MED':'ENF'} · {it.bagOwner}</span></td>
                <td className="mono">{window.fmtDateShort(it.expiry)}</td>
                <td>{exp && <span className={`pill ${exp.cls}`}><span className="dot"/>{exp.label}</span>}</td>
                <td><button className="btn primary sm" onClick={() => onReplace(it)}>Reponer</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HistorialTab({ state }) {
  const events = [...state.replaceEvents, ...state.usageEvents]
    .map(e => ({ ...e, _kind: state.replaceEvents.includes(e) ? 'replace' : 'usage' }))
    .sort((a,b) => new Date(b.at) - new Date(a.at));
  return (
    <div className="panel">
      <div className="panel-head">Actividad reciente<span className="meta">{events.length} eventos</span></div>
      <table className="tbl">
        <thead><tr><th>Cuándo</th><th>Tipo</th><th>Material</th><th>Maletín</th><th>Por</th><th className="num">Cant.</th></tr></thead>
        <tbody>
          {events.slice(0, 60).map(e => {
            const bag = state.bags[e.bagId];
            return (
              <tr key={e.id}>
                <td className="mono tiny">{window.fmtTime(e.at)}</td>
                <td>{e._kind==='replace' ? <span className="pill ok"><span className="dot"/>Reposición</span> : <span className="pill info"><span className="dot"/>Uso</span>}</td>
                <td>{e.itemName}<div className="item-meta">{e.section}</div></td>
                <td className="muted tiny">{bag?.label || e.bagId}</td>
                <td>{e.by}</td>
                <td className="num mono">{e.qty}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CalendarioTab({ state }) {
  const today = window.getEffectiveToday(state);
  const [monthOffset, setMonthOffset] = useState_C(0);
  const month = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const firstDay = (month.getDay() + 6) % 7; // Lunes = 0
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  // Eventos: revisiones programadas y caducidades del mes mostrado
  const events = {};
  function add(dateISO, ev) {
    const d = new Date(dateISO);
    if (d.getMonth() !== month.getMonth() || d.getFullYear() !== month.getFullYear()) return;
    const key = d.getDate();
    events[key] = events[key] || [];
    events[key].push(ev);
  }
  Object.values(state.bags).forEach(bag => {
    add(bag.nextRevision, { type: 'revision', label: `Revisión ${bag.owner}`, cls: 'ok' });
    bag.items.forEach(it => {
      if (it.requiresExpiry && it.expiry) {
        add(it.expiry, { type: 'expiry', label: `${it.name.slice(0,18)}… (${bag.owner})`, cls: window.daysUntil(it.expiry, state) < 0 ? 'danger' : 'warn' });
      }
    });
  });

  const monthName = month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="panel">
      <div className="panel-head">
        <div style={{textTransform:'capitalize'}}>{monthName}</div>
        <div className="flex">
          <button className="btn sm" onClick={() => setMonthOffset(o => o-1)}>← Mes ant.</button>
          <button className="btn sm" onClick={() => setMonthOffset(0)}>Hoy</button>
          <button className="btn sm" onClick={() => setMonthOffset(o => o+1)}>Mes sig. →</button>
        </div>
      </div>
      <div className="panel-body">
        <div className="cal-grid">
          {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => <div key={d} className="day-label">{d}</div>)}
          {Array.from({length: firstDay}).map((_,i) => <div key={'p'+i} className="day muted"></div>)}
          {Array.from({length: daysInMonth}).map((_,i) => {
            const dayNum = i + 1;
            const isToday = monthOffset === 0 && dayNum === today.getDate();
            const evs = events[dayNum] || [];
            return (
              <div key={dayNum} className={`day ${isToday ? 'today' : ''}`}>
                <div className="num">{dayNum}</div>
                {evs.slice(0, 3).map((e, idx) => (
                  <div key={idx} className={`cal-event ${e.cls}`} title={e.label}>{e.label}</div>
                ))}
                {evs.length > 3 && <div className="muted tiny mono">+{evs.length-3}</div>}
              </div>
            );
          })}
        </div>
        <div className="flex" style={{gap: 16, marginTop: 12, fontSize: 11}}>
          <span className="flex" style={{gap:4}}><span className="cal-event ok" style={{padding:'2px 8px'}}>·</span> Revisión semestral</span>
          <span className="flex" style={{gap:4}}><span className="cal-event warn" style={{padding:'2px 8px'}}>·</span> Caducidad ≤15d</span>
          <span className="flex" style={{gap:4}}><span className="cal-event danger" style={{padding:'2px 8px'}}>·</span> Caducado</span>
        </div>
      </div>
    </div>
  );
}

function StatsTab({ state }) {
  // Top 10 más consumidos (basado en usageEvents acumulados)
  const counts = {};
  state.usageEvents.forEach(e => {
    counts[e.itemName] = (counts[e.itemName] || 0) + e.qty;
  });
  const top = Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0, 10);
  const max = top[0]?.[1] || 1;

  // Por maletín
  const byBag = {};
  state.usageEvents.forEach(e => { byBag[e.bagId] = (byBag[e.bagId] || 0) + e.qty; });
  const bagRows = Object.entries(byBag).map(([id, n]) => ({ label: state.bags[id]?.label || id, n })).sort((a,b)=>b.n-a.n);
  const maxBag = bagRows[0]?.n || 1;

  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
      <div className="panel">
        <div className="panel-head">Top 10 materiales más consumidos</div>
        <div className="panel-body">
          {top.length === 0 && <div className="empty">Sin datos de consumo aún</div>}
          {top.map(([name, n]) => (
            <div key={name} className="bar-row">
              <div className="bar-label" title={name}>{name}</div>
              <div className="bar-track"><div className="bar-fill" style={{width: `${(n/max)*100}%`}}/></div>
              <div className="bar-val">{n}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="panel">
        <div className="panel-head">Consumo por maletín</div>
        <div className="panel-body">
          {bagRows.length === 0 && <div className="empty">Sin datos</div>}
          {bagRows.map(r => (
            <div key={r.label} className="bar-row">
              <div className="bar-label" title={r.label}>{r.label}</div>
              <div className="bar-track"><div className="bar-fill" style={{width: `${(r.n/maxBag)*100}%`, background: 'oklch(0.55 0.13 175)'}}/></div>
              <div className="bar-val">{r.n}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function IncidenciasTab({ state, incidents, dispatch, pushToast }) {
  return (
    <div className="panel">
      <div className="panel-head">Incidencias abiertas<span className="meta">{incidents.length}</span></div>
      <table className="tbl">
        <thead><tr><th>Material</th><th>Maletín</th><th>Descripción</th><th></th></tr></thead>
        <tbody>
          {incidents.length === 0 && <tr><td colSpan={4}><div className="empty">Sin incidencias abiertas</div></td></tr>}
          {incidents.map(it => (
            <tr key={`${it.bagId}-${it.id}`}>
              <td><div className="item-name">{it.name}</div><div className="item-meta">{it.section}</div></td>
              <td><span className={`pill ${it.bagType==='medico'?'info':'muted'}`}>{it.bagType==='medico'?'MED':'ENF'} · {it.bagOwner}</span></td>
              <td>{it.incidentNote}</td>
              <td><button className="btn sm" onClick={() => {
                dispatch({ type: 'set_incident', bagId: it.bagId, itemId: it.id, note: '', by: 'Cristina Moya' });
                pushToast('Incidencia cerrada', 'ok');
              }}>Cerrar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReplaceModal({ item, state, onClose, onConfirm }) {
  const [qty, setQty] = useState_C(item.pendingReplace || 1);
  const [newExpiry, setNewExpiry] = useState_C(() => {
    if (!item.requiresExpiry) return null;
    const d = new Date(); d.setMonth(d.getMonth()+12);
    return d.toISOString().slice(0,10);
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>Reponer material</h3><button className="btn ghost" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="muted tiny" style={{marginBottom:6}}>{item.bagLabel} · {item.section}</div>
          <div style={{fontWeight:600, fontSize:14, marginBottom:14}}>{item.name}</div>
          <div className="field">
            <label>Cantidad repuesta</label>
            <input type="number" min={1} className="input" value={qty} onChange={e => setQty(parseInt(e.target.value || '0'))} />
          </div>
          {item.requiresExpiry && (
            <div className="field">
              <label>Nueva fecha de caducidad</label>
              <input type="date" className="input" value={newExpiry || ''} onChange={e => setNewExpiry(e.target.value)} />
              <div className="muted tiny">Anterior: <span className="mono">{window.fmtDate(item.expiry)}</span></div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={() => onConfirm({ bagId: item.bagId, itemId: item.id, itemName: item.name, section: item.section, qty, newExpiry, by: 'Cristina Moya' })}>Confirmar reposición</button>
        </div>
      </div>
    </div>
  );
}

window.CristinaView = CristinaView;
