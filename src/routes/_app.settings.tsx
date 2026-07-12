import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Users, Sparkles, Sliders, Plus, Trash2, Upload, Shield } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { Textarea } from "@/shared/components/ui/textarea";
import { Switch } from "@/shared/components/ui/switch";
import { Avatar, AvatarFallback } from "@/shared/components/ui/avatar";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { Badge } from "@/shared/components/ui/badge";
import { CepInput, CpfCnpjInput, PhoneInput, UfInput } from "@/shared/components/form/field-inputs";
import { initials, fmtDate } from "@/shared/lib/format";
import { toast } from "sonner";
import { useAuth } from "@/shared/supabase/auth";
import { employeeKeys, listEmployees } from "@/modules/employees/services/employees";
import {
  userKeys,
  deleteSystemUser,
  createSystemUser,
  linkSystemUserToEmployee,
  listSystemUsers,
  setSystemUserActive,
} from "@/modules/users/services/users";
import type { SystemUserRecord } from "@/modules/users/services/users";
import type { EmployeeAccessRole } from "@/modules/employees/types";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Configurações | GaragemERP" }] }),
  validateSearch: (search: { tab?: unknown }): { tab?: SettingsTab } => {
    const tab = typeof search.tab === "string" ? search.tab : undefined;
    if (tab === "company" || tab === "users" || tab === "accessories" || tab === "general") {
      return { tab };
    }
    return {};
  },
  component: SettingsPage,
});

const initialAccessories = [
  "Ar condicionado",
  "Direção elétrica",
  "Vidros elétricos",
  "Trava elétrica",
  "Airbag",
  "ABS",
  "Câmera de ré",
  "Sensor de estacionamento",
  "Multimídia",
  "Teto solar",
  "Bancos em couro",
  "Rodas de liga",
  "GPS",
  "Faróis de LED",
  "Piloto automático",
];

type SettingsTab = "company" | "users" | "accessories" | "general";

