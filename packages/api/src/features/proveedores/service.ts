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
    data: {
      tenantId,
      name: data.name,
      cuit: cuitCheck.normalized!,
      email: data.email ?? null,
      phone: data.phone ?? null,
      address: data.address ?? null,
    },
  });
  return toResponse(supplier);
}

export async function updateProveedor(tenantId: string, id: string, data: ProveedorUpdate) {
  const existing = await db.supplier.findFirst({ where: { id, tenantId, deletedAt: null } });
  if (!existing) throw new ProveedorNotFoundError(id);

  if (data.cuit !== undefined && data.cuit !== existing.cuit) {
    const cuitCheck = validateCuit(data.cuit);
    if (!cuitCheck.valid) throw new CuitInvalidoError(data.cuit);
    const conflict = await db.supplier.findUnique({
      where: { tenantId_cuit: { tenantId, cuit: cuitCheck.normalized! } },
    });
    if (conflict) throw new ProveedorCuitExisteError(data.cuit);
    data = { ...data, cuit: cuitCheck.normalized! };
  }

  const supplier = await db.supplier.update({
    where: { id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.cuit !== undefined ? { cuit: data.cuit } : {}),
      ...('email' in data ? { email: data.email ?? null } : {}),
      ...('phone' in data ? { phone: data.phone ?? null } : {}),
      ...('address' in data ? { address: data.address ?? null } : {}),
    },
  });
  return toResponse(supplier);
}
