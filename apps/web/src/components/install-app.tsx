'use client';

import { useEffect, useState } from 'react';

/** Evento do Chrome/Edge; o Safari nunca dispara (por isso o passo a passo manual no iOS). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'messa_install_dismissed';

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS não implementa display-mode; expõe esta propriedade fora do padrão.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

/**
 * Registra o service worker e oferece "instalar" no painel da equipe (RF-74/PDR-019).
 *
 * Só aparece para staff: o cliente entra pelo QR, pede e vai embora — convidá-lo a
 * instalar um app seria ruído. Fica escondido quando o app já está instalado ou quando
 * a pessoa dispensou o convite.
 */
export function InstallApp() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }

    if (isStandalone() || localStorage.getItem(DISMISSED_KEY) === '1') return;

    // iOS: sem evento; mostramos o passo a passo de "Adicionar à Tela de Início".
    if (isIos()) {
      setHidden(false);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => setHidden(true));
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setHidden(true);
  }

  async function install() {
    if (!prompt) return setShowIosHelp(true);
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') setHidden(true);
    setPrompt(null);
  }

  if (hidden) return null;

  return (
    <div className="border-b border-neutral-200 bg-neutral-100 px-4 py-2 text-sm">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center">
        <span className="text-neutral-700">Instale o Messa no aparelho para abrir direto, sem o navegador.</span>
        {isIos() || showIosHelp ? (
          <span className="text-neutral-600">
            No iPhone: toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.
          </span>
        ) : (
          <button onClick={install} className="rounded-lg bg-neutral-900 px-3 py-1 font-medium text-white hover:bg-neutral-700">
            Instalar
          </button>
        )}
        <button onClick={dismiss} className="text-neutral-500 underline">
          agora não
        </button>
      </div>
    </div>
  );
}
