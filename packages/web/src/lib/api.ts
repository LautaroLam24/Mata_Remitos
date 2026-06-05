import { authStore } from "./auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function tryRefresh(): Promise<string | null> {
  const session = authStore.get();
  if (!session?.refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    if (!res.ok) {
      authStore.clear();
      return null;
    }
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    authStore.set({ ...session, accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken;
  } catch {
    authStore.clear();
    return null;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const message =
    typeof body === "object" && body !== null && "message" in body
      ? String((body as { message: unknown }).message)
      : `HTTP ${res.status}`;
  return new ApiError(res.status, message, body);
}

async function request<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean } = {}
): Promise<T> {
  const { skipAuth, ...init } = options;

  const headers: Record<string, string> = {
    ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...(init.headers as Record<string, string>),
  };

  if (!skipAuth) {
    const token = authStore.getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (res.status === 401 && !skipAuth) {
    const newToken = await tryRefresh();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { ...init, headers });
    }
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function requestBlob(path: string): Promise<Blob> {
  let token = authStore.getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let res = await fetch(`${API_BASE}${path}`, { headers });

  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { headers });
    }
  }

  if (!res.ok) throw await parseError(res);
  return res.blob();
}

async function uploadFile<T>(path: string, file: File): Promise<T> {
  let token = authStore.getAccessToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const formData = new FormData();
  formData.append("file", file);

  let res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });

  if (res.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData });
    }
  }

  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

// ── Remitos types ────────────────────────────────────────────────────────────

export interface UploadResponse {
  jobId: string;
  imageKey: string;
  message: string;
}

export interface JobStatusResponse {
  status: "waiting" | "active" | "completed" | "failed" | "unknown";
  documentId?: string;
  error?: string;
}

// ── Raw extraction types (ExtractionResult from OCR pipeline) ─────────────────

export interface FieldConfidence<T> {
  value: T;
  confidence: number;
}

export interface ExtractionItem {
  code: FieldConfidence<string | null>;
  description: FieldConfidence<string>;
  quantity: FieldConfidence<number>;
  unit: FieldConfidence<string>;
  unitPrice: FieldConfidence<number | null>;
  subtotal: FieldConfidence<number | null>;
}

export interface RawExtraction {
  documentType: string;
  documentNumber: FieldConfidence<string>;
  date: FieldConfidence<string>;
  supplier: {
    cuit: FieldConfidence<string>;
    name: FieldConfidence<string>;
  };
  items: ExtractionItem[];
  total: FieldConfidence<number | null>;
  rawText: string;
  overallConfidence: number;
  warnings: string[];
}

