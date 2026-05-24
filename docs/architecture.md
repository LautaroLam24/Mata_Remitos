# Arquitectura — Decisiones técnicas

## Decisiones clave (Architecture Decision Records resumidos)

### ADR-001: Multi-tenant single-instance

**Decisión:** Una sola instancia de la app sirve a todos los tenants, aislados por `tenantId`.

**Por qué:**
- Un solo deploy a mantener.
- Costos compartidos de infraestructura.
- Releases simultáneos para todos.
- Más fácil escalar horizontalmente.

**Alternativas descartadas:**
- Instance per tenant: 10 clientes = 10 servidores. Pesadilla operacional.
- Schema per tenant: complejo de migrar, no escala.

**Mitigación de riesgos:**
- RLS en Postgres como red de seguridad.
- Middleware obligatorio que setea `tenantId`.
- Tests específicos de aislamiento.

### ADR-002: Fastify sobre Express

**Decisión:** Fastify.

**Por qué:**
- 2-3x más performante.
- Mejor TypeScript support.
- Schema-first (genera OpenAPI gratis).
- Plugins más modernos.

### ADR-003: Prisma sobre TypeORM/Drizzle

**Decisión:** Prisma.

**Por qué:**
- Mejor dev experience (autocomplete, type safety).
- Migrations automáticas.
- Studio para debugging.

**Cuando podría cambiar:**
- Si necesitamos queries muy complejas → considerar Drizzle (más cerca del SQL).

### ADR-004: PostgreSQL sobre MongoDB

**Decisión:** PostgreSQL.

**Por qué:**
- Necesitamos transacciones ACID (stock + audit log).
- Relacional matchea naturalmente con el dominio.
- JSON nativo si necesitamos flexibilidad puntual.
- RLS para aislamiento multi-tenant.

### ADR-005: Estrategia híbrida de IA

**Decisión:** Gemini 2.5 Flash primer pass + Claude Sonnet 4.6 fallback.

**Por qué:**
- Gemini Flash: muy barato (~$0.001/imagen), accuracy aceptable (94%).
- Claude Sonnet: mejor consistencia de JSON, mejor en docs complejos.
- Estrategia híbrida minimiza costos sin sacrificar calidad.

**Métricas a trackear:**
- % docs procesados solo con Gemini.
- % docs que requieren Claude.
- % docs a revisión humana.
- Costo promedio por doc.

### ADR-006: BullMQ sobre alternativas

**Decisión:** BullMQ.

**Por qué:**
- Backed por Redis (ya usamos para cache).
- Soporte de retries, scheduled jobs, rate limiting.
- Dashboard (BullBoard) para debugging.
- Production-tested en miles de proyectos.

### ADR-007: Next.js App Router

**Decisión:** Next.js 15 con App Router (no Pages Router).

**Por qué:**
- Server Components reducen JS en cliente.
- Mejor SEO out-of-the-box.
- Layouts anidados.
- Streaming + Suspense.

### ADR-008: PWA, no app nativa (por ahora)

**Decisión:** PWA con Next.js.

**Por qué:**
- Cubre 95% de los casos.
- Una codebase para web + móvil.
- Deploy instantáneo (no app stores).
- Instalable, funciona offline (con service worker).

**Cuando reconsiderar:**
- Si necesitamos features nativas que PWA no soporta (ej. push muy específicos en iOS).
- Si el cliente prioriza presencia en stores.

## Diagrama de componentes

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTES                              │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────┐    │
│  │ PWA Mobile │  │  Web App   │  │ WhatsApp (bidirec) │    │
│  └─────┬──────┘  └─────┬──────┘  └──────────┬─────────┘    │
└────────┼───────────────┼────────────────────┼──────────────┘
         │               │                    │
         └───────┬───────┘                    │
                 │ HTTPS                      │ Webhooks
         ┌───────▼──────────────────────────────▼────────┐
         │            FASTIFY API                         │
         │  ┌─────────┬──────────┬─────────────────────┐ │
         │  │ Auth    │ Tenant   │ Feature Routes      │ │
         │  │ middlew │ middlew  │ (remitos, products, │ │
         │  └─────────┴──────────┴─────────────────────┘ │
         └────┬─────────────────┬───────────────────┬───┘
              │                 │                   │
       ┌──────▼──────┐   ┌──────▼──────┐    ┌──────▼──────┐
       │ PostgreSQL  │   │   Redis     │    │ Cloudflare  │
       │ (Prisma+RLS)│   │ (BullMQ)    │    │     R2      │
       └─────────────┘   └──────┬──────┘    └─────────────┘
                                │
                         ┌──────▼────────────┐
                         │   WORKERS         │
                         │  ┌─────────────┐  │
                         │  │ doc-process│  │ ────► Gemini API
                         │  │             │  │ ────► Claude API
                         │  ├─────────────┤  │
                         │  │ whatsapp   │  │ ────► WhatsApp API
                         │  ├─────────────┤  │
                         │  │ reports    │  │
                         │  └─────────────┘  │
                         └───────────────────┘
```

## Estrategia de escalado

### Vertical (corto plazo)
- Empezar con 1 instancia API + 1 instancia worker.
- Postgres en 1 nodo (Railway/Fly managed).
- Suficiente para ~10 clientes.

### Horizontal (cuando dolga)
- Múltiples instancias API detrás de load balancer.
- Múltiples workers (escalan independiente del API).
- Postgres con read replicas para reportes.
- Redis cluster si la cola crece mucho.

### Métricas a monitorear (desde día 1)
- Latencia P95 de endpoints.
- Tiempo promedio de procesamiento de documento (E2E).
- % de docs en cola de revisión.
- Costo de IA por tenant por mes.
- Storage R2 por tenant.

## Estrategia de deploy

### Desarrollo
- Local con docker-compose.
- Hot reload con `tsx watch` (backend) + Next dev (frontend).

### Staging
- Branch `staging` deploya a entorno con datos sintéticos.
- E2E tests automáticos en CI.

### Producción
- Railway o Fly.io para empezar (managed, barato, fácil).
- Cuando crezca: AWS/GCP con Terraform.
- Migraciones de DB con backup previo automático.
- Feature flags para releases graduales.

## Seguridad

- HTTPS obligatorio.
- JWT con expiración 7d, refresh token.
- Rate limiting por IP + por tenant.
- Helmet + CORS configurado.
- Sanitización de inputs (Zod + DOMPurify para HTML).
- Secrets en variables de entorno, NUNCA en código.
- Auditoría: `AuditLog` registra todo cambio crítico.
- Imágenes en R2 con URLs firmadas (no públicas).
- Backups diarios automáticos de Postgres.
- Encriptación at-rest (Postgres + R2).

## Costos estimados (primeros 5 clientes)

| Servicio | Costo mensual USD |
|---|---|
| Railway/Fly.io (API + worker + Postgres) | $20-40 |
| Cloudflare R2 (storage + egress) | $1-5 |
| Gemini API | $10-30 |
| Claude API (fallback) | $5-20 |
| WhatsApp Business (vía 360dialog) | $30-80 |
| **Total** | **$65-175** |

Con UN cliente Pro a AR$150.000/mes (~USD $150), ya cubrís infra.
