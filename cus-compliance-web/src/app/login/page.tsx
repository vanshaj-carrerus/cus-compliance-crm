"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Loader2, ShieldCheck } from "lucide-react";
import { clearAuthCache } from "@/lib/auth-cache";
import { clearCrmCache } from "@/lib/crm-cache";

type Step = "email" | "code" | "password" | "create" | "reset";
type Mode = "signin" | "reset";

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  // Drop prior session caches so a new login gets a fresh /me + CRM bootstrap.
  useEffect(() => {
    clearAuthCache();
    clearCrmCache();
  }, []);

  const resetMessages = () => {
    setError("");
    setInfo("");
  };

  const startOver = () => {
    resetMessages();
    setMode("signin");
    setPassword("");
    setConfirm("");
    setCode("");
    setStep("email");
  };

  const sendCode = async () => {
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setInfo(
        mode === "reset"
          ? "Reset code sent. Check your inbox."
          : "Verification code sent. Check your inbox."
      );
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      setPassword("");
      setConfirm("");

      if (mode === "reset") {
        if (!data.hasAccount) {
          throw new Error("No account found for this email");
        }
        if (!data.canResetPassword) {
          throw new Error(
            "Password reset is only available for Compliance Admin and Compliance User accounts"
          );
        }
        setStep("reset");
        setInfo("Code verified. Choose a new password.");
        return;
      }

      setStep(data.hasAccount ? "password" : "create");
      setInfo(
        data.hasAccount
          ? "Code verified. Enter your password."
          : "Code verified. Create a password for your account."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const login = async () => {
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const createPassword = async () => {
    resetMessages();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create account");
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create account");
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async () => {
    resetMessages();
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not reset password");
      router.replace("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reset password");
    } finally {
      setLoading(false);
    }
  };

  const beginForgotPassword = () => {
    resetMessages();
    setMode("reset");
    setPassword("");
    setConfirm("");
    setCode("");
    if (email.trim()) {
      setInfo("Confirm your email, then we’ll send a reset code.");
      setStep("email");
    } else {
      setInfo("Enter your email to reset your password.");
      setStep("email");
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step === "email") void sendCode();
    else if (step === "code") void verifyCode();
    else if (step === "password") void login();
    else if (step === "reset") void resetPassword();
    else void createPassword();
  };

  const stepLabel =
    mode === "reset"
      ? step === "email"
        ? "Reset · Email"
        : step === "code"
          ? "Reset · Verification code"
          : "Reset · New password"
      : step === "email"
        ? "1 · Email"
        : step === "code"
          ? "2 · Verification code"
          : step === "password"
            ? "3 · Password"
            : "3 · Create password";

  return (
    <div className="login-stage flex min-h-screen items-center justify-center bg-background p-4">
      <div
        aria-hidden
        className="login-orb -left-24 -top-24 h-[420px] w-[420px] bg-[radial-gradient(circle,rgba(27,184,180,0.5),transparent_65%)] [animation:orb-float_14s_ease-in-out_infinite_alternate]"
      />
      <div
        aria-hidden
        className="login-orb -bottom-32 -right-24 h-[520px] w-[520px] bg-[radial-gradient(circle,rgba(100,120,240,0.38),transparent_65%)] [animation:orb-float_18s_ease-in-out_infinite_alternate-reverse]"
      />
      <div
        aria-hidden
        className="login-orb bottom-10 left-[18%] h-[260px] w-[260px] bg-[radial-gradient(circle,rgba(255,176,128,0.32),transparent_65%)] [animation:orb-float_16s_ease-in-out_infinite_alternate]"
      />
      <div className="login-card relative w-full max-w-md rounded-[28px] border border-border bg-card p-9 shadow-sm">
        <div className="mb-7 text-center">
          <div className="brand-mark mx-auto mb-4 flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl">
            <Image
              src="/logo.png"
              alt="CareerUS Solutions"
              width={56}
              height={56}
              className="h-full w-full object-contain p-1.5"
              priority
            />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
            CareerUS Solutions
          </div>
          <h1 className="mt-2 text-[28px] font-bold tracking-tight text-(--ink)">
            Compliance CRM
          </h1>
          <p className="mt-2 text-sm text-muted">
            {mode === "reset"
              ? "Reset password for Compliance Admin / Compliance User"
              : "Sign in or create an account"}
          </p>
        </div>

        <div className="login-stepper mb-6 flex items-center justify-between gap-3 rounded-full border border-border bg-secondary px-3.5 py-2 text-xs font-bold text-primary">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            {stepLabel}
          </span>
          <span className="min-w-0 truncate font-medium text-muted">
            {email || "No email yet"}
          </span>
        </div>

        <form key={step} onSubmit={onSubmit} className="login-step space-y-4">
          {step === "email" && (
            <label className="block text-xs font-semibold text-muted">
              Work email
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="login-field mt-1.5 w-full rounded-[var(--radius)] border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                placeholder="you@company.com"
              />
            </label>
          )}

          {step === "code" && (
            <>
              <label className="block text-xs font-semibold text-muted">
                6-digit code
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  className="login-field mt-1.5 w-full rounded-[var(--radius)] border border-border bg-input px-3 py-2.5 text-center text-lg font-bold tracking-[0.4em] text-foreground outline-none focus:border-primary"
                  placeholder="••••••"
                />
              </label>
              <button
                type="button"
                disabled={loading}
                onClick={() => void sendCode()}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                Resend code
              </button>
            </>
          )}

          {step === "password" && (
            <>
              <label className="block text-xs font-semibold text-muted">
                Password
                <input
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-field mt-1.5 w-full rounded-[var(--radius)] border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="Enter your password"
                />
              </label>
              <button
                type="button"
                disabled={loading}
                onClick={beginForgotPassword}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                Forgot password?
              </button>
            </>
          )}

          {(step === "create" || step === "reset") && (
            <>
              <label className="block text-xs font-semibold text-muted">
                {step === "reset" ? "New password" : "New password"}
                <input
                  type="password"
                  required
                  autoFocus
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="login-field mt-1.5 w-full rounded-[var(--radius)] border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="At least 8 characters"
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                Confirm password
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="login-field mt-1.5 w-full rounded-[var(--radius)] border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="Repeat password"
                />
              </label>
            </>
          )}

          {error && (
            <div className="login-alert rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="login-alert rounded-[var(--radius)] border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="login-submit flex w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary px-4 py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {step === "email" &&
              (mode === "reset" ? "Send reset code" : "Send verification code")}
            {step === "code" && "Verify code"}
            {step === "password" && "Sign in"}
            {step === "create" && "Create account & enter"}
            {step === "reset" && "Update password & sign in"}
          </button>

          {step === "email" && mode === "signin" && (
            <button
              type="button"
              disabled={loading}
              onClick={beginForgotPassword}
              className="w-full text-center text-xs font-medium text-primary hover:underline disabled:opacity-50"
            >
              Forgot password?
            </button>
          )}

          {(step !== "email" || mode === "reset") && (
            <button
              type="button"
              disabled={loading}
              onClick={startOver}
              className="w-full text-center text-xs font-medium text-muted hover:text-foreground"
            >
              ← Back to sign in
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
