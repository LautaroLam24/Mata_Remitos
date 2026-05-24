# Primeros Pasos — Cómo arrancar el desarrollo

> Guía para arrancar el proyecto desde cero con Claude Code. Diseñada para optimizar uso de tokens y aprovechar subagentes.

## Día 1: Setup del esqueleto

### Sesión 1 con Claude Code (1-2 horas)

Abrí Claude Code en la carpeta del proyecto y arrancá con este prompt:

```
Leé el CLAUDE.md y los archivos en .claude/skills/ y .claude/agents/.

Necesito que armes la estructura base del proyecto:
1. package.json monorepo con workspaces (api + web + shared)
2. tsconfig base + tsconfigs por workspace
3. ESLint + Prettier configurados
4. Scripts npm coordinados (dev, test, build, lint)
5. Estructura de carpetas según el README

NO escribas código de features todavía. Solo setup de infra del repo.
```

Esto deja el esqueleto listo en ~30min de trabajo de Claude Code.

### Sesión 2: Base de datos

```
Usá el subagente db-architect.

Tarea: implementar el schema Prisma completo según docs/business-rules.md,
incluyendo:
- Todas las entidades del dominio
- Índices según db-schema-designer skill
- RLS policies en prisma/rls.sql
- Seed con datos de prueba (1 tenant, 2 usuarios, 10 productos, 3 proveedores)

Al final, corré las migraciones contra la BD local y verificá que el seed funcione.
```

### Sesión 3: Auth y multi-tenancy

```
Usá el subagente api-developer.

Tarea: implementar el módulo de auth completo:
- POST /auth/register (crea tenant + owner)
- POST /auth/login
- POST /auth/refresh
- Middleware authenticate + requireTenant
- Tests de integración con Vitest + Testcontainers

Seguí los patrones en .claude/skills/api-builder/.
```

## Día 2: Pipeline OCR

### Sesión 4: Extracción de documentos

```
Usá el subagente ocr-specialist en paralelo con api-developer.

Tareas:
- ocr-specialist: implementá el pipeline de extracción según .claude/skills/ocr-extractor/.
  Includes: preprocesamiento con sharp, llamada a Gemini, fallback a Claude, 
  validación con Zod.
- api-developer: endpoint POST /api/remitos/upload que recibe multipart, 
  sube a R2, y encola job 'document.process'.

Tests con fixtures (3 imágenes de remitos de muestra en /test/fixtures/).
```

### Sesión 5: Validación de dominio

```
Tarea: implementá las reglas de validación según .claude/skills/validation-rules/.

Cada regla en su propio archivo en src/features/remitos/validators/:
- validateCuit.ts
- validateDuplicate.ts
- matchProduct.ts (con fuse.js)
- validateConfidence.ts
- validateQuantity.ts
- resolveSupplier.ts

Cada validator es función pura, totalmente testeable.
Llamalas en cadena desde RemitoService.validate().
```

## Día 3: Frontend

### Sesión 6: Setup Next.js

```
Usá el subagente frontend-developer.

Tareas:
- Setup Next.js 15 + Tailwind + shadcn/ui en /web
- Layout base (sidebar + topbar) 
- Auth pages (login, register)
- Conexión con API (TanStack Query setup)
- React Hook Form helpers compartidos

Usá los patrones en .claude/skills/frontend-builder/.
```

### Sesión 7: Pantalla crítica de captura

```
Esta es la pantalla más importante del MVP.

Implementá según frontend-builder skill:
- /remitos/nuevo: captura de foto con input capture="environment"
- Preview con rotar/recortar
- Upload con progress bar
- Polling del job status
- Resultado con ConfidenceField por cada campo extraído
- Edición inline de campos con confidence baja
- Botón "Confirmar y cargar al stock"

Tests E2E con Playwright (al menos: subir foto, esperar resultado, aprobar).
```

## Día 4: WhatsApp y reportes

### Sesión 8: Notificaciones

```
Usá api-developer.

Tareas según .claude/skills/whatsapp-notifier/:
- Adapter pattern para 360dialog/Twilio (interfaz común)
- Worker BullMQ para enviar mensajes
- Templates a documentar para aprobar en Meta
- Webhook entrante POST /webhooks/whatsapp
- Endpoint para configurar destinatarios y eventos

Tests con mocks de la API de WhatsApp.
```

