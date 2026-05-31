# Mata Remitos

Sistema multi-tenant para PyMEs argentinas que automatiza la carga de remitos y facturas mediante visión por IA. El operario saca una foto con el celular, la IA extrae los datos, valida contra reglas de negocio, y actualiza el stock automáticamente.

---

## Cómo funciona

```
Foto del remito
      │
      ▼
  API /upload  →  BullMQ  →  Worker OCR
                                │
                    ┌───────────┼───────────┐
                    │           │           │
               Gemini 2.5   Claude 4.6   Mock
               (primario)   (fallback)   (dev)
                    │
                    ▼
            Extracción estructurada
            (proveedor, ítems, precios, fecha)
                    │
                    ▼
          Fuzzy matching contra catálogo
          confianza por campo (0-100)
                    │
               ¿Confianza ≥ 85%?
              /                \
            NO                  SÍ
            │                   │
       Cola de              Auto-procesar
       revisión             (futuro)
            │
     Revisión humana
     (aprobar / rechazar)
            │
            ▼
     Stock actualizado
     + Notificación email
```

---

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20 + TypeScript strict + Fastify |
| ORM / DB | Prisma + PostgreSQL 16 |
| Frontend | Next.js 15 (App Router) + Tailwind + shadcn/ui |
| Data fetching | TanStack Query |
| Cola de jobs | BullMQ + Redis |
| IA primaria | Gemini 2.5 Flash |
| IA fallback | Claude Sonnet 4.6 (Anthropic) |
| Storage | Cloudflare R2 (o MinIO local) |
| Email | Resend (3.000 emails/mes gratis) |
| Validación | Zod (runtime + tipos) |

---

## Estructura del proyecto

```
mata-remitos/
├── packages/
│   ├── api/                      # Backend Fastify
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── src/
│   │       ├── features/
│   │       │   ├── auth/         # JWT + registro + login
│   │       │   ├── remitos/      # Upload, review queue, aprobar/rechazar
│   │       │   ├── productos/    # CRUD catálogo
│   │       │   ├── proveedores/  # CRUD proveedores
│   │       │   ├── stock/        # Alertas de stock
│   │       │   ├── ocr/          # Pipeline de extracción IA
│   │       │   ├── dashboard/    # Métricas
│   │       │   └── notifications/# Templates email + service
│   │       ├── infrastructure/
│   │       │   ├── ai/           # Adapters Gemini y Claude
│   │       │   ├── email/        # Adapter Resend
│   │       │   ├── db.ts         # Prisma client singleton
│   │       │   ├── redis.ts      # Redis singleton
│   │       │   ├── storage.ts    # S3-compatible (R2/MinIO)
│   │       │   ├── queue.ts      # Cola document.process
│   │       │   └── notification-queue.ts
│   │       ├── workers/
│   │       │   ├── document.worker.ts      # Procesa OCR
│   │       │   ├── notification.worker.ts  # Envía emails
│   │       │   └── daily-report.worker.ts  # Cron 8:00 UTC
│   │       ├── middleware/
│   │       │   ├── auth.ts
│   │       │   ├── tenant.ts
│   │       │   └── error-handler.ts
│   │       └── shared/
│   │           ├── config.ts     # Validación de env con Zod
│   │           └── errors.ts     # Clases de error tipadas
│   └── web/                      # Frontend Next.js
│       └── src/
│           ├── app/
│           │   ├── (auth)/       # Login + registro
│           │   └── (dashboard)/  # Dashboard, remitos, productos, proveedores
│           ├── components/ui/    # shadcn/ui
│           └── lib/
│               ├── api.ts        # Cliente HTTP tipado
│               └── auth-store.ts # Session en localStorage
├── docker-compose.yml
├── .env.example
└── pnpm-workspace.yaml
```

---

## Setup local

### Pre-requisitos

- Node.js 20+
- Docker Desktop
- pnpm: `npm install -g pnpm`

### 1. Clonar e instalar

```bash
git clone <repo>
cd mata-remitos
pnpm install
```

### 2. Variables de entorno

```bash
cp .env.example packages/api/.env
```

Editá `packages/api/.env`:

```env
# Base de datos y Redis (se levantan con Docker)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/mataremitos"
REDIS_URL="redis://localhost:6379"

# Auth
JWT_SECRET="minimo-32-caracteres-cambiar-en-produccion"

# IA — elegí uno de los dos modos:
OCR_MOCK=true              # Para desarrollo sin API keys
# GEMINI_API_KEY="AIza..."  # Cuando tengas key de aistudio.google.com

# Storage (MinIO local, ya configurado)
STORAGE_ENDPOINT="http://localhost:9000"
STORAGE_BUCKET="mata-remitos"
STORAGE_ACCESS_KEY="minioadmin"
STORAGE_SECRET_KEY="minioadmin"
STORAGE_PUBLIC_URL="http://localhost:9000/mata-remitos"

# Email (opcional — si no está, los emails se loguean pero no se envían)
# RESEND_API_KEY="re_..."
# RESEND_FROM_EMAIL="Mata Remitos <noreply@tudominio.com>"
```

### 3. Levantar servicios

```bash
docker compose up -d
```

Esto levanta:
- PostgreSQL en `localhost:5432`
- Redis en `localhost:6379`
- MinIO (storage) en `localhost:9000` + consola en `localhost:9001`

### 4. Base de datos

```bash
pnpm db:migrate   # Aplica migraciones
pnpm db:seed      # Carga datos de prueba
```

El seed crea:
- Tenant: **Distribuidora El Sur**
- Usuario owner: `admin@elsur.com.ar` / `password123`
- Usuario operario: `operario@elsur.com.ar` / `password123`
- 5 proveedores y 16 productos con stock inicial

