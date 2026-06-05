'use client';

import { useState, useRef, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  ExternalLink,
  Plus,
  Link2,
  PackagePlus,
  Search,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfidenceBadge } from '@/components/features/ConfidenceBadge';
import { Skeleton } from '@/components/ui/skeleton';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import {
  api,
  type DocumentItem,
  type DocumentDetail,
  type ValidationCheck,
  type RawExtraction,
  type ApiError,
} from '@/lib/api';
import { cn } from '@/lib/utils';

// ─── Types & helpers ──────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  approved: 'Aprobado',
  rejected: 'Rechazado',
  review_needed: 'En revisión',
  processing: 'Procesando',
};

const STATUS_CLASSES: Record<string, string> = {
  approved: 'bg-green-500 text-white',
  rejected: 'bg-destructive text-destructive-foreground',
  review_needed: 'bg-yellow-500 text-white',
  processing: 'bg-muted text-muted-foreground',
};

const TYPE_LABELS: Record<string, string> = {
  remito: 'Remito',
  factura_a: 'Factura A',
  factura_b: 'Factura B',
  factura_c: 'Factura C',
  nota_pedido: 'Nota de pedido',
  desconocido: 'Desconocido',
};

function getFieldConf(raw: RawExtraction | null, path: string[]): number | null {
  let cur: unknown = raw;
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null) return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (typeof cur === 'object' && cur !== null && 'confidence' in cur) {
    const c = (cur as Record<string, unknown>)['confidence'];
    if (typeof c === 'number') return c;
  }
  return null;
}

// ─── Check row ────────────────────────────────────────────────────────────────

function CheckIcon({ status }: { status: ValidationCheck['status'] }) {
  if (status === 'passed')
    return <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />;
  if (status === 'warning')
    return <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />;
  return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />;
}

function CheckRow({ check }: { check: ValidationCheck }) {
  const borderCls =
    check.status === 'passed'
      ? 'border-green-100 dark:border-green-900'
      : check.status === 'warning'
        ? 'border-amber-100 dark:border-amber-900'
        : 'border-red-100 dark:border-red-900';
  const bgCls =
    check.status === 'passed'
      ? 'bg-green-50/50 dark:bg-green-950/30'
      : check.status === 'warning'
        ? 'bg-amber-50/50 dark:bg-amber-950/30'
        : 'bg-red-50/50 dark:bg-red-950/30';

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-3', borderCls, bgCls)}>
      <CheckIcon status={check.status} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{check.label}</div>
        <div className="text-sm text-muted-foreground">{check.message}</div>
        {check.details && (
          <div className="mt-1 text-xs text-muted-foreground/80">{check.details}</div>
        )}
      </div>
    </div>
  );
}

// ─── Summary cards ────────────────────────────────────────────────────────────

function SummaryCards({ passed, warnings, failed }: { passed: number; warnings: number; failed: number }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <div className="rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3 text-center">
        <div className="text-2xl font-bold text-green-700 dark:text-green-400">{passed}</div>
        <div className="text-xs text-green-600 dark:text-green-500">Pasadas</div>
      </div>
      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
        <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{warnings}</div>
        <div className="text-xs text-amber-600 dark:text-amber-500">Advertencias</div>
      </div>
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-3 text-center">
        <div className="text-2xl font-bold text-red-700 dark:text-red-400">{failed}</div>
        <div className="text-xs text-red-600 dark:text-red-500">Errores</div>
      </div>
    </div>
  );
}

// ─── Labeled field with confidence ───────────────────────────────────────────

function FieldWithConf({
  label,
  value,
  confidence,
  edited,
  onChange,
}: {
  label: string;
  value: string;
  confidence: number | null;
  edited: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {label}
        {confidence !== null && (
          <ConfidenceBadge confidence={confidence} edited={edited} />
        )}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          'h-8 text-sm',
          confidence !== null && !edited && confidence < 70 && 'border-red-400 bg-red-50 dark:bg-red-950/30',
          confidence !== null && !edited && confidence >= 70 && confidence < 85 && 'border-amber-400 dark:border-amber-600',
        )}
      />
    </div>
  );
}

