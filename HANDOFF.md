# HANDOFF · App Maletines UCP Domiciliaria

Documento de traspaso para implementar la versión real de la app a partir del prototipo HTML/React que vive en `App Maletines.html` + `src/*`.

Stack objetivo: **GitHub + Firebase (Hosting + Firestore + Auth) + despliegue automático con GitHub Actions**.

El prototipo guarda el estado en `localStorage` (capa `src/state.js`). El objetivo de este traspaso es reemplazar esa capa por Firestore manteniendo intacta la lógica del reducer y los componentes React.

---

## 1. Resumen funcional (lo que ya funciona en el prototipo)

- **Login** con selección de persona + PIN de 4 dígitos.
- **4 roles**: `medico`, `enfermera`, `supervisora` (Cristina Moya), `admin`.
- **14 maletines** (7 médicos, 7 enfermería) con catálogo precargado desde los listados oficiales UCP-IM-001 y UCP-IM-002.
- **Portador del maletín**:
  - Buscador + secciones plegables.
  - Registrar uso (botones `+/−`) → se comunica a Cristina.
  - Reponer directamente (↻) con cantidad + nueva fecha de caducidad.
  - Editar caducidad, reportar incidencias (texto libre).
  - Revisión semestral con checklist y firmas.
- **Cristina (supervisora)**: pestañas Pendientes / Maletines / Caducidades / Historial / Calendario / Consumo / Incidencias.
- **Admin**: gestión de PINs y vista del catálogo.
- **Alertas**: caducidad ≤15 días y productos ya caducados.

---

## 2. Modelo de datos en Firestore

Todo en una sola base de datos regional `europe-west1` (Bélgica) para cumplir RGPD.

### Colección `users/{uid}`
```
{
  name: "Cristina Moya",
  role: "supervisora",        // medico | enfermera | supervisora | admin
  bagId: null,                // string | null — ID del maletín asignado
  email: "cristina@ucp.local",
  createdAt: Timestamp,
  active: true
}
```
El `uid` es el de Firebase Auth.

### Colección `bags/{bagId}`
IDs estables: `med-alvaro`, `med-lucia`, … `enf-choni`, `enf-marta`, …
```
{
  id: "med-alvaro",
  type: "medico",             // medico | enfermera
  owner: "Alvaro",
  label: "Maletín médico · Alvaro",
  lastRevision: "2025-11-15",
  nextRevision: "2026-05-15",
  // contadores denormalizados para que Cristina lea 14 docs en vez de ~3000:
  pendingCount: 4,
  expiringSoonCount: 2,
  incidentCount: 0,
  updatedAt: Timestamp
}
```

### Subcolección `bags/{bagId}/items/{itemId}`
Un documento por ítem del catálogo. IDs estables del tipo `med-alvaro-exploracion-fonendo`.
```
{
  section: "Exploración",
  name: "Fonendo (1U)",
  requiresExpiry: false,
  stock: "ok",                // ok | falta | caducado | incidencia
  pendingReplace: 0,
  expiry: "2026-09-01" | null,
  incidentNote: "",
  updatedAt: Timestamp
}
```

### Colección `usageEvents/{eventId}`
Log **inmutable** de consumos (no se edita, solo se crea).
```
{
  bagId, itemId, itemName, section,
  qty: 2,
  by: "Choni",                // nombre legible
  byUid: "abc123",            // uid Firebase
  at: Timestamp,
  note: ""
}
```

### Colección `replaceEvents/{eventId}`
Log inmutable de reposiciones.
```
{
  bagId, itemId, itemName, section,
  qty: 2,
  by: "Cristina Moya" | "Choni",    // puede ser el portador o Cristina
  byUid,
  byRole: "supervisora" | "enfermera" | "medico",
  at: Timestamp,
  newExpiry: "2027-04-20" | null,
  previousExpiry: "2026-05-01" | null
}
```

### Colección `revisions/{revId}`
Revisiones semestrales firmadas.
```
{
  bagId,
  by: "Choni", byUid,
  supervisor: "Cristina Moya", supervisorUid,
  at: Timestamp,
  summary: { [itemId]: "correcto" | "falta" | "caducado" | "repuesto" }
}
```

