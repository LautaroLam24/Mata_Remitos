import { baseLayout, infoRow } from './base.js';

export interface DocumentApprovedParams {
  documentNumber: string;
  supplierName: string;
  movementsCreated: number;
  documentId: string;
  appUrl?: string;
}

export function renderDocumentApproved(params: DocumentApprovedParams): { subject: string; html: string; text: string } {
  const detailUrl = params.appUrl
    ? `${params.appUrl}/remitos/${params.documentId}`
    : `/remitos/${params.documentId}`;

  const content = `
    <div style="display:inline-block;padding:6px 14px;background:#dcfce7;border-radius:6px;margin-bottom:20px;">
      <span style="color:#16a34a;font-size:13px;font-weight:600;">✓ Aprobado</span>
    </div>

    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Remito aprobado</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">El remito fue aprobado y el stock fue actualizado correctamente.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      ${infoRow('Número', params.documentNumber)}
      ${infoRow('Proveedor', params.supplierName)}
      ${infoRow('Movimientos de stock', String(params.movementsCreated))}
    </table>

    <a href="${detailUrl}"
       style="display:inline-block;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
      Ver detalle
    </a>
  `;

  return {
    subject: `Remito aprobado: ${params.documentNumber} — ${params.supplierName}`,
    html: baseLayout(content, 'Remito aprobado'),
    text: `Remito aprobado\n\nNúmero: ${params.documentNumber}\nProveedor: ${params.supplierName}\nMovimientos de stock creados: ${params.movementsCreated}\n\nVer detalle: ${detailUrl}`,
  };
}
