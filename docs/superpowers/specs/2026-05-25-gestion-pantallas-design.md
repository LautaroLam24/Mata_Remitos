# Spec: Pantallas de Gestión — Sesión 10

**Fecha:** 2026-05-25  
**Alcance:** 4 pantallas nuevas + 1 pantalla modificada + endpoints de API nuevos

---

## Contexto

Sistema multi-tenant para PyMEs argentinas. Stack: Next.js 15 (App Router) + Fastify + Prisma + TanStack Query + shadcn/ui. El backend no tiene features de `productos` ni `proveedores` implementadas — se crean desde cero siguiendo los patrones existentes en `src/features/remitos/`.

---

## Pantallas

### 1. `/productos` — Lista con CRUD

**Propósito:** Gestionar el catálogo de productos y monitorear stock.

**Tabla:** Código | Nombre | Unidad | Stock Actual | Stock Mínimo | Estado

**Estado badge:**
- Verde: `stockOnHand >= minStock`
- Amarillo: `0 < stockOnHand < minStock`
- Rojo: `stockOnHand <= 0`

**Filtros:**
- Buscador por nombre/código (debounce 300ms, client-side sobre la página cargada)
- Toggle "Solo stock bajo" → recarga con `?lowStock=true` (server-side)

**Paginación:** 20 registros/página, server-side.

**CRUD:**
- Botón "Nuevo producto" → modal con react-hook-form + Zod
- Menú por fila: Editar (modal) / Archivar (soft-delete — `deletedAt !== null`)
- Click en fila → `/productos/[id]`

**Campos del formulario:**
- `code` (string, requerido, único por tenant)
- `name` (string, requerido)
- `unit` (string, requerido — ej: "kg", "unidad", "litro")
- `minStock` (number, requerido, ≥ 0)
- `stockOnHand` (number, solo en creación — luego solo se modifica vía movimientos)
- `aliases` (array de strings, opcional — para fuzzy match del OCR)

---

### 2. `/productos/[id]` — Detalle + Histórico de movimientos

**Propósito:** Ver el estado completo de un producto y su historial de stock.

**Layout:**
- Header card: código, nombre, unidad, stock actual vs mínimo, aliases
- Tabla de movimientos (debajo): Fecha | Tipo | Cantidad | Balance antes → después | Usuario | Razón

**Movimientos:** últimos 50, ordenados desc por fecha. Sin paginación.

**Botón "Editar"** → mismo modal del listado.

---

### 3. `/proveedores` — Lista + CRUD (sin borrar)

**Propósito:** Gestionar proveedores conocidos. No se eliminan si tienen documentos asociados.

**Tabla:** Nombre | CUIT | Email | Teléfono | Dirección

**Buscador:** por nombre o CUIT (client-side).

**CRUD:**
- Botón "Nuevo proveedor" → modal
- Click en fila → modal edición

**Campos del formulario:**
- `name` (string, requerido)
- `cuit` (string, requerido — validado con `validateCuit()` del dominio)
- `email` (string, opcional)
- `phone` (string, opcional)
- `address` (string, opcional)

**Restricción:** No hay endpoint DELETE. El botón no existe en la UI.

---

### 4. `/stock` — Dashboard de alertas

**Propósito:** Vista rápida de productos que necesitan reposición inmediata.

**Layout:** Dos secciones de cards (no tablas):

- **Sección "Crítico"** (badge rojo): `stockOnHand <= 0`
  - Card: nombre, unidad, "Sin stock", mínimo requerido, link → `/productos/[id]`
- **Sección "En riesgo"** (badge amarillo): `0 < stockOnHand < minStock`
  - Card: nombre, unidad, stock actual, mínimo requerido, link → `/productos/[id]`

**Estado vacío:** "Todos los productos tienen stock suficiente" con ícono verde.

**Datos:** un único endpoint `GET /api/stock/alerts` que devuelve los dos arrays. Client-side rendering, sin paginación.

