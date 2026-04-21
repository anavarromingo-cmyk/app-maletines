// Vista Admin: gestión de usuarios y catálogo.
// Gestión de PIN = envío de email de "restablecer contraseña" vía Firebase Auth.

const { useState: useState_A } = React;

function AdminView({ state, dispatch, pushToast }) {
  const [tab, setTab] = useState_A('usuarios');
  const [confirmUser, setConfirmUser] = useState_A(null);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1 className="page-title">Administración</h1>
          <div className="page-sub">Usuarios y catálogo de materiales</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab==='usuarios'?'active':''}`} onClick={()=>setTab('usuarios')}>Usuarios <span className="badge">{state.users.length}</span></button>
        <button className={`tab ${tab==='catalogo'?'active':''}`} onClick={()=>setTab('catalogo')}>Catálogo</button>
      </div>

      {tab === 'usuarios' && (
        <div className="panel">
          {state.users.length === 0 && (
            <div className="panel-body">
              <div className="muted tiny">
                No hay usuarios en Firestore. Ejecuta <span className="mono">scripts/seed-users.js</span> para darlos de alta.
              </div>
            </div>
          )}
          {state.users.length > 0 && (
            <table className="tbl">
              <thead><tr><th>Persona</th><th>Rol</th><th>Email</th><th>Maletín</th><th></th></tr></thead>
              <tbody>
                {state.users.map(u => {
                  const bagLabel = u.bagId
                    ? (state.bags[u.bagId] && state.bags[u.bagId].label) || u.bagId
                    : '—';
                  return (
                    <tr key={u.uid || u.name}>
                      <td><strong>{u.name}</strong>{u.active === false && <span className="pill muted" style={{marginLeft:6}}>inactivo</span>}</td>
                      <td><span className="pill muted">{u.role}</span></td>
                      <td className="mono tiny">{u.email || window.emailForUser(u.name)}</td>
                      <td className="muted tiny">{bagLabel}</td>
                      <td><button className="btn sm" onClick={() => setConfirmUser(u)}>Enviar reset</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
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

      {confirmUser && (
        <ResetModal
          user={confirmUser}
          onClose={() => setConfirmUser(null)}
          onConfirm={() => {
            dispatch({ type: 'set_pin', name: confirmUser.name });
            setConfirmUser(null);
          }}
        />
      )}
    </div>
  );
}

function ResetModal({ user, onClose, onConfirm }) {
  const email = user.email || window.emailForUser(user.name);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><h3>Restablecer PIN · {user.name}</h3><button className="btn ghost" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <p style={{marginBottom: 8}}>Se enviará un email a <span className="mono">{email}</span> con un enlace para establecer un nuevo PIN.</p>
          <div className="muted tiny">Firebase Auth gestiona el reset directamente; la app no almacena el PIN.</div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" onClick={onConfirm}>Enviar email</button>
        </div>
      </div>
    </div>
  );
}

window.AdminView = AdminView;
