import { todayIso } from "./dates";

const BACKUP_KEY = "crm-last-backup-date";

export function markBackupDownloaded() {
  try {
    localStorage.setItem(BACKUP_KEY, todayIso());
  } catch {
    /* ignore */
  }
}

export function wasBackedUpToday(): boolean {
  try {
    return localStorage.getItem(BACKUP_KEY) === todayIso();
  } catch {
    return true;
  }
}
