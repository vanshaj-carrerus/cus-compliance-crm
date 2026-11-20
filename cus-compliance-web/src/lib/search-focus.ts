/**
 * One-shot "show me this candidate" request: the header search box asks for a
 * candidate, the Master P.O Sheet picks it up (on mount, or right away if it
 * is already open), jumps to its page, scrolls to the row and highlights it.
 * Kept outside React context so neither side needs the other's state.
 */
export interface FocusRequest {
  id: number;
  nonce: number;
  at: number;
}

const listeners = new Set<() => void>();
let current: FocusRequest | null = null;
let counter = 0;

/** A request older than this is ignored (e.g. the sheet was opened much later). */
export const FOCUS_MAX_AGE_MS = 15_000;

export function requestCandidateFocus(id: number) {
  counter += 1;
  current = { id, nonce: counter, at: Date.now() };
  listeners.forEach((l) => l());
}

export function getFocusRequest(): FocusRequest | null {
  return current;
}

export function getServerFocusRequest(): FocusRequest | null {
  return null;
}

/** Mark a request handled so it is not picked up twice. */
export function clearFocusRequest(nonce: number) {
  if (current && current.nonce === nonce) {
    current = null;
    listeners.forEach((l) => l());
  }
}

export function subscribeFocusRequest(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
