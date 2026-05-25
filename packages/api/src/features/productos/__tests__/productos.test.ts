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
