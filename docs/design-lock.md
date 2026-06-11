# Design Lock — Sistema visual Unlocked Ecom (Torre de Control)

Este documento es el contrato de diseño de Torre de Control (`control.unlockedecom.co`).
Define el sistema visual aprobado, qué se puede cambiar y qué constituye una
regresión prohibida. Está protegido por `.github/CODEOWNERS` y por el test
estático `app/src/lib/brand-design-guard.test.ts`, que corre en CI
(`.github/workflows/torre-v2-verify.yml`).

## Sistema aprobado

- **Marca:** Unlocked Ecom. El lockup y los iconos oficiales viven en
  `app/public/brand/` (`ecom-lockup-color.png`, `ecom-logo-color.png`,
  `icon-red.png`, `icon-white.png`). No se sustituyen por logos improvisados,
  texto plano sin marca ni assets externos.
- **Tipografía:** Hanken Grotesk como familia principal (pesos 400–900).
  Space Grotesk se permite únicamente como fuente numérica/tabular
  (`--font-numeric` en `globals.css`); nunca como familia principal de UI.
- **Color de marca (rampa "ua"):**
  - Rojo principal: `#F23005` (`--color-accent`)
  - Hover: `#F8551F` (`--color-accent-hover`)
  - Press: `#D62A04` (`--color-accent-press`)
- **Superficies:** premium claras — fondo `#f6f7f7`, tarjetas blancas con
  borde sutil y sombra suave. Nada de bloques navy/oscuros legacy
  (`#1e2a4a`, `#0F172A`) ni paneles negros gigantes dentro del shell claro.
- **Dashboard estático:** `app/public/index.html` y
  `app/public/Plataforma/index.html` deben mantenerse **idénticos** (espejo).
  Ambos incluyen la barra superior con marca, el lockup "UNLOCKED ECOM" y la
  navegación inferior móvil (`mobile-bottom-nav`).
- **Admin (Usuarios y permisos):** `app/src/app/admin/users/page.tsx` vive
  dentro de `OperationsShell` y usa la superficie dedicada
  `.admin-users-surface`, que fuerza los tokens claros de marca por variables
  CSS con alcance local. Admin no puede volver a ser un "mundo oscuro"
  separado aunque el sistema operativo del usuario esté en
  `prefers-color-scheme: dark`, hasta que exista un tema oscuro global
  diseñado y aprobado.

## Regresiones prohibidas

Cualquiera de estos cambios se considera regresión y bloquea el merge:

1. Reintroducir marcadores del look legacy en los dashboards estáticos o en
   Admin: `BRAND_GRAD`, `BRAND_BAR`, `Space Grotesk` como UI principal,
   `#1e2a4a`, `#0F172A`, o el import legacy
   `Inter:wght@400;500;600;700;800;900`.
2. Cambiar `--color-accent` fuera de `#f23005` o eliminar Hanken Grotesk de
   `globals.css`.
3. Desincronizar `app/public/index.html` y `app/public/Plataforma/index.html`.
4. Quitar el lockup "UNLOCKED ECOM", la `mobile-bottom-nav` o el branding del
   topbar móvil de los dashboards estáticos.
5. Quitar `admin-users-surface` de la página de Admin o devolverle tarjetas
   oscuras mezcladas dentro del shell claro.
6. Borrar o vaciar este documento, el CODEOWNERS o el test guardián sin
   aprobación del owner.

## Cambios permitidos

- Añadir secciones, KPIs, tablas o módulos nuevos **usando los tokens
  existentes** (`--color-*`, `--radius`, `--shadow-card`, `--space-*`).
- Ajustes de copy, labels y contenido que no alteren jerarquía visual.
- Mejoras de accesibilidad (contraste, foco, semántica) dentro de la paleta.
- Refactors de CSS que conserven los mismos valores de tokens y marcadores.
- Un tema oscuro global **nuevo y aprobado por Jose** puede reemplazar el
  forzado claro de Admin; en ese momento se actualizan este contrato y el
  test guardián en el mismo PR.

## Regla de conflicto

Si un cambio funcional (lógica, queries, permisos, RBAC, formularios) choca
con el diseño: **primero se preserva la lógica actual y después se reaplica
el diseño aprobado encima**. Nunca se degrada el diseño para "destrabar"
lógica, ni se rompe lógica para cumplir diseño — se separan los cambios.

## Verificación

```bash
# Guard de diseño + suite completa (igual que CI)
cd app
npm run test -- brand-design-guard

# Verificación completa (typecheck + tests, lo que corre torre-v2-verify)
npm run verify

# Espejo de dashboards estáticos
cmp app/public/index.html app/public/Plataforma/index.html && echo "espejo OK"
```

Rutas protegidas por CODEOWNERS:

- `/app/public/index.html`
- `/app/public/Plataforma/index.html`
- `/app/public/brand/`
- `/app/src/app/globals.css`
- `/app/src/app/login/page.tsx`
- `/app/src/app/operaciones/operations-shell.tsx`
- `/app/src/app/admin/users/page.tsx`
- `/docs/design-lock.md`
- `/.github/CODEOWNERS`
