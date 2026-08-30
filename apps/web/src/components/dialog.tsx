'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from './ui';

interface ConfirmOptions {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}
interface PromptOptions {
  title: string;
  label?: string;
  initial?: string;
  placeholder?: string;
  maxLength?: number;
  confirmLabel?: string;
}

type Pending =
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

/** Substitui window.confirm/prompt por um diálogo do sistema. Envolver as superfícies de staff/admin. */
export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const confirm = useCallback((opts: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ kind: 'confirm', opts, resolve })), []);
  const prompt = useCallback((opts: PromptOptions) => new Promise<string | null>((resolve) => setPending({ kind: 'prompt', opts, resolve })), []);
  const close = (value: boolean | string | null) => {
    if (!pending) return;
    if (pending.kind === 'confirm') pending.resolve(Boolean(value));
    else pending.resolve(typeof value === 'string' ? value : null);
    setPending(null);
  };
  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}
      {pending && <Modal pending={pending} onClose={close} />}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const api = useContext(DialogContext);
  if (!api) throw new Error('useDialog precisa de <DialogProvider>');
  return api;
}

function Modal({ pending, onClose }: { pending: Pending; onClose: (v: boolean | string | null) => void }) {
  const [text, setText] = useState(pending.kind === 'prompt' ? (pending.opts.initial ?? '') : '');
  const firstRef = useRef<HTMLButtonElement | HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onClose(pending.kind === 'prompt' ? text : true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => onClose(null)} role="presentation">
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="dlg-title" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <h2 id="dlg-title" className="text-lg font-semibold">
          {pending.opts.title}
        </h2>
        {pending.kind === 'confirm' && pending.opts.body && <div className="mt-2 text-sm text-neutral-600">{pending.opts.body}</div>}
        {pending.kind === 'prompt' && (
          <label className="mt-3 block space-y-1">
            {pending.opts.label && <span className="text-xs font-medium uppercase tracking-wide text-neutral-500">{pending.opts.label}</span>}
            <input
              ref={firstRef as React.RefObject<HTMLInputElement>}
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={pending.opts.maxLength ?? 80}
              placeholder={pending.opts.placeholder}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
            />
          </label>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => onClose(null)}>
            {(pending.kind === 'confirm' && pending.opts.cancelLabel) || 'Cancelar'}
          </Button>
          <Button
            ref={pending.kind === 'confirm' ? (firstRef as React.RefObject<HTMLButtonElement>) : undefined}
            type="submit"
            variant={pending.kind === 'confirm' && pending.opts.danger ? 'danger' : 'primary'}
            disabled={pending.kind === 'prompt' && text.trim().length === 0}
          >
            {pending.opts.confirmLabel ?? 'Confirmar'}
          </Button>
        </div>
      </form>
    </div>
  );
}
