/**
 * "Assigned To" names are matched ignoring case and surrounding spaces, so
 * "Yatin", "yatin" and " YATIN " are one person - never listed twice.
 * The stored value on a candidate is never rewritten by these helpers.
 */
export const assigneeKey = (v: unknown) => String(v ?? "").trim().toLowerCase();

export const sameAssignee = (a: unknown, b: unknown) =>
  assigneeKey(a) !== "" && assigneeKey(a) === assigneeKey(b);

/** The real users, one entry per person (first spelling wins), sorted. */
export function uniqueAssignees(users: readonly string[]): string[] {
  const seen = new Map<string, string>();
  for (const u of users) {
    const k = assigneeKey(u);
    if (k && !seen.has(k)) seen.set(k, String(u).trim());
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Options for a row's "Assigned" dropdown: just the users. A name that isn't
 * any user (e.g. someone who left) is kept as an extra option only so the
 * cell doesn't go blank.
 */
export function assigneeOptions(users: readonly string[], current?: string): string[] {
  const list = uniqueAssignees(users);
  const cur = String(current ?? "").trim();
  if (cur && !list.some((u) => sameAssignee(u, cur))) list.push(cur);
  return list;
}

/** The dropdown value for a stored name: the matching user's own spelling. */
export function assigneeValue(users: readonly string[], current?: string): string {
  const cur = String(current ?? "").trim();
  if (!cur) return "";
  return uniqueAssignees(users).find((u) => sameAssignee(u, cur)) ?? cur;
}
