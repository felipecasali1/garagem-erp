import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Car, UserCircle2, Banknote, Users } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/shared/components/ui/command";
import { vehicles, customers, sales, employees } from "@/shared/mock-data";

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const go = (to: string) => {
    onOpenChange(false);
    navigate({ to });
  };

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Buscar veículos, clientes, vendas..." />
      <CommandList>
        <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
        <CommandGroup heading="Veículos">
          {vehicles.slice(0, 6).map((v) => (
            <CommandItem
              key={`v-${v.id}`}
              value={`${v.brand} ${v.model} ${v.plate}`}
              onSelect={() => go(`/vehicles/${v.id}`)}
            >
              <Car className="h-4 w-4" />
              <span>
                {v.brand} {v.model} <span className="text-muted-foreground">- {v.plate}</span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Clientes">
          {customers.slice(0, 6).map((c) => (
            <CommandItem
              key={`c-${c.id}`}
              value={c.person.name}
              onSelect={() => go(`/clients/${c.id}`)}
            >
              <UserCircle2 className="h-4 w-4" />
              {c.person.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Vendas">
          {sales.map((s) => (
            <CommandItem
              key={`s-${s.id}`}
              value={`${s.id} ${s.customer.person.name}`}
              onSelect={() => go(`/sales`)}
            >
              <Banknote className="h-4 w-4" />
              <span>
                Venda #{s.id}{" "}
                <span className="text-muted-foreground">- {s.customer.person.name}</span>
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Funcionários">
          {employees.map((e) => (
            <CommandItem
              key={`e-${e.id}`}
              value={e.person.name}
              onSelect={() => go(`/employees/${e.id}`)}
            >
              <Users className="h-4 w-4" />
              {e.person.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
