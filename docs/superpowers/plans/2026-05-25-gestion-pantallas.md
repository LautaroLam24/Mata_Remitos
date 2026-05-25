# Pantallas de Gestión — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar 4 pantallas nuevas (/productos, /productos/[id], /proveedores, /stock) y actualizar /remitos con filtros completos, con sus endpoints de API correspondientes.

**Architecture:** Backend-first: cada tarea de API incluye tests antes de implementar. Frontend usa Client Components con TanStack Query. El DataTable genérico usa `@tanstack/react-table` + shadcn Table. Los Tasks 1-5 son API; los Tasks 6-13 son frontend. Pueden paralelizarse una vez que los contratos de tipos estén definidos en Task 6.

**Tech Stack:** Fastify + Prisma + Zod (API); Next.js 15 App Router + TanStack Query + shadcn/ui + @tanstack/react-table (frontend)

**Notas clave antes de empezar:**
- `deletedAt DateTime?` ya existe en `Product` y `Supplier` — no se necesita migración
- `stockOnHand` y `minStock` son `Decimal` en Prisma → convertir con `Number()` en respuestas
- `minStock` es nullable (`Decimal?`) — manejarlo en el filtro lowStock
- Patrón de routes: `app.withTypeProvider<ZodTypeProvider>()`, `req.tenant.id`, `req.user.sub`
- `db` se importa directamente desde `'../../infrastructure/db.js'`

---

## Task 1: API — Feature `productos` (schemas + errors + service)

**Files:**
- Create: `packages/api/src/features/productos/schemas.ts`
- Create: `packages/api/src/features/productos/errors.ts`
- Create: `packages/api/src/features/productos/service.ts`

- [ ] **Step 1: Crear `schemas.ts`**

```typescript
// packages/api/src/features/productos/schemas.ts
import { z } from 'zod';

export const productoListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
  lowStock: z
    .string()
    .optional()
    .transform((v) => v === 'true'),
});

export const productoCreateSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  unit: z.string().min(1).max(50),
  minStock: z.number().nonnegative().nullable().default(null),
  stockOnHand: z.number().nonnegative().default(0),
  aliases: z.array(z.string()).default([]),
});

export const productoUpdateSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(200).optional(),
  unit: z.string().min(1).max(50).optional(),
  minStock: z.number().nonnegative().nullable().optional(),
  aliases: z.array(z.string()).optional(),
});

const productoResponseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  stockOnHand: z.number(),
  minStock: z.number().nullable(),
  aliases: z.array(z.string()),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
});

export const productoListResponseSchema = z.object({
  items: z.array(productoResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export const productoDetailResponseSchema = productoResponseSchema.extend({
  stockMovements: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      reason: z.string(),
      reference: z.string().nullable(),
      quantity: z.number(),
      balanceBefore: z.number(),
      balanceAfter: z.number(),
      createdAt: z.string(),
      user: z.object({ name: z.string(), email: z.string() }),
    }),
  ),
});

export type ProductoListQuery = z.infer<typeof productoListQuerySchema>;
export type ProductoCreate = z.infer<typeof productoCreateSchema>;
export type ProductoUpdate = z.infer<typeof productoUpdateSchema>;
```

- [ ] **Step 2: Crear `errors.ts`**

```typescript
// packages/api/src/features/productos/errors.ts
export class ProductoNotFoundError extends Error {
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Producto ${id} no encontrado`);
    this.name = 'ProductoNotFoundError';
  }
}

export class ProductoConStockError extends Error {
  readonly statusCode = 409;
  constructor(id: string, stock: number) {
    super(`No se puede archivar el producto ${id}: tiene stock ${stock}`);
    this.name = 'ProductoConStockError';
  }
}

export class ProductoCodigoExisteError extends Error {
  readonly statusCode = 409;
  constructor(code: string) {
    super(`Ya existe un producto con código ${code}`);
    this.name = 'ProductoCodigoExisteError';
  }
}
```

- [ ] **Step 3: Crear `service.ts`**

```typescript
// packages/api/src/features/productos/service.ts
import { Prisma } from '@prisma/client';
import { db } from '../../infrastructure/db.js';
import { ProductoCreate, ProductoListQuery, ProductoUpdate } from './schemas.js';
import {
  ProductoNotFoundError,
  ProductoConStockError,
  ProductoCodigoExisteError,
} from './errors.js';

type ProductRow = {
  id: string;
  code: string;
  name: string;
  unit: string;
  stockOnHand: Prisma.Decimal;
  minStock: Prisma.Decimal | null;
  aliases: string[];
  deletedAt: Date | null;
  createdAt: Date;
};

