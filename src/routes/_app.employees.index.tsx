import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Eye, MoreHorizontal, Pencil, Trash2, KeyRound } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { brl, fmtDate, initials } from "@/shared/lib/format";
import { employees } from "@/shared/mock-data";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/components/ui/table";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/employees/")({
  head: () => ({ meta: [{ title: "Funcionários | GaragemERP" }] }),
  component: EmployeesPage,
});

function EmployeesPage() {
  const navigate = useNavigate();
  return (
    <div className="max-w-[1600px] mx-auto">
      <PageHeader
        title="Funcionários"
        description={`${employees.length} colaboradores`}
        action={{ label: "Novo Funcionário", to: "/employees/new" }}
      />
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Funcionário</TableHead>
              <TableHead>Cargo</TableHead>
              <TableHead>Tipo Comissão</TableHead>
              <TableHead>Taxa</TableHead>
              <TableHead>Contratação</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {employees.map((e) => (
              <TableRow
                key={e.id}
                onClick={() => navigate({ to: "/employees/$id", params: { id: String(e.id) } })}
                className="cursor-pointer"
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-9 w-9">
                      <AvatarFallback className="text-xs bg-primary/10 text-primary">
                        {initials(e.person.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{e.person.name}</div>
                      <div className="text-xs text-muted-foreground">{e.person.email}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>{e.position}</TableCell>
                <TableCell>
                  <Badge variant="outline">
                    {e.commission_type === "percentage" ? "Percentual" : "Fixo"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {e.commission_type === "percentage"
                    ? `${e.commission_rate}%`
                    : brl(e.commission_rate)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {fmtDate(e.hired_at)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className={`h-2 w-2 rounded-full ${e.active ? "bg-success" : "bg-muted-foreground"}`} />
                    <span className="text-sm">{e.active ? "Ativo" : "Inativo"}</span>
                  </div>
                </TableCell>
                <TableCell onClick={(ev) => ev.stopPropagation()}>
                  <div className="flex gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Ver ${e.person.name}`}
                      asChild
                    >
                      <Link to="/employees/$id" params={{ id: String(e.id) }}>
                        <Eye className="h-4 w-4" />
                      </Link>
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Editar ${e.person.name}`}
                      asChild
                    >
                      <Link to="/employees/edit/$id" params={{ id: String(e.id) }}>
                        <Pencil className="h-4 w-4" />
                      </Link>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost" aria-label={`Mais ações`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuLabel>Ações</DropdownMenuLabel>
                        <DropdownMenuItem onClick={() => navigate({ to: "/employees/$id", params: { id: String(e.id) } })}>
                          <Eye className="h-4 w-4" /> Ver detalhes
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate({ to: "/employees/edit/$id", params: { id: String(e.id) } })}>
                          <Pencil className="h-4 w-4" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toast.success("Senha resetada e enviada por e-mail")}>
                          <KeyRound className="h-4 w-4" /> Resetar senha
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => toast.success(`${e.person.name} desativado`)}
                        >
                          <Trash2 className="h-4 w-4" /> Desativar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
