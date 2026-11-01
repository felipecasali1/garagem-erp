import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Outlet } from "@tanstack/react-router";
import { useRouterState } from "@tanstack/react-router";
import { AppSidebar } from "@/shared/components/layout/app-sidebar";
import { TopNav } from "@/shared/components/layout/top-nav";
import { SidebarInset, SidebarProvider } from "@/shared/components/ui/sidebar";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useAuth } from "@/shared/supabase/auth";
import { canAccessPath } from "@/shared/auth/access-control";

function AppLoadingShell() {
  const navigationGroups = [1, 3, 1, 2, 1];
  const chartBars = ["h-12", "h-20", "h-16", "h-28", "h-24", "h-32", "h-20"];

  return (
    <div className="min-h-screen bg-background" aria-busy="true">
      <span className="sr-only" role="status">
        Preparando sua área de trabalho
      </span>

      <div className="flex min-h-screen">
        <aside
          aria-hidden="true"
          className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex"
        >
          <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary font-display font-bold text-primary-foreground">
              G
            </div>
            <div>
              <div className="font-display font-semibold leading-tight text-sidebar-foreground">
                GaragemERP
              </div>
              <div className="text-xs leading-tight text-sidebar-foreground/60">
                Sistema de Gestão
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-7 px-4 py-6">
            {navigationGroups.map((itemCount, groupIndex) => (
              <div key={groupIndex} className="space-y-3">
                <Skeleton className="h-2.5 w-16 bg-sidebar-foreground/10" />
                <div className="space-y-3 pl-1">
                  {Array.from({ length: itemCount }, (_, itemIndex) => (
                    <div key={itemIndex} className="flex items-center gap-3">
                      <Skeleton className="size-4 rounded bg-sidebar-foreground/10" />
                      <Skeleton
                        className={`h-3.5 bg-sidebar-foreground/10 ${itemIndex % 2 ? "w-24" : "w-28"}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 border-t border-sidebar-border px-5 py-4">
            <Skeleton className="size-8 rounded-full bg-sidebar-foreground/10" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-24 bg-sidebar-foreground/10" />
              <Skeleton className="h-2.5 w-32 bg-sidebar-foreground/10" />
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header
            aria-hidden="true"
            className="flex h-16 items-center gap-4 border-b border-border bg-background/80 px-4"
          >
            <Skeleton className="size-8 rounded-md md:hidden" />
            <Skeleton className="h-4 w-28" />
            <div className="ml-auto flex items-center gap-3">
              <Skeleton className="hidden h-9 w-56 rounded-lg lg:block" />
              <Skeleton className="size-8 rounded-full" />
              <Skeleton className="size-8 rounded-full" />
            </div>
          </header>

          <main aria-hidden="true" className="space-y-6 p-4 md:p-6">
            <div className="space-y-2">
              <Skeleton className="h-8 w-44" />
              <Skeleton className="h-4 w-64 max-w-full" />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {Array.from({ length: 5 }, (_, index) => (
                <div key={index} className="space-y-4 rounded-xl border border-border bg-card p-5">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="size-9 rounded-full" />
                  </div>
                  <Skeleton className="h-7 w-20" />
                  <Skeleton className="h-3 w-32 max-w-full" />
                  <Skeleton className="h-3 w-16" />
                </div>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-5">
              <div className="space-y-5 rounded-xl border border-border bg-card p-5 lg:col-span-3">
                <Skeleton className="h-5 w-40" />
                <div className="flex h-40 items-end gap-3 border-b border-border px-2">
                  {chartBars.map((height, index) => (
                    <Skeleton
                      key={index}
                      className={`flex-1 rounded-t-md rounded-b-none ${height}`}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-5 rounded-xl border border-border bg-card p-5 lg:col-span-2">
                <Skeleton className="h-5 w-36" />
                <div className="space-y-4">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Skeleton className="size-9 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-3.5 w-2/3" />
                        <Skeleton className="h-3 w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { loading, session, accessRole } = useAuth();

  useEffect(() => {
    if (loading || session) return;
    void navigate({ to: "/login", replace: true });
  }, [loading, navigate, session]);

  useEffect(() => {
    if (loading || !session) return;
    if (!canAccessPath(accessRole, pathname)) {
      void navigate({ to: "/", replace: true });
    }
  }, [accessRole, loading, navigate, pathname, session]);

  if (loading) {
    return <AppLoadingShell />;
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
