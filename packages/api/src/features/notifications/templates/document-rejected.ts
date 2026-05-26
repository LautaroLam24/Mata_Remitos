import { baseLayout, infoRow } from './base.js';

export interface DocumentRejectedParams {
  documentNumber: string;
  supplierName: string;
  reason?: string;
  documentId: string;
  appUrl?: string;
}

export function renderDocumentRejected(params: DocumentRejectedParams): { subject: string; html: string; text: string } {
  const detailUrl = params.appUrl
    ? `${params.appUrl}/remitos/${params.documentId}`
    : `/remitos/${params.documentId}`;

  const reasonRow = params.reason
    ? infoRow('Motivo', params.reason)
    : '';

  const content = `
    <div style="display:inline-block;padding:6px 14px;background:#fee2e2;border-radius:6px;margin-bottom:20px;">
      <span style="color:#dc2626;font-size:13px;font-weight:600;">✕ Rechazado</span>
    </div>

    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Remito rechazado</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">El remito fue rechazado. El stock no fue modificado.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${infoRow('Número', params.documentNumber)}
      ${infoRow('Proveedor', params.supplierName)}
      ${reasonRow}
    </table>

    <a href="${detailUrl}"
       style="display:inline-block;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
      Ver detalle
    </a>
  `;

  return {
    subject: `Remito rechazado: ${params.documentNumber} — ${params.supplierName}`,
    html: baseLayout(content, 'Remito rechazado'),
    text: `Remito rechazado\n\nNúmero: ${params.documentNumber}\nProveedor: ${params.supplierName}${params.reason ? `\nMotivo: ${params.reason}` : ''}\n\nVer detalle: ${detailUrl}`,
  };
}
