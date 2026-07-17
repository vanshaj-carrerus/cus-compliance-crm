import { FormEvent, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";

type Step = "email" | "code" | "password" | "create";

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const { sendCode, verifyCode, login, createPassword } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);

  const resetMessages = () => {
    setError("");
    setInfo("");
  };

  const doSendCode = async () => {
    resetMessages();
    setLoading(true);
    try {
      await sendCode(email);
      setInfo("Verification code sent. Check your inbox.");
      setStep("code");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const doVerifyCode = async () => {
    resetMessages();
    setLoading(true);
    try {
      const data = await verifyCode(email, code);
      setPassword("");
      setConfirm("");
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

  const doLogin = async () => {
    resetMessages();
    setLoading(true);
    try {
      await login(password);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const doCreate = async () => {
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
      await createPassword(password);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create account");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step === "email") void doSendCode();
    else if (step === "code") void doVerifyCode();
    else if (step === "password") void doLogin();
    else void doCreate();
  };

  const stepLabel =
    step === "email"
      ? "1 · Email"
      : step === "code"
        ? "2 · Verification code"
        : step === "password"
          ? "3 · Password"
          : "3 · Create password";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-[20px] border border-border bg-card p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="text-xs font-black uppercase tracking-wider text-primary">
            CareerUS Solutions
          </div>
          <h1 className="mt-2 text-2xl font-black text-foreground">
            Compliance CRM
          </h1>
          <p className="mt-2 text-sm text-muted">
            Sign in with your authorized email
          </p>
        </div>

        <div className="mb-5 flex items-center justify-between rounded-full border border-border bg-secondary px-3 py-1.5 text-xs font-bold text-primary">
          <span>{stepLabel}</span>
          <span className="font-medium text-muted">
            {email || "No email yet"}
          </span>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
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
                className="mt-1.5 w-full rounded-[var(--radius)] border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
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
                  className="mt-1.5 w-full rounded-[var(--radius)] border border-border bg-input px-3 py-2.5 text-center text-lg font-bold tracking-[0.4em] text-foreground outline-none focus:border-primary"
                  placeholder="••••••"
                />
              </label>
              <button
                type="button"
                disabled={loading}
                onClick={() => void doSendCode()}
                className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
              >
                Resend code
              </button>
            </>
          )}

          {step === "password" && (
            <label className="block text-xs font-semibold text-muted">
              Password
              <input
                type="password"
                required
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 w-full rounded-[var(--radius)] border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                placeholder="Enter your password"
              />
            </label>
          )}

          {step === "create" && (
            <>
              <label className="block text-xs font-semibold text-muted">
                New password
                <input
                  type="password"
                  required
                  autoFocus
                  autoComplete="new-password"
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1.5 w-full rounded-[var(--radius)] border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
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
                  className="mt-1.5 w-full rounded-[var(--radius)] border border-border bg-input px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"
                  placeholder="Repeat password"
                />
              </label>
            </>
          )}

          {error && (
            <div className="rounded-[var(--radius)] border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </div>
          )}
          {info && !error && (
            <div className="rounded-[var(--radius)] border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--radius)] bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {step === "email" && "Send verification code"}
            {step === "code" && "Verify code"}
            {step === "password" && "Sign in"}
            {step === "create" && "Create account & enter"}
          </button>

          {step !== "email" && (
            <button
              type="button"
              disabled={loading}
              onClick={() => {
                resetMessages();
                if (step === "code") {
                  setCode("");
                  setStep("email");
                } else {
                  setPassword("");
                  setConfirm("");
                  setCode("");
                  setStep("email");
                }
              }}
              className="w-full text-center text-xs font-medium text-muted hover:text-foreground"
            >
              ← Start over
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
