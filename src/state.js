// Estado global persistente de la app
// Almacena: usuarios, PINs, inventario por maletín, eventos de uso, reposiciones, revisiones

const STORAGE_KEY = 'maletines_app_state_v1';

function defaultPin(name) {
  // PIN por defecto: 4 últimos dígitos basados en el nombre. Para demo.
  // 1234 para todos por defecto. Cristina: 9999. Admin: 0000.
  if (name === 'Cristina Moya') return '9999';
  if (name === 'Admin') return '0000';
  return '1234';
}

function todayISO() { return new Date().toISOString().slice(0,10); }
function nowISO() { return new Date().toISOString(); }

function buildInventory(catalog, ownerName, kind) {
  // Cada item arranca como "completo" con stock teórico 1, y caducidad simulada
  // Para los que requieren caducidad, generamos fechas variadas para tener demo realista
  const today = new Date();
  const inv = [];
  let idCounter = 0;
  catalog.forEach(group => {
    const requiresExpiry = window.EXPIRY_CATEGORIES.has(group.section);
    group.items.forEach(name => {
      idCounter++;
      const id = `${kind}-${ownerName}-${idCounter}`.toLowerCase().replace(/\s+/g,'-').replace(/[^\w-]/g,'');
      let expiry = null;
      let status = 'ok';
      if (requiresExpiry) {
        // Distribuir caducidades: la mayoría >6 meses, algunas próximas, alguna caducada
        const r = Math.random();
        const d = new Date(today);
        if (r < 0.04) {
          // caducada
          d.setDate(d.getDate() - Math.floor(Math.random()*30 + 1));
        } else if (r < 0.12) {
          // próxima a caducar (<=15 días)
          d.setDate(d.getDate() + Math.floor(Math.random()*14 + 1));
        } else if (r < 0.30) {
          // <= 60 días
          d.setDate(d.getDate() + Math.floor(Math.random()*45 + 16));
        } else {
          // > 2 meses
          d.setDate(d.getDate() + Math.floor(Math.random()*540 + 60));
        }
        expiry = d.toISOString().slice(0,10);
      }
      inv.push({
        id,
        section: group.section,
        name,
        requiresExpiry,
        stock: 'ok',         // ok | falta | caducado | incidencia
        pendingReplace: 0,    // unidades pendientes de reponer
        expiry,
        incidentNote: '',
      });
    });
  });
  return inv;
}

function buildInitialState() {
  const users = [];
  // Médicos
  window.MEDICOS.forEach(n => users.push({
    name: n, role: 'medico', pin: defaultPin(n),
    bagId: `med-${n.toLowerCase()}`, bagLabel: `Maletín médico · ${n}`,
  }));
  // Enfermería
  window.ENFERMERAS.forEach(n => users.push({
    name: n, role: 'enfermera', pin: defaultPin(n),
    bagId: `enf-${n.toLowerCase()}`, bagLabel: `Maletín enfermería · ${n}`,
  }));
  // Cristina
  users.push({ name: 'Cristina Moya', role: 'supervisora', pin: defaultPin('Cristina Moya'), bagId: null, bagLabel: null });
  // Admin
  users.push({ name: 'Admin', role: 'admin', pin: defaultPin('Admin'), bagId: null, bagLabel: null });

  // Inventarios por maletín
  const bags = {};
  window.MEDICOS.forEach(n => {
    bags[`med-${n.toLowerCase()}`] = {
      id: `med-${n.toLowerCase()}`,
      type: 'medico',
      owner: n,
      label: `Maletín médico · ${n}`,
      lastRevision: '2025-11-15',
      nextRevision: '2026-05-15',
      items: buildInventory(window.CATALOG_MEDICO, n, 'med'),
    };
  });
  window.ENFERMERAS.forEach(n => {
    bags[`enf-${n.toLowerCase()}`] = {
      id: `enf-${n.toLowerCase()}`,
      type: 'enfermera',
      owner: n,
      label: `Maletín enfermería · ${n}`,
      lastRevision: '2025-12-01',
      nextRevision: '2026-06-01',
      items: buildInventory(window.CATALOG_ENFERMERIA, n, 'enf'),
    };
  });

  // Genera algunos eventos de uso simulados para tener pendientes
  const usageEvents = [];
  const replaceEvents = [];
  Object.values(bags).forEach(bag => {
    // ~3-5 items pendientes de reponer por maletín
    const sample = [...bag.items].sort(() => Math.random() - 0.5).slice(0, 3 + Math.floor(Math.random()*3));
    sample.forEach(it => {
      const qty = 1 + Math.floor(Math.random()*3);
      it.pendingReplace = qty;
      it.stock = 'falta';
      const d = new Date();
      d.setDate(d.getDate() - Math.floor(Math.random()*5));
      usageEvents.push({
        id: `u-${Math.random().toString(36).slice(2,8)}`,
        bagId: bag.id, itemId: it.id, itemName: it.name, section: it.section,
        qty, by: bag.owner, at: d.toISOString(), note: '',
      });
    });
  });

  // Algunos eventos de reposición ya realizados (historial)
  for (let i = 0; i < 12; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (i + 1));
    const bagsArr = Object.values(bags);
    const bag = bagsArr[Math.floor(Math.random()*bagsArr.length)];
    const it = bag.items[Math.floor(Math.random()*bag.items.length)];
    replaceEvents.push({
      id: `r-${Math.random().toString(36).slice(2,8)}`,
      bagId: bag.id, itemId: it.id, itemName: it.name, section: it.section,
      qty: 1 + Math.floor(Math.random()*3),
      by: 'Cristina Moya', at: d.toISOString(),
      newExpiry: it.requiresExpiry ? new Date(Date.now()+365*24*3600*1000).toISOString().slice(0,10) : null,
    });
  }

  return {
    users, bags, usageEvents, replaceEvents,
    incidents: [],
    revisionsLog: [],
    session: null, // {name, role, bagId}
    settings: { simulatedDateOffset: 0 }, // días añadidos al "hoy"
  };
}

window.loadState = function() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { console.warn('load failed', e); }
  const s = buildInitialState();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch(e){}
  return s;
};

window.saveState = function(s) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch(e){ console.warn(e); }
};

window.resetState = function() {
  localStorage.removeItem(STORAGE_KEY);
  return window.loadState();
};

window.getEffectiveToday = function(state) {
  const d = new Date();
  d.setDate(d.getDate() + (state?.settings?.simulatedDateOffset || 0));
  return d;
};

window.daysUntil = function(isoDate, state) {
  if (!isoDate) return null;
  const today = window.getEffectiveToday(state);
  today.setHours(0,0,0,0);
  const t = new Date(isoDate); t.setHours(0,0,0,0);
  return Math.round((t - today) / (24*3600*1000));
};

window.fmtDate = function(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
};

window.fmtDateShort = function(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

window.fmtTime = function(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};
