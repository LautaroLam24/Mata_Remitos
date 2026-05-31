'use client';

import { useState } from 'react';
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
import { api, type ValidationCheck, type RawExtraction, type ApiError } from '@/lib/api';
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
      ? 'border-green-100'
      : check.status === 'warning'
        ? 'border-amber-100'
        : 'border-red-100';
  const bgCls =
    check.status === 'passed'
      ? 'bg-green-50/50'
      : check.status === 'warning'
        ? 'bg-amber-50/50'
        : 'bg-red-50/50';

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
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-center">
        <div className="text-2xl font-bold text-green-700">{passed}</div>
        <div className="text-xs text-green-600">Pasadas</div>
      </div>
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-center">
        <div className="text-2xl font-bold text-amber-700">{warnings}</div>
        <div className="text-xs text-amber-600">Advertencias</div>
      </div>
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-center">
        <div className="text-2xl font-bold text-red-700">{failed}</div>
        <div className="text-xs text-red-600">Errores</div>
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
          confidence !== null && !edited && confidence < 70 && 'border-red-400 bg-red-50',
          confidence !== null && !edited && confidence >= 70 && confidence < 85 && 'border-amber-400',
        )}
      />
    </div>
  );
}

// ─── Match badge ──────────────────────────────────────────────────────────────

function MatchBadge({ status }: { status: string }) {
  if (status === 'matched') {
    return (
      <span className="inline-block rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700">
        ✓ En catálogo
      </span>
    );
  }
  return (
    <span className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
      Sin match
    </span>
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
  const canApprove = validations?.summary.canApprove ?? true;
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={doc.imageUrl}
                  alt="Documento original"
                  className="w-full object-contain"
                  style={{ maxHeight: '75vh' }}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                    target.parentElement!.innerHTML =
                      '<div class="flex items-center justify-center h-48 text-muted-foreground text-sm p-6">No se pudo cargar la imagen</div>';
                  }}
                />
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
              <div className="flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800">Posible duplicado detectado</p>
                  <p className="text-sm text-red-700">
                    Ya existe un comprobante con el mismo proveedor y número.
                  </p>
                  <Link
                    href={`/remitos/${duplicateId}`}
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-700 underline underline-offset-2"
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
                <CardTitle className="text-sm">
                  Productos ({doc.items.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {doc.items.map((item, idx) => {
                  const itemConf = item.confidenceScore;
                  return (
                    <div key={item.id} className="space-y-1.5">
                      {idx > 0 && <div className="border-t pt-1" />}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium truncate">
                              {item.rawDescription}
                            </span>
                            {itemConf !== null && (
                              <ConfidenceBadge confidence={itemConf} />
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                            <span>
                              {item.quantity} {item.unit}
                            </span>
                            {item.unitPrice !== null && (
                              <span>${item.unitPrice.toFixed(2)} c/u</span>
                            )}
                          </div>
                        </div>
                        <MatchBadge status={item.matchStatus} />
                      </div>
                    </div>
                  );
                })}
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
                {!canApprove && (
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
    </>
  );
}
