import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { RULES, isStaffOnline } from '@messa/domain';

type Listener = (tenantId: string, staffOnline: boolean) => void;

interface TenantPresence {
  sockets: number;
  /** Instante em que o último socket caiu; null enquanto nunca houve queda. */
  lastSeenAt: Date | null;
  /** Timer da carência (BR-19); pendente = ainda anunciado como online. */
  graceTimer: NodeJS.Timeout | null;
  announced: boolean;
}

/**
 * BR-19 / ADR-005 — presença da equipe derivada dos sockets da room `tenant:{id}`.
 * Estado em memória de propósito: é derivado do transporte e se reconstrói sozinho se o
 * processo reinicia (todos os sockets caem junto). Não vai para a outbox nem para o banco.
 */
@Injectable()
export class StaffPresenceService implements OnModuleDestroy {
  private readonly log = new Logger(StaffPresenceService.name);
  private readonly tenants = new Map<string, TenantPresence>();
  private readonly listeners = new Set<Listener>();

  onModuleDestroy() {
    for (const t of this.tenants.values()) if (t.graceTimer) clearTimeout(t.graceTimer);
    this.tenants.clear();
  }

  /** O gateway avisa quando um socket de staff entra/sai. */
  connected(tenantId: string) {
    const t = this.entry(tenantId);
    t.sockets += 1;
    if (t.graceTimer) {
      clearTimeout(t.graceTimer);
      t.graceTimer = null;
    }
    this.announce(tenantId, t, true);
  }

  disconnected(tenantId: string) {
    const t = this.tenants.get(tenantId);
    if (!t || t.sockets === 0) return;
    t.sockets -= 1;
    if (t.sockets > 0) return;
    t.lastSeenAt = new Date();
    // Carência: só anuncia offline se ninguém reconectar (F5 no painel não é queda).
    t.graceTimer = setTimeout(() => {
      t.graceTimer = null;
      this.announce(tenantId, t, false);
    }, RULES.STAFF_PRESENCE_GRACE_MS);
    t.graceTimer.unref?.();
  }

  isOnline(tenantId: string): boolean {
    const t = this.tenants.get(tenantId);
    if (!t) return false;
    return isStaffOnline(new Date(), t.sockets, t.lastSeenAt);
  }

  /** O gateway se inscreve para propagar a virada aos clientes do tenant. */
  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private entry(tenantId: string): TenantPresence {
    let t = this.tenants.get(tenantId);
    if (!t) {
      t = { sockets: 0, lastSeenAt: null, graceTimer: null, announced: false };
      this.tenants.set(tenantId, t);
    }
    return t;
  }

  /** Só notifica na transição, para não inundar os clientes a cada socket. */
  private announce(tenantId: string, t: TenantPresence, online: boolean) {
    if (t.announced === online) return;
    t.announced = online;
    this.log.log(`tenant ${tenantId}: equipe ${online ? 'online' : 'offline'}`);
    for (const l of this.listeners) {
      try {
        l(tenantId, online);
      } catch (err) {
        this.log.error(err);
      }
    }
  }
}