export interface DocumentItem {
  id: string;
  tenantId: string;
  documentId: string;
  productId: string | null;
  rawDescription: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  confidenceScore: number | null;
  matchScore: number | null;
  matchStatus: string;
  humanEdited: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateItemBody {
  rawDescription?: string;
  quantity?: number;
  unitPrice?: number;
}

export interface CreateProductFromItemBody {
  code: string;
  name: string;
  unit: string;
  minStock?: number | null;
}

export interface CreateProductFromItemResponse {
  productId: string;
  item: DocumentItem;
}

export interface CreateAllUnmatchedResponse {
  created: number;
  items: DocumentItem[];
}

export interface DocumentDetail {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierCuit: string;
  type: string;
  documentNumber: string;
  date: string;
  status: string;
  overallConfidence: number;
  rawExtraction: RawExtraction | null;
  warnings: string[];
  imageUrl: string;
  imageThumbnailUrl: string | null;
  uploadedById: string;
  approvedById: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  items: DocumentItem[];
}

// ── Validations ───────────────────────────────────────────────────────────────

export type CheckStatus = 'passed' | 'warning' | 'failed';

export interface ValidationCheck {
  id: string;
  label: string;
  status: CheckStatus;
  message: string;
  details: string | null;
}

export interface DocumentValidationsResponse {
  checks: ValidationCheck[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
    canApprove: boolean;
    duplicateId?: string;
  };
}

export interface ApproveResponse {
  id: string;
  status: "approved";
  movementsCreated: number;
}

export interface RejectResponse {
  id: string;
  status: "rejected";
}

export interface ReviewQueueItem {
  id: string;
  tenantId: string;
  supplierId: string;
  supplierCuit: string;
  type: string;
  documentNumber: string;
  date: string;
  overallConfidence: number;
  warnings: string[];
  imageUrl: string;
  imageThumbnailUrl: string | null;
  createdAt: string;
}

export interface ReviewQueueResponse {
  items: ReviewQueueItem[];
  total: number;
  page: number;
  limit: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function qs(params: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') p.set(k, String(v));
  }
  return p.toString();
}

// ── Productos types ───────────────────────────────────────────────────────────

export interface Producto {
  id: string;
  code: string;
  name: string;
  unit: string;
  stockOnHand: number;
  minStock: number | null;
  aliases: string[];
  deletedAt: string | null;
  createdAt: string;
}

export interface StockMovimiento {
  id: string;
  type: string;
  reason: string;
  reference: string | null;
  quantity: number;
  balanceBefore: number;
  balanceAfter: number;
  createdAt: string;
  user: { name: string; email: string };
}

export interface ProductoDetail extends Producto {
  stockMovements: StockMovimiento[];
}

export interface ProductoListResponse {
  items: Producto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductoCreate {
  code: string;
  name: string;
  unit: string;
  minStock: number | null;
  stockOnHand: number;
  aliases: string[];
}

export interface ProductoUpdate {
  code?: string;
  name?: string;
  unit?: string;
  minStock?: number | null;
  aliases?: string[];
}

// ── Proveedores types ─────────────────────────────────────────────────────────

export interface Proveedor {
  id: string;
  name: string;
  cuit: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
}

export interface ProveedorListResponse {
  items: Proveedor[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProveedorCreate {
  name: string;
  cuit: string;
  email?: string;
  phone?: string;
  address?: string;
}

// ── Stock types ───────────────────────────────────────────────────────────────

export interface StockAlertProduct {
  id: string;
  code: string;
  name: string;
  unit: string;
  stockOnHand: number;
  minStock: number | null;
}

export interface StockAlertsResponse {
  critical: StockAlertProduct[];
  atRisk: StockAlertProduct[];
}

// ── Remitos list types ────────────────────────────────────────────────────────

export interface DocumentListItem {
  id: string;
  documentNumber: string;
  type: string;
  date: string;
  status: string;
  overallConfidence: number;
  itemCount: number;
  supplierName: string;
  supplierCuit: string;
  createdAt: string;
}

export interface DocumentListResponse {
  items: DocumentListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface DocumentListParams {
  page?: number;
  limit?: number;
  status?: 'all' | 'processing' | 'review_needed' | 'approved' | 'rejected';
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// ── Dashboard types ───────────────────────────────────────────────────────────

export type DashboardPeriod = '7d' | '30d' | '3m' | '6m' | '12m';

export interface DashboardKpiValue {
  value: number;
  previousValue: number;
  variationPct: number;
}

export interface DashboardMetrics {
  period: string;
  kpis: {
    totalDocuments: DashboardKpiValue;
    approvedDocuments: DashboardKpiValue;
    timeSavedMinutes: { value: number; estimatedSavingsArs: number };
    pendingReview: { value: number; olderThanWeekCount: number };
  };
  charts: {
    documentsPerMonth: Array<{ month: string; approved: number; rejected: number; review: number }>;
    topSuppliers: Array<{ supplierId: string; supplierName: string; documentCount: number; totalItems: number }>;
    topProducts: Array<{ productId: string; productName: string; totalQuantity: number; documentCount: number }>;
    documentTypeDistribution: Array<{ type: string; count: number; percentage: number }>;
  };
  alerts: Array<{
    type: 'info' | 'warning' | 'critical';
    title: string;
    description: string;
    actionUrl: string | null;
  }>;
  recentActivity: Array<{
    id: string;
    type: string;
    supplierName: string;
    documentNumber: string;
    status: string;
    createdAt: string;
  }>;
}

// ── Auth types ───────────────────────────────────────────────────────────────

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; name: string; role: string };
  tenant: { id: string; slug: string; name: string };
}

export interface RegisterBody {
  tenantName: string;
  tenantSlug: string;
  ownerEmail: string;
  ownerName: string;
  ownerPassword: string;
  ownerPhone?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export const api = {
  auth: {
    register: (body: RegisterBody) =>
      request<AuthResponse>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(body),
        skipAuth: true,
      }),

    login: (body: LoginBody) =>
      request<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
        skipAuth: true,
      }),

