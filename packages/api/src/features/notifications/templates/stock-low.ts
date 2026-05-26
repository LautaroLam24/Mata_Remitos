import { baseLayout } from './base.js';

export interface StockLowProduct {
  code: string;
  name: string;
  unit: string;
  stockOnHand: number;
  minStock: number;
}

export interface StockLowParams {
  products: StockLowProduct[];
  appUrl?: string;
}

export function renderStockLow(params: StockLowParams): { subject: string; html: string; text: string } {
  const productsUrl = params.appUrl ? `${params.appUrl}/productos?lowStock=true` : '/productos?lowStock=true';

  const rows = params.products
    .map((p) => {
      const isCritical = p.stockOnHand <= 0;
      const rowBg = isCritical ? '#fff1f2' : '#fffbeb';
      const badge = isCritical
        ? '<span style="color:#dc2626;font-size:11px;font-weight:700;">CRÍTICO</span>'
        : '<span style="color:#d97706;font-size:11px;font-weight:700;">BAJO</span>';
      return `
        <tr style="background:${rowBg};">
          <td style="padding:10px 12px;font-size:13px;color:#374151;border-bottom:1px solid #e5e7eb;">
            <strong>${p.name}</strong><br/>
            <span style="color:#9ca3af;font-size:11px;">${p.code}</span>
          </td>
          <td style="padding:10px 12px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;text-align:right;">
            ${p.stockOnHand} ${p.unit}
          </td>
          <td style="padding:10px 12px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;text-align:right;">
            mín ${p.minStock}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">
            ${badge}
          </td>
        </tr>`;
    })
    .join('');

  const count = params.products.length;

  const content = `
    <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">Alerta de stock bajo</h2>
    <p style="margin:0 0 24px;font-size:15px;color:#6b7280;">
      ${count} producto${count !== 1 ? 's' : ''} ${count !== 1 ? 'están' : 'está'} por debajo del stock mínimo.
    </p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-bottom:24px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:10px 12px;font-size:12px;color:#6b7280;text-align:left;border-bottom:1px solid #e5e7eb;">Producto</th>
          <th style="padding:10px 12px;font-size:12px;color:#6b7280;text-align:right;border-bottom:1px solid #e5e7eb;">Stock actual</th>
          <th style="padding:10px 12px;font-size:12px;color:#6b7280;text-align:right;border-bottom:1px solid #e5e7eb;">Mínimo</th>
          <th style="padding:10px 12px;font-size:12px;color:#6b7280;text-align:center;border-bottom:1px solid #e5e7eb;">Estado</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>

    <a href="${productsUrl}"
       style="display:inline-block;padding:12px 24px;background:#18181b;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">
      Ver productos con bajo stock
    </a>
  `;

  const textRows = params.products
    .map((p) => `- ${p.name} (${p.code}): ${p.stockOnHand} ${p.unit} (mín ${p.minStock})`)
    .join('\n');

  return {
    subject: `Alerta: ${count} producto${count !== 1 ? 's' : ''} con stock bajo`,
    html: baseLayout(content, 'Alerta de stock bajo'),
    text: `Alerta de stock bajo\n\n${count} producto${count !== 1 ? 's' : ''} por debajo del mínimo:\n\n${textRows}\n\nVer productos: ${productsUrl}`,
  };
}