### 5. Crear bucket en MinIO

Abrí `http://localhost:9001` (usuario: `minioadmin`, contraseña: `minioadmin`), creá un bucket llamado `mata-remitos` y configuralo como público.

### 6. Arrancar

```bash
pnpm dev
```

- **API:** http://localhost:3000
- **Web:** http://localhost:3001

---

## Comandos

```bash
# Desarrollo
pnpm dev              # Backend + frontend en paralelo
pnpm dev:api          # Solo backend  (tsx watch)
pnpm dev:web          # Solo frontend (next dev)

# Base de datos
pnpm db:migrate       # Aplicar migraciones pendientes
pnpm db:reset         # Reset completo (⚠️ borra todos los datos)
pnpm db:seed          # Cargar datos de prueba
pnpm db:studio        # Prisma Studio en http://localhost:5555

# Calidad
pnpm typecheck        # TypeScript sin compilar
pnpm lint             # ESLint
pnpm test             # Vitest (todos los tests)
```

---

## API endpoints

### Auth
```
POST /api/auth/register   Crear tenant + usuario owner
POST /api/auth/login      Login → { accessToken, refreshToken }
POST /api/auth/refresh    Renovar access token
```

### Remitos
```
POST /api/remitos/upload           Subir imagen (multipart)
GET  /api/remitos/jobs/:jobId      Estado del job OCR
GET  /api/remitos/review-queue     Cola de revisión
GET  /api/remitos                  Listar con filtros
GET  /api/remitos/:id              Detalle con ítems
POST /api/remitos/:id/approve      Aprobar → actualiza stock
POST /api/remitos/:id/reject       Rechazar
```

### Productos
```
GET    /api/productos          Listar (con búsqueda y filtro lowStock)
POST   /api/productos          Crear
GET    /api/productos/:id      Detalle + movimientos de stock
PUT    /api/productos/:id      Editar
DELETE /api/productos/:id      Soft delete
```

### Proveedores
```
GET  /api/proveedores      Listar
POST /api/proveedores      Crear
PUT  /api/proveedores/:id  Editar
```

### Stock y Dashboard
```
GET /api/stock/alerts         Productos bajo stock mínimo
GET /api/dashboard/metrics    Métricas del mes actual
```

---

## Notificaciones por email

El sistema envía emails automáticamente en estos eventos:

| Evento | Destinatario | Cuándo |
|---|---|---|
| Remito procesado | Owners del tenant | Al terminar el OCR |
| Remito aprobado | Quien subió el remito | Al aprobar |
| Remito rechazado | Quien subió el remito | Al rechazar |
| Stock bajo | Owners del tenant | Al aprobar, si algún producto cae bajo mínimo |
| Reporte diario | Owners del tenant | Cron 8:00 UTC |

Para activar, agregá a `.env`:
```env
RESEND_API_KEY="re_xxxxxxxxxxxx"
RESEND_FROM_EMAIL="Mata Remitos <noreply@tudominio.com>"
```

> Sin la key el sistema funciona igual — los emails se loguean en consola pero no se envían.

La abstracción está lista para enchufar WhatsApp Business API como canal adicional.

---

## Variables de entorno completas

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | Sí | PostgreSQL connection string |
| `REDIS_URL` | Sí | Redis connection string |
| `JWT_SECRET` | Sí | Secreto JWT (mín. 32 chars) |
| `GEMINI_API_KEY` | Para OCR real | API key de Google AI Studio |
| `ANTHROPIC_API_KEY` | Opcional | Fallback Claude si Gemini falla |
| `OCR_MOCK` | Dev | `true` para saltear llamadas a IA |
| `STORAGE_ENDPOINT` | Sí | Endpoint S3-compatible |
| `STORAGE_BUCKET` | Sí | Nombre del bucket |
| `STORAGE_ACCESS_KEY` | Sí | Access key |
| `STORAGE_SECRET_KEY` | Sí | Secret key |
| `STORAGE_PUBLIC_URL` | Sí | URL pública de los archivos |
| `RESEND_API_KEY` | Opcional | Para envío real de emails |
| `RESEND_FROM_EMAIL` | Opcional | Remitente verificado en Resend |

---

## Principios de diseño

**Multi-tenancy estricto.** Toda tabla del dominio lleva `tenantId`. Todas las queries filtran por tenant. Row-Level Security en Postgres como red de seguridad.

**Score de confianza por campo.** El OCR devuelve `{ value, confidence: 0-100 }` por cada campo. Si algún campo crítico baja de 85, el documento va a revisión humana en vez de impactar stock directamente.

**Idempotencia.** Mismo número de documento + mismo CUIT + misma fecha = no se duplica. Las notificaciones usan `correlationId` para no enviarse dos veces.

**Audit log completo.** Cada aprobación, rechazo y movimiento de stock queda registrado con timestamp, usuario y motivo.

**TypeScript strict.** Sin `any`. Schemas Zod como única fuente de verdad para validación de input y tipos compartidos.

---

## Estado actual

| Módulo | Estado |
|---|---|
| Auth + multi-tenant | Completo |
| Upload + pipeline OCR | Completo (mock + Gemini + Claude fallback) |
| Matching de productos (fuzzy) | Completo |
| Cola de revisión humana | Completo |
| Aprobar / rechazar + stock | Completo |
| CRUD productos y proveedores | Completo |
| Dashboard con métricas reales | Completo |
| Notificaciones email (Resend) | Completo |
| WhatsApp Business | Pendiente |
| Deploy a producción | Pendiente |

---

## Licencia

Privado — uso interno.