---

### 5. `/remitos` — Lista actualizada con filtros (absorbe historial)

**Propósito:** Vista unificada de todos los documentos procesados. Reemplaza la pantalla placeholder actual.

**Tabla:** Fecha | Número | Proveedor | Items | Confianza | Estado

**Estado badge:** Aprobado (verde) | Rechazado (rojo) | En revisión (amarillo) | Procesando (gris)

**Filtros combinables:**
- Select: estado (`all` / `approved` / `rejected` / `review_needed`)
- Select: proveedor (populated desde API)
- Date inputs: `dateFrom` / `dateTo`
- Buscador: por número de documento

**Paginación:** server-side, 20 registros/página. Los filtros se pasan como query params.

**Click en fila** → `/remitos/[id]` (pantalla ya existente).

**Sidebar:**
- "Historial" = `<Link href="/remitos?status=approved">` (solo un link, sin nueva página)
- "Cola de revisión" = `<Link href="/remitos?status=review_needed">`

---

## API — Endpoints nuevos

### Feature: `productos`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/productos` | Lista paginada. Params: `page`, `limit`, `search`, `lowStock` |
| `GET` | `/api/productos/:id` | Detalle + últimos 50 movimientos de stock |
| `POST` | `/api/productos` | Crear producto. Body: campos del formulario |
| `PUT` | `/api/productos/:id` | Editar producto (no modifica stockOnHand directamente) |
| `DELETE` | `/api/productos/:id` | Soft-delete: setea `deletedAt = now()`. Requiere que `stockOnHand = 0` |

### Feature: `proveedores`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/proveedores` | Lista. Params: `page`, `limit`, `search` |
| `POST` | `/api/proveedores` | Crear proveedor. Valida CUIT con `validateCuit()` |
| `PUT` | `/api/proveedores/:id` | Editar proveedor. Re-valida CUIT si cambia |

### Feature: `stock`

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/stock/alerts` | Devuelve `{ critical: Product[], atRisk: Product[] }` |

### Modificación: `remitos`

Agregar query params al `GET /api/remitos` (o crear ruta si no existe como listado):

| Param | Tipo | Descripción |
|-------|------|-------------|
| `page` | number | Paginación |
| `limit` | number | Registros por página (default 20) |
| `status` | string | `approved` / `rejected` / `review_needed` / `all` |
| `supplierId` | string | UUID del proveedor |
| `dateFrom` | string | ISO date |
| `dateTo` | string | ISO date |
| `search` | string | Número de documento |

---

## Frontend — Estructura de archivos

```
packages/web/src/
├── app/(dashboard)/
│   ├── productos/
│   │   ├── page.tsx                  # Lista + CRUD
│   │   └── [id]/page.tsx             # Detalle + movimientos
│   ├── proveedores/
│   │   └── page.tsx                  # Lista + CRUD
│   ├── stock/
│   │   └── page.tsx                  # Dashboard alertas
│   └── remitos/
│       └── page.tsx                  # MODIFICADA: agrega filtros
├── components/
│   ├── ui/
│   │   ├── table.tsx                 # shadcn (nuevo)
│   │   ├── badge.tsx                 # shadcn (nuevo)
│   │   ├── select.tsx                # shadcn (nuevo)
│   │   └── dialog.tsx                # shadcn (nuevo)
│   ├── features/
│   │   ├── DataTable.tsx             # Genérico con TanStack Table
│   │   ├── productos/
│   │   │   ├── ProductosTable.tsx
│   │   │   ├── ProductoForm.tsx      # Modal crear/editar
│   │   │   └── StockMovimientosTable.tsx
│   │   ├── proveedores/
│   │   │   ├── ProveedoresTable.tsx
│   │   │   └── ProveedorForm.tsx
│   │   └── stock/
│   │       └── StockAlertCards.tsx
└── hooks/
    ├── useProductos.ts
    ├── useProveedores.ts
    └── useStock.ts
