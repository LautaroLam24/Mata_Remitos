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

  if (data.code !== undefined && data.code !== existing.code) {
    const conflict = await db.product.findUnique({
      where: { tenantId_code: { tenantId, code: data.code } },
    });
    if (conflict) throw new ProductoCodigoExisteError(data.code);
  }

  const product = await db.product.update({
    where: { id },
    data: {
      ...(data.code !== undefined ? { code: data.code } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.unit !== undefined ? { unit: data.unit } : {}),
      ...(data.aliases !== undefined ? { aliases: data.aliases } : {}),
      ...('minStock' in data ? { minStock: data.minStock ?? null } : {}),
    },
  });
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
