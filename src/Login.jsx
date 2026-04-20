// Login screen: lista de personas + PIN
const { useState, useMemo } = React;

function LoginScreen({ state, onLogin }) {
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const groups = useMemo(() => {
    const g = { supervisora: [], admin: [], medico: [], enfermera: [] };
    state.users.forEach(u => g[u.role].push(u));
    return g;
  }, [state.users]);

  function pickUser(u) {
    setSelected(u);
    setPin('');
    setError('');
  }

  function pressDigit(d) {
    if (pin.length >= 4) return;
    const np = pin + d;
    setPin(np);
    setError('');
    if (np.length === 4) {
      setTimeout(() => attemptLogin(np), 120);
    }
  }
  function clearPin() { setPin(''); setError(''); }
  function backPin() { setPin(p => p.slice(0, -1)); setError(''); }

  function attemptLogin(p) {
    if (selected.pin === p) {
      onLogin(selected);
    } else {
      setError('PIN incorrecto');
      setPin('');
    }
  }

  function roleLabel(r) {
    return { supervisora: 'Supervisora', admin: 'Admin', medico: 'Médico/a', enfermera: 'Enfermero/a' }[r];
  }

  function initials(name) {
    return name.split(' ').map(s => s[0]).slice(0,2).join('').toUpperCase();
  }

  const today = new Date();

  return (
    <div className="login-screen">
      <div className="login-side">
        <div className="grid-bg" />
        <div className="login-logo">
          <div className="mark">M</div>
          <div>
            App Maletines <span style={{color:'oklch(0.65 0.01 230)', fontWeight:400}}>· UCP Domiciliaria</span>
          </div>
        </div>
        <div>
          <div className="login-headline">
            Control y reposición de <em>maletines clínicos</em> de hospitalización a domicilio.
          </div>
          <div style={{marginTop: 24, fontSize: 12, color: 'oklch(0.65 0.01 230)', maxWidth: 380, lineHeight: 1.6}}>
            Cada profesional registra el material consumido. Cristina ve un panel unificado
            con pendientes de reposición, alertas de caducidad y revisiones programadas.
          </div>
        </div>
        <div className="login-meta">
          <div>
            <div style={{color:'white', fontSize:13, marginBottom:2}}>14 maletines</div>
            <div>7 médicos · 7 enfermería</div>
          </div>
          <div>
            <div style={{color:'white', fontSize:13, marginBottom:2}}>Revisión cada 6 meses</div>
            <div>Aviso caducidad: 15 días</div>
          </div>
          <div>
            <div style={{color:'white', fontSize:13, marginBottom:2}} className="mono">{today.toLocaleDateString('es-ES')}</div>
            <div>v0.1 · prototipo</div>
          </div>
        </div>
      </div>

      <div className="login-form-wrap">
        {!selected && (
          <>
            <div className="login-step-label">Paso 1 de 2</div>
            <h2 className="login-step-title">Selecciona tu nombre</h2>
            <div className="user-list">
              <div className="user-group-label">Supervisora</div>
              {groups.supervisora.map(u => (
                <button key={u.name} className={`user-list-row role-${u.role}`} onClick={() => pickUser(u)}>
                  <div className="avatar">{initials(u.name)}</div>
                  <div>{u.name}</div>
                  <div className="role-tag">{roleLabel(u.role)}</div>
                </button>
              ))}
              <div className="user-group-label">Médicos</div>
              {groups.medico.map(u => (
                <button key={u.name} className={`user-list-row role-${u.role}`} onClick={() => pickUser(u)}>
                  <div className="avatar">{initials(u.name)}</div>
                  <div>{u.name}</div>
                  <div className="role-tag">{roleLabel(u.role)}</div>
                </button>
              ))}
              <div className="user-group-label">Enfermería</div>
              {groups.enfermera.map(u => (
                <button key={u.name} className={`user-list-row role-${u.role}`} onClick={() => pickUser(u)}>
                  <div className="avatar">{initials(u.name)}</div>
                  <div>{u.name}</div>
                  <div className="role-tag">{roleLabel(u.role)}</div>
                </button>
              ))}
              <div className="user-group-label">Administración</div>
              {groups.admin.map(u => (
                <button key={u.name} className={`user-list-row role-${u.role}`} onClick={() => pickUser(u)}>
                  <div className="avatar">{initials(u.name)}</div>
                  <div>{u.name}</div>
                  <div className="role-tag">{roleLabel(u.role)}</div>
                </button>
              ))}
            </div>
            <div className="login-hint">
              PIN demo · usuarios: 1234 · Cristina: 9999 · Admin: 0000
            </div>
          </>
        )}

        {selected && (
          <>
            <div className="login-step-label">Paso 2 de 2</div>
            <h2 className="login-step-title">Hola, {selected.name}</h2>
            <div style={{fontSize:12, color:'var(--ink-3)', marginBottom: 8}}>
              Introduce tu PIN de 4 dígitos
            </div>
            <div className="pin-display">
              {[0,1,2,3].map(i => (
                <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
              ))}
            </div>
            <div className="pin-error">{error}</div>
            <div className="pin-pad">
              {[1,2,3,4,5,6,7,8,9].map(d => (
                <button key={d} onClick={() => pressDigit(String(d))}>{d}</button>
              ))}
              <button className="action" onClick={clearPin}>C</button>
              <button onClick={() => pressDigit('0')}>0</button>
              <button className="action" onClick={backPin}>←</button>
            </div>
            <div style={{marginTop: 16}}>
              <button className="btn ghost" onClick={() => { setSelected(null); setPin(''); setError(''); }}>← Cambiar persona</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

window.LoginScreen = LoginScreen;
