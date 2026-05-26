import { renderDocumentProcessed } from './document-processed.js';
import { renderDocumentApproved } from './document-approved.js';
import { renderDocumentRejected } from './document-rejected.js';
import { renderStockLow } from './stock-low.js';
import { renderDailyReport } from './daily-report.js';

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

export function renderTemplate(template: string, params: Record<string, unknown>): RenderedTemplate {
  switch (template) {
    case 'document.processed':
      return renderDocumentProcessed(params as unknown as Parameters<typeof renderDocumentProcessed>[0]);
    case 'document.approved':
      return renderDocumentApproved(params as unknown as Parameters<typeof renderDocumentApproved>[0]);
    case 'document.rejected':
      return renderDocumentRejected(params as unknown as Parameters<typeof renderDocumentRejected>[0]);
    case 'stock.low':
      return renderStockLow(params as unknown as Parameters<typeof renderStockLow>[0]);
    case 'daily.report':
      return renderDailyReport(params as unknown as Parameters<typeof renderDailyReport>[0]);
    default:
      return {
        subject: `Notificación: ${template}`,
        html: `<p>Evento: ${template}</p><pre>${JSON.stringify(params, null, 2)}</pre>`,
        text: `Evento: ${template}\n${JSON.stringify(params, null, 2)}`,
      };
  }
}
