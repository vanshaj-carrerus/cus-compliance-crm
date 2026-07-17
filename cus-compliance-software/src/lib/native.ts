import { openUrl } from "@tauri-apps/plugin-opener";
import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauri()) {
    await openUrl(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function copyToClipboard(text: string): Promise<void> {
  if (isTauri()) {
    await writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

export async function notifyDesktop(
  title: string,
  body: string
): Promise<void> {
  try {
    if (isTauri()) {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      if (granted) {
        sendNotification({ title, body });
      }
      return;
    }
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") {
      await Notification.requestPermission();
    }
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    /* ignore */
  }
}

export async function requestNotifyPermission(): Promise<boolean> {
  try {
    if (isTauri()) {
      let granted = await isPermissionGranted();
      if (!granted) {
        const permission = await requestPermission();
        granted = permission === "granted";
      }
      return granted;
    }
    if (!("Notification" in window)) return false;
    const perm = await Notification.requestPermission();
    return perm === "granted";
  } catch {
    return false;
  }
}

export async function downloadTextFile(
  content: string,
  filename: string,
  _type = "text/plain"
): Promise<void> {
  if (isTauri()) {
    const path = await save({
      defaultPath: filename,
      filters: [
        {
          name: "Files",
          extensions: filename.endsWith(".json")
            ? ["json"]
            : filename.endsWith(".csv")
              ? ["csv"]
              : ["*"],
        },
      ],
    });
    if (!path) return;
    await writeTextFile(path, content);
    return;
  }

  const blob = new Blob([content], { type: _type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function pickAndReadTextFile(extensions: string[]): Promise<{
  name: string;
  content: string;
} | null> {
  if (isTauri()) {
    const path = await open({
      multiple: false,
      filters: [{ name: "Import", extensions }],
    });
    if (!path || Array.isArray(path)) return null;
    const content = await readTextFile(path);
    const name = path.split(/[/\\]/).pop() || "import";
    return { name, content };
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extensions.map((e) => `.${e}`).join(",");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      resolve({ name: file.name, content: await file.text() });
    };
    input.click();
  });
}