    refresh: (refreshToken: string) =>
      request<{ accessToken: string; refreshToken: string }>("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken }),
        skipAuth: true,
      }),
  },

  remitos: {
    upload: (file: File) =>
      uploadFile<UploadResponse>("/api/remitos/upload", file),

    getJobStatus: (jobId: string) =>
      request<JobStatusResponse>(`/api/remitos/jobs/${jobId}`),

    getDocument: (id: string) =>
      request<DocumentDetail>(`/api/remitos/${id}`),

    getImageBlob: (id: string) => requestBlob(`/api/remitos/${id}/image`),

    getValidations: (id: string) =>
      request<DocumentValidationsResponse>(`/api/remitos/${id}/validations`),

    approve: (id: string) =>
      request<ApproveResponse>(`/api/remitos/${id}/approve`, { method: "POST" }),

    overrideApprove: (id: string, overrideReason: string) =>
      request<ApproveResponse>(`/api/remitos/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({ overrideReason }),
      }),

    reject: (id: string, reason?: string) =>
      request<RejectResponse>(`/api/remitos/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({ ...(reason ? { reason } : {}) }),
      }),

    getReviewQueue: (page = 1, limit = 20) =>
      request<ReviewQueueResponse>(`/api/remitos/review-queue?page=${page}&limit=${limit}`),

    list: (p: DocumentListParams = {}) =>
      request<DocumentListResponse>(`/api/remitos?${qs({ page: p.page ?? 1, limit: p.limit ?? 20, status: p.status ?? 'all', supplierId: p.supplierId, dateFrom: p.dateFrom, dateTo: p.dateTo, search: p.search })}`),

    exportExcel: (p: Omit<DocumentListParams, 'page' | 'limit'> = {}) =>
      requestBlob(`/api/remitos/export/excel?${qs({ status: p.status, supplierId: p.supplierId, dateFrom: p.dateFrom, dateTo: p.dateTo, search: p.search })}`),

    exportCsv: (p: Omit<DocumentListParams, 'page' | 'limit'> = {}) =>
      requestBlob(`/api/remitos/export/csv?${qs({ status: p.status, supplierId: p.supplierId, dateFrom: p.dateFrom, dateTo: p.dateTo, search: p.search })}`),

    updateItem: (docId: string, itemId: string, body: UpdateItemBody) =>
      request<DocumentItem>(`/api/remitos/${docId}/items/${itemId}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),

    createProductFromItem: (docId: string, itemId: string, body: CreateProductFromItemBody) =>
      request<CreateProductFromItemResponse>(`/api/remitos/${docId}/items/${itemId}/create-product`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),

    associateItemToProduct: (docId: string, itemId: string, productId: string) =>
      request<DocumentItem>(`/api/remitos/${docId}/items/${itemId}/associate-product`, {
        method: 'POST',
        body: JSON.stringify({ productId }),
      }),

    createAllUnmatched: (docId: string) =>
      request<CreateAllUnmatchedResponse>(`/api/remitos/${docId}/items/create-all-unmatched`, {
        method: 'POST',
      }),
  },

  productos: {
    list: (p: { page?: number; search?: string; lowStock?: boolean } = {}) =>
      request<ProductoListResponse>(`/api/productos?${qs({ page: p.page ?? 1, search: p.search, lowStock: p.lowStock })}`),
    getById: (id: string) => request<ProductoDetail>(`/api/productos/${id}`),
    create: (body: ProductoCreate) =>
      request<Producto>('/api/productos', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: ProductoUpdate) =>
      request<Producto>(`/api/productos/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    delete: (id: string) => request<{ id: string; deletedAt: string }>(`/api/productos/${id}`, { method: 'DELETE' }),
  },

  proveedores: {
    list: (p: { page?: number; search?: string } = {}) =>
      request<ProveedorListResponse>(`/api/proveedores?${qs({ page: p.page ?? 1, search: p.search })}`),
    create: (body: ProveedorCreate) =>
      request<Proveedor>('/api/proveedores', { method: 'POST', body: JSON.stringify(body) }),
    update: (id: string, body: Partial<ProveedorCreate>) =>
      request<Proveedor>(`/api/proveedores/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  },

  stock: {
    alerts: () => request<StockAlertsResponse>('/api/stock/alerts'),
  },

  dashboard: {
    metrics: (period: DashboardPeriod = '6m') =>
      request<DashboardMetrics>(`/api/dashboard/metrics?period=${period}`),
  },
};
