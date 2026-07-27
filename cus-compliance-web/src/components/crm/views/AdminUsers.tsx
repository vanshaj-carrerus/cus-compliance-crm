"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthProvider";
import { useCrm } from "../CrmProvider";
import {
  CRM_FEATURES,
  FEATURE_LABELS,
  defaultFeaturesForRole,
  type CrmFeature,
} from "@/lib/features";
import { ROLE_LABELS, USER_ROLES, type UserRole } from "@/lib/roles";

type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: "invited" | "active";
  features: CrmFeature[];
  hasPassword: boolean;
  createdAt: string | null;
};

type AccessRequestItem = {
  id: string;
  userId: string;
  email: string;
  name: string;
  requestedRole: string;
  message: string;
  status: string;
  createdAt: string | null;
};

const emptyForm = {
  email: "",
  name: "",
  role: "compliance_user" as UserRole,
};

export function AdminUsers() {
  const { user: me, isAdmin, refresh } = useAuth();
  const { toast, navigate } = useCrm();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [requests, setRequests] = useState<AccessRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<{
    name: string;
    email: string;
    role: UserRole;
    features: CrmFeature[];
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, reqRes] = await Promise.all([
        fetch("/api/admin/users"),
        fetch("/api/admin/access-requests?status=pending"),
      ]);
      const usersData = await usersRes.json();
      const reqData = await reqRes.json();
      if (!usersRes.ok) throw new Error(usersData.error || "Failed to load users");
      if (!reqRes.ok) throw new Error(reqData.error || "Failed to load requests");
      setUsers(usersData.users || []);
      setRequests(reqData.requests || []);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (!isAdmin) {
      navigate("dashboard");
      return;
    }
    void load();
  }, [isAdmin, load, navigate]);

  const invite = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invite failed");
      toast("User invited — they can log in with their email", "success");
      setForm(emptyForm);
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Invite failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (u: AdminUser) => {
    setEditingId(u.id);
    setEditDraft({
      name: u.name,
      email: u.email,
      role: u.role,
      features: [...(u.features || [])],
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const toggleFeature = (feature: CrmFeature) => {
    setEditDraft((d) => {
      if (!d) return d;
      const has = d.features.includes(feature);
      return {
        ...d,
        features: has
          ? d.features.filter((f) => f !== feature)
          : CRM_FEATURES.filter(
              (f) => d.features.includes(f) || f === feature
            ),
      };
    });
  };

  const saveEdit = async (id: string) => {
    if (!editDraft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editDraft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast("User updated", "success");
      cancelEdit();
      await load();
      if (id === me?.id) await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (id: string, role: UserRole) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Role update failed");
      toast(`Role set to ${ROLE_LABELS[role]}`, "success");
      await load();
      if (id === me?.id) await refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Role update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const removeUser = async (u: AdminUser) => {
    if (u.id === me?.id) {
      toast("You cannot remove your own account", "error");
      return;
    }
    if (
      !window.confirm(
        `Remove ${u.email}? They will no longer be able to sign in.`
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Remove failed");
      toast("User removed", "success");
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Remove failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const resolveRequest = async (id: string, action: "approve" | "deny") => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/access-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed");
      toast(
        action === "approve"
          ? "Approved — user is now Compliance User"
          : "Request denied",
        "success"
      );
      await load();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <section className="mb-5 rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="text-[10px] font-black uppercase tracking-wider text-primary sm:text-xs">
          Administration
        </div>
        <h2 className="mt-1 text-xl font-black text-foreground sm:text-2xl">
          User Management
        </h2>
        <p className="mt-1 text-xs text-muted sm:text-sm">
          Review access requests, invite users, and toggle which pages each
          user can open.
        </p>
      </section>

      <section className="mb-5 rounded-[var(--radius)] border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-foreground">
            Access requests{" "}
            {!loading && requests.length > 0 ? `(${requests.length})` : ""}
          </h3>
          <p className="mt-0.5 text-xs text-muted">
            Users asking for Compliance User access.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold sm:px-5">User</th>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Note</th>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Requested</th>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-muted sm:px-5"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && requests.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-4 py-6 text-center text-muted sm:px-5"
                  >
                    No pending access requests.
                  </td>
                </tr>
              )}
              {!loading &&
                requests.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-4 py-3 sm:px-5">
                      <div className="font-semibold text-foreground">
                        {r.name || "—"}
                      </div>
                      <div className="text-xs text-muted">{r.email}</div>
                    </td>
                    <td className="max-w-[220px] px-4 py-3 text-xs text-muted sm:px-5">
                      {r.message || "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted sm:px-5">
                      {r.createdAt
                        ? new Date(r.createdAt).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3 sm:px-5">
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void resolveRequest(r.id, "approve")}
                          className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void resolveRequest(r.id, "deny")}
                          className="rounded-md border border-danger/30 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/5 disabled:opacity-60"
                        >
                          Deny
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-5 rounded-[var(--radius)] border border-border bg-card p-4 shadow-sm sm:p-5">
        <h3 className="mb-3 text-sm font-semibold text-foreground">
          Invite user
        </h3>
        <form
          onSubmit={invite}
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Email
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) =>
                setForm((f) => ({ ...f, email: e.target.value }))
              }
              className="rounded-[var(--radius)] border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="name@company.com"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Name
            <input
              type="text"
              value={form.name}
              onChange={(e) =>
                setForm((f) => ({ ...f, name: e.target.value }))
              }
              className="rounded-[var(--radius)] border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              placeholder="Optional"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Role
            <select
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  role: e.target.value as UserRole,
                }))
              }
              className="rounded-[var(--radius)] border border-border bg-input px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
            >
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-10 w-full items-center justify-center rounded-[var(--radius)] bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Invite"}
            </button>
          </div>
        </form>
        <p className="mt-3 text-[11px] text-muted">
          Invite seeds default page access for that role. Edit the user
          afterward to customize pages (
          {defaultFeaturesForRole("compliance_user").length} pages for
          Compliance User by default).
        </p>
      </section>

      <section className="rounded-[var(--radius)] border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-foreground">
            Users {loading ? "" : `(${users.length})`}
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-secondary/60 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-semibold sm:px-5">User</th>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Role</th>
                <th className="px-4 py-2.5 font-semibold sm:px-5">
                  Page access
                </th>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Status</th>
                <th className="px-4 py-2.5 font-semibold sm:px-5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted sm:px-5"
                  >
                    Loading users…
                  </td>
                </tr>
              )}
              {!loading && users.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-muted sm:px-5"
                  >
                    No users yet.
                  </td>
                </tr>
              )}
              {!loading &&
                users.map((u) => {
                  const editing = editingId === u.id && editDraft;
                  return (
                    <tr key={u.id} className="border-t border-border align-top">
                      <td className="px-4 py-3 sm:px-5">
                        {editing ? (
                          <div className="flex flex-col gap-2">
                            <input
                              value={editDraft.name}
                              onChange={(e) =>
                                setEditDraft((d) =>
                                  d ? { ...d, name: e.target.value } : d
                                )
                              }
                              className="rounded-md border border-border bg-input px-2 py-1.5 text-sm"
                              placeholder="Name"
                            />
                            <input
                              value={editDraft.email}
                              onChange={(e) =>
                                setEditDraft((d) =>
                                  d ? { ...d, email: e.target.value } : d
                                )
                              }
                              className="rounded-md border border-border bg-input px-2 py-1.5 text-sm"
                              placeholder="Email"
                            />
                          </div>
                        ) : (
                          <div>
                            <div className="font-semibold text-foreground">
                              {u.name || "—"}
                              {u.id === me?.id && (
                                <span className="ml-2 text-[10px] font-bold uppercase text-primary">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-muted">{u.email}</div>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        {editing ? (
                          <select
                            value={editDraft.role}
                            onChange={(e) => {
                              const role = e.target.value as UserRole;
                              setEditDraft((d) =>
                                d
                                  ? {
                                      ...d,
                                      role,
                                      features: defaultFeaturesForRole(role),
                                    }
                                  : d
                              );
                            }}
                            className="rounded-md border border-border bg-input px-2 py-1.5 text-sm"
                          >
                            {USER_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <select
                            value={u.role}
                            disabled={saving}
                            onChange={(e) =>
                              void changeRole(u.id, e.target.value as UserRole)
                            }
                            className="rounded-md border border-border bg-secondary px-2 py-1.5 text-xs font-semibold text-foreground"
                            aria-label={`Role for ${u.email}`}
                          >
                            {USER_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABELS[r]}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        {editing ? (
                          <div className="grid max-w-sm grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {CRM_FEATURES.map((f) => (
                              <label
                                key={f}
                                className="flex items-center gap-2 text-xs text-foreground"
                              >
                                <input
                                  type="checkbox"
                                  checked={editDraft.features.includes(f)}
                                  onChange={() => toggleFeature(f)}
                                  className="accent-primary"
                                />
                                {FEATURE_LABELS[f]}
                              </label>
                            ))}
                          </div>
                        ) : (
                          <div className="flex max-w-md flex-wrap gap-1">
                            {(u.features || []).length === 0 ? (
                              <span className="text-xs text-muted">
                                No pages
                              </span>
                            ) : (
                              (u.features || []).map((f) => (
                                <span
                                  key={f}
                                  className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground"
                                >
                                  {FEATURE_LABELS[f] || f}
                                </span>
                              ))
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            u.status === "invited"
                              ? "bg-warning/15 text-warning"
                              : "bg-success/15 text-success"
                          }`}
                        >
                          {u.status === "invited" ? "Invited" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3 sm:px-5">
                        <div className="flex flex-wrap gap-1.5">
                          {editing ? (
                            <>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => void saveEdit(u.id)}
                                className="rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => startEdit(u)}
                                className="rounded-md border border-border bg-secondary px-2.5 py-1 text-xs font-medium hover:bg-border"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                disabled={saving || u.id === me?.id}
                                onClick={() => void removeUser(u)}
                                className="rounded-md border border-danger/30 px-2.5 py-1 text-xs font-medium text-danger hover:bg-danger/5 disabled:opacity-40"
                              >
                                Remove
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
