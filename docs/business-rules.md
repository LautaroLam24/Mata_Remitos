# Reglas de Negocio — Mata-Remitos

> Documento vivo. Cada cambio se discute con stakeholders y se versiona.

## 1. Entidades del dominio

### Tenant
Empresa cliente que usa el sistema. Aislamiento total entre tenants.

### Usuario (User)
Pertenece a un único tenant. Roles:
- `owner`: dueño del negocio. Acceso total.
- `admin`: encargado. Puede aprobar, configurar, ver reportes.
- `user`: operario. Puede subir documentos y consultar stock.

### Producto (Product)
Catálogo del tenant. Único por `(tenantId, code)`.
- Stock se trackea en `stockOnHand` (Decimal 12,3 para soportar fraccional).
- `aliases`: array de nombres alternativos para fuzzy match.

### Proveedor (Supplier)
Único por `(tenantId, cuit)`. CUIT validado con dígito verificador.

### Documento (Document)
Remito, factura, nota de pedido. Único por `(tenantId, documentNumber, supplierCuit, date)`.

Estados:
- `processing`: en cola de extracción.
- `review_needed`: extraído pero requiere revisión humana.
- `approved`: aprobado y aplicado al stock.
- `rejected`: rechazado (duplicado, error, no aprobado).

### Item de Documento (DocumentItem)
Línea individual del documento. Cada item se intenta matchear contra el catálogo.

Estados de match:
- `pending`: aún no procesado.
- `matched`: matcheado con confianza ≥ 80%.
- `new_product`: producto no encontrado, el usuario debe decidir.
- `rejected`: el usuario decidió no cargarlo.

## 2. Reglas de validación

### R-001: Validación de CUIT
- CUIT debe tener 11 dígitos.
- Dígito verificador debe matchear.
- Si falla → error, no se procesa documento.

### R-002: Detección de duplicados
- Combinación única: `(tenantId, documentNumber, supplierCuit, date)`.
- Si existe → error `DUPLICATE_DOCUMENT` con referencia al doc original.
- Permitir override solo a usuarios con rol `admin` u `owner`.

### R-003: Umbral de confianza
- `AUTO_PROCESS_THRESHOLD`: 85 (configurable por tenant).
- Campos críticos: `documentNumber`, `date`, `supplier.cuit`, `items[].quantity`.
- Si algún campo crítico < threshold → estado `review_needed`.
- Si overall < threshold → estado `review_needed`.

### R-004: Matching de productos
- Algoritmo: Fuse.js con threshold 0.4.
- Score ≥ 80% → match automático.
- Score 50-79% → sugerencia (usuario debe confirmar).
- Score < 50% → tratar como producto nuevo (usuario decide crear).

### R-005: Cantidades válidas
- Quantity > 0.
- Quantity ≤ 100.000 (alerta si supera, no bloquea).
- Si el producto tiene `typicalRange` y la cantidad está fuera de [min×0.1, max×10] → warning.

### R-006: Proveedor nuevo
- Si el CUIT extraído no existe en `Supplier` para ese tenant:
  - NO crear automáticamente.
  - Marcar el documento como `review_needed`.
  - El usuario debe confirmar creación del proveedor.

### R-007: Cambios en aprobación
- Al aprobar un documento, el usuario puede:
  - Modificar cantidades manualmente.
  - Cambiar el producto matcheado.
  - Marcar items como "no cargar".
- Cada cambio se loguea en `AuditLog`.

## 3. Flujo de procesamiento

```
[Upload imagen]
    ↓
[Job: document.process]
    ↓
[Preprocesar imagen]
    ↓
[Extracción Gemini Flash]
    ↓
[¿overallConfidence ≥ 85%?]
    ├─ NO → [Extracción Claude Sonnet]
    │         ↓
    │       [Merge best confidence]
    │         ↓
    └─ SÍ ─┴→ [Validación de dominio]
              ↓
            [¿Validación OK?]
              ├─ Error crítico → [Estado: rejected]
              ├─ Requiere revisión → [Estado: review_needed]
              └─ Auto-procesar → [Aplicar a stock] → [Estado: approved]
                                        ↓
                                  [Notificar WhatsApp]
```

## 4. Aplicación de stock

Cuando un documento se aprueba:

1. Por cada item con `matchStatus = matched`:
   - Crear `StockMovement` con `type = in`, `reason = document`, `reference = documentId`.
   - Actualizar `Product.stockOnHand` (transacción atómica).
2. Items con `matchStatus = new_product`:
   - Si el usuario creó el producto → crear `Product` + `StockMovement`.
   - Si no → quedar pendiente.
3. Items con `matchStatus = rejected`:
   - No mover stock, queda registrado en el documento.

Todo en una transacción Prisma. Si falla cualquier paso, rollback total.

## 5. Notificaciones

### Eventos que disparan notificación WhatsApp

| Evento | Template | Destinatario |
|---|---|---|
| Documento procesado OK | `document_processed_ok` | Quien subió |
| Documento requiere revisión | `document_needs_review` | Admins del tenant |
| Stock bajo (próximo a quebrar) | `low_stock_alert` | Owner + admins |
| Reporte diario | `daily_report` | Owner |

### Reporte diario

Se ejecuta a las 7 AM ART. Contiene:
- Ventas del día anterior (si hay integración con sistema de ventas).
- Documentos procesados / pendientes de revisión.
- Productos próximos a quebrar.
- Anomalías detectadas.

## 6. Permisos por rol

| Acción | Owner | Admin | User |
|---|---|---|---|
| Ver dashboard | ✅ | ✅ | ✅ |
| Subir documento | ✅ | ✅ | ✅ |
| Aprobar documento | ✅ | ✅ | ❌ |
| Override de duplicado | ✅ | ✅ | ❌ |
| Crear proveedor | ✅ | ✅ | ❌ |
| Crear producto | ✅ | ✅ | ❌ |
| Configurar umbrales | ✅ | ✅ | ❌ |
| Invitar usuarios | ✅ | ❌ | ❌ |
| Ver audit log | ✅ | ✅ | ❌ |
| Configurar billing | ✅ | ❌ | ❌ |

## 7. Configuración por tenant

Cada tenant puede ajustar (en `Tenant.config`):

```json
{
  "autoProcessThreshold": 85,
  "fuzzyMatchThreshold": 80,
  "criticalFields": ["documentNumber", "date", "supplier.cuit", "items[].quantity"],
  "lowStockDaysAlert": 5,
  "dailyReportTime": "07:00",
  "dailyReportTimezone": "America/Argentina/Buenos_Aires",
  "whatsappRecipients": [
    { "phone": "+549...", "events": ["document_processed_ok", "low_stock_alert"] }
  ]
}
```

## 8. Casos edge documentados

| Caso | Comportamiento |
|---|---|
| Mismo documento subido 2 veces simultáneamente | Solo uno gana (constraint único). El otro recibe `DUPLICATE_DOCUMENT`. |
| Documento con 0 items extraídos | Estado `review_needed`, warning "Sin items detectados". |
| Quantity decimal (ej 1.5kg) | Soportado (Decimal en BD). |
| Producto con código duplicado en remito (mismo código 2 veces) | Sumar cantidades, warning para revisar. |
| Proveedor sin CUIT visible | Estado `review_needed`, usuario debe ingresar CUIT manual. |
| Imagen vacía o no comercial | Rechazar con `INVALID_DOCUMENT`. |
