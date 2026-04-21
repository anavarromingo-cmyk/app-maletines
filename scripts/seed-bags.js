#!/usr/bin/env node
// Seed de maletines: crea los 14 documentos `bags/*` y sus subcolecciones
// `items/*` a partir del catálogo oficial (src/catalog.js).
//
// Uso:   node seed-bags.js                  # siembra con fechas fake de caducidad
//        node seed-bags.js --no-fake-dates  # expiry: null en todos los ítems
//
// Requiere scripts/service-account.json.

const path  = require('path');
const admin = require('firebase-admin');

// --- Reutiliza catálogo y helpers del cliente -------------------------------
const window = {};
require(path.resolve(__dirname, '..', 'src', 'catalog.js'));
const {
  MEDICOS, ENFERMERAS,
  CATALOG_MEDICO, CATALOG_ENFERMERIA,
  EXPIRY_CATEGORIES,
  bagIdForUser,
} = window;

// --- Config ------------------------------------------------------------------

const SERVICE_ACCOUNT = require(path.resolve(__dirname, 'service-account.json'));
const NO_FAKE_DATES = process.argv.includes('--no-fake-dates');
const BATCH_LIMIT = 450; // Firestore admite 500 ops por batch; margen de seguridad.

// --- Helpers -----------------------------------------------------------------

function slug(s) {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function itemIdFor(section, name, idx) {
  // idx evita colisiones si dos ítems normalizan al mismo slug.
  return `${slug(section)}-${slug(name)}-${idx}`.slice(0, 150);
}

function fakeExpiryISO() {
  // Maletines recién repuestos: todas las caducidades ~6 meses vista con
  // jitter ±30 días. Se evita el umbral de alerta (≤15d) y las caducadas.
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  d.setDate(d.getDate() + Math.floor(Math.random() * 61) - 30);
  return d.toISOString().slice(0, 10);
}

function buildItems(catalog) {
  const items = [];
  let idx = 0;
  catalog.forEach((group) => {
    const requiresExpiry = EXPIRY_CATEGORIES.has(group.section);
    group.items.forEach((name) => {
      idx++;
      const id = itemIdFor(group.section, name, idx);
      const expiry = requiresExpiry && !NO_FAKE_DATES ? fakeExpiryISO() : null;
      items.push({
        id,
        data: {
          section: group.section,
          name,
          requiresExpiry,
          stock: 'ok',
          pendingReplace: 0,
          expiry,
          incidentNote: '',
        },
      });
    });
  });
  return items;
}

// --- Init --------------------------------------------------------------------

admin.initializeApp({ credential: admin.credential.cert(SERVICE_ACCOUNT) });
const db = admin.firestore();

// --- Seed --------------------------------------------------------------------

async function seedBag({ name, role, catalog }) {
  const bagId = bagIdForUser(name, role);
  const type  = role;
  const label = `Maletín ${role === 'medico' ? 'médico' : 'enfermería'} · ${name}`;

  const today = new Date();
  const lastRev = new Date(today); lastRev.setMonth(lastRev.getMonth() - 1);
  const nextRev = new Date(today); nextRev.setMonth(nextRev.getMonth() + 5);

  await db.doc(`bags/${bagId}`).set({
    id: bagId,
    type,
    owner: name,
    label,
    lastRevision: lastRev.toISOString().slice(0, 10),
    nextRevision: nextRev.toISOString().slice(0, 10),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const items = buildItems(catalog);
  // Chunking por BATCH_LIMIT
  for (let i = 0; i < items.length; i += BATCH_LIMIT) {
    const chunk = items.slice(i, i + BATCH_LIMIT);
    const batch = db.batch();
    chunk.forEach(({ id, data }) => {
      const ref = db.doc(`bags/${bagId}/items/${id}`);
      batch.set(ref, {
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    });
    await batch.commit();
  }
  console.log(`  ✓ ${bagId.padEnd(16)} ${items.length} ítems`);
}

(async function main() {
  console.log(`\nSeeding maletines (no-fake-dates=${NO_FAKE_DATES})\n`);
  for (const name of MEDICOS) {
    try { await seedBag({ name, role: 'medico',    catalog: CATALOG_MEDICO }); }
    catch (e) { console.error(`  ✗ med-${name}: ${e.message}`); }
  }
  for (const name of ENFERMERAS) {
    try { await seedBag({ name, role: 'enfermera', catalog: CATALOG_ENFERMERIA }); }
    catch (e) { console.error(`  ✗ enf-${name}: ${e.message}`); }
  }
  console.log('\nHecho.\n');
  process.exit(0);
})().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
