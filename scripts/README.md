# Scripts de seed — App Maletines UCP

Dos scripts Node para poblar Firebase desde cero (Auth + Firestore). Se ejecutan
**desde tu máquina**, una sola vez por entorno. No se despliegan.

## 1. Preparar credenciales

1. Ve a Firebase Console → ⚙️ Project settings → **Service accounts**.
2. "Generate new private key" → descarga el JSON.
3. Guárdalo como `scripts/service-account.json`.

Este archivo **no** se sube al repo (está en `.gitignore`).

## 2. Instalar dependencias

```bash
cd scripts
npm install
```

## 3. Ejecutar

```bash
# 16 usuarios en Firebase Auth + documentos users/{uid} en Firestore
npm run seed:users

# 14 maletines (bags/*) con sus ~150-200 ítems en bags/*/items/*
npm run seed:bags

# Ambos
npm run seed:all
```

Ambos scripts son **idempotentes** (`merge: true`): puedes volver a ejecutarlos
sin duplicar ni perder datos.

### PINs por defecto

| Rol | Email | PIN |
|---|---|---|
| Supervisora (Cristina) | `cristina@ucp.local` | `000000` |
| Admin | `admin@ucp.local` | `000000` |
| Médicos (7) | `alvaro@ucp.local`, … | `123456` |
| Enfermería (7) | `choni@ucp.local`, … | `123456` |

El primer día, cada usuario debe pulsar "¿No recuerdas el PIN?" en el login
para recibir un email de reset y fijar su PIN real.

### Flags

- `node seed-users.js --reset-pins` — fuerza reset de password en usuarios que
  ya existen. Úsalo solo si quieres volver a los PINs por defecto.
- `node seed-bags.js --no-fake-dates` — siembra los ítems con `expiry: null` en
  lugar de fechas simuladas. Útil para un entorno limpio de producción.

Por defecto las caducidades se generan ~6 meses vista (jitter ±30 días),
coherente con un estado de "maletín recién repuesto".

## 4. Verificar

- Firebase Console → Authentication → 16 usuarios listados.
- Firestore → colección `users` con 16 docs, `bags` con 14 docs y sus
  subcolecciones `items` con ~150-200 docs cada una.
