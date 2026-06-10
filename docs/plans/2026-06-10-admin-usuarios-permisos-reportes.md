# Admin de Usuarios, Permisos y Reportes Diarios Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Modernizar la sección Admin de Torre de Control con dos frentes: (1) administración práctica de usuarios/permisos y (2) corrección segura de reportes diarios por rol, sin romper producción.

**Architecture:** Aplicar una fase rápida sobre el Admin legacy para reducir riesgo inmediato de data incorrecta, y en paralelo construir una experiencia Next.js moderna para usuarios/permisos y reportes diarios. La autorización real permanece server-side; el frontend solo mejora UX, claridad y velocidad operativa.

**Tech Stack:** Next.js App Router, React Server Components/Server Actions, Prisma, dashboard API same-origin, HTML legacy sincronizado en 4 copias, Vitest/static tests, GitHub Actions deploy ECS/Fargate.

---

## Scope aprobado

Juan aprobó la opción 3: enfoque mixto.

1. **Fase 1 rápida:** mejorar el Admin actual para que no confunda ni dañe datos.
2. **Fase 2 estructural:** crear/optimizar pantallas Next reales para Admin.
3. **Énfasis especial:** la administración de usuarios/permisos debe quedar mucho más práctica: crear usuarios, editar usuarios, dar/quitar permisos y entender alcances sin fricción.

---

## Principios obligatorios

- No exponer secretos.
- No saltarse autorización server-side.
- No confiar en `canManage`/UI como barrera de seguridad.
- Mantener sincronizados los 4 HTML legacy cuando se toque el dashboard estático:
  - `index.html`
  - `Plataforma/index.html`
  - `app/public/index.html`
  - `app/public/Plataforma/index.html`
- Proteger cambios con tests estáticos y `npm run verify`.
- Deploy automático vía push a `main` + GitHub Actions `deploy-ecs.yml`.
- Separar claramente:
  - **Admin de Usuarios y Permisos**
  - **Admin / Corrección de Reportes Diarios**

---

## Current findings

### Admin de usuarios actual

Files:
- `app/src/app/admin/users/page.tsx`
- `app/src/app/admin/users/actions.ts`
- `app/src/lib/permissions.ts`

Estado actual:
- Ya permite crear/editar/suspender usuarios.
- Ya usa `requireUserAdmin()` en acciones server-side.
- Ya audita cambios con `auditEvent.create`.
- Ya maneja roles, cargo, scope, GHL mapping y permisos.

Problema principal:
- La UX es funcional pero no práctica para operación diaria.
- Permisos y alcances son difíciles de entender rápido.
- Crear usuarios requiere demasiada decisión manual sin presets claros.
- No hay una visualización simple de “qué puede hacer este usuario”.

### Admin de reportes diario actual

Files:
- `index.html`
- `Plataforma/index.html`
- `app/public/index.html`
- `app/public/Plataforma/index.html`

Estado actual:
- `AdminView` edita `daily_entries` por fecha/miembro.
- Usa `/api/dashboard/mutate` y `/api/dashboard/select` con sesión same-origin.
- Mutaciones tienen audit log.

Problema principal:
- `EDIT_FIELDS` expone solo 22 campos legacy.
- El modelo real de `rowToEntry` maneja ~46 campos.
- Campos críticos de closers, setters, notas y cash no son editables de forma clara.
- Labels legacy como `New Bk Orgánico` no coinciden con la semántica actual para High Ticket.

---

# Phase 1 — Quick safety improvements in legacy Admin

## Task 1: Rename legacy Admin copy to reduce confusion

**Objective:** Aclarar que el Admin legacy es para corrección de reportes diarios, no para usuarios/permisos.

**Files:**
- Modify: `index.html`
- Modify: `Plataforma/index.html`
- Modify: `app/public/index.html`
- Modify: `app/public/Plataforma/index.html`
- Test: existing static HTML test file or new test under `app/src/lib/`

**Implementation:**
- Replace title/copy similar to:
  - From: `Panel Admin`
  - To: `Corrección de reportes diarios`
- Add helper copy:
  - `Edita registros existentes de Detalle Diario por fecha y colaborador.`
  - `Para crear o administrar usuarios y permisos usa Administración de usuarios.`

**Verification:**
- Static test asserts new copy exists in all 4 HTML files.
- Run: `cd app && npm run verify`

---

## Task 2: Add direct link from legacy Admin to user management