### Sesión 9: Stock dashboard

```
Frontend-developer.

Tareas:
- Lista de productos con stock actual
- Indicador visual (verde/amarillo/rojo) según minStock
- Filtros por estado, rubro, proveedor habitual
- Detalle de producto con histórico de movimientos
- Reporte de productos próximos a quebrar
```

## Día 5: Polish y deploy

### Sesión 10: QA pass

```
Usá qa-tester.

Tareas:
- Auditá la cobertura de tests
- Identificá gaps en casos edge
- Escribí los tests que faltan
- Generá un reporte de cobertura
- Documentá los casos edge no testeados aún
```

### Sesión 11: Deploy

```
Tarea: preparar el deploy a Railway (o Fly.io).

- Dockerfile multi-stage (build + runtime)
- railway.toml o fly.toml
- GitHub Actions: CI (lint + test + typecheck) + CD (deploy automático en main)
- Healthcheck endpoint /health
- Setup de secrets en el provider
- Documentar el proceso en docs/deployment.md
```

## Truco para optimizar tokens

### Patrón "tech lead"

En vez de pedirle todo a Claude, dividí:

```
❌ MAL (gasta MUCHO contexto):
"Implementá todo el módulo de remitos: schema, endpoints, validaciones, frontend y tests"

✅ BIEN (paraleliza, gasta menos):
"Necesito implementar el módulo de remitos. Coordiná esta tarea:
- Lanzá db-architect para verificar el schema
- En paralelo, lanzá api-developer para endpoints
- En paralelo, lanzá ocr-specialist para el pipeline
- En paralelo, lanzá frontend-developer para la UI
- Finalmente, lanzá qa-tester para los tests
- Sintetizá los resultados al final"
```

Los subagentes trabajan en contextos separados → no compiten por tokens.

### Patrón "context loading explícito"

Antes de tareas grandes:

```
"Cargá en contexto los siguientes archivos:
- docs/business-rules.md
- .claude/skills/validation-rules/SKILL.md
- src/features/remitos/schemas.ts

Después implementá X."
```

Esto evita que Claude vaya leyendo archivos a tientas y gaste tokens en exploración.

### Patrón "verificación incremental"

```
❌ MAL:
"Implementá las 5 reglas de validación"
→ Claude tira 1000 líneas, algunas tienen bugs, gasta mucho contexto debugueando.

✅ BIEN:
"Implementá la regla 1 (validateCuit). Test + código. Cuando termines, paramos."
[Verificás que funciona]
"Ahora regla 2 (validateDuplicate)..."
```

Iteración corta. Verificás cada paso. Si algo falla, no perdés todo.

## Comandos útiles de Claude Code

```bash
# Iniciar sesión en el proyecto
claude

# Crear un subagente custom adicional
claude /agents

# Reducir contexto (cuando te queda poco)
claude /compact

# Limpiar contexto (sesión nueva)
claude /clear

# Ver uso de contexto
claude /context

# Plan mode (planifica antes de ejecutar)
claude --plan
```

## Cuando te trabes

Si Claude se confunde o pierde el hilo:

1. **`/compact`** primero. Te queda con un resumen.
2. **Lee tu última versión de los archivos clave** ("/view src/features/remitos/service.ts").
3. **Dale contexto fresco** ("Estamos implementando X. Llegamos hasta acá. Próximo paso: Y").
4. **Si sigue mal: `/clear` y arrancá una sesión nueva** con instrucciones claras.

## El primer cliente

Cuando tengas el MVP funcionando:

1. **Conseguilo con tu hermano.** Una PyME que él conozca, idealmente que ya tenga relación de confianza.
2. **Ofrecé un mes gratis** a cambio de feedback honesto y permiso para usarlo como caso de éxito.
3. **Estate ahí los primeros días.** Mirá cómo lo usan. Cada quilombo es feedback de oro.
4. **Itera rápido.** Lo que funciona en demo no siempre funciona en producción real.
5. **Cuando vuelva el cliente con "anda re bien" → pedí 2 referidos.**

Suerte. Vos podés.
