// Vista del portador del maletín (médico o enfermera)
const { useState: useState_B, useMemo: useMemo_B } = React;

function expiryStatus(item, state) {
  if (!item.requiresExpiry || !item.expiry) return null;
  const d = window.daysUntil(item.expiry, state);
  if (d < 0) return { label: `Caducó hace ${Math.abs(d)}d`, cls: 'danger', d };
  if (d <= 15) return { label: `Caduca en ${d}d`, cls: 'warn', d };
  return { label: `${d}d`, cls: 'ok', d };
}

function BagOwnerView({ state, session, dispatch, pushToast }) {
  // Fallback seguro mientras el primer snapshot de Firestore no ha llegado.
  const bag = state.bags[session.bagId] || {
    id: session.bagId, label: 'Cargando maletín…', items: [],
    lastRevision: null, nextRevision: null, type: null, owner: '',
  };
  const [search, setSearch] = useState_B('');
  const [openSections, setOpenSections] = useState_B(() => new Set((bag.items || []).map(i => i.section)));
  const [usageBuffer, setUsageBuffer] = useState_B({}); // itemId -> qty pending to log
  const [expiryEdit, setExpiryEdit] = useState_B(null); // {itemId}
  const [incidentEdit, setIncidentEdit] = useState_B(null);
  const [replaceEdit, setReplaceEdit] = useState_B(null); // {itemId}

  const sections = useMemo_B(() => {
    const map = new Map();
    bag.items.forEach(it => {
      if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return;
      if (!map.has(it.section)) map.set(it.section, []);
      map.get(it.section).push(it);
    });
    return [...map.entries()];
  }, [bag.items, search]);

  function toggleSection(s) {
    setOpenSections(prev => {
      const n = new Set(prev);
      if (n.has(s)) n.delete(s); else n.add(s);
      return n;
    });
  }

  function expandAll() { setOpenSections(new Set(bag.items.map(i => i.section))); }
  function collapseAll() { setOpenSections(new Set()); }

  function bumpQty(itemId, delta) {
    setUsageBuffer(prev => {
      const cur = prev[itemId] || 0;
      const next = Math.max(0, cur + delta);
      const np = { ...prev };
      if (next === 0) delete np[itemId]; else np[itemId] = next;
      return np;
    });
  }

  const totalPending = Object.values(usageBuffer).reduce((a,b) => a+b, 0);

  function submitUsage() {
    const items = Object.entries(usageBuffer);
    if (!items.length) return;
    items.forEach(([itemId, qty]) => {
      const it = bag.items.find(x => x.id === itemId);
      dispatch({ type: 'log_usage', bagId: bag.id, itemId, qty, by: session.name, name: it.name, section: it.section });
    });
    setUsageBuffer({});
    pushToast(`${items.length} ${items.length===1?'ítem registrado':'ítems registrados'} · Cristina recibirá el aviso`, 'ok');
  }

  // Caducidades próximas en este maletín
  const expiringSoon = bag.items.filter(i => {
    if (!i.requiresExpiry || !i.expiry) return false;
    const d = window.daysUntil(i.expiry, state);
    return d <= 15;
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">{bag.label}</h1>
          <div className="page-sub">
            Próx. revisión: <span className="mono">{window.fmtDate(bag.nextRevision)}</span>
            {' · '}
            <span className="mono">{bag.items.length} ítems</span>
          </div>
        </div>
        <div className="flex" style={{gap: 8}}>
          <button className="btn" onClick={expandAll}>Expandir</button>
          <button className="btn" onClick={collapseAll}>Plegar</button>
        </div>
      </div>

      {expiringSoon.length > 0 && (
        <div className="banner warn">
          <span>⚠</span>
          <span>
            <strong>{expiringSoon.length}</strong> {expiringSoon.length===1?'producto caduca':'productos caducan'} en ≤15 días.
            Pulsa <em>↻ Reponer</em> en cada ítem para anotar la nueva caducidad, o avísalo a Cristina.
          </span>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi">
          <div className="label">Pendientes de reponer</div>
          <div className="value">{bag.items.filter(i => i.pendingReplace > 0).length}</div>
          <div className="sub">items reportados</div>
        </div>
        <div className="kpi warn">
          <div className="label">Caducan ≤15d</div>
          <div className="value">{expiringSoon.length}</div>
          <div className="sub">requieren reposición</div>
        </div>
        <div className="kpi">
          <div className="label">Última revisión</div>
          <div className="value mono" style={{fontSize: 18}}>{window.fmtDateShort(bag.lastRevision)}</div>
          <div className="sub">próxima: {window.fmtDateShort(bag.nextRevision)}</div>
        </div>
        <div className="kpi">
          <div className="label">A registrar ahora</div>
          <div className="value" style={{color: totalPending > 0 ? 'var(--accent)' : 'var(--ink-4)'}}>{totalPending}</div>
          <div className="sub">unidades en buffer</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-wrap" style={{flex:1, maxWidth: 460}}>
          <input
            className="input search"
            placeholder="Buscar material en mi maletín…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={{flex:1}} />
        {totalPending > 0 && (
          <>
            <button className="btn ghost" onClick={() => setUsageBuffer({})}>Cancelar</button>
            <button className="btn accent" onClick={submitUsage}>
              Comunicar uso ({totalPending})
            </button>
          </>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <div>Inventario</div>
          <div className="meta">+ / − registra uso &nbsp;·&nbsp; ↻ repone y actualiza caducidad</div>
        </div>
        {sections.length === 0 && (
          <div className="empty">Sin coincidencias para "{search}"</div>
        )}
        {sections.map(([section, items]) => {
          const open = openSections.has(section) || search;
          const sectionPending = items.filter(i => i.pendingReplace > 0).length;
          const sectionExpiring = items.filter(i => {
            if (!i.requiresExpiry || !i.expiry) return false;
            const d = window.daysUntil(i.expiry, state);
            return d <= 15;
          }).length;
          return (
            <div key={section} className={`section-block ${open ? 'open' : ''}`}>
              <div className="section-head" onClick={() => toggleSection(section)}>
                <div className="flex" style={{gap: 8}}>
                  <span className="chev">▶</span>
                  <span className="title">{section}</span>
                  <span className="muted tiny mono">{items.length}</span>
                </div>
                <div className="section-meta">
                  {sectionExpiring > 0 && <span className="pill warn"><span className="dot"/>{sectionExpiring} caducidad</span>}
                  {sectionPending > 0 && <span className="pill danger"><span className="dot"/>{sectionPending} pend.</span>}
                </div>
              </div>
              {open && (
                <div className="section-body">
                  {items.map(it => {
                    const exp = expiryStatus(it, state);
                    const buf = usageBuffer[it.id] || 0;
                    return (
                      <div key={it.id} className="item-row">
                        <div className="nm">
                          {it.name}
                          {it.pendingReplace > 0 && <span className="pill danger" style={{marginLeft: 8}}>Pend. reposición × {it.pendingReplace}</span>}
                          {it.incidentNote && <span className="pill info" style={{marginLeft: 8}} title={it.incidentNote}>incidencia</span>}
                        </div>
                        <div className="expiry">
                          {it.requiresExpiry ? (
                            <span
                              className={exp ? `expiry ${exp.cls === 'ok' ? '' : exp.cls}` : ''}
                              onClick={() => setExpiryEdit({ itemId: it.id })}
                              style={{cursor: 'pointer'}}
                              title="Editar fecha de caducidad"
                            >
                              {window.fmtDateShort(it.expiry)}
                            </span>
                          ) : '—'}
                        </div>
                        <div>
                          {exp && exp.cls !== 'ok' && <span className={`pill ${exp.cls}`}><span className="dot"/>{exp.label}</span>}
                        </div>
                        <div className="qty-control" title="Registrar uso (resta del stock)">
                          <button onClick={() => bumpQty(it.id, -1)} disabled={buf === 0}>−</button>
                          <div className="qty">{buf}</div>
                          <button onClick={() => bumpQty(it.id, +1)}>+</button>
                        </div>
                        <button
                          className="btn sm"
                          onClick={() => setReplaceEdit({ itemId: it.id })}
                          title="Reponer / marcar como repuesto"
                        >
                          ↻ Reponer
                        </button>
                        <button
                          className="btn ghost sm"
                          onClick={() => setIncidentEdit({ itemId: it.id, note: it.incidentNote || '' })}
                          title="Reportar incidencia"
                        >
                          ⚑
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {expiryEdit && (
        <ExpiryModal
          item={bag.items.find(i => i.id === expiryEdit.itemId)}
          onClose={() => setExpiryEdit(null)}
          onSave={(newExpiry) => {
            dispatch({ type: 'set_expiry', bagId: bag.id, itemId: expiryEdit.itemId, expiry: newExpiry });
            setExpiryEdit(null);
            pushToast('Fecha de caducidad actualizada', 'ok');
          }}
        />
      )}

      {replaceEdit && (
        <SelfReplaceModal
          item={bag.items.find(i => i.id === replaceEdit.itemId)}
          onClose={() => setReplaceEdit(null)}
          onSave={({ qty, newExpiry }) => {
            dispatch({
              type: 'replace',
              bagId: bag.id,
              itemId: replaceEdit.itemId,
              itemName: bag.items.find(i => i.id === replaceEdit.itemId).name,
              section: bag.items.find(i => i.id === replaceEdit.itemId).section,
              qty, newExpiry, by: session.name,
            });
            setReplaceEdit(null);
            pushToast('Reposición registrada', 'ok');
          }}
        />
      )}

      {incidentEdit && (
        <IncidentModal
          item={bag.items.find(i => i.id === incidentEdit.itemId)}
          initial={incidentEdit.note}
          onClose={() => setIncidentEdit(null)}
          onSave={(note) => {
            dispatch({ type: 'set_incident', bagId: bag.id, itemId: incidentEdit.itemId, note, by: session.name });
            setIncidentEdit(null);
            pushToast('Incidencia registrada', 'ok');
          }}
        />
      )}
    </div>
  );
}

function ExpiryModal({ item, onClose, onSave }) {
  const [v, setV] = useState_B(item.expiry || '');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>Editar caducidad</h3><button className="btn ghost" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="muted tiny" style={{marginBottom: 8}}>{item.section}</div>
          <div style={{fontWeight:600, marginBottom: 14}}>{item.name}</div>
          <div className="field">
            <label>Nueva fecha de caducidad</label>
            <input type="date" className="input" value={v} onChange={e => setV(e.target.value)} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={() => onSave(v)}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function IncidentModal({ item, initial, onClose, onSave }) {
  const [v, setV] = useState_B(initial);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><h3>Incidencia</h3><button className="btn ghost" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="muted tiny" style={{marginBottom: 8}}>{item.section}</div>
          <div style={{fontWeight:600, marginBottom: 14}}>{item.name}</div>
          <div className="field">
            <label>Describe la incidencia</label>
            <textarea className="input" rows={4} value={v} onChange={e => setV(e.target.value)} placeholder="Ej. Roto, cánula doblada, falta tapón…" />
          </div>
        </div>
        <div className="modal-foot">
          {initial && <button className="btn danger" onClick={() => onSave('')}>Eliminar</button>}
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={() => onSave(v)}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

function SelfReplaceModal({ item, onClose, onSave }) {
  const [qty, setQty] = useState_B(item.pendingReplace || 1);
  const [newExpiry, setNewExpiry] = useState_B(() => {
    if (!item.requiresExpiry) return null;
    const d = new Date(); d.setMonth(d.getMonth()+12);
    return d.toISOString().slice(0,10);
  });
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>Reponer · {item.name}</h3><button className="btn ghost" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="muted tiny" style={{marginBottom:6}}>{item.section}</div>
          {item.pendingReplace > 0 && (
            <div className="banner" style={{marginBottom: 12}}>
              Pendientes actuales: <strong className="mono">× {item.pendingReplace}</strong>
            </div>
          )}
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
          <button className="btn primary" disabled={!qty || qty < 1} onClick={() => onSave({ qty, newExpiry })}>Confirmar reposición</button>
        </div>
      </div>
    </div>
  );
}

window.BagOwnerView = BagOwnerView;
window.expiryStatus = expiryStatus;