**Objective:** Que el usuario admin pueda ir rápido a crear/editar usuarios/permisos.

**Files:**
- Modify 4 HTML files.
- Test static assertion.

**Implementation:**
- Add prominent button/link:
  - Label: `Administrar usuarios y permisos`
  - URL: `/admin/users`
- Only show when `canManageUsers` is true.

**Verification:**
- Static test checks `/admin/users` link exists.
- Manual smoke after deploy: authenticated admin sees the link.

---

## Task 3: Replace legacy field labels with operational labels by role

**Objective:** Evitar que closers/setters vean nombres técnicos equivocados.

**Files:**
- Modify 4 HTML files.
- Test static assertions.

**Implementation:**
- Introduce role-aware field groups:
  - `HIGH_TICKET_CLOSER_EDIT_FIELDS`
  - `SETTER_EDIT_FIELDS`
  - `ADMIN_COMMERCIAL_EDIT_FIELDS`
  - `MARKETING_EDIT_FIELDS`
  - fallback `LEGACY_EDIT_FIELDS`
- Use existing member classification helpers where possible:
  - high ticket closer detection from current dashboard helpers
  - setter detection if already present; otherwise simple member name mapping with tests

**High Ticket labels:**
- `agendas` → `Agendas`
- `calificadas` → `Calificadas total`
- `agendasHoy` → `Hoy en agenda`
- `showUps` → `Show Ups`
- `ventasHT` → `Ventas HT`
- `valorVentaHT` → `Valor Venta HT`
- `cashCollected` → `Cash collected`
- `recurringCash` → `Recurring cash`
- `reservas` → `Reservas`
- `cashReservas` → `Cash reservas`
- `pendDiaAnterior` → `Pendientes día anterior`
- `pendAcumulados` → `Pendientes acumulados`
- `showupNotes` → `Notas show-up`
- `hotLeadsEvidence` → `Evidencia leads calientes`
- `blockers` → `Bloqueos`

**Setter labels:**
- `setterNewConversations` → `Conversaciones nuevas`
- `setterNewInbound` → `Inbound nuevos`
- `setterNewOutbound` → `Outbound nuevos`
- `setterOutboundReplies` → `Replies outbound`
- `setterCallsProposed` → `Calls proposed`
- `setterLinksSent` → `Links enviados`
- `setterLeadsContacted` → `Leads contactados`
- `setterConfirmedAgendas` → `Agendas confirmadas`
- `setterCallsToLeads` → `Calls to leads`
- `setterMessagesSent` → `Mensajes enviados`
- `setterOrganicLeads` → `Leads orgánicos`
- `setterAdsLeads` → `Leads ads`
- `setterFindings` → `Hallazgos del setter`
- `blockers` → `Bloqueos`

**Admin/Valentina labels:**
- `ventasHT` → `Ventas HT`
- `valorVentaHT` → `Valor Venta HT`
- `cashCollected` → `Cash collected`
- `ventasLT` → `Ventas LT`
- `valorVentaLT` → `Valor Venta LT`
- `refunds` → `Reembolsos`
- `refundValue` → `Valor reembolsos`
- `activeClients` → `Clientes activos`

**Verification:**
- Static tests confirm field groups exist.
- Static tests confirm legacy labels are not used as primary labels for High Ticket closers.
- Run targeted tests, then `npm run verify`.

---

## Task 4: Improve delete confirmation

**Objective:** Reducir riesgo de borrado accidental.

**Files:**
- Modify 4 HTML files.
- Test static assertion.

**Implementation:**
- Replace simple confirm with stronger warning.
- If current UI remains `window.confirm`, include data context:
  - member
  - date
  - key metrics present
  - warning that audit remains but row is deleted
- Preferred if feasible in legacy: require second confirmation for rows with ventas/cash.

**Verification:**
- Static test ensures warning copy includes member/date language and deletion risk.

---

# Phase 2 — Practical User & Permissions Admin

## Task 5: Add permission preset model in frontend code

**Objective:** Crear presets prácticos para que crear usuarios sea rápido y menos propenso a error.

**Files:**
- Modify/Create: `app/src/lib/permission-presets.ts`
- Modify: `app/src/app/admin/users/page.tsx`
- Test: `app/src/lib/permission-presets.test.ts`

**Presets iniciales:**
1. `Admin total`
   - role: `ADMIN`
   - position: `ADMIN`
   - dataScope: all
   - permissions: all
