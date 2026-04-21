// Pantalla de login: lista de personas + PIN de 6 dígitos.
// El PIN es la password de Firebase Auth. Email generado por convención
// (ver window.emailForUser en catalog.js). Al login exitoso, el cambio de
// sesión llega vía onAuthStateChanged → subscribeAppState → App.jsx re-render.

const { useState, useMemo } = React;

const PIN_LENGTH = 6;

function buildUserRoster() {
  return [
    { name: 'Cristina Moya', role: 'supervisora' },
    ...window.MEDICOS.map((name) => ({ name, role: 'medico' })),
    ...window.ENFERMERAS.map((name) => ({ name, role: 'enfermera' })),
    ...(window.FARMACEUTICAS || []).map((name) => ({ name, role: 'farmaceutico' })),
    { name: 'Admin', role: 'admin' },
  ];
}

function LoginScreen({ onLogin /* vestigial: la sesión real llega por onAuthChange */ }) {
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState('');

  const groups = useMemo(() => {
    const all = buildUserRoster();
    return {
      supervisora:  all.filter((u) => u.role === 'supervisora'),
      admin:        all.filter((u) => u.role === 'admin'),
      medico:       all.filter((u) => u.role === 'medico'),
      enfermera:    all.filter((u) => u.role === 'enfermera'),
      farmaceutico: all.filter((u) => u.role === 'farmaceutico'),
    };
  }, []);

  function pickUser(u) {
    setSelected(u); setPin(''); setError(''); setResetMsg('');
  }

  function pressDigit(d) {
    if (busy || pin.length >= PIN_LENGTH) return;
    const np = pin + d;
    setPin(np);
    setError('');
    if (np.length === PIN_LENGTH) {
      setTimeout(() => attemptLogin(np), 120);
    }
  }
  function clearPin() { if (!busy) { setPin(''); setError(''); } }
  function backPin()  { if (!busy) { setPin((p) => p.slice(0, -1)); setError(''); } }

  async function attemptLogin(p) {
    if (!selected) return;
    setBusy(true);
    setError('');
    try {
      const email = window.emailForUser(selected.name);
      await window.db.signIn(email, p);
      // Éxito: onAuthStateChanged disparará el re-render en App.jsx.
      if (typeof onLogin === 'function') { try { onLogin(selected); } catch (_) {} }
    } catch (e) {
      console.warn('[login] signIn falló', e && e.code, e && e.message);
      if (e && (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password')) {
        setError('PIN incorrecto');
      } else if (e && e.code === 'auth/user-not-found') {
        setError('Usuario no dado de alta. Contacta con el admin.');
      } else if (e && e.code === 'auth/too-many-requests') {
        setError('Demasiados intentos. Espera unos minutos.');
      } else {
        setError('No se pudo iniciar sesión');
      }
      setPin('');
    } finally {
      setBusy(false);
    }
  }

  async function requestReset() {
    if (!selected || busy) return;
    setBusy(true);
    setResetMsg('');
    try {
      await window.db.sendPasswordReset(window.emailForUser(selected.name));
      setResetMsg('Email de reset enviado a ' + window.emailForUser(selected.name));
    } catch (e) {
      console.warn('[login] sendPasswordReset falló', e);
      setResetMsg('No se pudo enviar el email');
    } finally {
      setBusy(false);
    }
  }

  function roleLabel(r) {
    return {
      supervisora: 'Supervisora',
      admin: 'Admin',
      medico: 'Médico/a',
      enfermera: 'Enfermero/a',
      farmaceutico: 'Farmacéutico/a',
    }[r];
  }
  function initials(name) {
    return name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
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
            <div>v0.2 · Firebase</div>
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
              {groups.supervisora.map((u) => (
                <button key={u.name} className={`user-list-row role-${u.role}`} onClick={() => pickUser(u)}>
                  <div className="avatar">{initials(u.name)}</div>
                  <div>{u.name}</div>
                  <div className="role-tag">{roleLabel(u.role)}</div>
                </button>
              ))}
              <div className="user-group-label">Médicos</div>
              {groups.medico.map((u) => (
                <button key={u.name} className={`user-list-row role-${u.role}`} onClick={() => pickUser(u)}>
                  <div className="avatar">{initials(u.name)}</div>
                  <div>{u.name}</div>
                  <div className="role-tag">{roleLabel(u.role)}</div>
                </button>
              ))}
              <div className="user-group-label">Enfermería</div>
              {groups.enfermera.map((u) => (
                <button key={u.name} className={`user-list-row role-${u.role}`} onClick={() => pickUser(u)}>
                  <div className="avatar">{initials(u.name)}</div>
                  <div>{u.name}</div>
                  <div className="role-tag">{roleLabel(u.role)}</div>
                </button>
              ))}
              {groups.farmaceutico.length > 0 && (
                <>
                  <div className="user-group-label">Farmacia</div>
                  {groups.farmaceutico.map((u) => (
                    <button key={u.name} className={`user-list-row role-${u.role}`} onClick={() => pickUser(u)}>
                      <div className="avatar">{initials(u.name)}</div>
                      <div>{u.name}</div>
                      <div className="role-tag">{roleLabel(u.role)}</div>
                    </button>
                  ))}
                </>
              )}
              <div className="user-group-label">Administración</div>
              {groups.admin.map((u) => (
                <button key={u.name} className={`user-list-row role-${u.role}`} onClick={() => pickUser(u)}>
                  <div className="avatar">{initials(u.name)}</div>
                  <div>{u.name}</div>
                  <div className="role-tag">{roleLabel(u.role)}</div>
                </button>
              ))}
            </div>
            <div className="login-hint">
              PIN de 6 dígitos · si lo olvidas, usa "¿No recuerdas el PIN?"
            </div>
          </>
        )}

        {selected && (
          <>
            <div className="login-step-label">Paso 2 de 2</div>
            <h2 className="login-step-title">Hola, {selected.name}</h2>
            <div style={{fontSize:12, color:'var(--ink-3)', marginBottom: 8}}>
              Introduce tu PIN de 6 dígitos
            </div>
            <div className="pin-display">
              {[0,1,2,3,4,5].map((i) => (
                <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
              ))}
            </div>
            <div className="pin-error">{error}</div>
            <div className="pin-pad">
              {[1,2,3,4,5,6,7,8,9].map((d) => (
                <button key={d} disabled={busy} onClick={() => pressDigit(String(d))}>{d}</button>
              ))}
              <button className="action" disabled={busy} onClick={clearPin}>C</button>
              <button disabled={busy} onClick={() => pressDigit('0')}>0</button>
              <button className="action" disabled={busy} onClick={backPin}>←</button>
            </div>
            <div style={{marginTop: 16, display:'flex', justifyContent:'space-between', alignItems:'center', gap:8}}>
              <button className="btn ghost" disabled={busy} onClick={() => { setSelected(null); setPin(''); setError(''); setResetMsg(''); }}>← Cambiar persona</button>
              <button className="btn ghost sm" disabled={busy} onClick={requestReset}>¿No recuerdas el PIN?</button>
            </div>
            {resetMsg && <div className="muted tiny" style={{marginTop: 8, textAlign:'center'}}>{resetMsg}</div>}
          </>
        )}
      </div>
    </div>
  );
}

window.LoginScreen = LoginScreen;