### Colección `incidents/{incId}` (opcional, solo si se prefiere separarlo de `items`)
```
{
  bagId, itemId, itemName, section,
  note: "Cánula doblada",
  status: "open" | "closed",
  openedBy, openedAt,
  closedBy, closedAt
}
```
**Recomendación**: mantener la incidencia como campo dentro del item y adicionalmente loggear un `usageEvents` con `note` para trazabilidad.

---

## 3. Reglas de seguridad (`firestore.rules`)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() { return request.auth != null; }
    function myDoc() { return get(/databases/$(database)/documents/users/$(request.auth.uid)).data; }
    function role() { return myDoc().role; }
    function isSupervisora() { return role() == 'supervisora'; }
    function isAdmin() { return role() == 'admin'; }
    function ownsBag(bagId) { return myDoc().bagId == bagId; }

    // USERS
    match /users/{uid} {
      allow read: if isSignedIn();                         // todos ven la lista (para login list)
      allow write: if isAdmin();                            // solo admin crea/modifica
      allow update: if request.auth.uid == uid             // yo puedo cambiar mi propio email
                    && request.resource.data.role == resource.data.role
                    && request.resource.data.bagId == resource.data.bagId;
    }

    // BAGS
    match /bags/{bagId} {
      allow read: if isSignedIn() && (isSupervisora() || isAdmin() || ownsBag(bagId));
      allow update: if isSupervisora() || isAdmin() || ownsBag(bagId);
      allow create, delete: if isAdmin();

      match /items/{itemId} {
        allow read: if isSignedIn() && (isSupervisora() || isAdmin() || ownsBag(bagId));
        allow write: if isSupervisora() || isAdmin() || ownsBag(bagId);
      }
    }

    // EVENTS (solo crear, no editar ni borrar — trazabilidad clínica)
    match /usageEvents/{id} {
      allow read: if isSignedIn() && (isSupervisora() || isAdmin()
                                     || resource.data.byUid == request.auth.uid);
      allow create: if isSignedIn() && request.resource.data.byUid == request.auth.uid;
      allow update, delete: if false;
    }
    match /replaceEvents/{id} {
      allow read: if isSignedIn();
      allow create: if isSignedIn() && request.resource.data.byUid == request.auth.uid;
      allow update, delete: if false;
    }
    match /revisions/{id} {
      allow read: if isSignedIn();
      allow create: if isSignedIn();
      allow update, delete: if false;
    }
  }
}
```

**Nota clínica**: los events son **append-only**. No se puede editar ni borrar un registro de uso pasado — solo añadir uno nuevo. Crítico para auditoría de medicación (opiáceos, BZD).

---

## 4. Autenticación

Proveedor: **Email / Password** de Firebase Auth.

- Cada persona tiene un correo del hospital (o un alias local tipo `alvaro@ucp-maletines.local`).
- Contraseña inicial la pone el admin desde la consola de Firebase.
- **Opcional (mejora futura)**: mantener el PIN de 4 dígitos para acceso rápido desde el móvil añadiendo una capa "PIN local" que desbloquea la sesión ya autenticada por Firebase (patrón de apps bancarias).

### Seed inicial de usuarios

Crear un script `scripts/seed-users.js` que use Firebase Admin SDK para dar de alta los 16 usuarios de una sola vez, con `role` y `bagId` asignados. Plantilla:

```js
// scripts/seed-users.js
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(require('./service-account.json')) });

const USERS = [
  { name: 'Alvaro',   role: 'medico',     bagId: 'med-alvaro',   email: 'alvaro@ucp.local' },
  { name: 'Lucía',    role: 'medico',     bagId: 'med-lucia',    email: 'lucia@ucp.local' },
  // … resto
  { name: 'Cristina Moya', role: 'supervisora', bagId: null, email: 'cristina@ucp.local' },
  { name: 'Admin',         role: 'admin',        bagId: null, email: 'admin@ucp.local' },
];