2. `Director comercial`
   - role: likely `OPERATOR` or custom permission set
   - dashboard read/write
   - reports read/write
   - users read optional, no user create unless approved
   - dataScope all or area
3. `Closer High Ticket`
   - dashboard read/write own/team as configured
   - reports read
   - no users management
4. `Setter`
   - dashboard read/write own/team as configured
   - reports read
   - no users management
5. `Solo lectura`
   - role `USER`
   - dashboard read
   - reports read
   - no write
6. `Operaciones / Mentor`
   - role `MENTOR`
   - operaciones read/write
   - dashboard read

**Verification:**
- Tests assert each preset maps to expected role/position/scope/permissions.

---

## Task 6: Add preset selector to create user form

**Objective:** Que crear usuarios sea práctico: elegir plantilla, completar email/nombre y ajustar excepciones si hace falta.

**Files:**
- Modify: `app/src/app/admin/users/page.tsx`
- Modify: `app/src/app/admin/users/actions.ts` only if server validation must understand preset payload.
- Test: static/component-oriented test if available; otherwise static test for preset selector wiring.

**Implementation:**
- Add section at top of create user form:
  - `Tipo de usuario`
  - Dropdown/buttons with presets.
- On select preset, fill:
  - role
  - position
  - dataScope
  - area/equipo defaults if applicable
  - permission checkboxes
- Keep manual override available under `Ajustes avanzados`.

**UX copy:**
- `Elige una plantilla y luego ajusta excepciones si es necesario.`

**Verification:**
- `npm run verify`.
- Manual smoke locally if feasible.

---

## Task 7: Add effective access summary per user

**Objective:** Mostrar de forma simple qué puede hacer cada usuario.

**Files:**
- Modify: `app/src/app/admin/users/page.tsx`
- Possibly create: `app/src/lib/effective-access-summary.ts`
- Test: `app/src/lib/effective-access-summary.test.ts`

**Implementation:**
- Display card/badge per user:
  - `Puede leer dashboard: Sí/No`
  - `Puede editar reportes: Sí/No`
  - `Puede administrar usuarios: Sí/No`
  - `Alcance de datos: Todo / Área / Equipo / Propio / Custom`
  - `Puede editar: todos / área X / equipo Y / solo propio / lista custom`
- Use existing permissions model; do not invent backend access logic.

**Verification:**
- Unit tests for summaries from sample users.

---

## Task 8: Add quick actions for common permission changes

**Objective:** Quitar/dar permisos frecuentes sin abrir toda la edición avanzada.

**Files:**
- Modify: `app/src/app/admin/users/page.tsx`
- Modify: `app/src/app/admin/users/actions.ts` if new server actions are cleaner.
- Test server action authorization/static coverage.

**Quick actions:**
- `Hacer solo lectura`
- `Permitir editar reportes`
- `Quitar edición de reportes`
- `Dar acceso Admin total` with confirmation
- `Suspender usuario`
- `Reactivar usuario`

**Safety:**
- Dangerous actions require confirmation.
- Every action must call `requireUserAdmin()`.
- Every action must write audit event.

**Verification:**
- Tests/static checks confirm `requireUserAdmin()` and `auditEvent.create` remain present.

---

## Task 9: Improve user list filtering/search

**Objective:** Administrar usuarios de forma rápida cuando la lista crezca.

**Files:**
- Modify: `app/src/app/admin/users/page.tsx`
- Maybe split client component: `app/src/app/admin/users/UserAdminClient.tsx`

**Features:**
- Search by name/email.
- Filter by role.
- Filter by position.
- Filter by active/suspended.
- Filter by dataScope.
- Sort active first, admins first or recently updated first.

**Verification:**
- If using client component, add tests where project test setup supports it.
- Otherwise static checks + manual smoke.

---

# Phase 3 — Modern Daily Reports Admin in Next

## Task 10: Create `/admin/reportes-diarios` route shell

**Objective:** Separar reportes diarios del HTML legacy y crear base Next mantenible.

**Files:**
- Create: `app/src/app/admin/reportes-diarios/page.tsx`
- Maybe create: `app/src/app/admin/reportes-diarios/actions.ts`
- Test: static route existence test.

**Implementation:**
- Require admin or dashboard write access server-side.
- Render title:
  - `Corrección de reportes diarios`
