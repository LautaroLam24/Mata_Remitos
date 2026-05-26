import { baseLayout } from './base.js';

export interface DailyReportParams {
  date: string;
  tenantName: string;
  remitosProcessed: number;
  remitosApproved: number;
  remitosRejected: number;
  remitosPending: number;
  lowStockProducts: Array<{ name: string; code: string; stockOnHand: number; unit: string; minStock: number }>;
  appUrl?: string;
}

export function renderDailyReport(params: DailyReportParams): { subject: string; html: string; text: string } {
  const dashboardUrl = params.appUrl ? `${params.appUrl}/dashboard` : '/dashboard';

  const statCard = (label: string, value: number, color: string) => `
    <td style="text-align:center;padding:16px;background:#f9fafb;border-radius:6px;">
      <p style="margin:0 0 4px;font-size:28px;font-weight:700;color:${color};">${value}</p>
      <p style="margin:0;font-size:12px;color:#6b7280;">${label}</p>
    </td>`;

  const lowStockSection = params.lowStockProducts.length > 0
    ? `
    <h3 style="margin:24px 0 12px;font-size:16px;font-weight:600;color:#111827;">Productos con stock bajo</h3>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;">
      ${params.lowStockProducts.map((p) => `
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#374151;border-bottom:1px solid #f3f4f6;">${p.name} <span style="color:#9ca3af;">(${p.code})</span></td>
          <td style="padding:8px 12px;font-size:13px;color:#dc2626;font-weight:600;text-align:right;border-bottom:1px solid #f3f4f6;">${p.stockOnHand} ${p.unit} / mín ${p.minStock}</td>
        </tr>`).join('')}
    </table>`
    : `<p style="margin:24px 0 0;font-size:14px;color:#16a34a;font-weight:500;">✓ Todos los productos tienen stock suficiente.</p>`;

  const content = `
    <h2 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;">Reporte diario</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#9ca3af;">${params.tenantName} &nbsp;·&nbsp; ${params.date}</p>

    <table width="100%" cellpadding="8" cellspacing="8" style="margin-bottom:8px;">
      <tr>
        ${statCard('Procesados', params.remitosProcessed, '#111827')}
        ${statCard('Aprobados', params.remitosApproved, '#16a34a')}
        ${statCard('Rechazados', params.remitosRejected, '#dc2626')}
        ${statCard('Pendientes', params.remitosPending, '#d97706')}
      </tr>
    </table>

    ${lowStockSection}

    <div style="margin-top:28px;">
      <a href="${dashboardUrl}"
         style="display:inline-block;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
        Ir al dashboard
      </a>
    </div>
  `;

  return {
    subject: `Reporte diario ${params.date} — ${params.tenantName}`,
    html: baseLayout(content, `Reporte diario ${params.date}`),
    text: [
      `Reporte diario — ${params.tenantName} — ${params.date}`,
      '',
      `Procesados: ${params.remitosProcessed}`,
      `Aprobados:  ${params.remitosApproved}`,
      `Rechazados: ${params.remitosRejected}`,
      `Pendientes: ${params.remitosPending}`,
      '',
      params.lowStockProducts.length > 0
        ? `Stock bajo:\n${params.lowStockProducts.map((p) => `  - ${p.name}: ${p.stockOnHand} ${p.unit} (mín ${p.minStock})`).join('\n')}`
        : 'Stock: todos los productos tienen stock suficiente.',
      '',
      `Dashboard: ${dashboardUrl}`,
    ].join('\n'),
  };
}
