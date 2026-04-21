#!/usr/bin/env node
// Seed de usuarios: crea o actualiza los 16 usuarios en Firebase Auth y
// guarda su perfil en Firestore (colección `users/{uid}`).
//
// Uso:   node seed-users.js                # idempotente; no resetea passwords
//        node seed-users.js --reset-pins   # fuerza reset de PIN en usuarios ya existentes
//
// Requiere scripts/service-account.json (ver scripts/README.md).

const path  = require('path');
const admin = require('firebase-admin');

// --- Reutiliza MEDICOS/ENFERMERAS y los helpers del catálogo del cliente -----
const window = {};
require(path.resolve(__dirname, '..', 'src', 'catalog.js'));
const { MEDICOS, ENFERMERAS, emailForUser, bagIdForUser } = window;

// --- Config ------------------------------------------------------------------

const SERVICE_ACCOUNT = require(path.resolve(__dirname, 'service-account.json'));
const RESET_PINS = process.argv.includes('--reset-pins');

const PIN_DEFAULT_PORTADOR = '123456';
const PIN_DEFAULT_CRISTINA = '000000';
const PIN_DEFAULT_ADMIN    = '000000';

function pinFor(role) {
  if (role === 'supervisora') return PIN_DEFAULT_CRISTINA;
  if (role === 'admin')       return PIN_DEFAULT_ADMIN;
  return PIN_DEFAULT_PORTADOR;
}

function buildRoster() {
  const roster = [];
  MEDICOS.forEach((name) => roster.push({
    name, role: 'medico',
    bagId: bagIdForUser(name, 'medico'),
    email: emailForUser(name),
  }));
  ENFERMERAS.forEach((name) => roster.push({
    name, role: 'enfermera',
    bagId: bagIdForUser(name, 'enfermera'),
    email: emailForUser(name),
  }));
  roster.push({ name: 'Cristina Moya', role: 'supervisora', bagId: null, email: emailForUser('Cristina Moya') });
  roster.push({ name: 'Admin',         role: 'admin',        bagId: null, email: emailForUser('Admin') });
  return roster;
}

// --- Init --------------------------------------------------------------------

admin.initializeApp({
  credential: admin.credential.cert(SERVICE_ACCOUNT),
});
const auth = admin.auth();
const db   = admin.firestore();

// --- Seed --------------------------------------------------------------------

async function upsertUser(u) {
  const pin = pinFor(u.role);
  let authUser;

  try {
    authUser = await auth.getUserByEmail(u.email);
    if (RESET_PINS) {
      await auth.updateUser(authUser.uid, { password: pin, displayName: u.name, disabled: false });
      console.log(`  ↻ reset PIN   ${u.email}`);
    } else {
      console.log(`  · ya existe   ${u.email}`);
    }
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    authUser = await auth.createUser({
      email: u.email,
      password: pin,
      displayName: u.name,
      emailVerified: false,
    });
    console.log(`  + creado      ${u.email} (pin ${pin})`);
  }

  await db.doc(`users/${authUser.uid}`).set({
    name:   u.name,
    role:   u.role,
    bagId:  u.bagId,
    email:  u.email,
    active: true,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

(async function main() {
  const roster = buildRoster();
  console.log(`\nSeeding ${roster.length} usuarios (reset-pins=${RESET_PINS})\n`);
  for (const u of roster) {
    try {
      await upsertUser(u);
    } catch (e) {
      console.error(`  ✗ fallo       ${u.email}: ${e.message}`);
    }
  }
  console.log('\nHecho. PINs por defecto:');
  console.log(`  portadores (médicos + enfermería): ${PIN_DEFAULT_PORTADOR}`);
  console.log(`  Cristina Moya:                     ${PIN_DEFAULT_CRISTINA}`);
  console.log(`  Admin:                             ${PIN_DEFAULT_ADMIN}`);
  console.log('Cada usuario debe cambiarlo desde "¿No recuerdas el PIN?" tras el primer login.\n');
  process.exit(0);
})().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
