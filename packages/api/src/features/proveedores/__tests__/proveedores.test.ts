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