// ─── Match badge ──────────────────────────────────────────────────────────────

function MatchBadge({ status }: { status: string }) {
  if (status === 'matched') {
    return (
      <span className="inline-block rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/40 dark:text-green-400">
        ✓ En catálogo
      </span>
    );
  }
  if (status === 'new_product') {
    return (
      <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900/40 dark:text-blue-400">
        + Nuevo producto
      </span>
    );
  }
  return (
    <span className="inline-block rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/40 dark:text-amber-400">
      Sin asignar
    </span>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────

type ItemEdits = { rawDescription: string; quantity: string; unitPrice: string };

interface ItemRowProps {
  item: DocumentItem;
  docId: string;
  isPending: boolean;
  onItemUpdated: (item: DocumentItem) => void;
  onOpenAssociate: (itemId: string) => void;
}

function ItemRow({ item, docId, isPending, onItemUpdated, onOpenAssociate }: ItemRowProps) {
  const [edits, setEdits] = useState<ItemEdits>({
    rawDescription: item.rawDescription,
    quantity: String(item.quantity),
    unitPrice: item.unitPrice !== null ? String(item.unitPrice) : '',
  });
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createData, setCreateData] = useState({
    code: `AUTO-${item.id.slice(-8).toUpperCase()}`,
    name: item.rawDescription,
    unit: item.unit,
  });

  const prevItemRef = useRef(item);
  // Sincronizar edits si el ítem cambia desde fuera (ej: después de associate)
  if (prevItemRef.current.id !== item.id || prevItemRef.current.matchStatus !== item.matchStatus) {
    prevItemRef.current = item;
    setEdits({
      rawDescription: item.rawDescription,
      quantity: String(item.quantity),
      unitPrice: item.unitPrice !== null ? String(item.unitPrice) : '',
    });
  }

  const updateMutation = useMutation({
    mutationFn: (updates: { rawDescription?: string; quantity?: number; unitPrice?: number }) =>
      api.remitos.updateItem(docId, item.id, updates),
    onSuccess: onItemUpdated,
    onError: () => setFieldError('Error al guardar el cambio.'),
  });

  const createProductMutation = useMutation({
    mutationFn: () =>
      api.remitos.createProductFromItem(docId, item.id, {
        code: createData.code,
        name: createData.name,
        unit: createData.unit,
      }),
    onSuccess: ({ item: updated }) => {
      setShowCreateForm(false);
      onItemUpdated(updated);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Error al crear el producto';
      setFieldError(msg);
    },
  });

  function handleBlur(field: 'rawDescription' | 'quantity' | 'unitPrice') {
    setFieldError(null);
    const val = edits[field];

    if (field === 'quantity') {
      const n = parseFloat(val);
      if (isNaN(n) || n <= 0) {
        setFieldError('Cantidad debe ser mayor a 0');
        setEdits((p) => ({ ...p, quantity: String(item.quantity) }));
        return;
      }
      if (n !== item.quantity) updateMutation.mutate({ quantity: n });
    } else if (field === 'unitPrice') {
      if (val === '') {
        // sin precio — no hay cambio si ya era null
        if (item.unitPrice !== null) updateMutation.mutate({ unitPrice: 0 });
      } else {
        const n = parseFloat(val);
        if (isNaN(n) || n < 0) {
          setFieldError('Precio debe ser mayor o igual a 0');
          setEdits((p) => ({ ...p, unitPrice: item.unitPrice !== null ? String(item.unitPrice) : '' }));
          return;
        }
        if (n !== item.unitPrice) updateMutation.mutate({ unitPrice: n });
      }
    } else if (field === 'rawDescription') {
      const trimmed = val.trim();
      if (!trimmed) {
        setFieldError('La descripción no puede estar vacía');
        setEdits((p) => ({ ...p, rawDescription: item.rawDescription }));
        return;
      }
      if (trimmed !== item.rawDescription) updateMutation.mutate({ rawDescription: trimmed });
    }
  }

  const isSaving = updateMutation.isPending;

  return (
    <div className="space-y-2">
      {/* Fila principal */}
      <div className="flex items-start gap-2">
        {/* Descripción */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            {item.confidenceScore !== null && (
              <ConfidenceBadge confidence={item.confidenceScore} edited={item.humanEdited} />
            )}
            {isSaving && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          <Input
            value={edits.rawDescription}
            onChange={(e) => setEdits((p) => ({ ...p, rawDescription: e.target.value }))}
            onBlur={() => handleBlur('rawDescription')}
            disabled={!isPending}
            className="h-7 text-xs"
            placeholder="Descripción"
          />
        </div>

        {/* Cantidad */}
        <div className="w-20">
          <div className="mb-0.5 text-[10px] text-muted-foreground">Cant.</div>
          <Input
            value={edits.quantity}
            onChange={(e) => setEdits((p) => ({ ...p, quantity: e.target.value }))}
            onBlur={() => handleBlur('quantity')}
            disabled={!isPending}
            className="h-7 text-xs text-right"
            type="number"
            min="0"
            step="any"
          />
        </div>

        {/* Precio */}
        <div className="w-24">
          <div className="mb-0.5 text-[10px] text-muted-foreground">Precio u.</div>
          <Input
            value={edits.unitPrice}
            onChange={(e) => setEdits((p) => ({ ...p, unitPrice: e.target.value }))}
            onBlur={() => handleBlur('unitPrice')}
            disabled={!isPending}
            className="h-7 text-xs text-right"
            type="number"
            min="0"
            step="any"
            placeholder="—"
          />
        </div>

        {/* Badge */}
        <div className="pt-5 shrink-0">
          <MatchBadge status={item.matchStatus} />
        </div>
      </div>

      {/* Error inline */}
      {fieldError && <p className="text-xs text-destructive">{fieldError}</p>}

      {/* Acciones para ítems sin asignar (solo en modo revisión) */}
      {isPending && item.matchStatus === 'pending' && (
        <div className="flex gap-1.5 ml-0">
          {!showCreateForm ? (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2 gap-1 border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400"
                onClick={() => setShowCreateForm(true)}
              >
                <Plus className="h-3 w-3" />
                Crear producto
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2 gap-1"
                onClick={() => onOpenAssociate(item.id)}
              >
                <Link2 className="h-3 w-3" />
                Asociar
              </Button>
            </>
          ) : (
            <div className="w-full rounded-md border bg-muted/30 p-2 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Nuevo producto</p>
              <div className="grid grid-cols-3 gap-1.5">
                <div>
                  <label className="text-[10px] text-muted-foreground">Código</label>
                  <Input
                    value={createData.code}
                    onChange={(e) => setCreateData((p) => ({ ...p, code: e.target.value }))}
                    className="h-6 text-xs"
                    placeholder="COD001"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground">Nombre</label>
                  <Input
                    value={createData.name}
                    onChange={(e) => setCreateData((p) => ({ ...p, name: e.target.value }))}
                    className="h-6 text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <label className="text-[10px] text-muted-foreground">Unidad</label>
                  <Input
                    value={createData.unit}
                    onChange={(e) => setCreateData((p) => ({ ...p, unit: e.target.value }))}
                    className="h-6 text-xs"
                    placeholder="un"
                  />
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button
                  size="sm"
                  className="h-6 text-xs px-2"
                  disabled={!createData.code.trim() || !createData.name.trim() || !createData.unit.trim() || createProductMutation.isPending}
                  onClick={() => createProductMutation.mutate()}
                >
                  {createProductMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'Crear'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs px-2"
                  onClick={() => setShowCreateForm(false)}
                >
                  Cancelar
                </Button>
              </div>
              {createProductMutation.isError && (
                <p className="text-xs text-destructive">
                  {(createProductMutation.error as ApiError | null)?.message ?? 'Error al crear'}
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RemitorDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id;

  const [editedFields, setEditedFields] = useState<Set<string>>(new Set());
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);

  // Imagen original cargada como blob URL (requiere auth, evita bucket público)
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setImageBlobUrl(null);
    setImageLoadError(false);

    api.remitos.getImageBlob(id)
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setImageBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setImageLoadError(true);
      });

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [id]);

  // Estado para el diálogo de "Asociar a producto existente"
  const [associateItemId, setAssociateItemId] = useState<string | null>(null);
  const [productSearchTerm, setProductSearchTerm] = useState('');

  const docQuery = useQuery({
    queryKey: ['document', id],
    queryFn: () => api.remitos.getDocument(id),
  });

  const validationsQuery = useQuery({
    queryKey: ['validations', id],
    queryFn: () => api.remitos.getValidations(id),
  });

  const approveMutation = useMutation({
    mutationFn: () => api.remitos.approve(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['document', id] });
      void qc.invalidateQueries({ queryKey: ['validations', id] });
      router.push('/remitos?aprobado=1');
    },
  });

  const overrideMutation = useMutation({
    mutationFn: (reason: string) => api.remitos.overrideApprove(id, reason),
    onSuccess: () => {
      setOverrideOpen(false);
      void qc.invalidateQueries({ queryKey: ['document', id] });
      router.push('/remitos?aprobado=1');
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string | undefined) => api.remitos.reject(id, reason),
    onSuccess: () => {
      setRejectOpen(false);
      void qc.invalidateQueries({ queryKey: ['document', id] });
      router.push('/remitos');
    },
  });

  // Búsqueda de productos para el diálogo de "Asociar"
  const productSearchQuery = useQuery({
    queryKey: ['productos', 'search', productSearchTerm],
    queryFn: () => api.productos.list({ search: productSearchTerm, page: 1 }),
    enabled: associateItemId !== null,
  });

  const associateMutation = useMutation({
    mutationFn: ({ itemId, productId }: { itemId: string; productId: string }) =>
      api.remitos.associateItemToProduct(id, itemId, productId),
    onSuccess: (updatedItem) => {
      setAssociateItemId(null);
      setProductSearchTerm('');
      updateItemInCache(updatedItem);
      void qc.invalidateQueries({ queryKey: ['validations', id] });
    },
  });

  const createAllMutation = useMutation({
    mutationFn: () => api.remitos.createAllUnmatched(id),
    onSuccess: ({ items }) => {
      qc.setQueryData(['document', id], (old: DocumentDetail | undefined) => {
        if (!old) return old;
        const updatedMap = new Map(items.map((i) => [i.id, i]));
        return {
          ...old,
          items: old.items.map((i) => updatedMap.get(i.id) ?? i),
        };
      });
      void qc.invalidateQueries({ queryKey: ['validations', id] });
    },
  });

  // Helper: actualizar un ítem en la cache sin re-fetch completo
  function updateItemInCache(updatedItem: DocumentItem) {
    qc.setQueryData(['document', id], (old: DocumentDetail | undefined) => {
      if (!old) return old;
      return {
        ...old,
        items: old.items.map((i) => (i.id === updatedItem.id ? updatedItem : i)),
      };
    });
    void qc.invalidateQueries({ queryKey: ['validations', id] });
  }

  const isReady = !docQuery.isLoading && !docQuery.isError && !!docQuery.data;
  const isPendingDoc = isReady && docQuery.data?.status === 'review_needed';
  const canApproveShortcut = validationsQuery.data?.summary.canApprove ?? true;

  useKeyboardShortcuts(
    [
      {
        key: 'Enter',
        description: 'Aprobar documento',
        handler: () => {
          if (isPendingDoc && canApproveShortcut) approveMutation.mutate();
        },
      },
      {
        key: 'Escape',
        description: 'Volver al listado',
        handler: () => router.push('/remitos'),
      },
      {
        key: 's',
        ctrlKey: true,
        allowInInput: true,
        description: 'Guardar borrador',
        handler: () => {},
      },
      {
        key: 'Enter',
        ctrlKey: true,
        allowInInput: true,
        description: 'Aprobar desde cualquier input',
        handler: () => {
          if (isPendingDoc && canApproveShortcut) approveMutation.mutate();
        },
      },
      {
        key: '?',
        description: 'Ayuda de atajos',
        handler: () => setHelpOpen(true),
      },
    ],
    true,
  );

  function handleFieldChange(field: string, value: string) {
    setEditedFields((prev) => new Set(prev).add(field));
    setFieldValues((prev) => ({ ...prev, [field]: value }));
  }

  function fieldVal(field: string, fallback: string): string {
    return field in fieldValues ? (fieldValues[field] ?? fallback) : fallback;
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (docQuery.isLoading) {
    return (
      <div className="space-y-4 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Skeleton className="h-[60vh] w-full rounded-lg" />
          </div>
          <div className="lg:col-span-2 space-y-4">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-48 w-full rounded-lg" />
            <Skeleton className="h-32 w-full rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (docQuery.isError || !docQuery.data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <XCircle className="h-10 w-10 text-destructive" />
        <p className="text-muted-foreground">No se pudo cargar el documento.</p>
        <Button variant="outline" onClick={() => router.push('/remitos')}>
          Volver al listado
        </Button>
      </div>
    );
  }

  const doc = docQuery.data;
  const validations = validationsQuery.data;
  const raw = doc.rawExtraction;
  const isPending = doc.status === 'review_needed';
  const unresolvedCount = doc.items.filter((i) => i.matchStatus === 'pending').length;
  const canApprove = (validations?.summary.canApprove ?? true) && unresolvedCount === 0;
  const duplicateId = validations?.summary.duplicateId;
  const actionsPending =
    approveMutation.isPending || overrideMutation.isPending || rejectMutation.isPending;

  return (
    <>
      <div className="space-y-4 p-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg p-2 hover:bg-accent"
            aria-label="Volver"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">
                {TYPE_LABELS[doc.type] ?? doc.type} {doc.documentNumber}
              </h1>
              <Badge className={STATUS_CLASSES[doc.status] ?? 'bg-muted'}>
                {STATUS_LABELS[doc.status] ?? doc.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {new Date(doc.date).toLocaleDateString('es-AR', {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
        </div>

        {/* Two-column layout */}
        <div className="grid gap-6 lg:grid-cols-5">
          {/* LEFT — image preview */}
          <div className="lg:col-span-3">
            <Card className="overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Documento original</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {imageLoadError ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm p-6">
                    No se pudo cargar el documento
                  </div>
                ) : !imageBlobUrl ? (
                  <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cargando documento...
                  </div>
                ) : doc.imageUrl.toLowerCase().endsWith('.pdf') ? (
                  <iframe
                    src={imageBlobUrl}
                    title="Documento original"
                    className="w-full border-0"
                    style={{ height: '75vh' }}
                  />
                ) : (
                  <img
                    src={imageBlobUrl}
                    alt="Documento original"
                    className="w-full object-contain"
                    style={{ maxHeight: '75vh' }}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* RIGHT — validations + form + actions */}
          <div className="lg:col-span-2 space-y-4">
            {/* Summary cards */}
            {validations && (
              <SummaryCards
                passed={validations.summary.passed}
                warnings={validations.summary.warnings}
                failed={validations.summary.failed}
              />
            )}

            {/* Duplicate alert */}
            {duplicateId && (
              <div className="flex items-start gap-3 rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">Posible duplicado detectado</p>
                  <p className="text-sm text-red-700 dark:text-red-400">
                    Ya existe un comprobante con el mismo proveedor y número.
                  </p>
                  <Link
                    href={`/remitos/${duplicateId}`}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-700 dark:text-red-400 underline underline-offset-2"
                  >
                    Ver comprobante existente
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            )}

            {/* Validations panel */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Validaciones automáticas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {validationsQuery.isLoading && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Ejecutando validaciones...
                  </div>
                )}
                {validations?.checks.map((check) => (
                  <CheckRow key={check.id} check={check} />
                ))}
              </CardContent>
            </Card>

            {/* Fields form */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Datos extraídos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <FieldWithConf
                  label="CUIT del proveedor"
                  value={fieldVal('supplierCuit', doc.supplierCuit)}
                  confidence={getFieldConf(raw, ['supplier', 'cuit'])}
                  edited={editedFields.has('supplierCuit')}
                  onChange={(v) => handleFieldChange('supplierCuit', v)}
                />
                <FieldWithConf
                  label="Número de documento"
                  value={fieldVal('documentNumber', doc.documentNumber)}
                  confidence={getFieldConf(raw, ['documentNumber'])}
                  edited={editedFields.has('documentNumber')}
                  onChange={(v) => handleFieldChange('documentNumber', v)}
                />
                <div className="grid grid-cols-2 gap-3">
                  <FieldWithConf
                    label="Tipo"
                    value={fieldVal('type', TYPE_LABELS[doc.type] ?? doc.type)}
                    confidence={null}
                    edited={false}
                    onChange={() => {}}
                  />
                  <FieldWithConf
                    label="Fecha"
                    value={fieldVal('date', new Date(doc.date).toLocaleDateString('es-AR'))}
                    confidence={getFieldConf(raw, ['date'])}
                    edited={editedFields.has('date')}
                    onChange={(v) => handleFieldChange('date', v)}
                  />
                </div>
                <FieldWithConf
                  label="Proveedor"
                  value={fieldVal('supplierName', '')}
                  confidence={getFieldConf(raw, ['supplier', 'name'])}
                  edited={editedFields.has('supplierName')}
                  onChange={(v) => handleFieldChange('supplierName', v)}
                />
              </CardContent>
            </Card>

            {/* Items */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-sm">
                    Productos ({doc.items.length})
                    {unresolvedCount > 0 && isPending && (
                      <span className="ml-2 text-xs font-normal text-amber-600">
                        {unresolvedCount} sin asignar
                      </span>
                    )}
                  </CardTitle>
                  {isPending && unresolvedCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs px-2 gap-1 shrink-0"
                      disabled={createAllMutation.isPending}
                      onClick={() => createAllMutation.mutate()}
                      title="Crear un producto nuevo por cada ítem sin asignar"
                    >
                      {createAllMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <PackagePlus className="h-3 w-3" />
                      )}
                      Crear todos
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {doc.items.map((item, idx) => (
                  <div key={item.id}>
                    {idx > 0 && <div className="border-t mb-3" />}
                    <ItemRow
                      item={item}
                      docId={id}
                      isPending={isPending}
                      onItemUpdated={(updated) => {
                        updateItemInCache(updated);
                      }}
                      onOpenAssociate={(itemId) => {
                        setAssociateItemId(itemId);
                        setProductSearchTerm('');
                      }}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Actions — only shown for review_needed docs */}
            {isPending && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={actionsPending}
                    onClick={() => setRejectOpen(true)}
                  >
                    {rejectMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-2 h-4 w-4" />
                    )}
                    Rechazar
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!canApprove || actionsPending}
                    title={!canApprove ? 'Resolvé los errores antes de aprobar' : undefined}
                    onClick={() => approveMutation.mutate()}
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    Validar y aprobar
                  </Button>
                </div>
                {unresolvedCount > 0 && (
                  <p className="text-center text-xs text-amber-600 font-medium">
                    Tenés {unresolvedCount} ítem{unresolvedCount === 1 ? '' : 's'} sin asignar — resolvé todos antes de confirmar.
                  </p>
                )}
                {unresolvedCount === 0 && !canApprove && (
                  <button
                    className="w-full text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    onClick={() => setOverrideOpen(true)}
                  >
                    Forzar aprobación de todas formas...
                  </button>
                )}
                {(approveMutation.isError || overrideMutation.isError || rejectMutation.isError) && (
                  <p className="text-center text-xs text-destructive">
                    {((approveMutation.error ?? overrideMutation.error ?? rejectMutation.error) as ApiError | null)?.message ?? 'Ocurrió un error'}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Keyboard shortcuts footer */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground border-t pt-3 mt-2">
          <span><kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd> aprobar</span>
          <span><kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Esc</kbd> cerrar</span>
          <span><kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">Ctrl+S</kbd> guardar</span>
          <span><kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">?</kbd> ayuda</span>
        </div>
      </div>

      {/* Override dialog */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-500" />
              Forzar aprobación
            </DialogTitle>
            <DialogDescription>
              Hay errores críticos en este documento. Ingresá una razón para dejar registro en el
              historial de auditoría.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="override-reason">Razón del override</Label>
            <Input
              id="override-reason"
              placeholder="Ej: Cliente confirmó CUIT correcto por teléfono"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOverrideOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={overrideReason.trim().length < 5 || overrideMutation.isPending}
              onClick={() => overrideMutation.mutate(overrideReason.trim())}
            >
              {overrideMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirmar override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar documento</DialogTitle>
            <DialogDescription>
              Opcional: indicá el motivo del rechazo (se notificará al operario).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason">Motivo (opcional)</Label>
            <Input
              id="reject-reason"
              placeholder="Ej: Imagen ilegible, datos incorrectos..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending}
              onClick={() =>
                rejectMutation.mutate(rejectReason.trim() || undefined)
              }
            >
              {rejectMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirmar rechazo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Associate product dialog */}
      <Dialog
        open={associateItemId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAssociateItemId(null);
            setProductSearchTerm('');
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Asociar a producto existente
            </DialogTitle>
            <DialogDescription>
              Buscá el producto del catálogo. Al asociarlo se guardará el alias para que la próxima vez matchee solo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-7 h-8 text-sm"
                placeholder="Buscar por nombre o código..."
                value={productSearchTerm}
                onChange={(e) => setProductSearchTerm(e.target.value)}
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1 rounded-md border p-1">
              {productSearchQuery.isLoading && (
                <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Buscando...
                </div>
              )}
              {!productSearchQuery.isLoading && (productSearchQuery.data?.items ?? []).length === 0 && (
                <p className="p-4 text-center text-sm text-muted-foreground">
                  {productSearchTerm ? 'No se encontraron productos' : 'Escribí para buscar'}
                </p>
              )}
              {(productSearchQuery.data?.items ?? []).map((product) => (
                <button
                  key={product.id}
                  className="w-full flex items-start gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                  disabled={associateMutation.isPending}
                  onClick={() => {
                    if (associateItemId) {
                      associateMutation.mutate({ itemId: associateItemId, productId: product.id });
                    }
                  }}
                >
                  <span className="font-mono text-xs text-muted-foreground shrink-0 pt-0.5">{product.code}</span>
                  <span className="flex-1 min-w-0 truncate">{product.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {Number(product.stockOnHand).toFixed(0)} {product.unit}
                  </span>
                </button>
              ))}
            </div>
            {associateMutation.isError && (
              <p className="text-xs text-destructive">
                {(associateMutation.error as ApiError | null)?.message ?? 'Error al asociar'}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAssociateItemId(null); setProductSearchTerm(''); }}>
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keyboard shortcuts help dialog */}
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atajos de teclado</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            {[
              { keys: 'Enter', desc: 'Aprobar documento (fuera de inputs)' },
              { keys: 'Ctrl+Enter', desc: 'Aprobar desde cualquier campo' },
              { keys: 'Esc', desc: 'Volver al listado' },
              { keys: 'Ctrl+S', desc: 'Guardar borrador (próximamente)' },
              { keys: '?', desc: 'Esta pantalla de ayuda' },
            ].map(({ keys, desc }) => (
              <div key={keys} className="flex items-center justify-between gap-4">
                <kbd className="rounded bg-muted px-2 py-1 font-mono text-xs">{keys}</kbd>
                <span className="text-muted-foreground flex-1">{desc}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
