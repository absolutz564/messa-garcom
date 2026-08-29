import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../config/config';

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Port de e-mail (RNF-13). Provedor: Resend via REST (sem SDK).
 * Sem RESEND_API_KEY (dev/teste) apenas loga — o link de convite continua visível na tela.
 */
@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get enabled(): boolean {
    return Boolean(this.config.RESEND_API_KEY);
  }

  async send(msg: EmailMessage): Promise<boolean> {
    if (!this.enabled) {
      this.log.log(`[email desativado] para ${msg.to}: ${msg.subject}`);
      return false;
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${this.config.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: this.config.EMAIL_FROM, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      });
      if (!res.ok) {
        this.log.error(`Resend ${res.status}: ${await res.text()}`);
        return false;
      }
      return true;
    } catch (err) {
      this.log.error(err);
      return false;
    }
  }

  inviteEmail(to: string, name: string, tenantName: string, role: string, url: string): EmailMessage {
    const roleLabel = { admin: 'administrador', operator: 'operador/caixa', waiter: 'garçom' }[role] ?? role;
    const text = `Olá, ${name}!\n\nVocê foi convidado(a) para a equipe de ${tenantName} no Messa como ${roleLabel}.\n\nAtive seu acesso (link válido por 7 dias):\n${url}\n\nSe você não esperava este convite, ignore este e-mail.`;
    const html = `<p>Olá, ${escape(name)}!</p><p>Você foi convidado(a) para a equipe de <strong>${escape(tenantName)}</strong> no Messa como <strong>${roleLabel}</strong>.</p><p><a href="${url}" style="display:inline-block;padding:12px 20px;background:#e11d48;color:#fff;border-radius:8px;text-decoration:none">Ativar meu acesso</a></p><p style="color:#666;font-size:12px">Link válido por 7 dias. Se você não esperava este convite, ignore este e-mail.</p>`;
    return { to, subject: `Convite para a equipe de ${tenantName} — Messa`, html, text };
  }
}

function escape(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
