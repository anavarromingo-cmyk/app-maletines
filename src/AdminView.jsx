// Vista Admin: gestión de usuarios y catálogo
const { useState: useState_A } = React;

function AdminView({ state, dispatch, pushToast }) {
  const [tab, setTab] = useState_A('usuarios');
  const [editUser, setEditUser] = useState_A(null);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Administración</h1>
          <div className="page-sub">Usuarios, PINs y catálogo de materiales</div>
        </div>
        <div className="flex" style={{gap:8}}>
          <button className="btn danger" onClick={() => {
            if (confirm('¿Restablecer toda la app? Se perderán los datos de demo.')) {
              window.resetState();
              location.reload();
            }
          }}>Restablecer demo</button>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab==='usuarios'?'active':''}`} onClick={()=>setTab('usuarios')}>Usuarios <span className="badge">{state.users.length}</span></button>
        <button className={`tab ${tab==='catalogo'?'active':''}`} onClick={()=>setTab('catalogo')}>Catálogo</button>
      </div>

      {tab === 'usuarios' && (
        <div className="panel">
          <table className="tbl">
            <thead><tr><th>Persona</th><th>Rol</th><th>Maletín</th><th>PIN</th><th></th></tr></thead>
            <tbody>
              {state.users.map(u => (
                <tr key={u.name}>
                  <td><strong>{u.name}</strong></td>
                  <td><span className="pill muted">{u.role}</span></td>
                  <td className="muted tiny">{u.bagLabel || '—'}</td>
                  <td className="mono">••••</td>
                  <td><button className="btn sm" onClick={() => setEditUser(u)}>Editar PIN</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'catalogo' && (
        <div className="panel">
          <div className="panel-head">Catálogo base · solo lectura en esta demo</div>
          <div className="panel-body">
            <div className="muted tiny" style={{marginBottom: 12}}>
              Materiales precargados desde los listados oficiales UCP-IM-001 (enfermeras) y UCP-IM-002 (médicos).
              Los items con caducidad están en: {[...window.EXPIRY_CATEGORIES].join(', ')}.
            </div>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:16}}>
              <div>
                <div className="sidebar-label">Maletín médico</div>
                {window.CATALOG_MEDICO.map(g => (
                  <div key={g.section} style={{marginBottom: 10}}>
                    <div style={{fontWeight:600, fontSize:12}}>{g.section} <span className="muted mono tiny">({g.items.length})</span></div>
                  </div>
                ))}
              </div>
              <div>
                <div className="sidebar-label">Maletín enfermería</div>
                {window.CATALOG_ENFERMERIA.map(g => (
                  <div key={g.section} style={{marginBottom: 10}}>
                    <div style={{fontWeight:600, fontSize:12}}>{g.section} <span className="muted mono tiny">({g.items.length})</span></div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {editUser && (
        <PinEditModal user={editUser} onClose={() => setEditUser(null)} onSave={(pin) => {
          dispatch({ type: 'set_pin', name: editUser.name, pin });
          setEditUser(null);
          pushToast(`PIN actualizado para ${editUser.name}`, 'ok');
        }} />
      )}
    </div>
  );
}

function PinEditModal({ user, onClose, onSave }) {
  const [v, setV] = useState_A('');
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>Cambiar PIN · {user.name}</h3><button className="btn ghost" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="field">
            <label>Nuevo PIN (4 dígitos)</label>
            <input type="text" className="input mono" maxLength={4} pattern="[0-9]{4}" value={v} onChange={e => setV(e.target.value.replace(/\D/g,''))} />
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={v.length!==4} onClick={() => onSave(v)}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

window.AdminView = AdminView;
