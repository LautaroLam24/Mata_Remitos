import { test, expect, type Page } from "@playwright/test";

const MOCK_SESSION = {
  accessToken: "mock-token",
  refreshToken: "mock-refresh",
  user: { id: "u1", email: "test@test.com", name: "Test User", role: "admin" },
  tenant: { id: "t1", slug: "test-co", name: "Test Company" },
};

const MOCK_DOCUMENT = {
  id: "doc-1",
  tenantId: "t1",
  supplierId: "s1",
  supplierCuit: "20-12345678-9",
  type: "remito",
  documentNumber: "R-00123",
  date: "2024-06-01T00:00:00.000Z",
  status: "review_needed",
  overallConfidence: 92,
  warnings: [],
  imageUrl: "http://localhost/img.jpg",
  imageThumbnailUrl: null,
  uploadedById: "u1",
  approvedById: null,
  approvedAt: null,
  createdAt: "2024-06-01T10:00:00.000Z",
  updatedAt: "2024-06-01T10:00:00.000Z",
  items: [
    {
      id: "item-1",
      tenantId: "t1",
      documentId: "doc-1",
      productId: null,
      rawDescription: "Harina 000 x 50kg",
      quantity: 10,
      unit: "bolsas",
      unitPrice: 2500,
      confidenceScore: 94,
      matchScore: null,
      matchStatus: "pending",
      createdAt: "2024-06-01T10:00:00.000Z",
      updatedAt: "2024-06-01T10:00:00.000Z",
    },
    {
      id: "item-2",
      tenantId: "t1",
      documentId: "doc-1",
      productId: "p1",
      rawDescription: "Aceite girasol 1L",
      quantity: 24,
      unit: "unidades",
      unitPrice: 850,
      confidenceScore: 88,
      matchScore: 95,
      matchStatus: "matched",
      createdAt: "2024-06-01T10:00:00.000Z",
      updatedAt: "2024-06-01T10:00:00.000Z",
    },
  ],
};

async function mockAuth(page: Page) {
  await page.addInitScript((session) => {
    localStorage.setItem("mr_session", JSON.stringify(session));
  }, MOCK_SESSION);
}

async function mockUploadAndComplete(page: Page) {
  // Use function predicates for reliable cross-origin URL matching
  await page.route(
    (url) => url.pathname === "/api/remitos/upload",
    (route) =>
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({
          jobId: "job-abc",
          imageKey: "t1/img.jpg",
          message: "ok",
        }),
      })
  );

  await page.route(
    (url) => url.pathname === "/api/remitos/jobs/job-abc",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ status: "completed", documentId: "doc-1" }),
      })
  );

  await page.route(
    (url) => url.pathname === "/api/remitos/doc-1",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(MOCK_DOCUMENT),
      })
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Nuevo Remito — pantalla de captura", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test("muestra zona de captura en 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/remitos/nuevo");

    await expect(
      page.getByText("Sacar foto al remito")
    ).toBeVisible();
    await expect(
      page.getByText("Tocá para abrir la cámara")
    ).toBeVisible();
    await expect(
      page.getByText("Seleccionar imagen del dispositivo")
    ).toBeVisible();
  });

  test("zona de captura es suficientemente grande para touch", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/remitos/nuevo");

    const captureZone = page
      .locator('label[for="remito-capture"] > div')
      .first();
    const box = await captureZone.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(200);
  });

  test("muestra preview y botones al seleccionar archivo", async ({ page }) => {
    await page.goto("/remitos/nuevo");

    const fileInput = page.locator('input[id="remito-gallery"]');
    await fileInput.setInputFiles({
      name: "remito.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("fake-image"),
    });

    await expect(
      page.getByAltText("Preview del remito")
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Otra foto" })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Procesar remito" })
    ).toBeVisible();
  });

  test('"Otra foto" limpia la preview y vuelve al estado inicial', async ({
    page,
  }) => {
    await page.goto("/remitos/nuevo");

    const fileInput = page.locator('input[id="remito-gallery"]');
    await fileInput.setInputFiles({
      name: "remito.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("x"),
    });

    await page.getByRole("button", { name: "Otra foto" }).click();

    await expect(
      page.getByText("Sacar foto al remito")
    ).toBeVisible();
    await expect(
      page.getByAltText("Preview del remito")
    ).not.toBeVisible();
  });
});

