import { Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/shared/components/layout/app-sidebar";
import { TopNav } from "@/shared/components/layout/top-nav";
import { SidebarInset, SidebarProvider } from "@/shared/components/ui/sidebar";

export function AppLayout() {
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