- Include link back to dashboard.
- Include filters shell:
  - date/month
  - member
  - role/type

**Verification:**
- Route builds.
- `npm run verify`.

---

## Task 11: Reuse dashboard select/mutate APIs safely

**Objective:** Leer/escribir reportes diarios sin duplicar acceso inseguro.

**Files:**
- Create/Modify route helpers under `app/src/app/admin/reportes-diarios/`
- Reuse existing access helpers from:
  - `app/src/lib/dashboard-access.ts`
  - `app/src/lib/dashboard-tables.ts`

**Implementation:**
- Prefer server-side reads through existing DB helpers if already available.
- If calling internal API, preserve same-origin/session semantics.
- Do not bypass scope checks.

**Verification:**
- Tests/static checks ensure no client Supabase direct secret usage.

---

## Task 12: Add role-based edit modal/page for daily entries

**Objective:** Editar reportes diarios con campos correctos por tipo de colaborador.

**Files:**
- Create: `app/src/app/admin/reportes-diarios/field-groups.ts`
- Create: `app/src/app/admin/reportes-diarios/EntryEditor.tsx`
- Test: `app/src/app/admin/reportes-diarios/field-groups.test.ts`

**Implementation:**
- Extract the same field group logic from Phase 1 into reusable Next code.
- Field groups:
  - High Ticket Closer
  - Setter
  - Admin/Valentina ventas/cash
  - Marketing
  - Legacy fallback

**Verification:**
- Unit tests for member → field group.
- Unit tests for required fields included.

---

## Task 13: Add diff confirmation before save

**Objective:** Que el admin vea exactamente qué va a cambiar antes de guardar.

**Files:**
- Modify: `EntryEditor.tsx`
- Create: `diffEntryFields.ts`
- Test: `diffEntryFields.test.ts`

**Implementation:**
- Compare original values vs edited values.
- Show:
  - field label
  - old value
  - new value
- Save button disabled when no changes.

**Verification:**
- Tests for numeric/string/null diffs.

---

## Task 14: Add audit history view if audit data is queryable

**Objective:** Hacer visible quién cambió qué y cuándo.

**Files:**
- Investigate audit storage schema.
- Create component only if audit events can be queried safely.

**Implementation:**
- On each entry row: `Ver historial`.
- Show:
  - actor
  - timestamp
  - action
  - changed fields

**Verification:**
- If schema is not ready, document as deferred without blocking phases 1-2.

---

# Phase 4 — Verification and deploy

## Task 15: Full verification

**Commands:**

```bash
cd /root/projects/josenaicipa/torre-de-control/app
npm run verify
```

Expected:
- All tests pass.
- Typecheck OK.

## Task 16: Commit and push

**Commands:**

```bash
git status --short
git add .
git commit -m "feat: improve admin users permissions and daily report editing"
git push origin main
```

## Task 17: Deployment verification

**Commands:**
- Check GitHub Actions latest run.
- Smoke production:
  - `/api/health`
  - `/admin/users`
  - `/admin/reportes-diarios` if created
  - `/index.html`
  - `/Plataforma/index.html`

Expected:
- Health OK.
- Admin users loads for admin session.
- Legacy dashboard still works.
- New route builds and responds.

---

## Recommended implementation order

1. Phase 2 Task 5-7 first: permission presets + effective summary.
2. Phase 1 Task 1-4 second: legacy report Admin safety.
3. Phase 2 Task 8-9 third: quick actions + search/filter.
4. Phase 3 after that: new `/admin/reportes-diarios` route.

Reason:
Juan explicitly prioritized practical user/permission management. We should solve that first while still keeping the daily report Admin safe.

---

## Acceptance criteria

### Usuarios/permisos

- Admin can create a user from a preset in under one minute.
- Admin can see what each user can do without reading raw permission flags.
- Admin can quickly make someone read-only or restore edit access.
- Permission changes remain audited.
- Server-side admin checks remain enforced.

### Reportes diarios

- Legacy Admin no longer presents confusing labels as the primary workflow.
- High Ticket closer fields expose the metrics Juan actually uses.
- Setter/Admin fields expose role-relevant fields.
- Deletes are harder to trigger accidentally.
- New Next route exists or is planned behind a clear follow-up if Phase 3 is deferred.

### Technical

- All 4 HTML files remain synchronized when touched.
- `npm run verify` passes.
- Production deploy is verified after push.
