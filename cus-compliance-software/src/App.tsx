import { Loader2 } from "lucide-react";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LoginPage } from "@/pages/LoginPage";
import { CrmLayoutClient } from "@/components/crm/CrmLayoutClient";

function AppGate() {
  const { ready, user } = useAuth();

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          Loading CareerUS CRM…
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage onSuccess={() => undefined} />;
  }

  return <CrmLayoutClient />;
}

export default function App() {
  return (
    <AuthProvider>
      <AppGate />
    </AuthProvider>
  );
}
