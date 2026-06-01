# Mata Remitos

> Sistema multi-tenant para PyMEs argentinas que automatiza la carga de remitos y facturas mediante visión por IA.

El operario saca una foto del remito con el celular. La IA extrae todos los datos estructurados, los valida contra reglas de negocio argentinas (CUIT, duplicados, confianza), y actualiza el stock automáticamente — sin tipear nada.

---

## ¿Cómo funciona?

```
📱 Foto del remito
        │
        ▼
  POST /api/remitos/upload
        │
        ▼
   BullMQ queue ──► Worker OCR
                         │
              ┌──────────┼──────────┐
              │          │          │
         Gemini 2.5  Claude 4.6   Mock
         (primario)  (fallback)   (dev)
              │
              ▼
    Extracción estructurada
    proveedor · ítems · precios · fecha
    confianza por campo (0–100)
              │
         ¿Conf. ≥ 85%?
        /             \
      NO              SÍ
      │                │
  Cola de          Stock actualizado
  revisión         automáticamente
  humana
      │
  Aprobar / Rechazar
  (con audit log)
      │
      ▼
  Notificación email / WhatsApp
```

---

## Features

| Feature | Estado |
|---|---|
| Multi-tenancy — aislamiento completo por empresa | ✅ |
| Upload de imagen (JPG, PNG, PDF) | ✅ |
| OCR con Gemini 2.5 Flash + fallback Claude Sonnet | ✅ |
| Score de confianza por campo (0–100) | ✅ |
| Fuzzy matching de productos contra catálogo | ✅ |
| Validación de CUIT argentino (dígito verificador) | ✅ |
| Detección de duplicados (nro + CUIT + fecha) | ✅ |
| Cola de revisión humana | ✅ |
| Aprobar / rechazar con override y audit log | ✅ |
| Actualización de stock al aprobar | ✅ |
| Alertas de stock bajo mínimo | ✅ |
| Dashboard con KPIs y gráficos (Recharts) | ✅ |
| Exportación Excel / CSV | ✅ |
| CRUD productos y proveedores | ✅ |
| Notificaciones email (Resend) | ✅ |
| Dark mode completo | ✅ |
| Buscador global Cmd+K | ✅ |
| Atajos de teclado en revisión | ✅ |
| Skeleton loaders + empty states | ✅ |
| WhatsApp Business API | 🔜 |
| Deploy a producción | 🔜 |

---

## Stack

| Capa | Tecnología |
|---|---|
| **Backend** | Node.js 20 + TypeScript strict + Fastify |
| **ORM / DB** | Prisma + PostgreSQL 16 |
| **Frontend** | Next.js 15 App Router + Tailwind CSS + shadcn/ui |
| **Data fetching** | TanStack Query v5 |
| **Cola de jobs** | BullMQ + Redis |
| **IA primaria** | Gemini 2.5 Flash |
| **IA fallback** | Claude Sonnet 4.6 (Anthropic) |
| **Storage** | Cloudflare R2 en prod · MinIO en dev |
| **Email** | Resend |
| **Validación** | Zod (runtime + tipos) |
| **Monorepo** | pnpm workspaces |

---

## Estructura del proyecto

```
mata-remitos/
├── packages/
│   ├── api/                          # Backend Fastify
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # Schema multi-tenant completo
│   │   │   ├── migrations/
│   │   │   └── seed.ts               # Datos de prueba realistas
│   │   └── src/
│   │       ├── features/
│   │       │   ├── auth/             # JWT + registro + login + refresh
│   │       │   ├── remitos/          # Upload, review queue, export
│   │       │   │   ├── routes.ts
│   │       │   │   ├── service.ts
│   │       │   │   ├── review-service.ts
│   │       │   │   ├── validation-service.ts
│   │       │   │   ├── export-service.ts
│   │       │   │   └── schemas.ts
│   │       │   ├── ocr/              # Pipeline de extracción IA
│   │       │   │   ├── pipeline.ts
│   │       │   │   ├── preprocessor.ts
│   │       │   │   └── adapters/     # Gemini + Claude + Mock
│   │       │   ├── productos/        # CRUD catálogo + movimientos
│   │       │   ├── proveedores/      # CRUD proveedores
│   │       │   ├── stock/            # Alertas críticas y en riesgo
│   │       │   ├── dashboard/        # KPIs, gráficos, actividad reciente
│   │       │   └── notifications/    # Templates + colas email
│   │       ├── infrastructure/
│   │       │   ├── db.ts             # Prisma singleton
│   │       │   ├── redis.ts          # Redis singleton
│   │       │   ├── storage.ts        # S3-compatible (R2/MinIO)
│   │       │   ├── queue.ts          # Cola document.process
│   │       │   └── notification-queue.ts
│   │       ├── workers/
│   │       │   ├── document.worker.ts       # OCR + fuzzy match + validaciones
│   │       │   ├── notification.worker.ts   # Envío de emails
│   │       │   └── daily-report.worker.ts   # Cron 8:00 UTC
│   │       ├── middleware/
│   │       │   ├── auth.ts           # JWT verify
│   │       │   ├── tenant.ts         # Multi-tenant isolation
│   │       │   └── error-handler.ts  # Errores tipados → HTTP
│   │       └── shared/
│   │           ├── config.ts         # Validación de env con Zod al startup
│   │           └── errors.ts         # ValidationError, DuplicateError, etc.
│   └── web/                          # Frontend Next.js 15
│       └── src/
│           ├── app/
│           │   ├── (auth)/           # /login, /register
│           │   └── (dashboard)/      # Páginas protegidas
│           │       ├── dashboard/    # KPIs y gráficos
│           │       ├── remitos/      # Listado + vista detalle
│           │       ├── productos/    # Catálogo con stock
│           │       ├── proveedores/  # Gestión de proveedores
│           │       └── stock/        # Alertas de stock
│           ├── components/
│           │   ├── features/         # CommandPalette, ConfidenceBadge, etc.
│           │   ├── shared/           # Sidebar, Topbar
│           │   └── ui/               # shadcn/ui + Skeleton + DataTable
│           ├── hooks/                # useAuth, useDebounce, useKeyboardShortcuts
│           └── lib/
│               ├── api.ts            # Cliente HTTP tipado (con retry + refresh)
│               └── auth-store.ts     # Sesión en localStorage
├── docker-compose.yml
├── .env.example
└── pnpm-workspace.yaml
```

