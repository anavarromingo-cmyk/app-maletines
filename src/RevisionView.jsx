// Revisión semestral: checklist completo del maletín con firmas
const { useState: useState_R, useEffect: useEffect_R } = React;

function RevisionView({ state, session, dispatch, pushToast, bagId }) {
  // Fallback seguro para los primeros renders antes de que llegue el snapshot.
  const bag = state.bags[bagId] || { id: bagId, label: 'Cargando…', items: [], nextRevision: null };
  const [checks, setChecks] = useState_R({});
  // Inicializa el checklist cuando los ítems estén disponibles.
  useEffect_R(() => {
    if ((bag.items || []).length === 0) return;
    setChecks((prev) => {
      if (Object.keys(prev).length > 0) return prev;
      const m = {};
      bag.items.forEach((it) => { m[it.id] = 'pendiente'; });
      return m;
    });
  }, [bag.items && bag.items.length]);
  const [signProf, setSignProf] = useState_R('');
  const [signSup, setSignSup] = useState_R('');
  const [done, setDone] = useState_R(false);

  function setCheck(id, v) {
    setChecks(prev => ({ ...prev, [id]: v }));
  }

  function setAll(section, v) {
    setChecks(prev => {
      const np = { ...prev };
      bag.items.filter(i => i.section === section).forEach(i => { np[i.id] = v; });
      return np;
    });
  }

  const completos = Object.values(checks).filter(v => v === 'correcto').length;
  const total = bag.items.length;
  const pct = Math.round((Object.values(checks).filter(v => v !== 'pendiente').length / total) * 100);

  function submit() {
    if (!signProf || !signSup) { alert('Faltan firmas'); return; }
    dispatch({ type: 'log_revision', bagId, by: signProf, supervisor: signSup, summary: { ...checks } });
    setDone(true);
    pushToast('Revisión semestral registrada', 'ok');
  }

  if (done) {
    return (
      <div className="panel" style={{maxWidth: 540, margin: '40px auto'}}>
        <div className="panel-body" style={{textAlign:'center', padding:40}}>
          <div style={{fontSize:48, color:'var(--ok)'}}>✓</div>
          <h2 style={{margin:'10px 0 6px'}}>Revisión completada</h2>
          <div className="muted">{bag.label}</div>
          <div className="mono tiny" style={{marginTop: 16}}>{window.fmtDate(new Date().toISOString())}</div>
          <div style={{marginTop: 20}}>
            <button className="btn primary" onClick={() => setDone(false)}>Volver al inventario</button>
          </div>
        </div>
      </div>
    );
  }

  // Group by section
  const sections = [];
  const m = new Map();
  bag.items.forEach(it => {
    if (!m.has(it.section)) { m.set(it.section, []); sections.push(it.section); }
    m.get(it.section).push(it);
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Revisión semestral</h1>
          <div className="page-sub">{bag.label} · próx. programada {window.fmtDate(bag.nextRevision)}</div>
        </div>
        <div className="flex" style={{gap:8}}>
          <span className="mono muted tiny">{pct}% revisado · {completos}/{total} correctos</span>
          <button className="btn primary" onClick={submit}>Firmar y cerrar revisión</button>
        </div>
      </div>

      <div className="banner">
        Marca cada ítem como <strong>Correcto</strong>, <strong>Falta</strong>, <strong>Caducado</strong> o <strong>Repuesto</strong>. Al finalizar, firma profesional y supervisora.
      </div>

      <div className="panel">
        {sections.map(section => {
          const items = m.get(section);
          return (
            <div key={section} className="section-block open">
              <div className="section-head">
                <div className="title">{section} <span className="muted mono tiny">({items.length})</span></div>
                <div className="flex" style={{gap: 4}}>
                  <button className="btn sm" onClick={() => setAll(section, 'correcto')}>Todo OK</button>
                  <button className="btn sm" onClick={() => setAll(section, 'falta')}>Todo falta</button>
                </div>
              </div>
              <div className="section-body">
                {items.map(it => (
                  <div key={it.id} className="item-row" style={{gridTemplateColumns:'1fr auto'}}>
                    <div className="nm">{it.name}
                      {it.requiresExpiry && <span className="mono tiny muted" style={{marginLeft:8}}>cad. {window.fmtDateShort(it.expiry)}</span>}
                    </div>
                    <div className="flex" style={{gap:4}}>
                      {['correcto','falta','caducado','repuesto'].map(v => (
                        <button key={v}
                          className={`btn sm ${checks[it.id]===v?'primary':''}`}
                          onClick={() => setCheck(it.id, v)}
                        >{v}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="panel" style={{marginTop:16}}>
        <div className="panel-head">Firmas</div>
        <div className="panel-body" style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
          <div className="field">
            <label>Firma profesional ({bag.type==='medico'?'médico/a':'enfermero/a'})</label>
            <input className="input" value={signProf} onChange={e=>setSignProf(e.target.value)} placeholder="Nombre y apellido" />
          </div>
          <div className="field">
            <label>Firma supervisora</label>
            <input className="input" value={signSup} onChange={e=>setSignSup(e.target.value)} placeholder="Cristina Moya" />
          </div>
        </div>
      </div>
    </div>
  );
}

window.RevisionView = RevisionView;