(async () => {
  for (const u of USERS) {
    const user = await admin.auth().createUser({ email: u.email, password: 'Cambiame1234!' });
    await admin.firestore().doc(`users/${user.uid}`).set({
      ...u, createdAt: admin.firestore.FieldValue.serverTimestamp(), active: true,
    });
    console.log('ok', u.name);
  }
})();
```

---

## 5. Migración del prototipo a Firestore

### 5.1. Archivos del prototipo que hay que tocar

| Archivo | Cambio |
|---|---|
| `src/state.js` | Eliminar `loadState`/`saveState` de localStorage. Crear `firestore.js` nuevo con listeners en tiempo real. |
| `src/App.jsx` | Reemplazar `useReducer` con estado inicial de localStorage por un hook que se suscribe a Firestore (`useFirestoreState`) y emite acciones que escriben en la BD. |
| `src/Login.jsx` | Mantener UI. Al pulsar PIN, hacer `signInWithEmailAndPassword` a Firebase Auth en vez de comparar en cliente. |
| `src/BagOwnerView.jsx` | Sin cambios salvo `dispatch` → `await db.logUsage(...)` etc. |
| `src/CristinaView.jsx` | Igual. |
| `src/RevisionView.jsx` | Igual. |
| `src/AdminView.jsx` | "Editar PIN" pasa a "Enviar email de restablecer contraseña" (Firebase Auth lo gestiona). |

### 5.2. Mapeo reducer → Firestore

| Acción del reducer actual | Operación Firestore |
|---|---|
| `log_usage` | `addDoc(usageEvents)` + `updateDoc(bags/{id}/items/{itemId})` con incremento de `pendingReplace` |
| `replace` | `addDoc(replaceEvents)` + `updateDoc(items/{itemId})` restando `pendingReplace` y seteando `expiry` |
| `set_expiry` | `updateDoc(items/{itemId}, { expiry })` |
| `set_incident` | `updateDoc(items/{itemId}, { incidentNote })` |
| `log_revision` | `addDoc(revisions)` + `updateDoc(bags/{id}, { lastRevision, nextRevision })` |

Para mantener los contadores denormalizados (`pendingCount`, `expiringSoonCount`), conviene una **Cloud Function** que escuche los cambios en `items` y actualice el `bag` padre. Requiere plan Blaze (céntimos/mes). Alternativa sin Blaze: calcularlos en cliente al vuelo (más lecturas, pero sigue cabiendo en Spark).

### 5.3. Carga inicial del catálogo

Script `scripts/seed-bags.js`:
- Lee `src/catalog.js` (los arrays `CATALOG_MEDICO` y `CATALOG_ENFERMERIA`).
- Crea los 14 documentos `bags/*`.
- Para cada uno, escribe los ~150-200 ítems en `bags/{id}/items/*`.
- Ejecutar **una sola vez** con `node scripts/seed-bags.js`.

---

## 6. Despliegue

### 6.1. Inicializar Firebase en el repo
```bash
npm install -g firebase-tools
firebase login
firebase init hosting firestore
# - elige tu proyecto
# - public directory: . (la raíz del prototipo)
# - single-page app: No (es un HTML estático con React vía CDN)
# - GitHub Actions: Sí → genera el workflow automáticamente
```

### 6.2. Archivos de configuración que quedan en el repo

- `firebase.json` — config de hosting + rules
- `firestore.rules` — reglas de seguridad (ver sección 3)
- `firestore.indexes.json` — índices compuestos si Firestore los pide en consola
- `.github/workflows/firebase-hosting-merge.yml` — generado por `firebase init`

### 6.3. Despliegue continuo

Cada `push` a `main`:
1. GitHub Actions ejecuta el workflow.
2. Firebase despliega Hosting + reglas.
3. La app queda en `https://<tu-proyecto>.web.app` en ~30 s.

### 6.4. Variables y secretos

- **No** incluir claves de Firebase Admin en el repo.
- La config pública de Firebase Web (`apiKey`, `projectId`, …) **sí** va en el cliente — no es secreta; la seguridad la dan las reglas de Firestore.
- Para el seed de usuarios, descargar `service-account.json` en local, **añadirlo a `.gitignore`** y ejecutar los scripts desde tu ordenador.

---

## 7. Acceso desde móvil (sin PWA, vía navegador)

Suficiente por ahora:

- Abrir `https://<tu-proyecto>.web.app` en Safari / Chrome del móvil.
- "**Añadir a pantalla de inicio**" crea un atajo con el favicon — comportamiento casi de app.
- HTTPS automático de Firebase Hosting → necesario para Auth funcione en móvil.

**Verificaciones de responsive que ya tiene el prototipo**:
- `@media (max-width: 800px)` oculta la sidebar y baja el padding.
- Pin-pad grande y táctil en login.
- Tablas con scroll horizontal en los anchos pequeños (aplicar `overflow-x: auto` al contenedor si aún no está).

**Mejora recomendada mínima para móvil**:
- Añadir `<meta name="theme-color" content="#0b1220">` en el `<head>` (color de la barra del sistema).
- Añadir un favicon propio (`favicon.ico` en raíz).

---

## 8. Lista de tareas para Claude Code

Pega esto como primer mensaje al abrir Claude Code en la carpeta del proyecto:

```
Lee HANDOFF.md. Sigue las secciones 2–7.

Orden de trabajo:
1. Propón el modelo Firestore definitivo (sección 2) y espera mi OK.
2. Crea firebase.json, firestore.rules y firestore.indexes.json.
3. Crea src/firebase.js (init del SDK cliente) y src/db.js (funciones logUsage, replace, setExpiry, setIncident, logRevision, subscribeBags, subscribeEvents).
4. Refactoriza src/state.js para que el estado venga de Firestore en tiempo real vía onSnapshot, manteniendo la misma forma del objeto state que usan los componentes.
5. Refactoriza src/Login.jsx para usar signInWithEmailAndPassword.
6. Refactoriza src/App.jsx: el reducer ya no guarda en localStorage; cada acción llama a la función equivalente de db.js.
7. Crea scripts/seed-users.js y scripts/seed-bags.js.
8. Configura GitHub Actions de Firebase Hosting.
9. Documenta en README.md cómo arrancar en local (firebase emulators:start) y cómo desplegar.

Criterios:
- No rompas la UI del prototipo; reaprovecha todos los componentes React existentes.
- Los events (usageEvents, replaceEvents, revisions) son append-only.
- Usa región europe-west1.
- Haz commits atómicos después de cada paso para poder revertir.
```

---

## 9. Checklist antes del despliegue en producción

- [ ] Reglas de Firestore probadas con el simulador de la consola Firebase.
- [ ] Seed de usuarios ejecutado y verificado (login real funciona).
- [ ] Seed de maletines ejecutado y verificado (14 bags, todos con sus ítems).
- [ ] Cristina logueada puede ver todos los maletines; un médico solo el suyo.
- [ ] Un usuario cualquiera NO puede editar eventos pasados.
- [ ] Contadores `pendingCount` / `expiringSoonCount` consistentes (o calculados en cliente sin CF).
- [ ] Probado en Safari iOS y Chrome Android.
- [ ] Alertas de presupuesto en Google Cloud Console configuradas a 5 €/mes (por si se pasara a Blaze).
- [ ] Backup: exportar Firestore a Google Cloud Storage una vez a la semana (`gcloud firestore export`).
- [ ] Política interna del hospital revisada (Sistemas / RGPD).
- [ ] Usuarios reales cambian su contraseña en el primer acceso.

---

## 10. Ampliaciones futuras (fuera del MVP)

- **PWA instalable** (manifest + service worker) → permitirá registrar uso offline en domicilio sin cobertura.
- **Cloud Functions programadas** (Blaze, céntimos/mes):
  - Email/push diario a Cristina con el resumen de pendientes.
  - Aviso automático 15 días antes de cada caducidad.
  - Aviso 1 mes antes de cada revisión semestral.
- **Exportación a PDF** de la revisión semestral firmada.
- **Dashboard de consumo** por trimestre para planificación de compras.
- **Lector de código de barras** desde cámara del móvil para altas de medicación.

---

_Documento generado como handoff del prototipo. Cualquier decisión técnica puede reajustarse sin alterar los flujos de usuario ya validados por el equipo._
