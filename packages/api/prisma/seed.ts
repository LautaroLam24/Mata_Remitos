/**
 * Seed idempotente para mata-remitos.
 * Estrategia: upsert en todos los modelos.
 * Para correr: pnpm --filter @mr/api db:seed
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Hash de "password123" generado con bcryptjs (cost=10) — solo para desarrollo local.
const DEV_PASSWORD_HASH =
  "$2b$10$sZp1MIDkLwREKh29.3L8suKTVCYG02Eo8OODRLZwf9Zt29ZTNOfOm";

async function main() {
  console.log("Iniciando seed...\n");

  // ─── TENANT ────────────────────────────────────────────────────────────────
  const tenant = await prisma.tenant.upsert({
    where: { slug: "distribuidora-el-sur" },
    update: {},
    create: {
      slug: "distribuidora-el-sur",
      name: "Distribuidora El Sur",
      plan: "pro",
      config: {
        autoProcessThreshold: 85,
        fuzzyMatchThreshold: 80,
        lowStockDaysAlert: 7,
        dailyReportTime: "08:00",
        dailyReportTimezone: "America/Argentina/Buenos_Aires",
        whatsappRecipients: ["+5491112345678"],
      },
    },
  });
  console.log(`✓ Tenant: ${tenant.name} (${tenant.id})`);

  // ─── USUARIOS ──────────────────────────────────────────────────────────────
  const owner = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "admin@elsur.com.ar" } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "admin@elsur.com.ar",
      name: "Carlos Mendez",
      passwordHash: DEV_PASSWORD_HASH,
      role: "owner",
      phone: "+5491112345678",
    },
  });
  console.log(`✓ User (owner): ${owner.name}`);

  const operario = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: "operario@elsur.com.ar" } },
    update: {},
    create: {
      tenantId: tenant.id,
      email: "operario@elsur.com.ar",
      name: "Juan García",
      passwordHash: DEV_PASSWORD_HASH,
      role: "user",
      phone: "+5491187654321",
    },
  });
  console.log(`✓ User (operario): ${operario.name}`);

  // ─── PROVEEDORES ───────────────────────────────────────────────────────────
  const supplierData = [
    {
      cuit: "30-71234567-8",
      name: "Alimentos Del Norte SA",
      email: "ventas@alimentosdelnorte.com.ar",
      phone: "+5491155551234",
      address: "Av. Corrientes 1234, CABA",
    },
    {
      cuit: "30-68904942-4",
      name: "Distribuidora Rápida SRL",
      email: "pedidos@distrapida.com.ar",
      phone: "+5491166669876",
      address: "Ruta 8 km 45, GBA Norte",
    },
    {
      cuit: "20-35678901-4",
      name: "Juan Pérez (Monotributo)",
      phone: "+5491177778888",
    },
    {
      cuit: "30-71234567-9",
      name: "Distribuidora La Popular S.A.",
      address: "Av. Rivadavia 4521, CABA",
    },
    {
      cuit: "30-65432198-2",
      name: "Mayorista El Sol S.R.L.",
      address: "Belgrano 2245, Avellaneda",
    },
  ];

  for (const s of supplierData) {
    const supplier = await prisma.supplier.upsert({
      where: { tenantId_cuit: { tenantId: tenant.id, cuit: s.cuit } },
      update: {},
      create: { tenantId: tenant.id, ...s },
    });
    console.log(`✓ Supplier: ${supplier.name} (${supplier.cuit})`);
  }

  // ─── PRODUCTOS ─────────────────────────────────────────────────────────────
  const productData = [
    {
      code: "ARR-001",
      name: "Arroz Blanco 1kg",
      unit: "un",
      stockOnHand: 150,
      minStock: 20,
      aliases: ["arroz blanco", "arroz 1kg"],
      typicalRange: { min: 10, max: 500 },
    },
    {
      code: "ACE-001",
      name: "Aceite Girasol 900ml",
      unit: "un",
      stockOnHand: 80,
      minStock: 15,
      aliases: ["aceite girasol", "aceite 900"],
      typicalRange: { min: 5, max: 200 },
    },
    {
      code: "AZU-001",
      name: "Azúcar 1kg",
      unit: "un",
      stockOnHand: 200,
      minStock: 30,
      aliases: ["azucar", "azúcar 1kg"],
      typicalRange: { min: 10, max: 600 },
    },
    {
      code: "HAR-001",
      name: "Harina 0000 1kg",
      unit: "un",
      stockOnHand: 120,
      minStock: 25,
      aliases: ["harina 0000", "harina 1kg"],
      typicalRange: { min: 10, max: 400 },
    },
    {
      code: "FID-001",
      name: "Fideos Spaghetti 500g",
      unit: "un",
      stockOnHand: 90,
      minStock: 20,
      aliases: ["fideos spaghetti", "spaghetti 500"],
      typicalRange: { min: 5, max: 300 },
    },
    {
      code: "SAL-001",
      name: "Sal Fina 500g",
      unit: "un",
      stockOnHand: 180,
      minStock: 40,
      aliases: ["sal fina", "sal 500"],
      typicalRange: { min: 10, max: 500 },
    },
    {
      code: "PUR-001",
      name: "Puré de Tomate 520g",
      unit: "un",
      stockOnHand: 60,
      minStock: 15,
      aliases: ["pure tomate", "puré tomate"],
      typicalRange: { min: 5, max: 200 },
    },
    {
      code: "LEC-001",
      name: "Leche Entera 1L",
      unit: "un",
      stockOnHand: 40,
      minStock: 10,
      aliases: ["leche entera", "leche 1L"],
      typicalRange: { min: 5, max: 150 },
    },
    {
      code: "MAI-001",
      name: "Maizena 500g",
      unit: "un",
      stockOnHand: 75,
      minStock: 20,
      aliases: ["maizena", "fecula maiz"],
      typicalRange: { min: 5, max: 250 },
    },
    {
      code: "VIN-001",
      name: "Vinagre Blanco 500ml",
      unit: "un",
      stockOnHand: 35,
      minStock: 10,
      aliases: ["vinagre blanco", "vinagre 500"],
      typicalRange: { min: 5, max: 120 },
    },
    {
      code: "DET-001",
      name: "Detergente concentrado 5 LT",
      unit: "un",
      stockOnHand: 30,
      minStock: 10,
      aliases: ["detergente concentrado", "detergente 5L", "detergente 5 litros"],
      typicalRange: { min: 5, max: 100 },
    },
    {
      code: "LAV-002",
      name: "Lavandina 4 LT con jabón",
      unit: "un",
      stockOnHand: 45,
      minStock: 15,
      aliases: ["lavandina 4L", "lavandina con jabon", "lavandina jabón"],
      typicalRange: { min: 5, max: 150 },
    },
    {
      code: "PAP-004",
      name: "Papel higiénico 4 unidades x 30 mts",
      unit: "fardo",
      stockOnHand: 20,
      minStock: 8,
      aliases: ["papel higienico 4u", "papel higienico 30m", "papel toilet 4u"],
      typicalRange: { min: 2, max: 80 },
    },
    {
      code: "JAB-008",
      name: "Jabón en polvo 3 kg multiacción",
      unit: "un",
      stockOnHand: 25,
      minStock: 10,
      aliases: ["jabon en polvo 3kg", "jabón polvo multiaccion", "detersor 3kg"],
      typicalRange: { min: 5, max: 120 },
    },
    {
      code: "ESP-012",
      name: "Esponja doble cara x 3 unidades",
      unit: "blister",
      stockOnHand: 60,
      minStock: 20,
      aliases: ["esponja doble cara", "esponja x3", "esponja verde amarilla"],
      typicalRange: { min: 6, max: 200 },
    },
    {
      code: "LMP-007",
      name: "Limpiador multiuso 1L cítrico",
      unit: "un",
      stockOnHand: 35,
      minStock: 15,
      aliases: ["limpiador multiuso", "limpiador citrico 1L", "multiuso citrico"],
      typicalRange: { min: 5, max: 150 },
    },
  ];

  for (const p of productData) {
    const product = await prisma.product.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: p.code } },
      update: { name: p.name, aliases: p.aliases, typicalRange: p.typicalRange, minStock: p.minStock },
      create: { tenantId: tenant.id, ...p },
    });
    console.log(`✓ Product: [${product.code}] ${product.name} — stock: ${product.stockOnHand}`);
  }

  console.log("\nSeed completado exitosamente.");
  console.log(`Tenant ID: ${tenant.id}`);
  console.log(`Owner ID:  ${owner.id}`);
  console.log(`Operario ID: ${operario.id}`);
}

main()
  .catch((error: unknown) => {
    console.error("Error en seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