function toResponse(p: ProductRow) {
  return {
    id: p.id,
    code: p.code,
    name: p.name,
    unit: p.unit,
    stockOnHand: Number(p.stockOnHand),
    minStock: p.minStock !== null ? Number(p.minStock) : null,
    aliases: p.aliases,
    deletedAt: p.deletedAt?.toISOString() ?? null,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function listProductos(tenantId: string, query: ProductoListQuery) {
  const { page, limit, search, lowStock } = query;
  const skip = (page - 1) * limit;

  const where: Prisma.ProductWhereInput = {
    tenantId,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { code: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  if (lowStock) {
    // Prisma no soporta comparación entre columnas; se filtra en JS.
    // Aceptable para PyME (<1000 productos). Migrar a $queryRaw si escala.
    const all = await db.product.findMany({ where, orderBy: { name: 'asc' } });
    const filtered = all.filter(
      (p) => p.minStock !== null && p.stockOnHand.lessThan(p.minStock),
    );
    const total = filtered.length;
    return {
      items: filtered.slice(skip, skip + limit).map(toResponse),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  const [items, total] = await Promise.all([
    db.product.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
    db.product.count({ where }),
  ]);

  return { items: items.map(toResponse), total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getProductoById(tenantId: string, id: string) {
  const product = await db.product.findFirst({
    where: { id, tenantId, deletedAt: null },
    include: {
      stockMovements: {
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { user: { select: { name: true, email: true } } },
      },
    },
  });
  if (!product) throw new ProductoNotFoundError(id);

  return {
    ...toResponse(product),
    stockMovements: product.stockMovements.map((m) => ({
      id: m.id,
      type: m.type,
      reason: m.reason,
      reference: m.reference ?? null,
      quantity: Number(m.quantity),
      balanceBefore: Number(m.balanceBefore),
      balanceAfter: Number(m.balanceAfter),
      createdAt: m.createdAt.toISOString(),
      user: m.user,
    })),
  };
}

export async function createProducto(tenantId: string, data: ProductoCreate) {
  const exists = await db.product.findUnique({
    where: { tenantId_code: { tenantId, code: data.code } },
  });
  if (exists) throw new ProductoCodigoExisteError(data.code);

  const product = await db.product.create({
    data: {
      tenantId,
      code: data.code,
      name: data.name,
      unit: data.unit,
      minStock: data.minStock ?? null,
      stockOnHand: data.stockOnHand,
      aliases: data.aliases,
    },
  });
  return toResponse(product);
}

export async function updateProducto(tenantId: string, id: string, data: ProductoUpdate) {
  const existing = await db.product.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) throw new ProductoNotFoundError(id);

  if (data.code && data.code !== existing.code) {
    const conflict = await db.product.findUnique({
      where: { tenantId_code: { tenantId, code: data.code } },
    });
    if (conflict) throw new ProductoCodigoExisteError(data.code);
  }

  const product = await db.product.update({ where: { id }, data });
  return toResponse(product);
}

export async function softDeleteProducto(tenantId: string, id: string) {
  const existing = await db.product.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) throw new ProductoNotFoundError(id);
  if (Number(existing.stockOnHand) > 0)
    throw new ProductoConStockError(id, Number(existing.stockOnHand));

  const product = await db.product.update({ where: { id }, data: { deletedAt: new Date() } });
  return toResponse(product);
}
```

- [ ] **Step 4: Commit parcial**

```bash
git add packages/api/src/features/productos/
git commit -m "feat(api): productos schemas, errors y service"
```

---

## Task 2: API — Tests para `productos`

**Files:**
- Create: `packages/api/src/features/productos/__tests__/productos.test.ts`

- [ ] **Step 1: Escribir tests para el service**

```typescript
// packages/api/src/features/productos/__tests__/productos.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

vi.mock('../../../infrastructure/db.js', () => ({
  db: {
    product: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from '../../../infrastructure/db.js';
import {
  listProductos,
  getProductoById,
  createProducto,
  updateProducto,
  softDeleteProducto,
} from '../service.js';
import { ProductoNotFoundError, ProductoConStockError, ProductoCodigoExisteError } from '../errors.js';

const mockProduct = {
  id: 'prod-1',
  tenantId: 'tenant-1',
  code: 'ARR-001',
  name: 'Arroz',
  unit: 'kg',
  stockOnHand: new Prisma.Decimal(50),
  minStock: new Prisma.Decimal(10),
  aliases: ['arroz'],
  typicalRange: null,
  deletedAt: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

beforeEach(() => vi.clearAllMocks());

describe('listProductos', () => {
  it('devuelve lista paginada', async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([mockProduct]);
    vi.mocked(db.product.count).mockResolvedValue(1);

    const result = await listProductos('tenant-1', { page: 1, limit: 20, lowStock: false });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].stockOnHand).toBe(50);
    expect(result.total).toBe(1);
  });

  it('filtra lowStock en JS', async () => {
    const atRisk = { ...mockProduct, stockOnHand: new Prisma.Decimal(5) }; // 5 < minStock 10
    const ok = { ...mockProduct, id: 'prod-2', stockOnHand: new Prisma.Decimal(20) };
    vi.mocked(db.product.findMany).mockResolvedValue([atRisk, ok]);

    const result = await listProductos('tenant-1', { page: 1, limit: 20, lowStock: true });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('prod-1');
  });

  it('filtra por tenant: no devuelve productos de otro tenant', async () => {
    vi.mocked(db.product.findMany).mockResolvedValue([]);
    vi.mocked(db.product.count).mockResolvedValue(0);

    const result = await listProductos('otro-tenant', { page: 1, limit: 20, lowStock: false });

    expect(result.items).toHaveLength(0);
    expect(vi.mocked(db.product.findMany).mock.calls[0][0].where).toMatchObject({
      tenantId: 'otro-tenant',
    });
  });
});

describe('getProductoById', () => {
  it('devuelve producto con movimientos', async () => {
    vi.mocked(db.product.findFirst).mockResolvedValue({
      ...mockProduct,
      stockMovements: [
        {
          id: 'mov-1',
          type: 'in',
          reason: 'document',
          reference: 'doc-1',
          quantity: new Prisma.Decimal(50),
          balanceBefore: new Prisma.Decimal(0),
          balanceAfter: new Prisma.Decimal(50),
          createdAt: new Date('2024-01-01'),
          user: { name: 'Admin', email: 'admin@test.com' },
        },
      ],
    } as any);

    const result = await getProductoById('tenant-1', 'prod-1');

    expect(result.id).toBe('prod-1');
    expect(result.stockMovements).toHaveLength(1);
    expect(result.stockMovements[0].quantity).toBe(50);
  });

  it('lanza ProductoNotFoundError si no existe', async () => {
    vi.mocked(db.product.findFirst).mockResolvedValue(null);

    await expect(getProductoById('tenant-1', 'no-existe')).rejects.toThrow(ProductoNotFoundError);
  });
});

describe('createProducto', () => {
  it('crea producto exitosamente', async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue(null);
    vi.mocked(db.product.create).mockResolvedValue(mockProduct);

    const result = await createProducto('tenant-1', {
      code: 'ARR-001',
      name: 'Arroz',
      unit: 'kg',
      minStock: 10,
      stockOnHand: 50,
      aliases: [],
    });

    expect(result.id).toBe('prod-1');
  });

  it('lanza ProductoCodigoExisteError si el código ya existe', async () => {
    vi.mocked(db.product.findUnique).mockResolvedValue(mockProduct);

    await expect(
      createProducto('tenant-1', {
        code: 'ARR-001',
        name: 'Arroz',
        unit: 'kg',
        minStock: null,
        stockOnHand: 0,
        aliases: [],
      }),
    ).rejects.toThrow(ProductoCodigoExisteError);
  });
});

describe('softDeleteProducto', () => {
  it('archiva producto sin stock', async () => {
    const sinStock = { ...mockProduct, stockOnHand: new Prisma.Decimal(0) };
    vi.mocked(db.product.findFirst).mockResolvedValue(sinStock);
    vi.mocked(db.product.update).mockResolvedValue({ ...sinStock, deletedAt: new Date() });

    const result = await softDeleteProducto('tenant-1', 'prod-1');

    expect(result.deletedAt).not.toBeNull();
  });

  it('lanza ProductoConStockError si tiene stock > 0', async () => {
    vi.mocked(db.product.findFirst).mockResolvedValue(mockProduct); // stock = 50

    await expect(softDeleteProducto('tenant-1', 'prod-1')).rejects.toThrow(ProductoConStockError);
  });
});
```

- [ ] **Step 2: Correr tests — deben fallar (service no existe aún)**

```bash
cd packages/api && pnpm test src/features/productos
```

Expected: FAIL — "Cannot find module '../service.js'"

- [ ] **Step 3: Verificar que pasan con el service del Task 1**

```bash
pnpm test src/features/productos
```

Expected: 8 tests passing

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/features/productos/__tests__/
git commit -m "test(api): tests unitarios para productos service"
```

---

## Task 3: API — Routes de `productos` + registro en app

**Files:**
- Create: `packages/api/src/features/productos/routes.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: Crear `routes.ts`**

```typescript
// packages/api/src/features/productos/routes.ts
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  productoListQuerySchema,
  productoCreateSchema,
  productoUpdateSchema,
  productoListResponseSchema,
  productoDetailResponseSchema,
} from './schemas.js';
import {
  listProductos,
  getProductoById,
  createProducto,
  updateProducto,
  softDeleteProducto,
} from './service.js';
import { ProductoNotFoundError, ProductoConStockError, ProductoCodigoExisteError } from './errors.js';
import { ValidationError } from '../../shared/errors.js';

export const productosRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/',
    {
      schema: {
        querystring: productoListQuerySchema,
        response: { 200: productoListResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => {
      return listProductos(req.tenant.id, req.query);
    },
  );

  r.get(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: productoDetailResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      try {
        return await getProductoById(req.tenant.id, req.params.id);
      } catch (e) {
        if (e instanceof ProductoNotFoundError) return reply.code(404).send({ message: e.message });
        throw e;
      }
    },
  );

  r.post(
    '/',
    {
      schema: {
        body: productoCreateSchema,
        response: { 201: productoDetailResponseSchema.omit({ stockMovements: true }) },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      try {
        const result = await createProducto(req.tenant.id, req.body);
        return reply.code(201).send(result);
      } catch (e) {
        if (e instanceof ProductoCodigoExisteError) return reply.code(409).send({ message: e.message });
        throw e;
      }
    },
  );

  r.put(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: productoUpdateSchema,
        response: { 200: productoDetailResponseSchema.omit({ stockMovements: true }) },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      try {
        return await updateProducto(req.tenant.id, req.params.id, req.body);
      } catch (e) {
        if (e instanceof ProductoNotFoundError) return reply.code(404).send({ message: e.message });
        if (e instanceof ProductoCodigoExisteError) return reply.code(409).send({ message: e.message });
        throw e;
      }
    },
  );

  r.delete(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        response: { 200: z.object({ id: z.string(), deletedAt: z.string() }) },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      try {
        const result = await softDeleteProducto(req.tenant.id, req.params.id);
        return { id: result.id, deletedAt: result.deletedAt! };
      } catch (e) {
        if (e instanceof ProductoNotFoundError) return reply.code(404).send({ message: e.message });
        if (e instanceof ProductoConStockError) return reply.code(409).send({ message: e.message });
        throw e;
      }
    },
  );
};
```

- [ ] **Step 2: Registrar en `app.ts`**

Agregar las dos líneas (import + register) a `packages/api/src/app.ts`:

```typescript
// Agregar al bloque de imports (junto a remitoRoutes):
import { productosRoutes } from './features/productos/routes.js';

// Agregar al bloque de registers (junto a remitoRoutes):
await app.register(productosRoutes, { prefix: '/api/productos' });
```

- [ ] **Step 3: Verificar typecheck**

```bash
cd packages/api && pnpm typecheck
```

Expected: 0 errores

- [ ] **Step 4: Commit**

```bash
git add packages/api/src/features/productos/routes.ts packages/api/src/app.ts
git commit -m "feat(api): endpoints CRUD de productos"
```

---

## Task 4: API — Feature `proveedores` (service + routes + tests)

**Files:**
- Create: `packages/api/src/features/proveedores/schemas.ts`
- Create: `packages/api/src/features/proveedores/errors.ts`
- Create: `packages/api/src/features/proveedores/service.ts`
- Create: `packages/api/src/features/proveedores/routes.ts`
- Create: `packages/api/src/features/proveedores/__tests__/proveedores.test.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: Crear `schemas.ts`**

```typescript
// packages/api/src/features/proveedores/schemas.ts
import { z } from 'zod';

export const proveedorListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().optional(),
});

export const proveedorCreateSchema = z.object({
  name: z.string().min(1).max(200),
  cuit: z.string().min(11).max(13),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

export const proveedorUpdateSchema = proveedorCreateSchema.partial();

const proveedorResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  cuit: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string(),
});

export const proveedorListResponseSchema = z.object({
  items: z.array(proveedorResponseSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});

export type ProveedorListQuery = z.infer<typeof proveedorListQuerySchema>;
export type ProveedorCreate = z.infer<typeof proveedorCreateSchema>;
export type ProveedorUpdate = z.infer<typeof proveedorUpdateSchema>;
```

- [ ] **Step 2: Crear `errors.ts`**

```typescript
// packages/api/src/features/proveedores/errors.ts
export class ProveedorNotFoundError extends Error {
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Proveedor ${id} no encontrado`);
    this.name = 'ProveedorNotFoundError';
  }
}

export class ProveedorCuitExisteError extends Error {
  readonly statusCode = 409;
  constructor(cuit: string) {
    super(`Ya existe un proveedor con CUIT ${cuit}`);
    this.name = 'ProveedorCuitExisteError';
  }
}

export class CuitInvalidoError extends Error {
  readonly statusCode = 422;
  constructor(cuit: string) {
    super(`CUIT inválido: ${cuit}`);
    this.name = 'CuitInvalidoError';
  }
}
```

- [ ] **Step 3: Crear `service.ts`**

```typescript
// packages/api/src/features/proveedores/service.ts
import { db } from '../../infrastructure/db.js';
import { validateCuit } from '../remitos/validators/validateCuit.js';
import { ProveedorCreate, ProveedorListQuery, ProveedorUpdate } from './schemas.js';
import { ProveedorNotFoundError, ProveedorCuitExisteError, CuitInvalidoError } from './errors.js';

function toResponse(s: {
  id: string;
  name: string;
  cuit: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: Date;
}) {
  return {
    id: s.id,
    name: s.name,
    cuit: s.cuit,
    email: s.email,
    phone: s.phone,
    address: s.address,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function listProveedores(tenantId: string, query: ProveedorListQuery) {
  const { page, limit, search } = query;
  const skip = (page - 1) * limit;

  const where = {
    tenantId,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { cuit: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    db.supplier.findMany({ where, skip, take: limit, orderBy: { name: 'asc' } }),
    db.supplier.count({ where }),
  ]);

  return { items: items.map(toResponse), total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function createProveedor(tenantId: string, data: ProveedorCreate) {
  const cuitCheck = validateCuit(data.cuit);
  if (!cuitCheck.valid) throw new CuitInvalidoError(data.cuit);

  const exists = await db.supplier.findUnique({
    where: { tenantId_cuit: { tenantId, cuit: cuitCheck.normalized! } },
  });
  if (exists) throw new ProveedorCuitExisteError(data.cuit);

  const supplier = await db.supplier.create({
    data: { tenantId, ...data, cuit: cuitCheck.normalized! },
  });
  return toResponse(supplier);
}

export async function updateProveedor(tenantId: string, id: string, data: ProveedorUpdate) {
  const existing = await db.supplier.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) throw new ProveedorNotFoundError(id);

  if (data.cuit && data.cuit !== existing.cuit) {
    const cuitCheck = validateCuit(data.cuit);
    if (!cuitCheck.valid) throw new CuitInvalidoError(data.cuit);
    const conflict = await db.supplier.findUnique({
      where: { tenantId_cuit: { tenantId, cuit: cuitCheck.normalized! } },
    });
    if (conflict) throw new ProveedorCuitExisteError(data.cuit);
    data = { ...data, cuit: cuitCheck.normalized! };
  }

  const supplier = await db.supplier.update({ where: { id }, data });
  return toResponse(supplier);
}
```

- [ ] **Step 4: Escribir tests**

```typescript
// packages/api/src/features/proveedores/__tests__/proveedores.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../infrastructure/db.js', () => ({
  db: {
    supplier: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { db } from '../../../infrastructure/db.js';
import { listProveedores, createProveedor, updateProveedor } from '../service.js';
import { CuitInvalidoError, ProveedorCuitExisteError, ProveedorNotFoundError } from '../errors.js';

const mockSupplier = {
  id: 'sup-1',
  tenantId: 'tenant-1',
  cuit: '20-30678774-9',
  name: 'Alimentos Del Norte',
  email: 'ventas@norte.com',
  phone: '11-4444-5555',
  address: 'Av. Corrientes 1234',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  deletedAt: null,
};

beforeEach(() => vi.clearAllMocks());

describe('listProveedores', () => {
  it('devuelve lista paginada', async () => {
    vi.mocked(db.supplier.findMany).mockResolvedValue([mockSupplier]);
    vi.mocked(db.supplier.count).mockResolvedValue(1);

    const result = await listProveedores('tenant-1', { page: 1, limit: 20 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Alimentos Del Norte');
  });

  it('aísla por tenantId', async () => {
    vi.mocked(db.supplier.findMany).mockResolvedValue([]);
    vi.mocked(db.supplier.count).mockResolvedValue(0);

    await listProveedores('otro-tenant', { page: 1, limit: 20 });

    expect(vi.mocked(db.supplier.findMany).mock.calls[0][0].where).toMatchObject({
      tenantId: 'otro-tenant',
    });
  });
});

describe('createProveedor', () => {
  it('crea proveedor con CUIT válido', async () => {
    vi.mocked(db.supplier.findUnique).mockResolvedValue(null);
    vi.mocked(db.supplier.create).mockResolvedValue(mockSupplier);

    const result = await createProveedor('tenant-1', {
      name: 'Alimentos Del Norte',
      cuit: '20306787749', // sin guiones — se normaliza
    });

    expect(result.cuit).toBe('20-30678774-9');
  });

  it('lanza CuitInvalidoError con CUIT inválido', async () => {
    await expect(
      createProveedor('tenant-1', { name: 'Test', cuit: '12-34567890-1' }),
    ).rejects.toThrow(CuitInvalidoError);
  });

  it('lanza ProveedorCuitExisteError si el CUIT ya existe', async () => {
    vi.mocked(db.supplier.findUnique).mockResolvedValue(mockSupplier);

    await expect(
      createProveedor('tenant-1', { name: 'Otro', cuit: '20306787749' }),
    ).rejects.toThrow(ProveedorCuitExisteError);
  });
});

describe('updateProveedor', () => {
  it('lanza ProveedorNotFoundError si no existe', async () => {
    vi.mocked(db.supplier.findFirst).mockResolvedValue(null);

    await expect(updateProveedor('tenant-1', 'no-existe', { name: 'Nuevo' })).rejects.toThrow(
      ProveedorNotFoundError,
    );
  });
});
```

- [ ] **Step 5: Crear `routes.ts` y registrar en `app.ts`**

```typescript
// packages/api/src/features/proveedores/routes.ts
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  proveedorListQuerySchema,
  proveedorCreateSchema,
  proveedorUpdateSchema,
  proveedorListResponseSchema,
} from './schemas.js';
import { listProveedores, createProveedor, updateProveedor } from './service.js';
import { ProveedorNotFoundError, ProveedorCuitExisteError, CuitInvalidoError } from './errors.js';

const proveedorResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  cuit: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  createdAt: z.string(),
});

export const proveedoresRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/',
    {
      schema: { querystring: proveedorListQuerySchema, response: { 200: proveedorListResponseSchema } },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => listProveedores(req.tenant.id, req.query),
  );

  r.post(
    '/',
    {
      schema: { body: proveedorCreateSchema, response: { 201: proveedorResponseSchema } },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      try {
        const result = await createProveedor(req.tenant.id, req.body);
        return reply.code(201).send(result);
      } catch (e) {
        if (e instanceof CuitInvalidoError) return reply.code(422).send({ message: e.message });
        if (e instanceof ProveedorCuitExisteError) return reply.code(409).send({ message: e.message });
        throw e;
      }
    },
  );

  r.put(
    '/:id',
    {
      schema: {
        params: z.object({ id: z.string() }),
        body: proveedorUpdateSchema,
        response: { 200: proveedorResponseSchema },
      },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req, reply) => {
      try {
        return await updateProveedor(req.tenant.id, req.params.id, req.body);
      } catch (e) {
        if (e instanceof ProveedorNotFoundError) return reply.code(404).send({ message: e.message });
        if (e instanceof CuitInvalidoError) return reply.code(422).send({ message: e.message });
        if (e instanceof ProveedorCuitExisteError) return reply.code(409).send({ message: e.message });
        throw e;
      }
    },
  );
};
```

En `packages/api/src/app.ts`, agregar:
```typescript
import { proveedoresRoutes } from './features/proveedores/routes.js';
// ...
await app.register(proveedoresRoutes, { prefix: '/api/proveedores' });
```

- [ ] **Step 6: Correr todos los tests**

```bash
cd packages/api && pnpm test
```

Expected: todos los tests previos + nuevos passing

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/features/proveedores/ packages/api/src/app.ts
git commit -m "feat(api): endpoints y tests de proveedores"
```

---

## Task 5: API — Stock alerts + Remitos list con filtros

**Files:**
- Create: `packages/api/src/features/stock/schemas.ts`
- Create: `packages/api/src/features/stock/routes.ts`
- Modify: `packages/api/src/features/remitos/schemas.ts`
- Modify: `packages/api/src/features/remitos/routes.ts`
- Modify: `packages/api/src/app.ts`

- [ ] **Step 1: Crear `stock/schemas.ts`**

```typescript
// packages/api/src/features/stock/schemas.ts
import { z } from 'zod';

const stockProductSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  stockOnHand: z.number(),
  minStock: z.number().nullable(),
});

export const stockAlertsResponseSchema = z.object({
  critical: z.array(stockProductSchema), // stockOnHand <= 0
  atRisk: z.array(stockProductSchema),   // 0 < stockOnHand < minStock
});
```

- [ ] **Step 2: Crear `stock/routes.ts`**

```typescript
// packages/api/src/features/stock/routes.ts
import type { FastifyPluginAsync } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { db } from '../../infrastructure/db.js';
import { stockAlertsResponseSchema } from './schemas.js';

export const stockRoutes: FastifyPluginAsync = async (app) => {
  const r = app.withTypeProvider<ZodTypeProvider>();

  r.get(
    '/alerts',
    {
      schema: { response: { 200: stockAlertsResponseSchema } },
      preHandler: [app.authenticate, app.requireTenant],
    },
    async (req) => {
      const products = await db.product.findMany({
        where: { tenantId: req.tenant.id, deletedAt: null },
        select: { id: true, code: true, name: true, unit: true, stockOnHand: true, minStock: true },
        orderBy: { stockOnHand: 'asc' },
      });

      const critical = products
        .filter((p) => Number(p.stockOnHand) <= 0)
        .map((p) => ({ ...p, stockOnHand: Number(p.stockOnHand), minStock: p.minStock ? Number(p.minStock) : null }));

      const atRisk = products
        .filter(
          (p) =>
            p.minStock !== null &&
            Number(p.stockOnHand) > 0 &&
            Number(p.stockOnHand) < Number(p.minStock),
        )
        .map((p) => ({ ...p, stockOnHand: Number(p.stockOnHand), minStock: Number(p.minStock) }));

      return { critical, atRisk };
    },
  );
};
```

- [ ] **Step 3: Agregar schemas de lista a `remitos/schemas.ts`**

Agregar al final del archivo existente `packages/api/src/features/remitos/schemas.ts`:

```typescript
export const documentListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z
    .enum(['all', 'processing', 'review_needed', 'approved', 'rejected'])
    .default('all'),
  supplierId: z.string().optional(),
  dateFrom: z.string().optional(), // ISO date string
  dateTo: z.string().optional(),   // ISO date string
  search: z.string().optional(),   // por documentNumber
});

export const documentListItemSchema = z.object({
  id: z.string(),
  documentNumber: z.string(),
  type: z.string(),
  date: z.string(),
  status: z.string(),
  overallConfidence: z.number(),
  itemCount: z.number(),
  supplierName: z.string(),
  supplierCuit: z.string(),
  createdAt: z.string(),
});

export const documentListResponseSchema = z.object({
  items: z.array(documentListItemSchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number(),
});
```

- [ ] **Step 4: Agregar `GET /` a `remitos/routes.ts`**

Insertar ANTES del handler existente de `GET /review-queue`, al inicio de `remitoRoutes`:

```typescript
// Agregar imports en la parte superior de routes.ts:
import {
  // ... imports existentes ...
  documentListQuerySchema,
  documentListResponseSchema,
} from './schemas.js';

// Agregar este handler como PRIMER route dentro de remitoRoutes, antes de /upload:
r.get(
  '/',
  {
    schema: {
      querystring: documentListQuerySchema,
      response: { 200: documentListResponseSchema },
    },
    preHandler: [app.authenticate, app.requireTenant],
  },
  async (req) => {
    const { page, limit, status, supplierId, dateFrom, dateTo, search } = req.query;
    const skip = (page - 1) * limit;

    const where: import('@prisma/client').Prisma.DocumentWhereInput = {
      tenantId: req.tenant.id,
      deletedAt: null,
      ...(status !== 'all' ? { status } : {}),
      ...(supplierId ? { supplierId } : {}),
      ...(search ? { documentNumber: { contains: search, mode: 'insensitive' } } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const [docs, total] = await Promise.all([
      db.document.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: { select: { name: true, cuit: true } },
          _count: { select: { items: true } },
        },
      }),
      db.document.count({ where }),
    ]);

    return {
      items: docs.map((d) => ({
        id: d.id,
        documentNumber: d.documentNumber,
        type: d.type,
        date: d.date.toISOString(),
        status: d.status,
        overallConfidence: d.overallConfidence,
        itemCount: d._count.items,
        supplierName: d.supplier.name,
        supplierCuit: d.supplier.cuit,
        createdAt: d.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  },
);
```

- [ ] **Step 5: Registrar stockRoutes en `app.ts`**

```typescript
import { stockRoutes } from './features/stock/routes.js';
// ...
await app.register(stockRoutes, { prefix: '/api/stock' });
```

- [ ] **Step 6: Typecheck y tests**

```bash
cd packages/api && pnpm typecheck && pnpm test
```

Expected: 0 errores typecheck, todos los tests passing

- [ ] **Step 7: Commit**

```bash
git add packages/api/src/features/stock/ packages/api/src/features/remitos/ packages/api/src/app.ts
git commit -m "feat(api): stock alerts y lista de remitos con filtros"
```

---

## Task 6: Frontend — Instalar dependencias + DataTable + tipos en api.ts

**Files:**
- Run commands (shadcn + @tanstack/react-table)
- Create: `packages/web/src/components/ui/data-table.tsx`
- Modify: `packages/web/src/lib/api.ts`

- [ ] **Step 1: Instalar shadcn components y @tanstack/react-table**

```bash
cd packages/web
pnpm dlx shadcn@latest add table badge select dialog
pnpm add @tanstack/react-table
```

- [ ] **Step 2: Crear `data-table.tsx`**

```tsx
// packages/web/src/components/ui/data-table.tsx
'use client';

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  isLoading?: boolean;
  emptyMessage?: string;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  isLoading,
  emptyMessage = 'No hay datos.',
  onRowClick,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((h) => (
                <TableHead key={h.id}>
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                Cargando...
              </TableCell>
            </TableRow>
          ) : table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 3: Agregar tipos y métodos a `api.ts`**

Agregar al final del archivo `packages/web/src/lib/api.ts`, antes del objeto `api`:

```typescript
// ── Helpers ──────────────────────────────────────────────────────────────────

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') p.set(k, String(v));
  }
  return p.toString();
}

// ── Productos types ───────────────────────────────────────────────────────────

export interface Producto {
  id: string;
  code: string;
  name: string;
  unit: string;
  stockOnHand: number;
  minStock: number | null;
  aliases: string[];
  deletedAt: string | null;
  createdAt: string;
}

export interface StockMovimiento {
  id: string;
  type: string;
  reason: string;
  reference: string | null;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
  user: { name: string; email: string };
}

export interface ProductoDetail extends Producto {
  stockMovements: StockMovimiento[];
}

export interface ProductoListResponse {
  items: Producto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductoCreate {
  code: string;
  name: string;
  unit: string;
  minStock: number | null;
  stockOnHand: number;
  aliases: string[];
}

export interface ProductoUpdate {
  code?: string;
  name?: string;
  unit?: string;
  minStock?: number | null;
  aliases?: string[];
}

// ── Proveedores types ─────────────────────────────────────────────────────────

export interface Proveedor {
  id: string;
  name: string;
  cuit: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
}

export interface ProveedorListResponse {
  items: Proveedor[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProveedorCreate {
  name: string;
  cuit: string;
  email?: string;
  phone?: string;
  address?: string;
}

// ── Stock types ───────────────────────────────────────────────────────────────

export interface StockAlertProduct {
  id: string;
  code: string;
  name: string;
  unit: string;
  stockOnHand: number;
  minStock: number | null;
}

export interface StockAlertsResponse {
  critical: StockAlertProduct[];
  atRisk: StockAlertProduct[];
}

// ── Remitos list types ────────────────────────────────────────────────────────

export interface DocumentListItem {
  id: string;
  documentNumber: string;
  type: string;
  date: string;
  status: string;
  overallConfidence: number;
  itemCount: number;
  supplierName: string;
  supplierCuit: string;
  createdAt: string;
}

export interface DocumentListResponse {
  items: DocumentListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DocumentListParams {
  page?: number;
  limit?: number;
  status?: 'all' | 'processing' | 'review_needed' | 'approved' | 'rejected';
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}
```

Luego extender el objeto `api` existente con los nuevos namespaces:

```typescript
// Dentro del objeto api, agregar junto a auth y remitos:
  productos: {
    list: (p: { page?: number; search?: string; lowStock?: boolean } = {}) =>
      request<ProductoListResponse>(`/api/productos?${qs({ page: p.page ?? 1, search: p.search, lowStock: p.lowStock })}`),
    getById: (id: string) => request<ProductoDetail>(`/api/productos/${id}`),
    create: (body: ProductoCreate) =>
      request<Producto>('/api/productos', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: ProductoUpdate) =>
      request<Producto>(`/api/productos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => request<{ id: string; deletedAt: string }>(`/api/productos/${id}`, { method: 'DELETE' }),
  },

  proveedores: {
    list: (p: { page?: number; search?: string } = {}) =>
      request<ProveedorListResponse>(`/api/proveedores?${qs({ page: p.page ?? 1, search: p.search })}`),
    create: (body: ProveedorCreate) =>
      request<Proveedor>('/api/proveedores', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<ProveedorCreate>) =>
      request<Proveedor>(`/api/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },

  stock: {
    alerts: () => request<StockAlertsResponse>('/api/stock/alerts'),
  },
```

Y actualizar `api.remitos` para agregar la lista:

```typescript
// En api.remitos, agregar:
    list: (p: DocumentListParams = {}) =>
      request<DocumentListResponse>(`/api/remitos?${qs({ page: p.page ?? 1, limit: p.limit ?? 20, status: p.status ?? 'all', supplierId: p.supplierId, dateFrom: p.dateFrom, dateTo: p.dateTo, search: p.search })}`),
```

- [ ] **Step 4: Typecheck**

```bash
cd packages/web && pnpm typecheck
```

Expected: 0 errores

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ui/data-table.tsx packages/web/src/lib/api.ts packages/web/src/components/ui/table.tsx packages/web/src/components/ui/badge.tsx packages/web/src/components/ui/select.tsx packages/web/src/components/ui/dialog.tsx
git commit -m "feat(web): DataTable genérico + tipos de API + shadcn components"
```

---

## Task 7: Frontend — /productos (lista + CRUD)

**Files:**
- Create: `packages/web/src/components/features/productos/ProductoForm.tsx`
- Create: `packages/web/src/app/(dashboard)/productos/page.tsx`

- [ ] **Step 1: Crear `ProductoForm.tsx` (modal crear/editar)**

```tsx
// packages/web/src/components/features/productos/ProductoForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Producto } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

const schema = z.object({
  code: z.string().min(1, 'Requerido'),
  name: z.string().min(1, 'Requerido'),
  unit: z.string().min(1, 'Requerido'),
  minStock: z.coerce.number().nonnegative().nullable(),
  stockOnHand: z.coerce.number().nonnegative(),
  aliases: z.string(), // string separado por comas, se parsea al submit
});

type FormValues = z.infer<typeof schema>;

interface ProductoFormProps {
  open: boolean;
  onClose: () => void;
  editing?: Producto | null;
}

export function ProductoForm({ open, onClose, editing }: ProductoFormProps) {
  const qc = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? {
          code: editing.code,
          name: editing.name,
          unit: editing.unit,
          minStock: editing.minStock ?? null,
          stockOnHand: editing.stockOnHand,
          aliases: editing.aliases.join(', '),
        }
      : { stockOnHand: 0, aliases: '' },
  });

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.productos.create({
        code: data.code,
        name: data.name,
        unit: data.unit,
        minStock: data.minStock,
        stockOnHand: data.stockOnHand,
        aliases: data.aliases ? data.aliases.split(',').map((a) => a.trim()).filter(Boolean) : [],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      reset();
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.productos.update(editing!.id, {
        code: data.code,
        name: data.name,
        unit: data.unit,
        minStock: data.minStock,
        aliases: data.aliases ? data.aliases.split(',').map((a) => a.trim()).filter(Boolean) : [],
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      onClose();
    },
  });

  const mutation = editing ? updateMutation : createMutation;

  const onSubmit = handleSubmit((data) => mutation.mutate(data));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar producto' : 'Nuevo producto'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="code">Código *</Label>
              <Input id="code" {...register('code')} disabled={!!editing} />
              {errors.code && <p className="text-xs text-destructive">{errors.code.message}</p>}
            </div>
            <div className="space-y-1">
              <Label htmlFor="unit">Unidad *</Label>
              <Input id="unit" {...register('unit')} placeholder="kg, un, lt" />
              {errors.unit && <p className="text-xs text-destructive">{errors.unit.message}</p>}
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="name">Nombre *</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="minStock">Stock mínimo</Label>
              <Input id="minStock" type="number" step="0.001" {...register('minStock')} />
            </div>
            {!editing && (
              <div className="space-y-1">
                <Label htmlFor="stockOnHand">Stock inicial</Label>
                <Input id="stockOnHand" type="number" step="0.001" {...register('stockOnHand')} />
              </div>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="aliases">Alias (separados por coma)</Label>
            <Input id="aliases" {...register('aliases')} placeholder="coca cola, coca, gaseosa" />
          </div>
          {mutation.error && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof Error ? mutation.error.message : 'Error inesperado'}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Crear `productos/page.tsx`**

```tsx
// packages/web/src/app/(dashboard)/productos/page.tsx
'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { api, Producto } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProductoForm } from '@/components/features/productos/ProductoForm';
import { useDebounce } from '@/hooks/useDebounce';

function StockBadge({ stockOnHand, minStock }: { stockOnHand: number; minStock: number | null }) {
  if (stockOnHand <= 0) return <Badge variant="destructive">Sin stock</Badge>;
  if (minStock !== null && stockOnHand < minStock)
    return <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">En riesgo</Badge>;
  return <Badge className="bg-green-500 text-white hover:bg-green-600">OK</Badge>;
}

export default function ProductosPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Producto | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['productos', { page, search: debouncedSearch, lowStock }],
    queryFn: () => api.productos.list({ page, search: debouncedSearch || undefined, lowStock }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.productos.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['productos'] }),
  });

  const columns: ColumnDef<Producto>[] = [
    { accessorKey: 'code', header: 'Código' },
    { accessorKey: 'name', header: 'Nombre' },
    { accessorKey: 'unit', header: 'Unidad' },
    {
      accessorKey: 'stockOnHand',
      header: 'Stock actual',
      cell: ({ row }) => row.original.stockOnHand.toLocaleString('es-AR'),
    },
    {
      accessorKey: 'minStock',
      header: 'Stock mínimo',
      cell: ({ row }) => row.original.minStock?.toLocaleString('es-AR') ?? '—',
    },
    {
      id: 'estado',
      header: 'Estado',
      cell: ({ row }) => (
        <StockBadge stockOnHand={row.original.stockOnHand} minStock={row.original.minStock} />
      ),
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="flex gap-2 justify-end" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setEditing(row.original);
              setFormOpen(true);
            }}
          >
            Editar
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={row.original.stockOnHand > 0}
            title={row.original.stockOnHand > 0 ? 'Tiene stock, no se puede archivar' : 'Archivar'}
            onClick={() => {
              if (confirm('¿Archivar este producto?')) deleteMutation.mutate(row.original.id);
            }}
          >
            Archivar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Productos</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          Nuevo producto
        </Button>
      </div>

      <div className="flex gap-3">
        <Input
          placeholder="Buscar por nombre o código..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="max-w-sm"
        />
        <Button
          variant={lowStock ? 'default' : 'outline'}
          onClick={() => {
            setLowStock((v) => !v);
            setPage(1);
          }}
        >
          Solo stock bajo
        </Button>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        emptyMessage="No hay productos."
        onRowClick={(p) => router.push(`/productos/${p.id}`)}
      />

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {data.total} productos — página {page} de {data.totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => p + 1)}
              disabled={page === data.totalPages}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <ProductoForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        editing={editing}
      />
    </div>
  );
}
```

- [ ] **Step 3: Crear hook `useDebounce` si no existe**

```typescript
// packages/web/src/hooks/useDebounce.ts
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
```

- [ ] **Step 4: Typecheck**

```bash
cd packages/web && pnpm typecheck
```

Expected: 0 errores

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/app/(dashboard)/productos/ packages/web/src/components/features/productos/ packages/web/src/hooks/useDebounce.ts
git commit -m "feat(web): pantalla /productos con CRUD"
```

---

## Task 8: Frontend — /productos/[id] (detalle + movimientos)

**Files:**
- Create: `packages/web/src/app/(dashboard)/productos/[id]/page.tsx`

- [ ] **Step 1: Crear `[id]/page.tsx`**

```tsx
// packages/web/src/app/(dashboard)/productos/[id]/page.tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { api, StockMovimiento, Producto } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProductoForm } from '@/components/features/productos/ProductoForm';

function StockBadge({ stockOnHand, minStock }: { stockOnHand: number; minStock: number | null }) {
  if (stockOnHand <= 0) return <Badge variant="destructive">Sin stock</Badge>;
  if (minStock !== null && stockOnHand < minStock)
    return <Badge className="bg-yellow-500 text-white">En riesgo</Badge>;
  return <Badge className="bg-green-500 text-white">OK</Badge>;
}

const movimientoColumns: ColumnDef<StockMovimiento>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Fecha',
    cell: ({ row }) =>
      new Date(row.original.createdAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }),
  },
  {
    accessorKey: 'type',
    header: 'Tipo',
    cell: ({ row }) => {
      const labels: Record<string, string> = { in: 'Entrada', out: 'Salida', adjustment: 'Ajuste' };
      return labels[row.original.type] ?? row.original.type;
    },
  },
  { accessorKey: 'reason', header: 'Razón' },
  {
    accessorKey: 'quantity',
    header: 'Cantidad',
    cell: ({ row }) => row.original.quantity.toLocaleString('es-AR'),
  },
  {
    id: 'balance',
    header: 'Balance',
    cell: ({ row }) =>
      `${row.original.balanceBefore.toLocaleString('es-AR')} → ${row.original.balanceAfter.toLocaleString('es-AR')}`,
  },
  {
    id: 'usuario',
    header: 'Usuario',
    cell: ({ row }) => row.original.user.name,
  },
];

export default function ProductoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['productos', id],
    queryFn: () => api.productos.getById(id),
  });

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando...</div>;
  if (!data) return <div className="p-6 text-muted-foreground">Producto no encontrado.</div>;

  const productoForForm: Producto = {
    id: data.id,
    code: data.code,
    name: data.name,
    unit: data.unit,
    stockOnHand: data.stockOnHand,
    minStock: data.minStock,
    aliases: data.aliases,
    deletedAt: data.deletedAt,
    createdAt: data.createdAt,
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" onClick={() => router.back()}>
          ← Volver
        </Button>
        <h1 className="text-2xl font-semibold flex-1">{data.name}</h1>
        <Button onClick={() => setEditOpen(true)}>Editar</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Código</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-mono">{data.code}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Stock actual</CardTitle></CardHeader>
          <CardContent>
            <p className="text-xl font-semibold">{data.stockOnHand.toLocaleString('es-AR')} {data.unit}</p>
            <StockBadge stockOnHand={data.stockOnHand} minStock={data.minStock} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Stock mínimo</CardTitle></CardHeader>
          <CardContent><p className="text-xl">{data.minStock !== null ? `${data.minStock.toLocaleString('es-AR')} ${data.unit}` : '—'}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Alias</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {data.aliases.length ? data.aliases.join(', ') : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-medium mb-3">Últimos movimientos de stock</h2>
        <DataTable
          columns={movimientoColumns}
          data={data.stockMovements}
          emptyMessage="Sin movimientos registrados."
        />
      </div>

      <ProductoForm
        open={editOpen}
        onClose={() => setEditOpen(false)}
        editing={productoForForm}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck y commit**

```bash
cd packages/web && pnpm typecheck
git add packages/web/src/app/(dashboard)/productos/[id]/
git commit -m "feat(web): pantalla /productos/[id] con movimientos"
```

---

## Task 9: Frontend — /proveedores (lista + CRUD)

**Files:**
- Create: `packages/web/src/components/features/proveedores/ProveedorForm.tsx`
- Create: `packages/web/src/app/(dashboard)/proveedores/page.tsx`

- [ ] **Step 1: Crear `ProveedorForm.tsx`**

```tsx
// packages/web/src/components/features/proveedores/ProveedorForm.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, Proveedor } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

const schema = z.object({
  name: z.string().min(1, 'Requerido'),
  cuit: z.string().min(11, 'CUIT inválido (11 dígitos)').max(13),
  email: z.string().email('Email inválido').or(z.literal('')).optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface ProveedorFormProps {
  open: boolean;
  onClose: () => void;
  editing?: Proveedor | null;
}

export function ProveedorForm({ open, onClose, editing }: ProveedorFormProps) {
  const qc = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: editing
      ? { name: editing.name, cuit: editing.cuit, email: editing.email ?? '', phone: editing.phone ?? '', address: editing.address ?? '' }
      : {},
  });

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.proveedores.create({ name: data.name, cuit: data.cuit, email: data.email || undefined, phone: data.phone || undefined, address: data.address || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); reset(); onClose(); },
  });

  const updateMutation = useMutation({
    mutationFn: (data: FormValues) =>
      api.proveedores.update(editing!.id, { name: data.name, cuit: data.cuit, email: data.email || undefined, phone: data.phone || undefined, address: data.address || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proveedores'] }); onClose(); },
  });

  const mutation = editing ? updateMutation : createMutation;
  const onSubmit = handleSubmit((data) => mutation.mutate(data));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="name">Razón social *</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="cuit">CUIT *</Label>
            <Input id="cuit" {...register('cuit')} placeholder="20-12345678-9" />
            {errors.cuit && <p className="text-xs text-destructive">{errors.cuit.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="phone">Teléfono</Label>
              <Input id="phone" {...register('phone')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="address">Dirección</Label>
              <Input id="address" {...register('address')} />
            </div>
          </div>
          {mutation.error && (
            <p className="text-sm text-destructive">
              {mutation.error instanceof Error ? mutation.error.message : 'Error inesperado'}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Crear `proveedores/page.tsx`**

```tsx
// packages/web/src/app/(dashboard)/proveedores/page.tsx
'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { api, Proveedor } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ProveedorForm } from '@/components/features/proveedores/ProveedorForm';
import { useDebounce } from '@/hooks/useDebounce';

const columns: ColumnDef<Proveedor>[] = [
  { accessorKey: 'name', header: 'Razón social' },
  { accessorKey: 'cuit', header: 'CUIT' },
  { accessorKey: 'email', header: 'Email', cell: ({ row }) => row.original.email ?? '—' },
  { accessorKey: 'phone', header: 'Teléfono', cell: ({ row }) => row.original.phone ?? '—' },
  { accessorKey: 'address', header: 'Dirección', cell: ({ row }) => row.original.address ?? '—' },
];

export default function ProveedoresPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Proveedor | null>(null);
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['proveedores', { page, search: debouncedSearch }],
    queryFn: () => api.proveedores.list({ page, search: debouncedSearch || undefined }),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Proveedores</h1>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>Nuevo proveedor</Button>
      </div>

      <Input
        placeholder="Buscar por nombre o CUIT..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        className="max-w-sm"
      />

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        emptyMessage="No hay proveedores."
        onRowClick={(p) => { setEditing(p); setFormOpen(true); }}
      />

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} proveedores — página {page} de {data.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>Anterior</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page === data.totalPages}>Siguiente</Button>
          </div>
        </div>
      )}

      <ProveedorForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} editing={editing} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck y commit**

```bash
cd packages/web && pnpm typecheck
git add packages/web/src/app/(dashboard)/proveedores/ packages/web/src/components/features/proveedores/
git commit -m "feat(web): pantalla /proveedores con CRUD"
```

---

## Task 10: Frontend — /stock (dashboard de alertas)

**Files:**
- Create: `packages/web/src/app/(dashboard)/stock/page.tsx`

- [ ] **Step 1: Crear `stock/page.tsx`**

```tsx
// packages/web/src/app/(dashboard)/stock/page.tsx
'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, StockAlertProduct } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function AlertCard({ product, variant }: { product: StockAlertProduct; variant: 'critical' | 'atRisk' }) {
  return (
    <Link href={`/productos/${product.id}`}>
      <Card className={`hover:shadow-md transition-shadow cursor-pointer border-l-4 ${variant === 'critical' ? 'border-l-destructive' : 'border-l-yellow-500'}`}>
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <CardTitle className="text-base">{product.name}</CardTitle>
            {variant === 'critical'
              ? <Badge variant="destructive">Sin stock</Badge>
              : <Badge className="bg-yellow-500 text-white">En riesgo</Badge>}
          </div>
          <p className="text-xs text-muted-foreground font-mono">{product.code}</p>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between text-sm">
            <span>Stock actual</span>
            <span className={`font-semibold ${variant === 'critical' ? 'text-destructive' : 'text-yellow-600'}`}>
              {product.stockOnHand.toLocaleString('es-AR')} {product.unit}
            </span>
          </div>
          {product.minStock !== null && (
            <div className="flex justify-between text-sm text-muted-foreground mt-1">
              <span>Mínimo requerido</span>
              <span>{product.minStock.toLocaleString('es-AR')} {product.unit}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function StockPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['stock', 'alerts'],
    queryFn: () => api.stock.alerts(),
    refetchInterval: 60_000, // refresca cada minuto
  });

  const critical = data?.critical ?? [];
  const atRisk = data?.atRisk ?? [];
  const total = critical.length + atRisk.length;

  if (isLoading) return <div className="p-6 text-muted-foreground">Cargando alertas...</div>;

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Alertas de stock</h1>
        {total === 0 && (
          <p className="text-muted-foreground mt-1">Todos los productos tienen stock suficiente.</p>
        )}
      </div>

      {critical.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-destructive mb-3">
            Crítico — Sin stock ({critical.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {critical.map((p) => (
              <AlertCard key={p.id} product={p} variant="critical" />
            ))}
          </div>
        </section>
      )}

      {atRisk.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-yellow-600 mb-3">
            En riesgo — Stock bajo mínimo ({atRisk.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {atRisk.map((p) => (
              <AlertCard key={p.id} product={p} variant="atRisk" />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck y commit**

```bash
cd packages/web && pnpm typecheck
git add packages/web/src/app/(dashboard)/stock/
git commit -m "feat(web): pantalla /stock con alertas crítico/en-riesgo"
```

---

## Task 11: Frontend — /remitos actualizado con filtros

**Files:**
- Modify: `packages/web/src/app/(dashboard)/remitos/page.tsx`

- [ ] **Step 1: Reemplazar `remitos/page.tsx`**

```tsx
// packages/web/src/app/(dashboard)/remitos/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ColumnDef } from '@tanstack/react-table';
import { api, DocumentListItem, DocumentListParams } from '@/lib/api';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDebounce } from '@/hooks/useDebounce';

const STATUS_LABELS: Record<string, string> = {
  all: 'Todos',
  processing: 'Procesando',
  review_needed: 'En revisión',
  approved: 'Aprobado',
  rejected: 'Rechazado',
};

const STATUS_VARIANTS: Record<string, string> = {
  approved: 'bg-green-500 text-white',
  rejected: 'bg-destructive text-destructive-foreground',
  review_needed: 'bg-yellow-500 text-white',
  processing: 'bg-muted text-muted-foreground',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge className={STATUS_VARIANTS[status] ?? 'bg-muted'}>
      {STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

const columns: ColumnDef<DocumentListItem>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Fecha',
    cell: ({ row }) =>
      new Date(row.original.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
  },
  { accessorKey: 'documentNumber', header: 'Número' },
  { accessorKey: 'supplierName', header: 'Proveedor' },
  { accessorKey: 'itemCount', header: 'Items' },
  {
    accessorKey: 'overallConfidence',
    header: 'Confianza',
    cell: ({ row }) => `${row.original.overallConfidence}%`,
  },
  {
    accessorKey: 'status',
    header: 'Estado',
    cell: ({ row }) => <StatusBadge status={row.original.status} />,
  },
];

export default function RemitosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<DocumentListParams['status']>(
    (searchParams.get('status') as DocumentListParams['status']) ?? 'all',
  );
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const { data, isLoading } = useQuery({
    queryKey: ['remitos', { page, search: debouncedSearch, status, dateFrom, dateTo }],
    queryFn: () =>
      api.remitos.list({
        page,
        status,
        search: debouncedSearch || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
  });

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Remitos</h1>
        <Button onClick={() => router.push('/remitos/nuevo')}>Nuevo remito</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Buscar por número..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
        <Select
          value={status}
          onValueChange={(v) => { setStatus(v as DocumentListParams['status']); setPage(1); }}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(STATUS_LABELS).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
          className="w-40"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
          className="w-40"
        />
        {(search || status !== 'all' || dateFrom || dateTo) && (
          <Button
            variant="outline"
            onClick={() => { setSearch(''); setStatus('all'); setDateFrom(''); setDateTo(''); setPage(1); }}
          >
            Limpiar filtros
          </Button>
        )}
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        emptyMessage="No hay remitos con esos filtros."
        onRowClick={(doc) => router.push(`/remitos/${doc.id}`)}
      />

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{data.total} remitos — página {page} de {data.totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>Anterior</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => p + 1)} disabled={page === data.totalPages}>Siguiente</Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Crear wrapper con Suspense (requerido por Next.js 15)**

`useSearchParams()` requiere que el componente esté dentro de un `<Suspense>`. Dado que la `page.tsx` es el entry point, crear un componente interno:

```tsx
// Al final de remitos/page.tsx, reemplazar `export default function RemitosPage()` por:
function RemitosPageInner() {
  // ... todo el contenido actual de RemitosPage
}

export default function RemitosPage() {
  return (
    <Suspense fallback={<div className="p-6 text-muted-foreground">Cargando...</div>}>
      <RemitosPageInner />
    </Suspense>
  );
}
```

Agregar `import { Suspense } from 'react'` al bloque de imports.

- [ ] **Step 3: Typecheck y commit**

```bash
cd packages/web && pnpm typecheck
git add packages/web/src/app/(dashboard)/remitos/page.tsx
git commit -m "feat(web): /remitos con filtros por estado, fecha y búsqueda"
```

---

## Task 12: Frontend — Actualizar sidebar + verificación final

**Files:**
- Modify: `packages/web/src/components/shared/sidebar.tsx`

- [ ] **Step 1: Leer el sidebar actual**

Leer `packages/web/src/components/shared/sidebar.tsx` para entender la estructura exacta de links antes de editar.

- [ ] **Step 2: Agregar las nuevas rutas al sidebar**

Agregar al array/estructura de navegación del sidebar. El patrón exacto depende del código actual, pero el resultado debe incluir estos links:

```typescript
// Grupo "Operaciones":
{ href: '/remitos/nuevo', label: 'Nuevo remito' },
{ href: '/remitos', label: 'Todos los remitos' },
{ href: '/remitos?status=review_needed', label: 'Cola de revisión' },
{ href: '/remitos?status=approved', label: 'Historial' },

// Grupo "Gestión":
{ href: '/productos', label: 'Productos' },
{ href: '/proveedores', label: 'Proveedores' },
{ href: '/stock', label: 'Alertas de stock' },
```

- [ ] **Step 3: Typecheck final**

```bash
cd packages/web && pnpm typecheck
```

Expected: 0 errores

- [ ] **Step 4: Correr todos los tests de la API**

```bash
cd packages/api && pnpm test
```

Expected: todos los tests previos + nuevos passing (≥ 108 tests)

- [ ] **Step 5: Levantar el stack y navegar las pantallas**

```bash
# Terminal 1
cd packages/api && pnpm dev

# Terminal 2
cd packages/web && pnpm dev
```

Verificar navegando a `http://localhost:3001`:

- [ ] `/productos` muestra los 15 productos del seed con badges de estado correctos
- [ ] `/productos` buscador filtra por nombre (ej: "arroz")
- [ ] `/productos` toggle "Solo stock bajo" filtra correctamente
- [ ] `/productos` botón "Nuevo producto" abre modal y permite crear
- [ ] `/productos` botón "Editar" en fila abre modal pre-llenado
- [ ] `/productos/[id]` muestra detalle + movimientos (vacíos en seed)
- [ ] `/proveedores` muestra los 5 proveedores del seed
- [ ] `/proveedores` click en fila abre modal de edición
- [ ] `/stock` muestra productos con stock = 0 en sección Crítico (si el seed tiene alguno)
- [ ] `/remitos` muestra lista vacía (sin remitos procesados aún en seed limpio)
- [ ] `/remitos?status=approved` filtra correctamente (link "Historial" del sidebar)
- [ ] Sidebar tiene todos los links nuevos y navega correctamente

- [ ] **Step 6: Commit final**

```bash
git add packages/web/src/components/shared/sidebar.tsx
git commit -m "feat(web): sidebar con rutas de gestión — sesión 10 completa"
```
