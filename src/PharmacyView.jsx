// Vista del rol "farmaceutico" — prepara reposición de medicación, sueros y
// desinfectantes. Solo ve ítems cuya section esté en window.EXPIRY_CATEGORIES
// (no material no farmacológico). Puede marcar ítems como preparados (crea
// replaceEvents en bloque) y ajustar la nueva caducidad por ítem antes de
// confirmar. No toca incidencias ni revisiones.

const { useState: useState_F, useMemo: useMemo_F } = React;

const NINETY_DAYS_MS = 90 * 24 * 3600 * 1000;

function defaultNewExpiry() {
  const d = new Date();
  d.setMonth(d.getMonth() + 12);
  return d.toISOString().slice(0, 10);
}

function pharmaKey(it) { return `${it.bagId}:${it.id}`; }

function PharmacyView({ state, session, page, setPage, dispatch, pushToast }) {
  // Scope: solo ítems farmacéuticos (medicación + sueros + desinfectantes).
  const allItems = useMemo_F(() => {
    const arr = [];
    Object.values(state.bags).forEach((bag) => {
      (bag.items || []).forEach((it) => {
        if (!window.EXPIRY_CATEGORIES.has(it.section)) return;
        arr.push({ ...it, bagId: bag.id, bagLabel: bag.label, bagOwner: bag.owner, bagType: bag.type });
      });
    });
    return arr;
  }, [state.bags]);

  const pendientes = allItems.filter((i) => i.pendingReplace > 0);
  const expiringSoon = allItems.filter((i) => {
    if (!i.requiresExpiry || !i.expiry) return false;
    const d = window.daysUntil(i.expiry, state);
    return d !== null && d <= 30;
  }).sort((a, b) => window.daysUntil(a.expiry, state) - window.daysUntil(b.expiry, state));
  const expired = expiringSoon.filter((i) => window.daysUntil(i.expiry, state) < 0);
  const expiring15 = expiringSoon.filter((i) => {
    const d = window.daysUntil(i.expiry, state);
    return d >= 0 && d <= 15;
  });

  const [confirmModal, setConfirmModal] = useState_F(null); // { items: [...] }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Farmacia · preparación</h1>
          <div className="page-sub">
            Hola, {session.name} · {pendientes.length} ítems pendientes · {expiringSoon.length} caducidades ≤30d
          </div>
        </div>
        <div className="flex" style={{ gap: 8 }}>
          {page === 'preparar' && (
            <button className="btn" onClick={() => window.print()}>Imprimir hoja</button>
          )}
        </div>
      </div>

      {expired.length > 0 && (
        <div className="banner danger">
          <span>●</span>
          <span><strong>{expired.length}</strong> {expired.length === 1 ? 'producto farmacéutico caducado' : 'productos farmacéuticos caducados'}.</span>
          <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setPage('caducidades')}>Ver</button>
        </div>
      )}

      <div className="kpi-grid">
        <div className="kpi danger">
          <div className="label">Para preparar</div>
          <div className="value">{pendientes.length}</div>
          <div className="sub">en {new Set(pendientes.map((i) => i.bagId)).size} maletines</div>
        </div>
        <div className="kpi warn">
          <div className="label">Caducan ≤15d</div>
          <div className="value">{expiring15.length}</div>
          <div className="sub">{expiringSoon.length - expiring15.length - expired.length} más entre 16–30d</div>
        </div>
        <div className="kpi danger">
          <div className="label">Ya caducados</div>
          <div className="value">{expired.length}</div>
          <div className="sub">para retirar/reponer</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${page === 'preparar' ? 'active' : ''}`} onClick={() => setPage('preparar')}>
          Para preparar <span className="badge">{pendientes.length}</span>
        </button>
        <button className={`tab ${page === 'caducidades' ? 'active' : ''}`} onClick={() => setPage('caducidades')}>
          Caducidades <span className="badge">{expiringSoon.length}</span>
        </button>
        <button className={`tab ${page === 'historial' ? 'active' : ''}`} onClick={() => setPage('historial')}>
          Historial mío
        </button>
      </div>

      {page === 'preparar' && (
        <PrepararTab
          state={state}
          pendientes={pendientes}
          onPrepare={(items) => setConfirmModal({ items })}
        />
      )}
      {page === 'caducidades' && <CaducidadesFarmaTab state={state} items={expiringSoon} />}
      {page === 'historial' && <HistorialFarmaTab state={state} session={session} />}

      {confirmModal && (
        <PrepareConfirmModal
          items={confirmModal.items}
          onClose={() => setConfirmModal(null)}
          onConfirm={async (rows) => {
            let ok = 0;
            for (const r of rows) {
              try {
                await dispatch({
                  type: 'replace',
                  bagId: r.bagId,
                  itemId: r.id,
                  itemName: r.name,
                  section: r.section,
                  qty: r.pendingReplace,
                  newExpiry: r.requiresExpiry ? r.newExpiry : null,
                });
                ok += 1;
              } catch (_) { /* dispatch ya muestra toast de error */ }
            }
            setConfirmModal(null);
            pushToast(`Preparados ${ok} ítem${ok === 1 ? '' : 's'}`, 'ok');
          }}
        />
      )}
    </div>
  );
}

function PrepararTab({ state, pendientes, onPrepare }) {
  const [selected, setSelected] = useState_F(() => new Set());

  // Agrupa por maletín
  const groups = useMemo_F(() => {
    const m = new Map();
    pendientes.forEach((it) => {
      if (!m.has(it.bagId)) m.set(it.bagId, { bag: state.bags[it.bagId], items: [] });
      m.get(it.bagId).items.push(it);
    });
    return Array.from(m.values()).sort((a, b) => (a.bag?.owner || '').localeCompare(b.bag?.owner || ''));
  }, [pendientes, state.bags]);

  function toggle(it) {
    const k = pharmaKey(it);
    const next = new Set(selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    setSelected(next);
  }
  function toggleAllInBag(bagItems, checked) {
    const next = new Set(selected);
    bagItems.forEach((it) => {
      const k = pharmaKey(it);
      if (checked) next.add(k); else next.delete(k);
    });
    setSelected(next);
  }
  function selectAll() { setSelected(new Set(pendientes.map(pharmaKey))); }
  function clearAll()  { setSelected(new Set()); }

  const selectedItems = pendientes.filter((it) => selected.has(pharmaKey(it)));
  const todayFmt = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <>
      <div className="print-only" style={{ padding: '0 0 12px' }}>
        <h2 style={{ margin: 0 }}>Orden de preparación — Farmacia UCP</h2>
        <div className="muted tiny">Fecha · {todayFmt} · {pendientes.length} ítems pendientes</div>
      </div>
      <div className="filter-bar">
        <button className="btn sm" onClick={selectAll} disabled={pendientes.length === 0}>Seleccionar todo</button>
        <button className="btn sm" onClick={clearAll} disabled={selected.size === 0}>Limpiar</button>
        <span className="muted tiny mono">{selected.size} seleccionados</span>
        <button
          className="btn primary"
          style={{ marginLeft: 'auto' }}
          disabled={selected.size === 0}
          onClick={() => onPrepare(selectedItems)}
        >
          Marcar seleccionados como preparados
        </button>
      </div>

      {pendientes.length === 0 && (
        <div className="panel"><div className="empty"><div className="em-icon">✓</div>Nada pendiente de preparar</div></div>
      )}

      {groups.map(({ bag, items }) => {
        if (!bag) return null;
        const allChecked = items.every((it) => selected.has(pharmaKey(it)));
        const someChecked = !allChecked && items.some((it) => selected.has(pharmaKey(it)));
        return (
          <div key={bag.id} className="panel" style={{ marginBottom: 12 }}>
            <div className="panel-head">
              <label className="flex" style={{ gap: 8, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  ref={(el) => { if (el) el.indeterminate = someChecked; }}
                  onChange={(e) => toggleAllInBag(items, e.target.checked)}
                />
                <span><strong>{bag.label || bag.owner}</strong> <span className="muted tiny">· {bag.type === 'medico' ? 'médico' : 'enfermería'}</span></span>
              </label>
              <span className="meta">{items.length} ítems</span>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th className="no-print" style={{ width: 32 }}></th>
                  <th>Material</th>
                  <th>Sección</th>
                  <th>Caducidad</th>
                  <th className="num">Pendiente</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const exp = window.expiryStatus(it, state);
                  const k = pharmaKey(it);
                  return (
                    <tr key={k}>
                      <td className="no-print"><input type="checkbox" checked={selected.has(k)} onChange={() => toggle(it)} /></td>
                      <td><div className="item-name">{it.name}</div></td>
                      <td className="muted tiny">{it.section}</td>
                      <td>
                        {it.requiresExpiry ? (
                          <div>
                            <span className="mono tiny">{window.fmtDateShort(it.expiry)}</span>
                            {exp && exp.cls !== 'ok' && <div><span className={`pill ${exp.cls}`}><span className="dot" />{exp.label}</span></div>}
                          </div>
                        ) : <span className="muted">—</span>}
                      </td>
                      <td className="num"><strong className="mono">× {it.pendingReplace}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

function CaducidadesFarmaTab({ state, items }) {
  const groups = useMemo_F(() => {
    const m = new Map();
    items.forEach((it) => {
      if (!m.has(it.bagId)) m.set(it.bagId, { bag: state.bags[it.bagId], items: [] });
      m.get(it.bagId).items.push(it);
    });
    return Array.from(m.values());
  }, [items, state.bags]);

  if (items.length === 0) {
    return <div className="panel"><div className="empty"><div className="em-icon">✓</div>Sin caducidades ≤30 días</div></div>;
  }

  return (
    <>
      {groups.map(({ bag, items: rows }) => (
        <div key={bag?.id || Math.random()} className="panel" style={{ marginBottom: 12 }}>
          <div className="panel-head">
            <div><strong>{bag?.label || bag?.owner || '—'}</strong> <span className="muted tiny">· {bag?.type === 'medico' ? 'médico' : 'enfermería'}</span></div>
            <span className="meta">{rows.length} ítems</span>
          </div>
          <table className="tbl">
            <thead><tr><th>Material</th><th>Sección</th><th>Caducidad</th><th>Estado</th><th className="num">Pendiente</th></tr></thead>
            <tbody>
              {rows.map((it) => {
                const exp = window.expiryStatus(it, state);
                return (
                  <tr key={pharmaKey(it)}>
                    <td><div className="item-name">{it.name}</div></td>
                    <td className="muted tiny">{it.section}</td>
                    <td className="mono">{window.fmtDateShort(it.expiry)}</td>
                    <td>{exp && <span className={`pill ${exp.cls}`}><span className="dot" />{exp.label}</span>}</td>
                    <td className="num mono">{it.pendingReplace > 0 ? `× ${it.pendingReplace}` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

function HistorialFarmaTab({ state, session }) {
  const cutoff = Date.now() - NINETY_DAYS_MS;
  const events = (state.replaceEvents || [])
    .filter((e) => e.byUid === session.uid && e.at && new Date(e.at).getTime() >= cutoff)
    .sort((a, b) => new Date(b.at) - new Date(a.at));

  return (
    <div className="panel">
      <div className="panel-head">Mis reposiciones · últimos 90 días<span className="meta">{events.length} eventos</span></div>
      <table className="tbl">
        <thead>
          <tr>
            <th>Cuándo</th>
            <th>Material</th>
            <th>Maletín</th>
            <th>Caducidad</th>
            <th className="num">Cant.</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && <tr><td colSpan={5}><div className="empty">Aún no has preparado nada en los últimos 90 días.</div></td></tr>}
          {events.map((e) => {
            const bag = state.bags[e.bagId];
            return (
              <tr key={e.id}>
                <td className="mono tiny">{window.fmtTime(e.at)}</td>
                <td>{e.itemName}<div className="item-meta">{e.section}</div></td>
                <td className="muted tiny">{bag?.label || e.bagId}</td>
                <td className="mono tiny">{e.newExpiry ? window.fmtDateShort(e.newExpiry) : '—'}</td>
                <td className="num mono">{e.qty}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PrepareConfirmModal({ items, onClose, onConfirm }) {
  const [rows, setRows] = useState_F(() => items.map((it) => ({
    ...it,
    newExpiry: it.requiresExpiry ? defaultNewExpiry() : null,
    _excluded: false,
  })));
  const [busy, setBusy] = useState_F(false);

  function setExpiryForRow(id, bagId, value) {
    setRows((rs) => rs.map((r) => (r.id === id && r.bagId === bagId ? { ...r, newExpiry: value } : r)));
  }
  function excludeRow(id, bagId) {
    setRows((rs) => rs.map((r) => (r.id === id && r.bagId === bagId ? { ...r, _excluded: true } : r)));
  }

  const active = rows.filter((r) => !r._excluded);

  async function handleConfirm() {
    setBusy(true);
    try { await onConfirm(active); } finally { setBusy(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 820 }}>
        <div className="modal-head">
          <h3>Confirmar preparación</h3>
          <button className="btn ghost" onClick={onClose} disabled={busy}>✕</button>
        </div>
        <div className="modal-body">
          <div className="muted tiny" style={{ marginBottom: 10 }}>
            Revisa la nueva caducidad de cada ítem. Al confirmar, se reponen las cantidades pendientes en los maletines correspondientes.
          </div>
          <table className="tbl">
            <thead>
              <tr>
                <th>Material</th>
                <th>Maletín</th>
                <th className="num">Cant.</th>
                <th>Nueva caducidad</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {active.map((r) => (
                <tr key={pharmaKey(r)}>
                  <td>
                    <div className="item-name">{r.name}</div>
                    <div className="item-meta">{r.section}</div>
                  </td>
                  <td className="muted tiny">{r.bagLabel || r.bagOwner}</td>
                  <td className="num mono">× {r.pendingReplace}</td>
                  <td>
                    {r.requiresExpiry ? (
                      <input
                        type="date"
                        className="input"
                        value={r.newExpiry || ''}
                        onChange={(e) => setExpiryForRow(r.id, r.bagId, e.target.value)}
                        disabled={busy}
                      />
                    ) : <span className="muted">—</span>}
                  </td>
                  <td>
                    <button className="btn ghost sm" onClick={() => excludeRow(r.id, r.bagId)} disabled={busy} title="Quitar de esta preparación">✕</button>
                  </td>
                </tr>
              ))}
              {active.length === 0 && (
                <tr><td colSpan={5}><div className="empty">No queda ningún ítem para confirmar.</div></td></tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose} disabled={busy}>Cancelar</button>
          <button className="btn primary" onClick={handleConfirm} disabled={busy || active.length === 0}>
            {busy ? 'Guardando…' : `Confirmar preparación (${active.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}

window.PharmacyView = PharmacyView;