---

## Setup local

### Pre-requisitos

- **Node.js 20+**
- **Docker Desktop**
- **pnpm** → `npm install -g pnpm`

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/LautaroLam24/Mata_Remitos.git
cd Mata_Remitos
pnpm install
```

### 2. Variables de entorno

```bash
cp .env.example packages/api/.env
```

Editá `packages/api/.env` con los valores mínimos para desarrollo:

```env
# Base de datos y Redis — levantados con Docker, no tocar
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mataremitos"
REDIS_URL="redis://localhost:6379"

# Auth — cambiá esto en producción
JWT_SECRET="minimo-32-caracteres-aleatorios-cambiar-en-prod"

# IA — usá mock en dev para no gastar créditos
OCR_MOCK=true
# GEMINI_API_KEY="AIza..."     # aistudio.google.com (gratis)
# ANTHROPIC_API_KEY="sk-..."   # console.anthropic.com

# Storage — MinIO local ya configurado con Docker
STORAGE_ENDPOINT="http://localhost:9000"
STORAGE_BUCKET="mata-remitos"
STORAGE_ACCESS_KEY="minioadmin"
STORAGE_SECRET_KEY="minioadmin"
STORAGE_REGION="us-east-1"
STORAGE_PUBLIC_URL="http://localhost:9000/mata-remitos"

# Frontend
NEXT_PUBLIC_API_URL="http://localhost:3000"

# Email — opcional, sin key se loguea en consola
# RESEND_API_KEY="re_..."
# RESEND_FROM_EMAIL="Mata Remitos <noreply@tudominio.com>"
```

### 3. Levantar servicios de infraestructura

```bash
docker compose up -d
```

Esto levanta:
- **PostgreSQL** en `localhost:5432`
- **Redis** en `localhost:6379`
- **MinIO** (storage S3-compatible) en `localhost:9000` · consola en `localhost:9001`

### 4. Inicializar la base de datos

```bash
pnpm db:migrate   # Aplica todas las migraciones
pnpm db:seed      # Carga datos de prueba
```

El seed crea automáticamente:

| Dato | Valor |
|---|---|
| Tenant | Distribuidora El Sur |
| Usuario owner | `admin@elsur.com.ar` / `password123` |
| Usuario operario | `operario@elsur.com.ar` / `password123` |
| Proveedores | 5 proveedores con CUIT válido |
| Productos | 16 productos con stock inicial |

### 5. Crear bucket en MinIO

Abrí `http://localhost:9001` → usuario `minioadmin` / contraseña `minioadmin` → creá un bucket llamado `mata-remitos` y configuralo como público (Access Policy: Public).

### 6. Arrancar el proyecto

```bash
pnpm dev
```

| Servicio | URL |
|---|---|
| **API** (Fastify) | http://localhost:3000 |
| **Web** (Next.js) | http://localhost:3001 |
| **MinIO Console** | http://localhost:9001 |
| **Prisma Studio** | `pnpm db:studio` → http://localhost:5555 |

---

## Comandos disponibles

```bash
# Desarrollo
pnpm dev              # Backend + frontend en paralelo
pnpm dev:api          # Solo backend (tsx watch)
pnpm dev:web          # Solo frontend (next dev)

# Base de datos
pnpm db:migrate       # Aplicar migraciones pendientes
pnpm db:reset         # Reset completo (⚠️ borra todos los datos)
pnpm db:seed          # Cargar datos de prueba
pnpm db:studio        # Prisma Studio

# Calidad de código
pnpm typecheck        # TypeScript sin compilar
pnpm lint             # ESLint + Prettier
pnpm test             # Vitest (todos los packages)
```

