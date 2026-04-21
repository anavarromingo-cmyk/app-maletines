// Stub — la vista completa llega en el siguiente commit.
function PharmacyView({ session }) {
  return (
    <div style={{padding: 24}}>
      <h1 className="page-title">Farmacia</h1>
      <div className="muted">Hola, {session.name}. Vista en construcción.</div>
    </div>
  );
}
window.PharmacyView = PharmacyView;
