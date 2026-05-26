import { config } from '../../shared/config.js';

export interface EmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendResult {
  id: string;
}

export async function sendEmail(params: EmailParams): Promise<SendResult | null> {
  if (!config.RESEND_API_KEY) {
    console.log(`[Email] RESEND_API_KEY not configured — skipping send to ${params.to} (${params.subject})`);
    return null;
  }

  const { Resend } = await import('resend');
  const resend = new Resend(config.RESEND_API_KEY);
  const from = config.RESEND_FROM_EMAIL ?? 'Mata Remitos <noreply@mataremitos.com>';

  const { data, error } = await resend.emails.send({
    from,
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.text ? { text: params.text } : {}),
  });

  if (error) throw new Error(`Resend error: ${error.message}`);
  if (!data) throw new Error('Resend returned no data');
  return { id: data.id };
}
