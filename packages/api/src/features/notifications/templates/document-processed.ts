import { baseLayout, badge, infoRow } from './base.js';

export interface DocumentProcessedParams {
  documentNumber: string;
  supplierName: string;
  confidence: number;
  documentId: string;
  appUrl?: string;
}

export function renderDocumentProcessed(params: DocumentProcessedParams): { subject: string; html: string; text: string } {
  const confidenceColor = params.confidence >= 85 ? '#16a34a' : params.confidence >= 60 ? '#d97706' : '#dc2626';
  const confidenceLabel = params.confidence >= 85 ? 'Alta confianza' : params.confidence >= 60 ? 'Confianza media' : 'Baja confianza';

  const reviewUrl = params.appUrl
    ? `${params.appUrl}/remitos/${params.documentId}`
    : `/remitos/${params.documentId}`;

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Nuevo remito listo para revisión</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Se procesó un remito y está esperando tu aprobación.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${infoRow('Número', params.documentNumber)}
      ${infoRow('Proveedor', params.supplierName)}
      ${infoRow('Confianza OCR', `${params.confidence}% &nbsp;${badge(confidenceLabel, confidenceColor)}`)}
    </table>

    <a href="${reviewUrl}"
       style="display:inline-block;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
      Revisar remito
    </a>
  `;

  return {
    subject: `Nuevo remito para revisar: ${params.documentNumber} — ${params.supplierName}`,
    html: baseLayout(content, 'Nuevo remito para revisar'),
    text: `Nuevo remito listo para revisión\n\nNúmero: ${params.documentNumber}\nProveedor: ${params.supplierName}\nConfianza OCR: ${params.confidence}%\n\nRevisalo en: ${reviewUrl}`,
  };
}
