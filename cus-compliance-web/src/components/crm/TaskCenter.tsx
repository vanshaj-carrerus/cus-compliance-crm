"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertTriangle,
  Check,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import type { CrmTask } from "@/lib/tasks";

const POLL_MS = 20_000;
const MAX_LEN = 300;

interface TasksContextValue {
  tasks: CrmTask[];
  loaded: boolean;
  open: boolean;
  setOpen: (v: boolean) => void;
  add: (text: string, urgent: boolean) => Promise<string | null>;
  update: (id: string, patch: { text?: string; urgent?: boolean }) => Promise<string | null>;
  remove: (id: string) => Promise<string | null>;
}

const TasksContext = createContext<TasksContextValue | null>(null);

function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) throw new Error("useTasks must be used within TasksProvider");
  return ctx;
}

async function readError(res: Response, fallback: string) {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

/**
 * One shared task list for every signed-in CRM user. Kept fresh by polling
 * (and on tab focus), so a task added by anyone shows up for everyone.
 */
export function TasksProvider({ children }: { children: React.ReactNode }) {
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  // Bumped on every local change so a slower, older poll can't overwrite it.
  const mutationSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = mutationSeq.current;
    try {
      const res = await fetch("/api/tasks", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { tasks?: CrmTask[] };
      if (seq !== mutationSeq.current) return;
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
      setLoaded(true);
    } catch {
      /* offline - keep what we have, try again on the next tick */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    const tick = () => {
      if (document.visibilityState === "visible") void load();
    };
    const timer = window.setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [load]);

  const sorted = useCallback(
    (list: CrmTask[]) =>
      [...list].sort(
        (a, b) =>
          Number(b.urgent) - Number(a.urgent) ||
          String(a.createdAt).localeCompare(String(b.createdAt))
      ),
    []
  );

  const add = useCallback(
    async (text: string, urgent: boolean) => {
      mutationSeq.current += 1;
      try {
        const res = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, urgent }),
        });
        if (!res.ok) return await readError(res, "Could not add the task");
        const data = (await res.json()) as { task: CrmTask };
        mutationSeq.current += 1;
        setTasks((prev) => sorted([...prev.filter((t) => t.id !== data.task.id), data.task]));
        return null;
      } catch {
        return "Could not reach the server";
      }
    },
    [sorted]
  );

  const update = useCallback(
    async (id: string, patch: { text?: string; urgent?: boolean }) => {
      mutationSeq.current += 1;
      try {
        const res = await fetch(`/api/tasks/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (res.status === 404) {
          mutationSeq.current += 1;
          setTasks((prev) => prev.filter((t) => t.id !== id));
          return "This task was already removed by someone else";
        }
        if (!res.ok) return await readError(res, "Could not update the task");
        const data = (await res.json()) as { task: CrmTask };
        mutationSeq.current += 1;
        setTasks((prev) => sorted(prev.map((t) => (t.id === id ? data.task : t))));
        return null;
      } catch {
        return "Could not reach the server";
      }
    },
    [sorted]
  );

  const remove = useCallback(async (id: string) => {
    mutationSeq.current += 1;
    try {
      const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" });
      if (!res.ok) return await readError(res, "Could not remove the task");
      mutationSeq.current += 1;
      setTasks((prev) => prev.filter((t) => t.id !== id));
      return null;
    } catch {
      return "Could not reach the server";
    }
  }, []);

  const value = useMemo(
    () => ({ tasks, loaded, open, setOpen, add, update, remove }),
    [tasks, loaded, open, add, update, remove]
  );

  return (
    <TasksContext.Provider value={value}>
      {children}
      <TaskModal />
    </TasksContext.Provider>
  );
}

/** Header button (replaces the old Follow-ups chip). */
export function TaskButton({ className }: { className: string }) {
  const { tasks, setOpen } = useTasks();
  const urgent = tasks.filter((t) => t.urgent).length;
  return (
    <button
      type="button"
      className={`${className} rounded-full`}
      onClick={() => setOpen(true)}
      title="Team tasks - add and see urgent things to do"
    >
      <ListChecks className="h-3.5 w-3.5" />
      Tasks
      {tasks.length > 0 && (
        <span
          className={`inline-flex min-w-5 items-center justify-center rounded-full px-1 text-[length:calc(10px*var(--ui-text-scale,1))] font-black text-white ${
            urgent > 0 ? "bg-danger" : "bg-primary"
          }`}
        >
          {tasks.length}
        </span>
      )}
    </button>
  );
}

/** Highlighted scrolling line under the header - only shown while tasks exist. */
export function TaskMarquee() {
  const { tasks, setOpen } = useTasks();
  if (tasks.length === 0) return null;

  const chars = tasks.reduce((n, t) => n + t.text.length + (t.urgent ? 8 : 0) + 6, 0);
  // ~ 7 characters per second keeps long lines readable.
  const seconds = Math.max(18, Math.round(chars / 7));

  const items = (
    <>
      {tasks.map((t) => (
        <span key={t.id} className={`tm-item ${t.urgent ? "is-urgent" : ""}`}>
          {t.urgent && (
            <b className="tm-badge">
              <AlertTriangle className="h-3 w-3" strokeWidth={2.6} /> URGENT
            </b>
          )}
          <span className="tm-text">{t.text}</span>
          <i className="tm-dot" aria-hidden />
        </span>
      ))}
    </>
  );

  return (
    <div
      className="tm-bar"
      role="button"
      tabIndex={0}
      aria-label={`Team tasks: ${tasks.map((t) => t.text).join(". ")}. Press to manage tasks.`}
      onClick={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
      }}
      title="Click to add or edit tasks"
    >
      <span className="tm-label">
        <ListChecks className="h-3.5 w-3.5" strokeWidth={2.4} />
        Tasks
      </span>
      <div className="tm-viewport">
        <div className="tm-track" style={{ animationDuration: `${seconds}s` }}>
          <div className="tm-half">{items}</div>
          <div className="tm-half" aria-hidden>
            {items}
          </div>
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} day${d === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function TaskRow({ task }: { task: CrmTask }) {
  const { update, remove } = useTasks();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.text);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setErr("");
    const e = await fn();
    setBusy(false);
    if (e) setErr(e);
    return !e;
  };

  const save = async () => {
    const text = draft.trim();
    if (!text) {
      setErr("Task can't be empty");
      return;
    }
    if (text === task.text) {
      setEditing(false);
      return;
    }
    if (await run(() => update(task.id, { text }))) setEditing(false);
  };

  const edited = task.updatedBy && task.updatedAt && task.updatedAt !== task.createdAt;

  return (
    <li className={`tk-row ${task.urgent ? "is-urgent" : ""}`}>
      <button
        type="button"
        className={`tk-flag ${task.urgent ? "is-on" : ""}`}
        disabled={busy}
        aria-pressed={task.urgent}
        title={task.urgent ? "Urgent - click to unmark" : "Mark as urgent"}
        onClick={() => void run(() => update(task.id, { urgent: !task.urgent }))}
      >
        <AlertTriangle className="h-4 w-4" strokeWidth={2.2} />
      </button>

      <div className="tk-body">
        {editing ? (
          <input
            autoFocus
            value={draft}
            maxLength={MAX_LEN}
            className="tk-input"
            aria-label="Edit task"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void save();
              } else if (e.key === "Escape") {
                e.stopPropagation();
                setEditing(false);
                setDraft(task.text);
                setErr("");
              }
            }}
          />
        ) : (
          <div className="tk-text">{task.text}</div>
        )}
        <div className="tk-meta">
          {task.createdBy ? `Added by ${task.createdBy}` : "Added"} · {timeAgo(task.createdAt)}
          {edited ? ` · edited by ${task.updatedBy} ${timeAgo(task.updatedAt)}` : ""}
        </div>
        {err && <div className="tk-err">{err}</div>}
      </div>

      <div className="tk-actions">
        {editing ? (
          <>
            <button
              type="button"
              className="tk-icon is-ok"
              disabled={busy}
              title="Save"
              aria-label="Save task"
              onClick={() => void save()}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
            <button
              type="button"
              className="tk-icon"
              disabled={busy}
              title="Cancel"
              aria-label="Cancel editing"
              onClick={() => {
                setEditing(false);
                setDraft(task.text);
                setErr("");
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="tk-icon"
              disabled={busy}
              title="Edit"
              aria-label="Edit task"
              onClick={() => {
                setDraft(task.text);
                setEditing(true);
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="tk-icon is-ok"
              disabled={busy}
              title="Mark done (removes it for everyone)"
              aria-label="Mark task done"
              onClick={() => {
                if (!confirm("Mark this task as done? It will be removed for everyone.")) return;
                void run(() => remove(task.id));
              }}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function TaskModal() {
  const { open, setOpen, tasks, loaded, add } = useTasks();
  const [text, setText] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;

  const submit = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr("");
    const e = await add(t, urgent);
    setBusy(false);
    if (e) {
      setErr(e);
      return;
    }
    setText("");
    setUrgent(false);
  };

  return (
    <div
      data-modal-overlay
      className="tk-overlay"
      onClick={() => setOpen(false)}
    >
      <div
        className="tk-modal"
        role="dialog"
        aria-modal
        aria-label="Team tasks"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tk-head">
          <div>
            <div className="tk-title">
              <ListChecks className="h-5 w-5" /> Team tasks
            </div>
            <div className="tk-sub">
              Shared with everyone - these scroll across the top of every page.
            </div>
          </div>
          <button
            type="button"
            className="tk-icon"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          className="tk-add"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            autoFocus
            value={text}
            maxLength={MAX_LEN}
            className="tk-input"
            placeholder="Add a task or something urgent to do…"
            aria-label="New task"
            onChange={(e) => setText(e.target.value)}
          />
          <button
            type="button"
            className={`tk-urgent ${urgent ? "is-on" : ""}`}
            aria-pressed={urgent}
            onClick={() => setUrgent((v) => !v)}
            title="Show this in red as urgent"
          >
            <AlertTriangle className="h-4 w-4" strokeWidth={2.2} /> Urgent
          </button>
          <button
            type="submit"
            className="tk-submit"
            disabled={busy || !text.trim()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2.6} />}
            Add
          </button>
        </form>
        {err && <div className="tk-err px-5">{err}</div>}

        <ul className="tk-list">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
          {loaded && tasks.length === 0 && (
            <li className="tk-empty">
              No tasks right now. Add one above and it will appear for everyone.
            </li>
          )}
          {!loaded && <li className="tk-empty">Loading tasks…</li>}
        </ul>
      </div>
    </div>
  );
}
