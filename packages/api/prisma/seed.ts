/**
 * Seed realista para Demo SRL — fabricante de alimentos (cliente demo).
 * Correr con: pnpm --filter @mr/api db:reset && pnpm --filter @mr/api db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// bcryptjs hash de "password123" (cost=10) — solo desarrollo
const DEV_PASSWORD_HASH =
  "$2b$10$sZp1MIDkLwREKh29.3L8suKTVCYG02Eo8OODRLZwf9Zt29ZTNOfOm";

const IMG =
  "https://placehold.co/800x1000/16a34a/ffffff?text=Remito+Demo";

function d(iso: string): Date {
  return new Date(iso);
}

async function main() {
  console.log("🌱 Seed Demo SRL iniciado...\n");

  // ─── TENANT ─────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      name: "Demo SRL",
      plan: "pro",
      config: {
        autoProcessThreshold: 85,
        fuzzyMatchThreshold: 80,
        lowStockDaysAlert: 7,
        dailyReportTime: "08:00",
        dailyReportTimezone: "America/Argentina/Buenos_Aires",
        whatsappRecipients: ["+5491133843718"],
      },
    },
  });
  console.log(`✓ Tenant: ${tenant.name} (${tenant.id})\n`);

  // ─── USUARIOS ───────────────────────────────────────────────────────────────
  const owner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@demo.com" } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "admin@demo.com",
      name: "Julio González",
      passwordHash: DEV_PASSWORD_HASH,
      role: "owner",
      phone: "+5491133843718",
    },
  });
  const operario = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "operario@demo.com" } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "operario@demo.com",
      name: "María Pérez",
      passwordHash: DEV_PASSWORD_HASH,
      role: "user",
    },
  });
  console.log(`✓ Usuarios: ${owner.name}, ${operario.name}\n`);

  await prisma.auditLog.createMany({
    data: [
      {
        tenantId: tenant.id,
        userId: owner.id,
        entityType: "Tenant",
        entityId: tenant.id,
        action: "create",
        changes: { before: null, after: { slug: "demo", plan: "pro" } },
        createdAt: d("2025-11-01T10:00:00"),
      },
      {
        tenantId: tenant.id,
        userId: owner.id,
        entityType: "User",
        entityId: owner.id,
        action: "create",
        changes: { before: null, after: { email: "admin@demo.com", role: "owner" } },
        createdAt: d("2025-11-01T10:01:00"),
      },
      {
        tenantId: tenant.id,
        userId: owner.id,
        entityType: "User",
        entityId: operario.id,
        action: "create",
        changes: { before: null, after: { email: "operario@demo.com", role: "user" } },
        createdAt: d("2025-11-01T10:02:00"),
      },
    ],
  });

  // ─── PROVEEDORES ────────────────────────────────────────────────────────────
  const SUPS = [
    { cuit: "30-50001091-2", name: "Molinos Río de la Plata SA",        email: "ventas@molinos.com.ar",      phone: "+541143424000",  address: "Av. Madero 942, CABA" },
    { cuit: "30-50467970-5", name: "Mastellone Hnos SA",                email: "pedidos@mastellone.com.ar",  phone: "+541142994000",  address: "Ruta 8 km 30, General Rodríguez" },
    { cuit: "30-50118358-1", name: "Aceitera General Deheza SA",         email: "ventas@agd.com.ar",          phone: "+543584422100",  address: "Ruta 8 km 697, General Deheza, Córdoba" },
    { cuit: "30-50001083-1", name: "Ledesma SAAI",                      email: "ventas@ledesma.com.ar",      phone: "+5438887530000", address: "Libertador Gral. San Martín, Jujuy" },
    { cuit: "30-52568839-5", name: "Compañía Argentina de Levaduras SA", email: "ventas@calsa.com.ar",        phone: "+541147568000",  address: "Av. Constituyentes 1800, CABA" },
    { cuit: "30-61836321-9", name: "Sealed Air Argentina SA",            email: "contacto@sealedair.com.ar", phone: "+541143085000",  address: "Av. Del Libertador 498, CABA" },
    { cuit: "30-50673622-0", name: "Cartocor SA",                       email: "ventas@cartocor.com.ar",     phone: "+543516017000",  address: "Bv. Chacabuco 1160, Córdoba" },
    { cuit: "30-54668997-9", name: "YPF SA",                            email: "clientes@ypf.com",           phone: "+541149572000",  address: "Macacha Güemes 515, CABA" },
    { cuit: "30-65511620-2", name: "Edenor SA",                         email: "atencion@edenor.com",        phone: "+541148196900",  address: "Azopardo 1025, CABA" },
    { cuit: "30-65786579-9", name: "Metrogas SA",                       email: "atencion@metrogas.com.ar",   phone: "+541149099000",  address: "Gregorio Aráoz de Lamadrid 1360, CABA" },
    { cuit: "30-50673226-8", name: "Andreani Logística SA",              email: "clientes@andreani.com",      phone: "+541143003900",  address: "Av. Libertad 836, Munro" },
    { cuit: "30-63945373-8", name: "Telecom Argentina SA",              email: "empresas@telecom.com.ar",    phone: "+541143681200",  address: "Alicia M. de Justo 50, CABA" },
  ];

  const sup: Record<string, string> = {};
  for (const s of SUPS) {
    const r = await prisma.supplier.upsert({
      where: { tenantId_cuit: { tenantId: tenant.id, cuit: s.cuit } },
      update: {},
      create: { tenantId: tenant.id, ...s },
    });
    sup[s.cuit] = r.id;
  }
  console.log(`✓ ${SUPS.length} proveedores\n`);

  // ─── PRODUCTOS (stockOnHand=0, se actualiza tras movimientos) ───────────────
  const PRODS = [
    { code: "HAR-000",  name: "Harina 000 x 50kg",              unit: "kg",  minStock: 200, aliases: ["harina cero", "harina 3 ceros", "harina triple cero"],  typicalRange: { min: 50,  max: 800  } },
    { code: "HAR-0000", name: "Harina 0000 x 25kg",             unit: "kg",  minStock: 100, aliases: ["harina cuatro ceros", "harina 4 ceros"],                 typicalRange: { min: 25,  max: 400  } },
    { code: "SEM-001",  name: "Semita x 50kg",                   unit: "kg",  minStock:  50, aliases: ["semita", "semola"],                                      typicalRange: { min: 50,  max: 300  } },
    { code: "LEC-001",  name: "Leche entera UAT x 1L",           unit: "un",  minStock: 150, aliases: ["leche larga vida", "leche UAT", "leche entera"],         typicalRange: { min: 50,  max: 500  } },
    { code: "QUE-MUZ",  name: "Queso muzzarella x 4kg",          unit: "un",  minStock:  20, aliases: ["mozzarella", "muzza", "queso muzzarella"],               typicalRange: { min: 10,  max: 80   } },
    { code: "MAN-001",  name: "Manteca x 5kg",                   unit: "un",  minStock:  10, aliases: ["manteca", "mantequilla"],                                typicalRange: { min: 5,   max: 40   } },
    { code: "HUE-001",  name: "Huevos x 30u",                    unit: "un",  minStock:  50, aliases: ["huevo", "maple de huevos", "maples huevos"],             typicalRange: { min: 10,  max: 200  } },
    { code: "ACE-GIR",  name: "Aceite Girasol 900ml",            unit: "un",  minStock: 100, aliases: ["aceite girasol", "aceite 900ml"],                        typicalRange: { min: 50,  max: 500  } },
    { code: "LEV-FR",   name: "Levadura fresca x 500g",          unit: "un",  minStock:  30, aliases: ["levadura fresca", "levadura"],                           typicalRange: { min: 10,  max: 100  } },
    { code: "SAL-FIN",  name: "Sal fina x 25kg",                 unit: "kg",  minStock:  30, aliases: ["sal fina", "sal"],                                       typicalRange: { min: 25,  max: 200  } },
    { code: "AZU-001",  name: "Azúcar x 25kg",                   unit: "kg",  minStock:  20, aliases: ["azucar", "azúcar"],                                      typicalRange: { min: 25,  max: 150  } },
    { code: "FIL-BOPP", name: "Film BOPP 25 micrones x 1000m",   unit: "un",  minStock:  15, aliases: ["film bopp", "film empaque", "film plástico"],            typicalRange: { min: 5,   max: 50   } },
    { code: "ETI-001",  name: "Etiquetas autoadhesivas x 5000u",  unit: "un",  minStock:  10, aliases: ["etiquetas", "stickers", "rótulos"],                     typicalRange: { min: 5,   max: 30   } },
    { code: "CAJ-30",   name: "Caja corrugada 30x20x10",          unit: "un",  minStock: 500, aliases: ["caja chica", "caja 30x20"],                              typicalRange: { min: 500, max: 2000 } },
    { code: "CAJ-50",   name: "Caja corrugada 50x40x30",          unit: "un",  minStock: 300, aliases: ["caja grande", "caja 50x40"],                             typicalRange: { min: 250, max: 1500 } },
    { code: "SEP-001",  name: "Separador cartón x 500u",          unit: "un",  minStock:  30, aliases: ["separador carton", "separadores"],                       typicalRange: { min: 20,  max: 150  } },
    { code: "GAS-001",  name: "Gasoil grado 3",                   unit: "lt",  minStock:   0, aliases: ["gasoil", "combustible grado 3", "gasoil g3"],            typicalRange: { min: 100, max: 1000 } },
  ];

  const prod: Record<string, string> = {};
  for (const p of PRODS) {
    const r = await prisma.product.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: p.code } },
      update: { name: p.name, aliases: p.aliases, typicalRange: p.typicalRange, minStock: p.minStock },
      create: { tenantId: tenant.id, stockOnHand: 0, ...p },
    });
    prod[p.code] = r.id;
  }
  console.log(`✓ ${PRODS.length} productos\n`);

  // ─── DOCUMENTOS ─────────────────────────────────────────────────────────────
  // Running balance por producto (para stockMovement ledger)
  const bal: Record<string, number> = {};
  for (const p of PRODS) bal[p.code] = 0;

  type ItemDef = {
    productCode?: string;
    rawDescription: string;
    qty: number;
    unit: string;
    unitPrice: number | null;
    conf: number;
    matchStatus: "matched" | "new_product" | "pending";
    matchScore?: number;
  };

  const mkDoc = async (params: {
    cuit: string;
    supplierName: string;
    type: string;
    num: string;
    date: string;
    status: "approved" | "review_needed" | "rejected";
    conf: number;
    warnings: string[];
    items: ItemDef[];
    at: string;
  }) => {
    const { cuit, supplierName, type, num, date, status, conf, warnings, items, at } = params;
    const uploadedById = operario.id;
    const approvedById = status === "approved" ? owner.id : null;
    const approvedAt =
      status === "approved"
        ? new Date(d(at).getTime() + 3 * 3600 * 1000)
        : null;

    const total = items.reduce(
      (s, i) => s + (i.unitPrice != null ? i.qty * i.unitPrice : 0),
      0,
    );

    const rawExtraction = {
      documentType: type,
      documentNumber: { value: num, confidence: Math.min(conf + 3, 99) },
      date: { value: date, confidence: conf },
      supplier: {
        cuit: { value: cuit, confidence: 98 },
        name: { value: supplierName, confidence: 95 },
      },
      items: items.map((i) => ({
        code: { value: null, confidence: 0 },
        description: { value: i.rawDescription, confidence: i.conf },
        quantity: { value: i.qty, confidence: i.conf },
        unit: { value: i.unit, confidence: Math.max(i.conf - 5, 60) },
        unitPrice: {
          value: i.unitPrice,
          confidence: i.unitPrice != null ? Math.max(i.conf - 3, 60) : 0,
        },
        subtotal: {
          value: i.unitPrice != null ? i.qty * i.unitPrice : null,
          confidence: i.unitPrice != null ? Math.max(i.conf - 5, 60) : 0,
        },
      })),
      total: { value: total || null, confidence: Math.max(conf - 2, 60) },
      rawText: `${type.toUpperCase().replace("_", " ")} N° ${num}\nFecha: ${date}\nProveedor: ${supplierName} — CUIT ${cuit}`,
      overallConfidence: conf,
      warnings,
    };

    const doc = await prisma.document.create({
      data: {
        tenantId: tenant.id,
        supplierId: sup[cuit]!,
        supplierCuit: cuit,
        type,
        documentNumber: num,
        date: d(date),
        status,
        overallConfidence: conf,
        rawExtraction,
        warnings,
        imageUrl: IMG,
        uploadedById,
        approvedById,
        approvedAt,
        createdAt: d(at),
      },
    });

    for (const item of items) {
      const productId = item.productCode ? (prod[item.productCode] ?? null) : null;
      await prisma.documentItem.create({
        data: {
          tenantId: tenant.id,
          documentId: doc.id,
          productId,
          rawDescription: item.rawDescription,
          quantity: item.qty,
          unit: item.unit,
          unitPrice: item.unitPrice,
          confidenceScore: item.conf,
          matchStatus: item.matchStatus,
          matchScore: item.matchScore ?? (item.matchStatus === "matched" ? 92 : null),
          createdAt: d(at),
        },
      });

      if (status === "approved" && item.matchStatus === "matched" && item.productCode) {
        const before = bal[item.productCode] ?? 0;
        const after = before + item.qty;
        bal[item.productCode] = after;
        await prisma.stockMovement.create({
          data: {
            tenantId: tenant.id,
            productId: prod[item.productCode]!,
            userId: owner.id,
            type: "in",
            reason: "document",
            reference: doc.id,
            quantity: item.qty,
            balanceBefore: before,
            balanceAfter: after,
            createdAt: approvedAt ?? d(at),
          },
        });
      }
    }

    if (status === "approved") {
      await prisma.auditLog.create({
        data: {
          tenantId: tenant.id,
          userId: owner.id,
          entityType: "Document",
          entityId: doc.id,
          action: "approve",
          changes: { before: { status: "review_needed" }, after: { status: "approved" } },
          createdAt: approvedAt ?? d(at),
        },
      });
    }

    return doc;
  };

  // ── Diciembre 2025 ─────────────────────────────────────────────────────────

  await mkDoc({
    cuit: "30-50001091-2", supplierName: "Molinos Río de la Plata SA",
    type: "remito", num: "R-0001-00012301", date: "2025-12-01",
    status: "approved", conf: 92, warnings: [],
    items: [
      { productCode: "HAR-000",  rawDescription: "Harina 000 x 50kg",  qty: 400, unit: "kg", unitPrice: 85, conf: 93, matchStatus: "matched", matchScore: 97 },
      { productCode: "HAR-0000", rawDescription: "Harina 0000 x 25kg", qty: 200, unit: "kg", unitPrice: 92, conf: 91, matchStatus: "matched", matchScore: 96 },
    ],
    at: "2025-12-01T09:15:00",
  });

  await mkDoc({
    cuit: "30-50467970-5", supplierName: "Mastellone Hnos SA",
    type: "remito", num: "R-0001-00012302", date: "2025-12-10",
    status: "approved", conf: 95, warnings: [],
    items: [
      { productCode: "LEC-001", rawDescription: "Leche entera UAT 1L",   qty: 200, unit: "un", unitPrice: 480,  conf: 96, matchStatus: "matched", matchScore: 99 },
      { productCode: "QUE-MUZ", rawDescription: "Queso muzzarella 4kg",  qty: 30,  unit: "un", unitPrice: 8900, conf: 94, matchStatus: "matched", matchScore: 95 },
      { productCode: "MAN-001", rawDescription: "Manteca x 5kg",         qty: 20,  unit: "un", unitPrice: 4200, conf: 95, matchStatus: "matched", matchScore: 98 },
      { productCode: "HUE-001", rawDescription: "Huevos x 30 unidades",  qty: 100, unit: "un", unitPrice: 2800, conf: 93, matchStatus: "matched", matchScore: 94 },
    ],
    at: "2025-12-10T08:30:00",
  });

  await mkDoc({
    cuit: "30-50001083-1", supplierName: "Ledesma SAAI",
    type: "factura_a", num: "FA-0001-00005842", date: "2025-12-31",
    status: "approved", conf: 88, warnings: [],
    items: [
      { productCode: "AZU-001", rawDescription: "Azúcar x 25kg",   qty: 50, unit: "kg", unitPrice: 620, conf: 89, matchStatus: "matched", matchScore: 98 },
      { productCode: "SAL-FIN", rawDescription: "Sal fina x 25kg", qty: 50, unit: "kg", unitPrice: 180, conf: 87, matchStatus: "matched", matchScore: 97 },
    ],
    at: "2025-12-31T11:00:00",
  });

  // ── Enero 2026 ─────────────────────────────────────────────────────────────

  await mkDoc({
    cuit: "30-52568839-5", supplierName: "Compañía Argentina de Levaduras SA",
    type: "remito", num: "R-0001-00009134", date: "2026-01-15",
    status: "approved", conf: 90, warnings: [],
    items: [
      { productCode: "LEV-FR", rawDescription: "Levadura fresca 500g", qty: 60, unit: "un", unitPrice: 950, conf: 91, matchStatus: "matched", matchScore: 99 },
    ],
    at: "2026-01-15T10:20:00",
  });

  await mkDoc({
    cuit: "30-50467970-5", supplierName: "Mastellone Hnos SA",
    type: "remito", num: "R-0001-00012303", date: "2026-01-22",
    status: "approved", conf: 93, warnings: [],
    items: [
      { productCode: "LEC-001", rawDescription: "Leche entera UAT 1L", qty: 200, unit: "un", unitPrice: 510,  conf: 94, matchStatus: "matched", matchScore: 99 },
      { productCode: "MAN-001", rawDescription: "Manteca x 5kg",       qty: 10,  unit: "un", unitPrice: 4400, conf: 92, matchStatus: "matched", matchScore: 98 },
    ],
    at: "2026-01-22T09:00:00",
  });

  await mkDoc({
    cuit: "30-50001091-2", supplierName: "Molinos Río de la Plata SA",
    type: "factura_a", num: "FA-0001-00089241", date: "2026-01-31",
    status: "approved", conf: 96, warnings: [],
    items: [
      { productCode: "HAR-000",  rawDescription: "Harina 000 x 50kg",  qty: 200, unit: "kg", unitPrice: 88, conf: 97, matchStatus: "matched", matchScore: 97 },
      { productCode: "HAR-0000", rawDescription: "Harina 0000 x 25kg", qty: 100, unit: "kg", unitPrice: 95, conf: 96, matchStatus: "matched", matchScore: 96 },
      { productCode: "SEM-001",  rawDescription: "Semita x 50kg",      qty: 100, unit: "kg", unitPrice: 78, conf: 95, matchStatus: "matched", matchScore: 92 },
    ],
    at: "2026-01-31T14:00:00",
  });

  // ── Febrero 2026 ──────────────────────────────────────────────────────────

  await mkDoc({
    cuit: "30-50467970-5", supplierName: "Mastellone Hnos SA",
    type: "remito", num: "R-0001-00012304", date: "2026-02-14",
    status: "approved", conf: 94, warnings: [],
    items: [
      { productCode: "LEC-001", rawDescription: "Leche entera UAT 1L",  qty: 200, unit: "un", unitPrice: 530,  conf: 95, matchStatus: "matched", matchScore: 99 },
      { productCode: "QUE-MUZ", rawDescription: "Queso muzzarella 4kg", qty: 20,  unit: "un", unitPrice: 9200, conf: 93, matchStatus: "matched", matchScore: 95 },
    ],
    at: "2026-02-14T08:45:00",
  });

  await mkDoc({
    cuit: "30-50118358-1", supplierName: "Aceitera General Deheza SA",
    type: "remito", num: "R-0001-00034521", date: "2026-02-28",
    status: "approved", conf: 91, warnings: [],
    items: [
      { productCode: "ACE-GIR", rawDescription: "Aceite Girasol 900ml", qty: 200, unit: "un", unitPrice: 1850, conf: 92, matchStatus: "matched", matchScore: 98 },
    ],
    at: "2026-02-28T10:30:00",
  });

  await mkDoc({
    cuit: "30-61836321-9", supplierName: "Sealed Air Argentina SA",
    type: "remito", num: "R-0001-00004471", date: "2026-02-28",
    status: "approved", conf: 89, warnings: [],
    items: [
      { productCode: "FIL-BOPP", rawDescription: "Film BOPP 25 micrones 1000m", qty: 30, unit: "un", unitPrice: 28500, conf: 90, matchStatus: "matched", matchScore: 94 },
    ],
    at: "2026-02-28T11:15:00",
  });

  // ── Marzo 2026 ────────────────────────────────────────────────────────────

  await mkDoc({
    cuit: "30-50001091-2", supplierName: "Molinos Río de la Plata SA",
    type: "factura_a", num: "FA-0001-00089612", date: "2026-03-15",
    status: "approved", conf: 97, warnings: [],
    items: [
      { productCode: "HAR-0000", rawDescription: "Harina 0000 x 25kg", qty: 100, unit: "kg", unitPrice: 96, conf: 98, matchStatus: "matched", matchScore: 96 },
    ],
    at: "2026-03-15T09:30:00",
  });

  await mkDoc({
    cuit: "30-50673622-0", supplierName: "Cartocor SA",
    type: "remito", num: "R-0001-00021887", date: "2026-03-31",
    status: "approved", conf: 93, warnings: [],
    items: [
      { productCode: "CAJ-30",  rawDescription: "Caja corrugada 30x20x10",    qty: 1000, unit: "un", unitPrice: 380,  conf: 94, matchStatus: "matched", matchScore: 96 },
      { productCode: "CAJ-50",  rawDescription: "Caja corrugada 50x40x30",    qty: 500,  unit: "un", unitPrice: 720,  conf: 93, matchStatus: "matched", matchScore: 95 },
      { productCode: "SEP-001", rawDescription: "Separador cartón x 500 u.",  qty: 60,   unit: "un", unitPrice: 4200, conf: 91, matchStatus: "matched", matchScore: 93 },
    ],
    at: "2026-03-31T13:00:00",
  });

  // ── Abril 2026 ────────────────────────────────────────────────────────────

  await mkDoc({
    cuit: "30-50467970-5", supplierName: "Mastellone Hnos SA",
    type: "remito", num: "R-0001-00012305", date: "2026-04-15",
    status: "approved", conf: 92, warnings: [],
    items: [
      { productCode: "QUE-MUZ", rawDescription: "Queso muzzarella 4kg",  qty: 30,  unit: "un", unitPrice: 9400, conf: 93, matchStatus: "matched", matchScore: 95 },
      { productCode: "HUE-001", rawDescription: "Huevos x 30 unidades",  qty: 100, unit: "un", unitPrice: 2950, conf: 91, matchStatus: "matched", matchScore: 94 },
    ],
    at: "2026-04-15T08:20:00",
  });

  await mkDoc({
    cuit: "30-61836321-9", supplierName: "Sealed Air Argentina SA",
    type: "factura_a", num: "FA-0001-00004723", date: "2026-04-15",
    status: "approved", conf: 95, warnings: [],
    items: [
      { productCode: "FIL-BOPP", rawDescription: "Film BOPP 25 micrones 1000m",      qty: 20, unit: "un", unitPrice: 29000, conf: 96, matchStatus: "matched", matchScore: 94 },
      { productCode: "ETI-001",  rawDescription: "Etiquetas autoadhesivas x 5000 u.", qty: 30, unit: "un", unitPrice: 3200,  conf: 94, matchStatus: "matched", matchScore: 88 },
    ],
    at: "2026-04-15T14:45:00",
  });

  await mkDoc({
    cuit: "30-50001091-2", supplierName: "Molinos Río de la Plata SA",
    type: "remito", num: "R-0001-00012306", date: "2026-04-30",
    status: "approved", conf: 90, warnings: [],
    items: [
      { productCode: "HAR-000", rawDescription: "Harina 000 x 50kg", qty: 200, unit: "kg", unitPrice: 91, conf: 91, matchStatus: "matched", matchScore: 97 },
      { productCode: "SEM-001", rawDescription: "Semita x 50kg",     qty: 100, unit: "kg", unitPrice: 80, conf: 89, matchStatus: "matched", matchScore: 92 },
    ],
    at: "2026-04-30T10:00:00",
  });

  await mkDoc({
    cuit: "30-52568839-5", supplierName: "Compañía Argentina de Levaduras SA",
    type: "remito", num: "R-0001-00009215", date: "2026-04-30",
    status: "approved", conf: 88, warnings: [],
    items: [
      { productCode: "LEV-FR", rawDescription: "Levadura fresca 500g", qty: 40, unit: "un", unitPrice: 980, conf: 89, matchStatus: "matched", matchScore: 99 },
    ],
    at: "2026-04-30T11:30:00",
  });

  // ── Mayo 2026 ─────────────────────────────────────────────────────────────

  await mkDoc({
    cuit: "30-50001083-1", supplierName: "Ledesma SAAI",
    type: "remito", num: "R-0001-00005901", date: "2026-05-09",
    status: "approved", conf: 94, warnings: [],
    items: [
      { productCode: "AZU-001", rawDescription: "Azúcar x 25kg",   qty: 30, unit: "kg", unitPrice: 640, conf: 95, matchStatus: "matched", matchScore: 98 },
      { productCode: "SAL-FIN", rawDescription: "Sal fina x 25kg", qty: 50, unit: "kg", unitPrice: 185, conf: 93, matchStatus: "matched", matchScore: 97 },
    ],
    at: "2026-05-09T08:00:00",
  });

  await mkDoc({
    cuit: "30-50118358-1", supplierName: "Aceitera General Deheza SA",
    type: "remito", num: "R-0001-00034788", date: "2026-05-16",
    status: "approved", conf: 96, warnings: [],
    items: [
      { productCode: "ACE-GIR", rawDescription: "Aceite Girasol 900ml", qty: 300, unit: "un", unitPrice: 1920, conf: 97, matchStatus: "matched", matchScore: 98 },
    ],
    at: "2026-05-16T09:45:00",
  });

  await mkDoc({
    cuit: "30-50673622-0", supplierName: "Cartocor SA",
    type: "remito", num: "R-0001-00022103", date: "2026-05-23",
    status: "approved", conf: 93, warnings: [],
    items: [
      { productCode: "CAJ-30",  rawDescription: "Caja corrugada 30x20x10",   qty: 1000, unit: "un", unitPrice: 395,  conf: 94, matchStatus: "matched", matchScore: 96 },
      { productCode: "CAJ-50",  rawDescription: "Caja corrugada 50x40x30",   qty: 500,  unit: "un", unitPrice: 740,  conf: 93, matchStatus: "matched", matchScore: 95 },
      { productCode: "SEP-001", rawDescription: "Separador cartón x 500 u.", qty: 40,   unit: "un", unitPrice: 4350, conf: 91, matchStatus: "matched", matchScore: 93 },
    ],
    at: "2026-05-23T08:30:00",
  });

  await mkDoc({
    cuit: "30-50467970-5", supplierName: "Mastellone Hnos SA",
    type: "remito", num: "R-0001-00012309", date: "2026-05-23",
    status: "approved", conf: 91, warnings: [],
    items: [
      { productCode: "MAN-001", rawDescription: "Manteca x 5kg", qty: 10, unit: "un", unitPrice: 4600, conf: 92, matchStatus: "matched", matchScore: 98 },
    ],
    at: "2026-05-23T09:15:00",
  });

  // ── Review needed ─────────────────────────────────────────────────────────

  // Confianza baja (76) — imagen borrosa, precio ilegible
  await mkDoc({
    cuit: "30-54668997-9", supplierName: "YPF SA",
    type: "remito", num: "R-0001-00234521", date: "2026-05-23",
    status: "review_needed", conf: 76,
    warnings: [
      "imagen parcialmente borrosa — campos extraídos con baja confianza",
      "precio unitario ilegible",
    ],
    items: [
      { rawDescription: "Combustible Grado 3 — Gasoil (Lt)", qty: 500, unit: "lt", unitPrice: null, conf: 72, matchStatus: "new_product" },
    ],
    at: "2026-05-23T10:00:00",
  });

  // Item sin match en catálogo (Semolín extrafino) + item matcheado
  await mkDoc({
    cuit: "30-50001091-2", supplierName: "Molinos Río de la Plata SA",
    type: "remito", num: "R-0001-00012307", date: "2026-05-23",
    status: "review_needed", conf: 82, warnings: [],
    items: [
      { rawDescription: "Semolín extrafino x 50kg",                qty: 100, unit: "kg", unitPrice: 95, conf: 84, matchStatus: "new_product" },
      { productCode: "HAR-000", rawDescription: "Harina 000 x 50kg", qty: 100, unit: "kg", unitPrice: 93, conf: 83, matchStatus: "matched", matchScore: 97 },
    ],
    at: "2026-05-23T11:00:00",
  });

  // Review común — sello superpuesto sobre la fecha
  await mkDoc({
    cuit: "30-50467970-5", supplierName: "Mastellone Hnos SA",
    type: "remito", num: "R-0001-00012308", date: "2026-05-23",
    status: "review_needed", conf: 85,
    warnings: ["sello del proveedor parcialmente superpuesto con la fecha"],
    items: [
      { productCode: "LEC-001", rawDescription: "Leche entera UAT 1L",  qty: 100, unit: "un", unitPrice: 555,  conf: 86, matchStatus: "matched", matchScore: 99 },
      { productCode: "QUE-MUZ", rawDescription: "Queso muzzarella 4kg", qty: 10,  unit: "un", unitPrice: 9600, conf: 84, matchStatus: "matched", matchScore: 95 },
    ],
    at: "2026-05-23T12:00:00",
  });

  // ── Rejected ─────────────────────────────────────────────────────────────

  await mkDoc({
    cuit: "30-50673622-0", supplierName: "Cartocor SA",
    type: "remito", num: "R-0001-00021800", date: "2025-12-15",
    status: "rejected", conf: 67,
    warnings: [
      "imagen completamente fuera de foco — imposible extraer datos confiables",
      "número de documento ilegible",
    ],
    items: [
      { productCode: "CAJ-30", rawDescription: "Cajas corrugadas (tipo y cantidad ilegibles)", qty: 500, unit: "un", unitPrice: null, conf: 55, matchStatus: "matched", matchScore: 82 },
    ],
    at: "2025-12-15T15:00:00",
  });

  // ─── ACTUALIZAR STOCKONHAND ──────────────────────────────────────────────
  let stockUpdates = 0;
  for (const [code, finalBal] of Object.entries(bal)) {
    if (finalBal > 0) {
      await prisma.product.update({
        where: { tenantId_code: { tenantId: tenant.id, code } },
        data: { stockOnHand: finalBal },
      });
      stockUpdates++;
    }
  }
  console.log(`✓ Stock actualizado en ${stockUpdates} productos\n`);

  // ─── RESUMEN FINAL ──────────────────────────────────────────────────────
  const docTotal = await prisma.document.count({ where: { tenantId: tenant.id } });
  const movTotal = await prisma.stockMovement.count({ where: { tenantId: tenant.id } });
  const auditTotal = await prisma.auditLog.count({ where: { tenantId: tenant.id } });

  const harK = await prisma.product.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code: "HAR-000"  } }, select: { stockOnHand: true } });
  const lecK = await prisma.product.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code: "LEC-001"  } }, select: { stockOnHand: true } });
  const cajK = await prisma.product.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code: "CAJ-30"   } }, select: { stockOnHand: true } });
  const aceK = await prisma.product.findUnique({ where: { tenantId_code: { tenantId: tenant.id, code: "ACE-GIR"  } }, select: { stockOnHand: true } });

  console.log("─".repeat(52));
  console.log("SEED DEMO — RESUMEN");
  console.log("─".repeat(52));
  console.log(`Tenant:      ${tenant.name}  (slug: demo)`);
  console.log(`Proveedores: ${SUPS.length}`);
  console.log(`Productos:   ${PRODS.length}`);
  console.log(`Documentos:  ${docTotal}  (19 aprobados · 3 revisión · 1 rechazado)`);
  console.log(`Movimientos: ${movTotal}`);
  console.log(`Audit logs:  ${auditTotal}`);
  console.log("");
  console.log("Stock verificado:");
  console.log(`  HAR-000  Harina 000:    ${harK?.stockOnHand} kg   (esperado: 800)`);
  console.log(`  LEC-001  Leche UAT:     ${lecK?.stockOnHand} un   (esperado: 600)`);
  console.log(`  CAJ-30   Caja 30x20:    ${cajK?.stockOnHand} un   (esperado: 2000)`);
  console.log(`  ACE-GIR  Aceite:        ${aceK?.stockOnHand} un   (esperado: 500)`);
  console.log("");
  console.log("Login:  admin@demo.com  /  password123");
  console.log("─".repeat(52));
}

main()
  .catch((e: unknown) => {
    console.error("Error en seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
