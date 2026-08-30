'use client';

/**
 * Alertas sonoros do painel (sem arquivos de áudio: tons gerados via WebAudio).
 * Navegadores só liberam áudio após um gesto do usuário — `enable()` deve ser chamado de um clique.
 */
const KEY = 'messa_sound';
let ctx: AudioContext | null = null;

export function isSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}

/** Chamar a partir de um clique: cria/retoma o AudioContext. */
export async function unlockAudio(): Promise<boolean> {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

function tone(freq: number, at: number, dur: number, gain = 0.9) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square'; // timbre agudo e penetrante: atravessa o barulho de bar
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  o.connect(g).connect(ctx.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

export type Chime = 'request' | 'order' | 'test';

/** request: campainha de 3 notas repetida 3× (~2,5 s). order: 2 notas × 2. */
export async function chime(kind: Chime) {
  if (!isSoundEnabled()) return;
  if (!(await unlockAudio()) || !ctx) return;
  const t = ctx.currentTime + 0.02;
  if (kind === 'request') {
    for (let i = 0; i < 3; i++) {
      const b = t + i * 0.85;
      tone(1047, b, 0.2);
      tone(1319, b + 0.22, 0.2);
      tone(1760, b + 0.44, 0.35);
    }
  } else if (kind === 'order') {
    for (let i = 0; i < 2; i++) {
      const b = t + i * 0.6;
      tone(880, b, 0.15);
      tone(1319, b + 0.18, 0.3);
    }
  } else {
    tone(1047, t, 0.2);
    tone(1319, t + 0.22, 0.3);
  }
}

// ---------------------------------------------------------------------------
// Notificações do sistema (balão no canto da tela) — funcionam com a aba em segundo plano
// ou o navegador minimizado; exigem HTTPS e permissão concedida a partir de um clique.
// ---------------------------------------------------------------------------

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

/** Chamar a partir de um clique. */
export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Mostra a notificação só quando a aba não está visível (ou `force`); `tag` evita duplicatas. */
export function notify(title: string, body: string, tag: string, force = false): boolean {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  if (!force && document.visibilityState === 'visible' && document.hasFocus()) return false;
  try {
    const n = new Notification(title, { body, tag, icon: '/icon.svg', badge: '/icon.svg', requireInteraction: true, lang: 'pt-BR' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
    return true;
  } catch {
    /* alguns navegadores móveis exigem service worker; o som continua */
    return false;
  }
}
