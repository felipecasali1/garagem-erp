import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Users,
  UserCircle2,
  Car,
  ShoppingCart,
  Banknote,
  PieChart,
  Receipt,
  Wallet,
  Settings,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/shared/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";

const groups = [
  {
    label: "Principal",
    items: [{ title: "Dashboard", url: "/", icon: LayoutDashboard }],
  },
  {
    label: "Cadastros",
    items: [
      { title: "Funcionários", url: "/employees", icon: Users },
      { title: "Clientes", url: "/clients", icon: UserCircle2 },
    ],
  },
  {
    label: "Estoque",
    items: [{ title: "Veículos", url: "/vehicles", icon: Car }],
  },
  {
    label: "Comercial",
    items: [
      { title: "Compras", url: "/purchases", icon: ShoppingCart },
      { title: "Vendas", url: "/sales", icon: Banknote },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Visão Geral", url: "/financial", icon: PieChart },
      { title: "Transações", url: "/financial/transactions", icon: Receipt },
      { title: "Contas a Pagar", url: "/financial/bills", icon: Wallet },
    ],
  },
  {
    label: "Configurações",
    items: [{ title: "Configurações", url: "/settings", icon: Settings }],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <Sidebar collapsible="icon" className="border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-display font-bold">
            G
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-display font-semibold leading-tight text-sidebar-foreground">
                GaragemERP
              </span>
              <span className="text-xs text-sidebar-foreground/60 leading-tight">
                Sistema de Gestão
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-sidebar-foreground/50 text-[10px] uppercase tracking-wider">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active =
                    item.url === "/"
                      ? pathname === "/"
                      : pathname === item.url || pathname.startsWith(item.url + "/");
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <Link to={item.url}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-2">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              CL
            </AvatarFallback>
          </Avatar>
          {!collapsed && (
            <>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-sidebar-foreground truncate">
                  Carlos Lima
                </div>
                <div className="text-xs text-sidebar-foreground/60 truncate">Gerente</div>
              </div>
              <button
                className="text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors"
                aria-label="Sair"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
