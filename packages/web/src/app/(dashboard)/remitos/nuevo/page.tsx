"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocumentCapture } from "@/components/features/DocumentCapture";
import { ConfidenceField } from "@/components/features/ConfidenceField";
import { api, type DocumentDetail, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

function sanitizeError(raw?: string): string {
  if (!raw) return "Error al procesar el documento";
  if (raw.includes("quota") || raw.includes("429") || raw.includes("Too Many Requests")) {
    return "El servicio de análisis está temporalmente no disponible. Intentá en unos minutos.";
  }
  if (raw.includes("ANTHROPIC_API_KEY") || raw.includes("GEMINI_API_KEY")) {
    return "Error de configuración del servidor. Contactá al administrador.";
  }
  if (raw.length > 120 || raw.includes("googleapis.com") || raw.includes("https://")) {
    return "No se pudo procesar el documento. Revisá que la imagen sea legible e intentá de nuevo.";
  }
  return raw;
}

const PROCESSING_MESSAGES = [
  "Analizando imagen...",
  "Extrayendo datos del documento...",
  "Identificando productos...",
  "Verificando reglas de negocio...",
  "Casi listo...",
];

type PageState = "capture" | "uploading" | "processing" | "result" | "error";

export default function NuevoRemitoPage() {
  const router = useRouter();
  const [pageState, setPageState] = useState<PageState>("capture");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [jobId, setJobId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [document, setDocument] = useState<DocumentDetail | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [msgIndex, setMsgIndex] = useState(0);

  // Rotate processing messages every 2s
  useEffect(() => {
    if (pageState !== "processing") return;
    const id = setInterval(
      () => setMsgIndex((i) => (i + 1) % PROCESSING_MESSAGES.length),
      2000
    );
    return () => clearInterval(id);
  }, [pageState]);

  // Poll job status every 2s while processing
  const jobQuery = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => api.remitos.getJobStatus(jobId!),
    enabled: !!jobId && pageState === "processing",
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "completed" || status === "failed" ? false : 2000;
    },
  });

  useEffect(() => {
    const data = jobQuery.data;
    if (!data) return;
    if (data.status === "completed" && data.documentId) {
      setDocumentId(data.documentId);
    } else if (data.status === "failed") {
      setErrorMessage(sanitizeError(data.error));
      setPageState("error");
    }
  }, [jobQuery.data]);

  // Load document once job completes
  const docQuery = useQuery({
    queryKey: ["document", documentId],
    queryFn: () => api.remitos.getDocument(documentId!),
    enabled: !!documentId,
  });

  useEffect(() => {
    if (docQuery.data) {
      setDocument(docQuery.data);
      setPageState("result");
    }
    if (docQuery.isError) {
      setErrorMessage("Error al cargar el documento procesado");
      setPageState("error");
    }
  }, [docQuery.data, docQuery.isError]);

  // Approve
  const approveMutation = useMutation({
    mutationFn: () => api.remitos.approve(documentId!),
    onSuccess: () => router.push("/remitos?aprobado=1"),
    onError: (err) => {
      setErrorMessage(
        err instanceof ApiError ? err.message : "Error al aprobar el documento"
      );
    },
  });

  // Reject
  const rejectMutation = useMutation({
    mutationFn: () => api.remitos.reject(documentId!),
    onSuccess: () => router.push("/remitos"),
    onError: (err) => {
      setErrorMessage(
        err instanceof ApiError
          ? err.message
          : "Error al rechazar el documento"
      );
    },
  });

  const handleFileSelected = useCallback(async (file: File) => {
    setPageState("uploading");
    setUploadProgress(0);

    const timer = setInterval(
      () => setUploadProgress((p) => Math.min(p + 20, 90)),
      150
    );

    try {
      const result = await api.remitos.upload(file);
      clearInterval(timer);
      setUploadProgress(100);
      setTimeout(() => {
        setJobId(result.jobId);
        setPageState("processing");
      }, 300);
    } catch (err) {
      clearInterval(timer);
      setErrorMessage(
        err instanceof ApiError ? err.message : "Error al subir el archivo"
      );
      setPageState("error");
    }
  }, []);

  function handleReset() {
    setPageState("capture");
    setJobId(null);
    setDocumentId(null);
    setDocument(null);
    setUploadProgress(0);
    setMsgIndex(0);
  }

  // ─── Capture / Uploading ─────────────────────────────────────────────────────

  if (pageState === "capture" || pageState === "uploading") {
    return (
      <div className="mx-auto max-w-lg space-y-6">
        <PageHeader subtitle="Fotografiá o subí el documento" />
        <DocumentCapture
          onFileSelected={handleFileSelected}
          isUploading={pageState === "uploading"}
          uploadProgress={uploadProgress}
        />
      </div>
    );
  }

  // ─── Processing ───────────────────────────────────────────────────────────────

  if (pageState === "processing") {
    return (
      <div className="mx-auto max-w-lg">
        <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-8 text-center">
          <div className="relative h-20 w-20">
            <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
            <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
          </div>

          <div className="space-y-2">
            <p className="text-lg font-semibold">
              {PROCESSING_MESSAGES[msgIndex]}
            </p>
            <p className="text-sm text-muted-foreground">
              Esto puede tardar unos segundos
            </p>
          </div>

          <div className="flex gap-1.5">
            {PROCESSING_MESSAGES.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 w-1.5 rounded-full transition-colors duration-300",
                  i === msgIndex ? "bg-primary" : "bg-muted"
                )}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────────

  if (pageState === "error") {
    return (
      <div className="mx-auto max-w-lg">
        <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-6 text-center">
          <div className="rounded-full bg-destructive/10 p-5">
            <XCircle className="h-10 w-10 text-destructive" />
          </div>
          <div className="space-y-1">
            <p className="text-lg font-semibold">Ocurrió un error</p>
            <p className="text-sm text-muted-foreground">{errorMessage}</p>
          </div>
          <Button onClick={handleReset}>Intentar de nuevo</Button>
        </div>
      </div>
    );
  }

  // ─── Result ───────────────────────────────────────────────────────────────────

  if (!document) return null;

  const actionsPending = approveMutation.isPending || rejectMutation.isPending;

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-28">
      <PageHeader subtitle="Revisá lo que extrajo la IA" />

      {/* Overall confidence banner */}
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg p-3 text-sm",
          document.overallConfidence >= 85
            ? "bg-green-50 text-green-800"
            : document.overallConfidence >= 70
              ? "bg-yellow-50 text-yellow-800"
              : "bg-red-50 text-red-800"
        )}
      >
        {document.overallConfidence >= 85 ? (
          <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div>
          <p className="font-medium">
            Confianza general: {document.overallConfidence}%
          </p>
          {document.warnings.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs opacity-90">
              {document.warnings.map((w, i) => (
                <li key={i}>• {w}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Document header fields */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Datos del documento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ConfidenceField
            label="CUIT Proveedor"
            value={document.supplierCuit}
            confidence={document.overallConfidence}
          />
          <ConfidenceField
            label="Número de documento"
            value={document.documentNumber}
            confidence={document.overallConfidence}
          />
          <div className="grid grid-cols-2 gap-3">
            <ConfidenceField
              label="Tipo"
              value={document.type}
              confidence={document.overallConfidence}
            />
            <ConfidenceField
              label="Fecha"
              value={new Date(document.date).toLocaleDateString("es-AR")}
              confidence={document.overallConfidence}
            />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Productos ({document.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {document.items.map((item, i) => {
            const itemConfidence =
              item.confidenceScore ?? document.overallConfidence;
            return (
              <div key={item.id} className="space-y-2">
                {i > 0 && <div className="border-t pt-1" />}
                <ConfidenceField
                  label={`Producto ${i + 1}`}
                  value={item.rawDescription}
                  confidence={itemConfidence}
                />
                <div className="grid grid-cols-2 gap-2">
                  <ConfidenceField
                    label="Cantidad"
                    value={`${item.quantity} ${item.unit}`}
                    confidence={itemConfidence}
                  />
                  {item.unitPrice !== null && (
                    <ConfidenceField
                      label="Precio unit."
                      value={`$${item.unitPrice}`}
                      confidence={itemConfidence}
                    />
                  )}
                </div>
                <MatchStatusBadge status={item.matchStatus} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 border-t bg-background/95 p-4 backdrop-blur-sm lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
        <div className="mx-auto flex max-w-lg gap-3">
          <Button
            variant="outline"
            className="flex-1"
            disabled={actionsPending}
            onClick={() => rejectMutation.mutate()}
          >
            {rejectMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="mr-2 h-4 w-4" />
            )}
            Cancelar
          </Button>
          <Button
            className="flex-1"
            disabled={actionsPending}
            onClick={() => approveMutation.mutate()}
          >
            {approveMutation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="mr-2 h-4 w-4" />
            )}
            Confirmar al stock
          </Button>
        </div>
        {(approveMutation.isError || rejectMutation.isError) && (
          <p className="mt-2 text-center text-xs text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

function PageHeader({ subtitle }: { subtitle: string }) {
  return (
    <div className="flex items-center gap-3">
      <Link href="/remitos" className="rounded-lg p-2 hover:bg-accent">
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <div>
        <h1 className="text-xl font-bold">Nuevo remito</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

function MatchStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    matched: {
      label: "✓ Producto identificado en catálogo",
      cls: "bg-green-100 text-green-700",
    },
    pending: {
      label: "⏳ Pendiente de match con catálogo",
      cls: "bg-yellow-100 text-yellow-700",
    },
  };
  const { label, cls } = config[status] ?? {
    label: "Sin match en catálogo",
    cls: "bg-muted text-muted-foreground",
  };
  return (
    <span className={cn("inline-block rounded px-2 py-1 text-xs", cls)}>
      {label}
    </span>
  );
}
