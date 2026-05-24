# Mata-Remitos

> Sistema multi-tenant para PyMEs argentinas. Carga remitos y facturas sacándoles una foto. La IA extrae los datos, valida contra reglas de negocio, y actualiza stock automáticamente.

## Stack

- **Backend:** Node.js 20 + TypeScript + Fastify + Prisma + PostgreSQL 16
- **Frontend:** Next.js 15 + Tailwind + shadcn/ui + TanStack Query
- **IA:** Gemini 2.5 Flash (primario) + Claude Sonnet 4.6 (fallback)
- **Cola:** BullMQ + Redis
- **Storage:** Cloudflare R2
- **Notificaciones:** WhatsApp Business API

## Arranque rápido

### 1. Pre-requisitos

- Node.js 20+
- Docker + Docker Compose
- pnpm (recomendado): `npm install -g pnpm`

### 2. Setup

```bash
# Clonar y entrar
cd mata-remitos

# Instalar deps
pnpm install

# Levantar Postgres + Redis local
docker compose up -d

# Copiar y editar variables de entorno
cp .env.example .env
# Editar .env con tus API keys (Gemini, Anthropic, R2, WhatsApp)

# Migrar BD
pnpm db:migrate
pnpm db:seed

# Desarrollo
pnpm dev
```

## Cómo trabajar con Claude Code en este proyecto

Este proyecto está optimizado para desarrollo con Claude Code usando **subagentes especializados**.

### Workflow recomendado

Para tareas complejas, en vez de pedirle a Claude que haga todo, **delegá a subagentes**:

```
"Necesito implementar el endpoint POST /api/remitos/upload.
Dividí el trabajo:
- db-architect: revisá si el schema necesita ajustes
- api-developer: armá la ruta Fastify con validación
- ocr-specialist: integrá el pipeline de extracción
- qa-tester: escribí los tests
Coordina y sintetizá al final."
```

Claude va a lanzar los subagentes en paralelo donde sea posible, lo que **ahorra tokens y tiempo**.

### Skills disponibles

Las skills en `.claude/skills/` son referencias técnicas que Claude lee automáticamente cuando son relevantes:

- `ocr-extractor`: prompts y pipeline de extracción.
- `validation-rules`: reglas de negocio (CUIT, fuzzy match, duplicados).
- `whatsapp-notifier`: integración WhatsApp.
- `db-schema-designer`: patrones multi-tenant.
- `api-builder`: patrones Fastify + Zod.
- `frontend-builder`: patrones Next.js + shadcn.

## Estructura del proyecto

```
.claude/
├── agents/                    # Subagentes especializados
└── skills/                    # Skills técnicas
docs/
├── business-rules.md          # Reglas de negocio
├── architecture.md            # Decisiones arquitectónicas
└── deployment.md              # Cómo desplegar a producción
src/
├── features/                  # Código por dominio
├── infrastructure/            # Clientes externos (DB, AI, Storage)
├── middleware/
└── shared/
prisma/
├── schema.prisma
├── migrations/
└── rls.sql                    # Row-Level Security
test/
├── fixtures/                  # Datos de prueba
├── unit/
├── integration/
└── e2e/
docker-compose.yml             # Postgres + Redis local
```

## Comandos útiles

```bash
pnpm dev              # Backend + frontend en paralelo
pnpm dev:api          # Solo backend
pnpm dev:web          # Solo frontend

pnpm db:migrate       # Aplicar migraciones
pnpm db:reset         # Reset completo (CUIDADO: borra todo)
pnpm db:seed          # Cargar datos de prueba
pnpm db:studio        # Abrir Prisma Studio

pnpm test             # Todos los tests
pnpm test:unit        # Solo unitarios
pnpm test:e2e         # End-to-end

pnpm typecheck        # Chequeo de tipos
pnpm lint             # ESLint
pnpm format           # Prettier
```

## Roadmap del MVP

### Fase 1 — Núcleo (semanas 1-2)
- [ ] Setup proyecto + CI/CD
- [ ] Schema Prisma + migraciones
- [ ] Auth (JWT + multi-tenant)
- [ ] Endpoint upload + pipeline OCR
- [ ] Pantalla captura de foto

### Fase 2 — Validación y stock (semanas 3-4)
- [ ] Reglas de validación
- [ ] Matching de productos
- [ ] Cola de revisión humana
- [ ] Update de stock con audit log

### Fase 3 — Notificaciones (semana 5)
- [ ] Integración WhatsApp
- [ ] Templates aprobados
- [ ] Alertas de stock bajo

### Fase 4 — Dashboard + reportes (semana 6)
- [ ] Dashboard productos
- [ ] Reporte diario automático
- [ ] Métricas de uso

### Fase 5 — Deploy + primer cliente (semana 7-8)
- [ ] Deploy a Railway/Fly.io
- [ ] Onboarding del primer cliente
- [ ] Capacitación

## Modelo de negocio

| Plan | Precio AR$/mes | Docs/mes | Usuarios |
|---|---|---|---|
| Starter | $50.000-80.000 | 200 | 1 |
| Pro | $120.000-180.000 | 1.000 | 5 |
| Enterprise | $250.000+ | Ilimitado | Ilimitado |

Setup fee inicial: $200.000-400.000.