```

---

## API Backend — Estructura de archivos

```
packages/api/src/features/
├── productos/
│   ├── routes.ts       # Fastify routes
│   ├── service.ts      # Lógica de negocio (soft-delete, validaciones)
│   └── schemas.ts      # Zod schemas para input/output
├── proveedores/
│   ├── routes.ts
│   ├── service.ts      # Incluye validateCuit() del dominio
│   └── schemas.ts
└── stock/
    ├── routes.ts
    └── schemas.ts      # Output schema: { critical, atRisk }
```

---

## Migración de base de datos requerida

El modelo `Product` en Prisma no tiene campo `deletedAt`. Hay que agregar:

```prisma
model Product {
  // ... campos existentes ...
  deletedAt DateTime?   // soft-delete
}
```

Esto requiere `pnpm db:migrate` con un nombre descriptivo (`add_deleted_at_to_product`). Todos los listados y queries de productos deben filtrar `deletedAt: null` por default.

---

## Componentes UI a instalar (shadcn)

```bash
pnpm dlx shadcn@latest add table badge select dialog
```

---

## TanStack Query — Patrones

**Lista paginada con filtros (productos, proveedores, remitos):**
```ts
const { data } = useQuery({
  queryKey: ['productos', { page, search, lowStock }],
  queryFn: () => api.productos.list({ page, search, lowStock }),
})
```

**Mutaciones con invalidación:**
```ts
const createMutation = useMutation({
  mutationFn: api.productos.create,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['productos'] }),
})
```

**Filtros en URL** (para que los links del sidebar funcionen):
```ts
// En /remitos, leer searchParams del server component o useSearchParams() en client
const status = searchParams.get('status') ?? 'all'
```

---

## Decisiones técnicas

- **Soft-delete en productos:** campo `deletedAt` en el modelo Prisma. Los listados filtran `deletedAt: null` por default. La ruta `DELETE` valida que `stockOnHand === 0` antes de archivar.
- **CUIT en proveedores:** el endpoint `POST` y `PUT` llaman a `validateCuit()` del dominio (`src/features/remitos/validators/validateCuit.ts`) — misma lógica ya testeada.
- **DataTable genérico:** usa `@tanstack/react-table` (ya instalado). Acepta `columns` y `data` como props. La lógica de sort/render es interna; cada tabla define solo sus columnas.
- **Filtros en URL para /remitos:** `useSearchParams()` + `useRouter()` para que los links del sidebar (`/remitos?status=approved`) funcionen sin estado local adicional.
- **Stock alerts:** un solo endpoint devuelve los dos arrays. El frontend los separa en dos secciones. Sin paginación — la cantidad de productos críticos en una PyME rara vez supera 50.

---

## Restricciones y reglas de negocio

- `stockOnHand` nunca se modifica directamente por un endpoint de productos — solo vía movimientos de stock (aprobación de remitos). La excepción es la creación inicial.
- Soft-delete de producto requiere `stockOnHand === 0`. Si tiene stock, la API retorna `409 Conflict`.
- Los proveedores no tienen endpoint DELETE. Si hace falta deshabilitar uno en el futuro, se agrega `deletedAt` en una sesión posterior.
- Todos los endpoints filtran por `tenantId` extraído del JWT (misma convención que `remitos`).
- Las tablas del frontend no muestran registros con `deletedAt !== null` (filtro server-side).

---

## Testing

- **API:** tests de integración (Supertest + Vitest) para cada endpoint nuevo siguiendo el patrón de `__tests__/` en remitos. Cubrir: happy path, tenant isolation, validación de CUIT inválido, soft-delete con stock > 0.
- **Frontend:** typecheck (`pnpm typecheck`) como verificación mínima. No hay tests de componentes en este proyecto todavía.
- **Verificación manual:** navegar las 5 pantallas con datos del seed (15 productos, 5 proveedores) y confirmar que se muestran correctamente.