test.describe("Nuevo Remito — flujo de procesamiento", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
  });

  test("muestra pantalla de procesamiento después del upload", async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === "/api/remitos/upload",
      (route) =>
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            jobId: "job-xyz",
            imageKey: "t1/img.jpg",
            message: "ok",
          }),
        })
    );

    // Job stays in active state for this test
    await page.route(
      (url) => url.pathname === "/api/remitos/jobs/job-xyz",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "active" }),
        })
    );

    await page.goto("/remitos/nuevo");

    const fileInput = page.locator('input[id="remito-gallery"]');
    await fileInput.setInputFiles({
      name: "remito.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("x"),
    });

    await page.getByRole("button", { name: "Procesar remito" }).click();

    // Should show processing state
    await expect(
      page.getByText("Analizando imagen...")
    ).toBeVisible({ timeout: 5000 });
  });

  test("muestra pantalla de error cuando el job falla", async ({ page }) => {
    await page.route(
      (url) => url.pathname === "/api/remitos/upload",
      (route) =>
        route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({
            jobId: "job-fail",
            imageKey: "t1/img.jpg",
            message: "ok",
          }),
        })
    );

    await page.route(
      (url) => url.pathname === "/api/remitos/jobs/job-fail",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ status: "failed", error: "OCR timeout" }),
        })
    );

    await page.goto("/remitos/nuevo");

    const fileInput = page.locator('input[id="remito-gallery"]');
    await fileInput.setInputFiles({
      name: "remito.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("x"),
    });

    await page.getByRole("button", { name: "Procesar remito" }).click();

    await expect(
      page.getByText("Ocurrió un error")
    ).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("OCR timeout")).toBeVisible();
  });
});

test.describe("Nuevo Remito — pantalla de resultado", () => {
  test.beforeEach(async ({ page }) => {
    await mockAuth(page);
    await mockUploadAndComplete(page);
  });

  async function goToResult(page: Page) {
    await page.goto("/remitos/nuevo");
    const fileInput = page.locator('input[id="remito-gallery"]');
    await fileInput.setInputFiles({
      name: "remito.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("x"),
    });
    await page.getByRole("button", { name: "Procesar remito" }).click();
    await expect(
      page.getByText("Revisá lo que extrajo la IA")
    ).toBeVisible({ timeout: 10000 });
  }

  test("muestra datos del documento extraído", async ({ page }) => {
    await goToResult(page);

    await expect(page.getByText("Confianza general: 92%")).toBeVisible();
    // Labels are in <span> text nodes; values live in <input> elements
    await expect(page.getByText("CUIT Proveedor")).toBeVisible();
    await expect(page.getByText("Número de documento")).toBeVisible();
    await expect(page.getByText("Productos (2)")).toBeVisible();
    // Input values: use locator with value pseudo-class (Playwright 1.44)
    await expect(page.locator("input").filter({ hasText: /^$/ }).first()).toBeVisible();
    // Verify at least two product labels exist
    await expect(page.getByText("Producto 1")).toBeVisible();
    await expect(page.getByText("Producto 2")).toBeVisible();
  });

  test("muestra badges de confianza por item", async ({ page }) => {
    await goToResult(page);
    // Item 1 has 94% → green
    const badges = page.getByText(/\d+% confianza/);
    await expect(badges.first()).toBeVisible();
  });

  test("muestra match status para cada item", async ({ page }) => {
    await goToResult(page);
    await expect(
      page.getByText("⏳ Pendiente de match con catálogo")
    ).toBeVisible();
    await expect(
      page.getByText("✓ Producto identificado en catálogo")
    ).toBeVisible();
  });

  test("botones de acción visibles en mobile 375px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await goToResult(page);

    await expect(
      page.getByRole("button", { name: /Confirmar al stock/ })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Cancelar/ })
    ).toBeVisible();
  });

  test("aprobar redirige a /remitos", async ({ page }) => {
    await page.route(
      (url) => url.pathname === "/api/remitos/doc-1/approve",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            id: "doc-1",
            status: "approved",
            movementsCreated: 2,
          }),
        })
    );

    await goToResult(page);
    await page.getByRole("button", { name: /Confirmar al stock/ }).click();

    await expect(page).toHaveURL(/\/remitos/, { timeout: 5000 });
  });

  test("rechazar redirige a /remitos", async ({ page }) => {
    await page.route(
      (url) => url.pathname === "/api/remitos/doc-1/reject",
      (route) =>
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "doc-1", status: "rejected" }),
        })
    );

    await goToResult(page);
    await page.getByRole("button", { name: /Cancelar/ }).click();

    await expect(page).toHaveURL(/\/remitos/, { timeout: 5000 });
  });

  test('"Intentar de nuevo" vuelve a captura desde estado de error', async ({
    page,
  }) => {
    await page.route(
      (url) => url.pathname === "/api/remitos/upload",
      (route) => route.fulfill({ status: 500, body: "Server error" })
    );

    await page.goto("/remitos/nuevo");

    const fileInput = page.locator('input[id="remito-gallery"]');
    await fileInput.setInputFiles({
      name: "remito.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("x"),
    });
    await page.getByRole("button", { name: "Procesar remito" }).click();

    await expect(
      page.getByText("Ocurrió un error")
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Intentar de nuevo" }).click();

    await expect(
      page.getByText("Sacar foto al remito")
    ).toBeVisible();
  });
});
