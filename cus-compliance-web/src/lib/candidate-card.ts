/**
 * Tiny store for the right-side candidate quick card. Any view can call
 * openCandidateCard(id) (e.g. on double-click of a candidate name) and the
 * <CandidateCard /> mounted in the shell picks it up. Kept outside React
 * context so views don't need extra provider plumbing.
 */
const listeners = new Set<() => void>();
let openId: number | null = null;

export function openCandidateCard(id: number) {
  openId = id;
  listeners.forEach((l) => l());
}

export function closeCandidateCard() {
  if (openId == null) return;
  openId = null;
  listeners.forEach((l) => l());
}

export function getCandidateCardId(): number | null {
  return openId;
}

export function getServerCandidateCardId(): number | null {
  return null;
}

export function subscribeCandidateCard(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
