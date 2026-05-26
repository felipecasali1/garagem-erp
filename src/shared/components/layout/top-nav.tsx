import { useRouterState, Link } from "@tanstack/react-router";
import { Search, ChevronRight, Sun, Moon } from "lucide-react";
import { SidebarTrigger } from "@/shared/components/ui/sidebar";
import { Button } from "@/shared/components/ui/button";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { useTheme } from "@/shared/hooks/use-theme";
import { CommandPalette, useCommandPalette } from "@/shared/components/layout/command-palette";
import { NotificationsMenu } from "@/shared/components/layout/notifications";
import { useAuth } from "@/shared/supabase/auth";
import { initials } from "@/shared/lib/format";

const labels: Record<string, string> = {
  "": "Dashboard",
  employees: "Funcionários",
  clients: "Clientes",
  vehicles: "Veículos",
  sales: "Vendas",
  purchases: "Compras",
  financial: "Financeiro",
  transactions: "Transações",
  settings: "Configurações",
  new: "Novo",
};

export function TopNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const segments = pathname.split("/").filter(Boolean);
  const { theme, toggle } = useTheme();
  const { open, setOpen } = useCommandPalette();
  const { session } = useAuth();
  const userLabel = session?.user.email ?? "Colaborador";

  return (
    <header className="h-16 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-30 flex items-center gap-3 px-4">
      <SidebarTrigger />

      <nav className="hidden md:flex items-center gap-1.5 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
          GaragemERP
        </Link>
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const label = labels[seg] ?? seg;
          return (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
              {isLast ? (
                <span className="text-foreground font-medium capitalize">{label}</span>
              ) : (
                <span className="text-muted-foreground capitalize">{label}</span>
              )}
            </span>
          );
        })}
        {segments.length === 0 && (
          <>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
            <span className="text-foreground font-medium">Dashboard</span>
          </>
        )}
      </nav>

      <div className="flex-1 max-w-md mx-auto hidden lg:block">
        <button
          onClick={() => setOpen(true)}
          className="relative w-full h-9 pl-9 pr-16 rounded-lg bg-muted border border-transparent hover:border-border outline-none text-sm transition-colors text-left text-muted-foreground"
        >
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
          Buscar veículos, clientes, vendas...
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden md:inline-flex h-5 items-center gap-1 rounded border bg-background px-1.5 text-[10px]">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro"}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <NotificationsMenu />
        <Avatar className="h-8 w-8 ml-1">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs">
            {initials(userLabel.replace(/[@._-]+/g, " ")).slice(0, 2) || "GE"}
          </AvatarFallback>
        </Avatar>
      </div>

      <CommandPalette open={open} onOpenChange={setOpen} />
    </header>
  );
}
