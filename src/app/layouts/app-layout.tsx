import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/shared/components/layout/app-sidebar";
import { TopNav } from "@/shared/components/layout/top-nav";
import { SidebarInset, SidebarProvider } from "@/shared/components/ui/sidebar";
import { useAuth } from "@/shared/supabase/auth";

export function AppLayout() {
  const navigate = useNavigate();
  const { loading, session } = useAuth();

  useEffect(() => {
    if (loading || session) return;
    void navigate({ to: "/login", replace: true });
  }, [loading, navigate, session]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-2">
          <p className="text-lg font-medium text-foreground">Verificando sua sessão...</p>
          <p className="text-sm text-muted-foreground">
            Conectando ao Supabase para carregar o acesso.
          </p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col min-w-0">
          <TopNav />
          <main className="flex-1 p-6 overflow-x-hidden">
            <Outlet />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