---

## API Reference

### Autenticación

```
POST /api/auth/register   Crear tenant + usuario owner
POST /api/auth/login      → { accessToken, refreshToken, user, tenant }
POST /api/auth/refresh    Renovar access token
```

Todos los endpoints protegidos requieren header:
```
Authorization: Bearer <accessToken>
```

### Remitos

```
POST /api/remitos/upload              Subir imagen (multipart/form-data)
GET  /api/remitos/jobs/:jobId         Estado del job OCR (waiting|active|completed|failed)
GET  /api/remitos/review-queue        Cola de documentos pendientes de revisión
GET  /api/remitos                     Listar (filtros: status, supplierId, dateFrom, dateTo, search)
GET  /api/remitos/:id                 Detalle con ítems y extracción raw
GET  /api/remitos/:id/validations     Validaciones automáticas (CUIT, duplicados, confianza)
POST /api/remitos/:id/approve         Aprobar → actualiza stock + notificación
POST /api/remitos/:id/reject          Rechazar (con motivo opcional)
GET  /api/remitos/export/excel        Exportar filtrado a .xlsx
GET  /api/remitos/export/csv          Exportar filtrado a .csv
```

### Productos

```
GET    /api/productos          Listar (search, lowStock filter, paginación)
POST   /api/productos          Crear producto
GET    /api/productos/:id      Detalle + historial de movimientos de stock
PUT    /api/productos/:id      Editar (nombre, código, unidad, stock mínimo, aliases)
DELETE /api/productos/:id      Soft delete (solo si stock = 0)
```

### Proveedores

```
GET  /api/proveedores          Listar (search, paginación)
POST /api/proveedores          Crear (validación CUIT con dígito verificador)
PUT  /api/proveedores/:id      Editar
```

### Stock y Dashboard

```
GET /api/stock/alerts          Productos críticos (sin stock) y en riesgo (bajo mínimo)
GET /api/dashboard/metrics     KPIs, gráficos, alertas y actividad reciente
                               ?period=7d|30d|3m|6m|12m
```

---

## Principios de diseño

### Multi-tenancy estricto
Toda tabla del dominio lleva `tenantId`. Todas las queries filtran por tenant. Row-Level Security en PostgreSQL actúa como red de seguridad adicional.

### Score de confianza por campo
El OCR devuelve `{ value, confidence: 0–100 }` por cada campo extraído. Si algún campo crítico baja de 85, el documento va a la cola de revisión humana en vez de impactar el stock directamente.

### Idempotencia
- **Documentos:** `UNIQUE(tenantId, documentNumber, supplierCuit, date)` — el mismo remito no se puede cargar dos veces.
- **Notificaciones:** `correlationId` único por evento — los emails no se duplican aunque el job se reintente.

### Audit log completo
Cada aprobación, rechazo, movimiento de stock y decisión de IA queda registrado en `audit_logs` con timestamp, usuario y motivo. Inmutable.

### TypeScript strict
Sin `any`. Schemas Zod como única fuente de verdad para validación de input y tipos compartidos entre backend y frontend.

---

## Notificaciones

El sistema envía emails automáticamente vía [Resend](https://resend.com):

| Evento | Destinatario |
|---|---|
| Documento procesado por OCR | Owners del tenant |
| Documento aprobado | Usuario que subió el remito |
| Documento rechazado | Usuario que subió el remito |
| Stock bajo mínimo | Owners del tenant |
| Reporte diario (cron 8:00 UTC) | Owners del tenant |

Sin `RESEND_API_KEY` el sistema funciona igual — los emails se loguean en consola pero no se envían.

La capa de notificaciones está diseñada para soportar WhatsApp Business API como canal adicional (próximo paso).

---

## Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET` | ✅ | Secreto JWT (mín. 32 chars) |
| `GEMINI_API_KEY` | Para OCR real | API key de [Google AI Studio](https://aistudio.google.com) |
| `ANTHROPIC_API_KEY` | Opcional | Fallback Claude si Gemini falla |
| `OCR_MOCK` | Dev | `true` para omitir llamadas a IA |
| `STORAGE_ENDPOINT` | ✅ | Endpoint S3-compatible (MinIO o R2) |
| `STORAGE_BUCKET` | ✅ | Nombre del bucket |
| `STORAGE_ACCESS_KEY` | ✅ | Access key S3 |
| `STORAGE_SECRET_KEY` | ✅ | Secret key S3 |
| `STORAGE_PUBLIC_URL` | ✅ | URL pública base para los archivos |
| `RESEND_API_KEY` | Opcional | Para envío real de emails |
| `RESEND_FROM_EMAIL` | Opcional | Remitente verificado en Resend |
| `NEXT_PUBLIC_API_URL` | ✅ (frontend) | URL de la API desde el navegador |

---

## Licencia

Uso privado — todos los derechos reservados.
