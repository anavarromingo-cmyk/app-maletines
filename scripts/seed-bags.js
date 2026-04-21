#!/usr/bin/env node
// Seed de maletines: crea los 14 documentos `bags/*` y sus subcolecciones
// `items/*` a partir del catálogo oficial (src/catalog.js).
//
// Uso:   node seed-bags.js
//
// Requiere scripts/service-account.json.

const path = require('path');
const admin = require('firebase-admin');

// Shim para que catalog.js (pensado para el navegador) funcione en Node.
global.window = global;
global.document = {};
require(path.resolve(__dirname, '..', 'src', 'catalog.js'));

const {
  MEDICOS, ENFERMERAS,
  CATALOG_MEDICO, CATALOG_ENFERMERIA,
  EXPIRY_CATEGORIES,
  bagIdForUser,
} = global;

// --- Config ------------------------------------------------------------------

const SERVICE_ACCOUNT = require(path.resolve(__dirname, 'service-account.json'));
const BATCH_LIMIT = 450; // Firestore admite 500 ops por batch; margen de seguridad.

// --- Helpers -----------------------------------------------------------------

function slug(s) {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function itemIdFor(section, name, idx) {
  // idx evita colisiones si dos ítems normalizan al mismo slug.
  return `${slug(section)}-${slug(name)}-${idx}`.slice(0, 150);
}

function nextRevisionISO() {
  const d = new Date();
  d.setMonth(d.getMonth() + 6);
  return d.toISOString().slice(0, 10);
}

function buildItems(catalog) {
  const items = [];
  let idx = 0;
  catalog.forEach((group) => {
    const requiresExpiry = EXPIRY_CATEGORIES.has(group.section);
    group.items.forEach((name) => {
      idx++;
      items.push({
        id: itemIdFor(group.section, name, idx),
        data: {
          section: group.section,
          name,
          requiresExpiry,
          stock: 'ok',
          pendingReplace: 0,
          expiry: null,
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
  const label = `Maletín ${role === 'medico' ? 'médico' : 'enfermería'} · ${name}`;

  await db.doc(`bags/${bagId}`).set({
    id: bagId,
    type: role,
    owner: name,
    label,
    lastRevision: null,
    nextRevision: nextRevisionISO(),
    pendingCount: 0,
    expiringSoonCount: 0,
    incidentCount: 0,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  const items = buildItems(catalog);
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
  console.log('\nSeeding maletines\n');
  for (const name of MEDICOS) {
    try { await seedBag({ name, role: 'medico', catalog: CATALOG_MEDICO }); }
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
