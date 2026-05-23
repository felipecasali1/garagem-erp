import { Bell, AlertTriangle, Banknote, Wrench } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Button } from "@/shared/components/ui/button";
import { relTime } from "@/shared/lib/format";

const items = [
  {
    icon: AlertTriangle,
    color: "text-destructive",
    title: "Aluguel em atraso",
    desc: "Pátio Sede - vence há 4 dias",
    time: new Date(Date.now() - 86400 * 4 * 1000).toISOString(),
  },
  {
    icon: Banknote,
    color: "text-success",
    title: "Nova venda registrada",
    desc: "Venda #1028 - Renault Kwid",
    time: new Date(Date.now() - 3600 * 6 * 1000).toISOString(),
  },
  {
    icon: Wrench,
    color: "text-warning",
    title: "Veículo em manutenção",
    desc: "Jeep Compass JEE-5R88",
    time: new Date(Date.now() - 3600 * 18 * 1000).toISOString(),
  },
];

export function NotificationsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações">
          <Bell className="h-4 w-4" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive ring-2 ring-background" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b border-border">
          <div className="font-display font-semibold">Notificações</div>
          <div className="text-xs text-muted-foreground">{items.length} não lidas</div>
        </div>
        <div className="max-h-80 overflow-y-auto divide-y divide-border">
          {items.map((n, i) => (
            <button
              key={i}
              className="w-full text-left px-4 py-3 hover:bg-muted/50 transition flex gap-3"
            >
              <div className={`mt-0.5 ${n.color}`}>
                <n.icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium leading-tight">{n.title}</div>
                <div className="text-xs text-muted-foreground truncate">{n.desc}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-1">{relTime(n.time)}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-border text-center">
          <button className="text-xs text-primary hover:underline">Ver todas</button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
