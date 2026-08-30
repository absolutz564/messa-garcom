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

/**
 * Sino de balcão sintetizado (síntese aditiva: parciais inarmônicos com decaimentos diferentes).
 * Soa como campainha de recepção/iFood: ataque forte, brilho metálico, cauda ~0,9 s.
 */
function bell(at: number, base = 1760, gain = 1.0) {
  if (!ctx) return;
  const partials: Array<[number, number, number]> = [
    [1.0, 1.0, 0.9],   // [razão de frequência, amplitude, duração]
    [2.0, 0.55, 0.7],
    [2.76, 0.4, 0.5],
    [4.07, 0.25, 0.35],
    [5.4, 0.15, 0.25],
  ];
  const master = ctx.createGain();
  master.gain.value = gain;
  master.connect(ctx.destination);
  for (const [ratio, amp, dur] of partials) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = base * ratio;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(amp, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0005, at + dur);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + dur + 0.05);
  }
}

export type Chime = 'request' | 'order' | 'test';

/** request: 5 toques de sino (~4 s, estilo iFood). order: 2 toques. test: 1 toque. */
export async function chime(kind: Chime) {
  if (!isSoundEnabled()) return;
  if (!(await unlockAudio()) || !ctx) return;
  const t = ctx.currentTime + 0.02;
  if (kind === 'request') {
    for (let i = 0; i < 5; i++) bell(t + i * 0.75, i % 2 === 0 ? 1760 : 2093);
  } else if (kind === 'order') {
    bell(t, 1760);
    bell(t + 0.6, 2093);
  } else {
    bell(t, 1760);
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
