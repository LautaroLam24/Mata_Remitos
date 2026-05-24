# Monorepo Base Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the pnpm monorepo with packages/api (Fastify) and packages/web (Next.js 15), shared TypeScript + ESLint + Prettier config, and working root scripts.

**Architecture:** Single monorepo under `packages/*` with workspace names `@mr/api` and `@mr/web`. Root holds shared tooling config; each package extends it. No feature code — only the skeleton needed to make `pnpm install` and `pnpm typecheck` succeed.

**Tech Stack:** pnpm 9 workspaces, TypeScript 5.4 strict, ESLint 9 flat config, Prettier 3, Next.js 15, Fastify 4, Tailwind CSS 3.

---

## File Map

```
[root]
├── tsconfig.base.json          CREATE — strict TS base all workspaces extend
├── eslint.config.mjs           CREATE — ESLint 9 flat config (TS rules for api; next rules for web)
├── .prettierrc                 CREATE — shared Prettier config
├── .prettierignore             CREATE — ignore dist/.next/node_modules
├── package.json                MODIFY — add ESLint devDeps

packages/api/
├── package.json                CREATE — @mr/api, scripts, deps
├── tsconfig.json               CREATE — extends base, NodeNext resolution
└── src/index.ts                CREATE — empty entry point for typecheck

packages/web/
├── package.json                CREATE — @mr/web, scripts, deps
├── tsconfig.json               CREATE — extends base, Bundler resolution, jsx:preserve
├── next.config.ts              CREATE — minimal Next.js config
├── next-env.d.ts               CREATE — Next.js type reference file
├── tailwind.config.ts          CREATE — Tailwind content paths
├── postcss.config.mjs          CREATE — Tailwind + autoprefixer
└── src/app/
    ├── globals.css             CREATE — Tailwind directives
    ├── layout.tsx              CREATE — root layout with metadata
    └── page.tsx                CREATE — minimal home page
```

---

## Task 1: Root config files

**Files:**
- Create: `tsconfig.base.json`
- Create: `.prettierrc`
- Create: `.prettierignore`

- [ ] **Step 1: Create tsconfig.base.json**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "esModuleInterop": true
  }
}
```

- [ ] **Step 2: Create .prettierrc**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 3: Create .prettierignore**

```
node_modules
dist
.next
pnpm-lock.yaml
```

---

## Task 2: ESLint flat config

**Files:**
- Create: `eslint.config.mjs`
- Modify: `package.json` (root)

- [ ] **Step 1: Update root package.json — add ESLint devDependencies**

Add to `devDependencies` (merge with existing):

```json
"@eslint/js": "^9.0.0",
"eslint": "^9.0.0",
"globals": "^15.0.0",
"typescript-eslint": "^8.0.0"
```

- [ ] **Step 2: Create eslint.config.mjs**

```mjs
// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.next/**",
      "**/node_modules/**",
      "eslint.config.mjs",
      "**/*.config.{js,mjs,cjs}",
      "**/postcss.config.mjs",
    ],
  },

  js.configs.recommended,

  ...tseslint.configs.recommendedTypeChecked,

  // packages/api — Node.js environment
  {
    files: ["packages/api/src/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },

  // packages/web — Browser + Node.js (SSR) environment
  {
    files: ["packages/web/src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": "warn",
    },
  },
);
```

---

## Task 3: packages/api skeleton

**Files:**
- Create: `packages/api/package.json`
- Create: `packages/api/tsconfig.json`
- Create: `packages/api/src/index.ts`

- [ ] **Step 1: Create packages/api/package.json**

```json
{
  "name": "@mr/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src",
    "test": "vitest run",
    "test:unit": "vitest run",
    "test:watch": "vitest",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset --force",
    "db:seed": "tsx src/db/seed.ts",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@fastify/cors": "^9.0.1",
    "@fastify/helmet": "^11.1.1",
    "@fastify/multipart": "^8.3.0",
    "@fastify/rate-limit": "^9.1.0",
    "@prisma/client": "^5.14.0",
    "bullmq": "^5.8.0",
    "fastify": "^4.28.0",
    "ioredis": "^5.3.2",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "prisma": "^5.14.0",
    "tsx": "^4.11.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create packages/api/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.ts"]
}
```

- [ ] **Step 3: Create packages/api/src/index.ts**

```typescript
// API entry point — implemented in Session 3 (auth) onwards
export {};
```

---

## Task 4: packages/web skeleton

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/next.config.ts`
- Create: `packages/web/next-env.d.ts`
- Create: `packages/web/tailwind.config.ts`
- Create: `packages/web/postcss.config.mjs`
- Create: `packages/web/src/app/globals.css`
- Create: `packages/web/src/app/layout.tsx`
- Create: `packages/web/src/app/page.tsx`

- [ ] **Step 1: Create packages/web/package.json**

```json
{
  "name": "@mr/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "typecheck": "tsc --noEmit",
    "lint": "next lint",
    "test": "vitest run",
    "test:unit": "vitest run",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.40.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.44.0",
    "@types/node": "^20.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "autoprefixer": "^10.4.0",
    "eslint-config-next": "^15.0.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create packages/web/tsconfig.json**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "allowJs": true,
    "noEmit": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create packages/web/next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {},
};

export default nextConfig;
```

- [ ] **Step 4: Create packages/web/next-env.d.ts**

```typescript
/// <reference types="next" />
/// <reference types="next/image-types/global" />

// NOTE: This file should not be edited
// see https://nextjs.org/docs/app/api-reference/config/typescript for more information.
```

- [ ] **Step 5: Create packages/web/tailwind.config.ts**

```typescript
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 6: Create packages/web/postcss.config.mjs**

```mjs
const config = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

export default config;
```

- [ ] **Step 7: Create packages/web/src/app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create packages/web/src/app/layout.tsx**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mata Remitos",
  description: "Automatización de remitos para PyMEs argentinas",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Create packages/web/src/app/page.tsx**

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-bold">Mata Remitos</h1>
    </main>
  );
}
```

---

## Task 5: Install and verify

- [ ] **Step 1: Run pnpm install from root**

```bash
pnpm install
```

Expected: resolves all workspace deps, creates `pnpm-lock.yaml`, no errors.

- [ ] **Step 2: Run pnpm typecheck**

```bash
pnpm typecheck
```

Expected: runs `tsc --noEmit` in both `@mr/api` and `@mr/web`, exits 0 with no errors.

- [ ] **Step 3: Verify workspace structure**

```bash
pnpm list -r --depth 0
```

Expected: lists `@mr/api` and `@mr/web` as workspace members.

---

## Self-Review

**Spec coverage:**
- ✅ packages/api — Fastify backend scaffold
- ✅ packages/web — Next.js 15 frontend scaffold
- ✅ tsconfig.base.json + per-workspace tsconfigs
- ✅ ESLint + Prettier shared config
- ✅ Root scripts: dev, build, test, typecheck, lint, db:*
- ✅ No feature code written

**Placeholder scan:** None found. Every step contains exact file content.

**Type consistency:** `@mr/api`, `@mr/web` names are consistent across package.json scripts and root package.json filter references.
