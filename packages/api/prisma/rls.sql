-- =============================================================================
-- ROW LEVEL SECURITY — mata-remitos
-- =============================================================================
-- La app DEBE ejecutar antes de cada query de dominio:
--   SET LOCAL app.current_tenant_id = '<tenantId>';
--
-- Si la variable no está seteada, current_setting(..., true) devuelve NULL
-- → la policy no matchea ninguna fila (fail-safe).
--
-- El role con BYPASSRLS (migraciones, superuser) está exento automáticamente.
-- En producción, la app debe conectarse con un role SIN BYPASSRLS.
-- =============================================================================

-- ─── USERS ───────────────────────────────────────────────────────────────────
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_users ON users;
CREATE POLICY tenant_isolation_users ON users
  AS PERMISSIVE FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ─── SUPPLIERS ───────────────────────────────────────────────────────────────
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_suppliers ON suppliers;
CREATE POLICY tenant_isolation_suppliers ON suppliers
  AS PERMISSIVE FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ─── PRODUCTS ────────────────────────────────────────────────────────────────
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_products ON products;
CREATE POLICY tenant_isolation_products ON products
  AS PERMISSIVE FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ─── DOCUMENTS ───────────────────────────────────────────────────────────────
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_documents ON documents;
CREATE POLICY tenant_isolation_documents ON documents
  AS PERMISSIVE FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ─── DOCUMENT ITEMS ──────────────────────────────────────────────────────────
ALTER TABLE document_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_document_items ON document_items;
CREATE POLICY tenant_isolation_document_items ON document_items
  AS PERMISSIVE FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ─── STOCK MOVEMENTS ─────────────────────────────────────────────────────────
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_stock_movements ON stock_movements;
CREATE POLICY tenant_isolation_stock_movements ON stock_movements
  AS PERMISSIVE FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ─── AUDIT LOGS ──────────────────────────────────────────────────────────────
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_audit_logs ON audit_logs;
CREATE POLICY tenant_isolation_audit_logs ON audit_logs
  AS PERMISSIVE FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_notifications ON notifications;
CREATE POLICY tenant_isolation_notifications ON notifications
  AS PERMISSIVE FOR ALL
  USING ("tenantId" = current_setting('app.current_tenant_id', true)::text)
  WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true)::text);

-- ─── NOTA ────────────────────────────────────────────────────────────────────
-- La tabla "tenants" NO tiene RLS.
-- El acceso está controlado por la app layer (JWT contiene tenantId).
-- =============================================================================
-- ROLLBACK:
--   DROP POLICY IF EXISTS tenant_isolation_users ON users;
--   ALTER TABLE users DISABLE ROW LEVEL SECURITY;
--   (repetir para cada tabla)
-- =============================================================================
