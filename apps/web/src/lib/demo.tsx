'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Actor, Command, DomainState, Role, Scope } from '@king-david/contracts';
import { createSeed, DEMO_SCOPE, execute, DomainError } from '@king-david/db';

const STORAGE_KEY = 'king-david-demo-v2';
export const demoScope: Scope = DEMO_SCOPE;
export const isDemoEnabled = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || (process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_DEMO_MODE !== 'false');
export function demoActor(role: Role = 'manager'): Actor { return { id: `demo-${role}`, name: `Demo ${role.replace('_', ' ')}`, tenantId: DEMO_SCOPE.tenantId, propertyIds: [DEMO_SCOPE.propertyId], role, mfa: false }; }
interface DemoContext { state: DomainState; ready: boolean; storageError: string; role: Role; setRole: (role: Role) => void; dispatch: (command: Omit<Command, 'key'> & { key?: string }, actor?: Actor) => Promise<string>; reset: () => void }
const Context = createContext<DemoContext | null>(null);
export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DomainState>(() => createSeed(new Date()));
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState('');
  const [role, setRole] = useState<Role>('manager');
  const stateRef = useRef(state);
  const commit = useCallback((next: DomainState) => {
    // Quota/auth failures are surfaced, never reported as a successful server save.
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    stateRef.current = next; setState(next); setStorageError('');
  }, []);
  useEffect(() => {
    if (!isDemoEnabled) { setReady(true); return; }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) { const parsed = JSON.parse(stored) as DomainState; if (!parsed.enquiries || !parsed.content || !parsed.receipts) throw new Error('Invalid demo data'); stateRef.current = parsed; setState(parsed); }
      else commit(stateRef.current);
    } catch { setStorageError('Browser storage is unavailable or contains an invalid demo. Actions are disabled. Reset the demo to continue.'); }
    setReady(true);
    const sync = (event: StorageEvent) => { if (event.key === STORAGE_KEY && event.newValue) { try { const next = JSON.parse(event.newValue); stateRef.current = next; setState(next); } catch { setStorageError('Could not read another tab’s update. Refresh before continuing.'); } } };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [commit]);
  const dispatch = useCallback(async (input: Omit<Command, 'key'> & { key?: string }, actorOverride?: Actor) => {
    if (!isDemoEnabled) throw new DomainError('The demo is disabled.');
    const command: Command = { ...input, key: input.key || crypto.randomUUID() };
    const run = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        const current = stored ? JSON.parse(stored) as DomainState : stateRef.current;
        const result = execute(current, actorOverride || demoActor(role), DEMO_SCOPE, command, { demo: true });
        commit(result.state); return result.resultId;
      } catch (error) {
        if (error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'SecurityError')) { setStorageError('This change was not saved: browser storage is unavailable or full.'); throw new DomainError('This change was not saved. Free browser storage and retry.'); }
        throw error;
      }
    };
    return navigator.locks ? navigator.locks.request('king-david-demo-write', run) : run();
  }, [role, commit]);
  const reset = useCallback(() => { try { const next = createSeed(); commit(next); } catch { setStorageError('Could not reset browser storage.'); } }, [commit]);
  return <Context.Provider value={{ state, ready, storageError, role, setRole, dispatch, reset }}>{children}</Context.Provider>;
}
export function useDemo() { const context = useContext(Context); if (!context) throw new Error('DemoProvider is missing'); return context; }
export function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'Something went wrong. Please retry.'; }
export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8') { const url = URL.createObjectURL(new Blob([text], { type })); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function formatDate(date: string, options?: Intl.DateTimeFormatOptions) { return new Date(date.length === 10 ? `${date}T12:00:00Z` : date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC', ...options }); }