function SettingsPage() {
  const { isAdmin } = useAuth();
  const { tab: searchTab } = Route.useSearch();
  const [tab, setTab] = useState<SettingsTab>(searchTab ?? "company");

  useEffect(() => {
    setTab(searchTab ?? "company");
  }, [searchTab]);

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Configurações"
        description="Empresa, usuários, acessórios e preferências."
      />
      <Tabs value={tab} onValueChange={(value) => setTab(value as SettingsTab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="company">
            <Building2 className="h-4 w-4 mr-2" />
            Empresa
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" />
              Usuários
            </TabsTrigger>
          )}
          <TabsTrigger value="accessories">
            <Sparkles className="h-4 w-4 mr-2" />
            Acessórios
          </TabsTrigger>
          <TabsTrigger value="general">
            <Sliders className="h-4 w-4 mr-2" />
            Geral
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <CompanyTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
        )}
        <TabsContent value="accessories">
          <AccessoriesTab />
        </TabsContent>
        <TabsContent value="general">
          <GeneralTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CompanyTab() {
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Dados da empresa atualizados");
  };
  return (
    <form onSubmit={submit}>
      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-20 w-20 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center text-primary-foreground font-display font-bold text-2xl">
              GE
            </div>
            <div>
              <Button type="button" variant="outline" size="sm">
                <Upload className="h-4 w-4" /> Trocar logo
              </Button>
              <p className="text-xs text-muted-foreground mt-2">PNG ou SVG, até 2MB</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Razão social">
              <Input defaultValue="Garagem Elite Comércio de Veículos LTDA" />
            </Field>
            <Field label="Nome fantasia">
              <Input defaultValue="GaragemERP" />
            </Field>
            <Field label="CNPJ">
              <CpfCnpjInput value="12345678000190" onValueChange={() => {}} personType="company" />
            </Field>
            <Field label="Inscrição estadual">
              <Input defaultValue="123.456.789.000" />
            </Field>
            <Field label="Telefone">
              <PhoneInput value="1140028922" onValueChange={() => {}} />
            </Field>
            <Field label="E-mail">
              <Input type="email" defaultValue="contato@garagemerp.com.br" />
            </Field>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="font-display font-semibold mb-3">Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="CEP">
                <CepInput value="04567000" onValueChange={() => {}} />
              </Field>
              <Field label="Cidade">
                <Input defaultValue="São Paulo" />
              </Field>
              <Field label="UF">
                <UfInput value="SP" onValueChange={() => {}} />
              </Field>
              <Field label="Rua">
                <Input defaultValue="Av. Brigadeiro Faria Lima" />
              </Field>
              <Field label="Número">
                <Input defaultValue="1500" />
              </Field>
              <Field label="Bairro">
                <Input defaultValue="Itaim Bibi" />
              </Field>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit">Salvar alterações</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function UsersTab() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<number | null>(null);
  const { data: users = [], isLoading } = useQuery({
    queryKey: userKeys.all,
    queryFn: listSystemUsers,
  });
  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: userKeys.all });
    await queryClient.invalidateQueries({ queryKey: employeeKeys.all });
  };
  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      setSystemUserActive(id, active),
    onSuccess: async () => {
      await invalidate();
      toast.success("Usuário atualizado");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar usuário.");
    },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteSystemUser,
    onSuccess: async () => {
      await invalidate();
      toast.success("Usuário removido");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao excluir usuário.");
    },
  });
  return (
    <>
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h3 className="font-display font-semibold">Usuários do sistema</h3>
              <p className="text-xs text-muted-foreground">{users.length} usuários cadastrados</p>
            </div>
            <NewUserDialog users={users} />
          </div>
          {isLoading ? (
            <div className="p-8 text-sm text-muted-foreground">Carregando usuários...</div>
          ) : (
            <div className="divide-y divide-border">
              {users.map((u) => (
                <div key={u.id} className="flex items-center gap-4 px-6 py-4">
                  <Avatar>
                    <AvatarFallback className="bg-muted text-xs">{initials(u.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {u.employee_position
                        ? `Cargo: ${u.employee_position}`
                        : "Sem vínculo com funcionário"}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground hidden md:block">
                    {u.last_login_at
                      ? `Último acesso: ${fmtDate(u.last_login_at)}`
                      : "Nunca acessou"}
                  </div>
                  {u.is_admin && (
                    <Badge variant="outline" className="border-primary/30 text-primary">
                      <Shield className="h-3 w-3 mr-1" /> Admin
                    </Badge>
                  )}
                  {u.auth_user_id && session?.user.id === u.auth_user_id ? (
                    u.active ? (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          Você
                        </Badge>
                        <Switch checked disabled />
                      </div>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => toggleMutation.mutate({ id: u.id, active: true })}
                        disabled={toggleMutation.isPending}
                      >
                        Reativar meu acesso
                      </Button>
                    )
                  ) : (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={u.active}
                        onCheckedChange={(value) =>
                          toggleMutation.mutate({ id: u.id, active: value })
                        }
                      />
                      {!u.auth_user_id || session?.user.id !== u.auth_user_id ? (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Excluir usuário ${u.name}`}
                          onClick={() => setConfirmDeleteUserId(u.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <ConfirmActionDialog
        open={confirmDeleteUserId != null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteUserId(null);
        }}
        title="Excluir usuário?"
        description="Isso remove o acesso ao sistema. O funcionário e o histórico de vendas/compras continuam preservados."
        confirmLabel={deleteMutation.isPending ? "Excluindo..." : "Excluir"}
        confirmDisabled={deleteMutation.isPending || confirmDeleteUserId == null}
        onConfirm={() => {
          if (confirmDeleteUserId == null) return;
          const id = confirmDeleteUserId;
          setConfirmDeleteUserId(null);
          deleteMutation.mutate(id);
        }}
      />
    </>
  );
}

function AccessoriesTab() {
  const [items, setItems] = useState(initialAccessories);
  const [draft, setDraft] = useState("");
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const add = () => {
    if (!draft.trim()) return;
    setItems((s) => [...s, draft.trim()]);
    setDraft("");
    toast.success("Acessório adicionado");
  };
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="font-display font-semibold">Catálogo de acessórios</h3>
          <p className="text-xs text-muted-foreground">
            Acessórios disponíveis para associação aos veículos.
          </p>
        </div>
        <div className="flex gap-2">
          <Input
            placeholder="Ex.: Sensor de chuva"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
          />
          <Button onClick={add}>
            <Plus className="h-4 w-4" /> Adicionar
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.map((name) => (
            <div
              key={name}
              className="group flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full border border-border bg-muted/40 text-sm"
            >
              {name}
              <button
                type="button"
                onClick={() => setConfirmRemove(name)}
                className="opacity-50 hover:opacity-100 hover:text-destructive transition"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <ConfirmActionDialog
          open={confirmRemove != null}
          onOpenChange={(open) => {
            if (!open) setConfirmRemove(null);
          }}
          title="Remover acessório?"
          description="Este item será removido da lista de acessórios sugeridos."
          confirmLabel={confirmRemove ? "Remover" : "Confirmar"}
          onConfirm={() => {
            if (!confirmRemove) return;
            const name = confirmRemove;
            setConfirmRemove(null);
            setItems((current) => current.filter((item) => item !== name));
            toast.success("Acessório removido");
          }}
        />
      </CardContent>
    </Card>
  );
}

function GeneralTab() {
  return (
    <Card>
      <CardContent className="p-6 space-y-6">
        <div>
          <h3 className="font-display font-semibold mb-3">Comissões padrão</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Tipo padrão">
              <Select defaultValue="percentage">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentual</SelectItem>
                  <SelectItem value="fixed">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Taxa padrão (%)">
              <Input type="number" defaultValue={2.5} />
            </Field>
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="font-display font-semibold mb-3">Preferências</h3>
          <div className="space-y-3">
            <Toggle label="Mostrar margens estimadas em listagens" defaultChecked />
            <Toggle label="Exibir alertas de parcelas vencidas no topo" defaultChecked />
            <Toggle label="Notificar comissões aprovadas por e-mail" />
            <Toggle label="Tema escuro como padrão para novos usuários" />
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <h3 className="font-display font-semibold mb-3">Mensagem do dia</h3>
          <Textarea rows={3} placeholder="Aparece no topo do dashboard para todos os usuários" />
        </div>

        <div className="flex justify-end">
          <Button onClick={() => toast.success("Preferências salvas")}>Salvar preferências</Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Toggle({ label, defaultChecked }: { label: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
      <span className="text-sm">{label}</span>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function NewUserDialog({ users }: { users: SystemUserRecord[] }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"create" | "link">("create");
  const { data: employees = [] } = useQuery({
    queryKey: employeeKeys.all,
    queryFn: listEmployees,
  });
  const availableEmployees = employees.filter((employee) => !employee.user_id);
  const availableUsers = users.filter((user) => !user.employee_id);
  const [createEmployeeId, setCreateEmployeeId] = useState("new");
  const [linkedUserId, setLinkedUserId] = useState("new");
  const [linkedEmployeeId, setLinkedEmployeeId] = useState("new");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [position, setPosition] = useState("Funcionário");
  const [role, setRole] = useState<EmployeeAccessRole>("seller");
  const [active, setActive] = useState(true);
  const createMutation = useMutation({
    mutationFn: createSystemUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      await queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      toast.success("Usuário criado e vinculado ao acesso interno");
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao criar usuário.");
    },
  });
  const linkMutation = useMutation({
    mutationFn: linkSystemUserToEmployee,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      await queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      toast.success("Usuário vinculado ao funcionário");
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao vincular usuário.");
    },
  });

  useEffect(() => {
    if (mode !== "create") {
      return;
    }

    if (createEmployeeId === "new") {
      setName("");
      setEmail("");
      setPhone("");
      setPosition("Funcionário");
      return;
    }

    const selected = employees.find((employee) => String(employee.id) === createEmployeeId);
    if (!selected) {
      return;
    }

    setName(selected.person.name);
    setEmail(selected.person.email);
    setPhone(selected.person.phone);
    setPosition(selected.position);
  }, [createEmployeeId, employees, mode]);

  const selectedCreateEmployee = employees.find(
    (employee) => String(employee.id) === createEmployeeId,
  );
  const selectedLinkEmployee = employees.find(
    (employee) => String(employee.id) === linkedEmployeeId,
  );
  const selectedLinkUser = users.find((user) => String(user.id) === linkedUserId);

  const resetForm = () => {
    setOpen(false);
    setMode("create");
    setCreateEmployeeId("new");
    setLinkedUserId("new");
    setLinkedEmployeeId("new");
    setName("");
    setEmail("");
    setPassword("");
    setPhone("");
    setPosition("Funcionário");
    setRole("seller");
    setActive(true);
  };

  const submit = () => {
    if (mode === "create") {
      if (!name.trim() || !email.trim() || password.trim().length < 8) {
        toast.error("Preencha nome, e-mail e uma senha com no mínimo 8 caracteres");
        return;
      }

      createMutation.mutate({
        name,
        email,
        password,
        phone: phone || undefined,
        role,
        position,
        active,
        isAdmin: role === "admin",
        employeeId: createEmployeeId === "new" ? undefined : Number(createEmployeeId),
      });
      return;
    }

    if (linkedUserId === "new" || linkedEmployeeId === "new") {
      toast.error("Selecione um usuário e um funcionário para vincular.");
      return;
    }

    linkMutation.mutate({
      userId: Number(linkedUserId),
      employeeId: Number(linkedEmployeeId),
      role,
      active,
      isAdmin: role === "admin",
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          resetForm();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Novo usuário
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Usuário</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Modo">
            <Select
              value={mode}
              onValueChange={(value) => {
                setMode(value as "create" | "link");
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="create">Criar novo acesso</SelectItem>
                <SelectItem value="link">Vincular usuário existente</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {mode === "create" ? (
            <>
              <Field label="Funcionário vinculado">
                <Select value={createEmployeeId} onValueChange={setCreateEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Criar novo funcionário ou vincular existente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Criar novo funcionário</SelectItem>
                    {availableEmployees.map((employee) => (
                      <SelectItem key={employee.id} value={String(employee.id)}>
                        {employee.person.name} — {employee.position}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Nome completo">
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Senha temporária">
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </Field>
              <Field label="Telefone">
                <PhoneInput value={phone} onValueChange={setPhone} />
              </Field>
              {!selectedCreateEmployee && (
                <Field label="Cargo">
                  <Input value={position} onChange={(e) => setPosition(e.target.value)} />
                </Field>
              )}
            </>
          ) : (
            <>
              <Field label="Usuário existente">
                <Select value={linkedUserId} onValueChange={setLinkedUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um usuário" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Selecionar usuário</SelectItem>
                    {availableUsers.map((user) => (
                      <SelectItem key={user.id} value={String(user.id)}>
                        {user.name} {user.email ? `— ${user.email}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Funcionário">
                <Select value={linkedEmployeeId} onValueChange={setLinkedEmployeeId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um funcionário" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="new">Selecionar funcionário</SelectItem>
                    {availableEmployees.map((employee) => (
                      <SelectItem key={employee.id} value={String(employee.id)}>
                        {employee.person.name} — {employee.position}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {selectedLinkUser && (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
                  O sistema vai vincular {selectedLinkUser.name} ao funcionário{" "}
                  {selectedLinkEmployee ? selectedLinkEmployee.person.name : "selecionado"}.
                </div>
              )}
            </>
          )}
          <Field label="Perfil de acesso">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrador</SelectItem>
                <SelectItem value="manager">Gerente</SelectItem>
                <SelectItem value="seller">Vendedor</SelectItem>
                <SelectItem value="financial">Financeiro</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="text-sm">Ativo no sistema</div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={createMutation.isPending || linkMutation.isPending}>
            <Plus className="h-4 w-4" />
            {mode === "create"
              ? createMutation.isPending
                ? "Criando..."
                : "Criar usuário"
              : linkMutation.isPending
                ? "Vinculando..."
                : "Vincular acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
