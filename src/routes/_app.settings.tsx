import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Users, Sparkles, Plus, Trash2, Shield, Loader2 } from "lucide-react";
import { PageHeader } from "@/shared/components/layout/page-header";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
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
  companySettingsKeys,
  getCompanySettings,
  getEmptyCompanySettings,
  saveCompanySettings,
  type CompanySettingsDraft,
} from "@/modules/settings/services/company-settings";
import {
  accessoryKeys,
  createAccessory,
  listAccessories,
  setAccessoryActive,
} from "@/modules/settings/services/accessories";
import {
  userKeys,
  deleteSystemUser,
  createSystemUser,
  listSystemUsers,
  setSystemUserActive,
} from "@/modules/users/services/users";
import type { EmployeeAccessRole } from "@/modules/employees/types";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Configurações | GaragemERP" }] }),
  validateSearch: (search: { tab?: unknown }): { tab?: SettingsTab } => {
    const tab = typeof search.tab === "string" ? search.tab : undefined;
    if (tab === "company" || tab === "users" || tab === "accessories") {
      return { tab };
    }
    return {};
  },
  component: SettingsPage,
});

type SettingsTab = "company" | "users" | "accessories";

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
        description="Empresa, acessos do sistema e catálogo de acessórios."
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
      </Tabs>
    </div>
  );
}

function CompanyTab() {
  const queryClient = useQueryClient();
  const {
    data: settings,
    isLoading,
    error,
  } = useQuery({
    queryKey: companySettingsKeys.detail,
    queryFn: getCompanySettings,
  });
  const [draft, setDraft] = useState<CompanySettingsDraft>(getEmptyCompanySettings());

  useEffect(() => {
    setDraft(settings ?? getEmptyCompanySettings());
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: saveCompanySettings,
    onSuccess: async (nextSettings) => {
      queryClient.setQueryData(companySettingsKeys.detail, nextSettings);
      toast.success("Dados da empresa salvos");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Falha ao salvar dados da empresa.",
      );
    },
  });

  const patchDraft = (patch: Partial<CompanySettingsDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(draft);
  };

  return (
    <form onSubmit={submit}>
      <Card>
        <CardContent className="p-6 space-y-6">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              Falha ao carregar dados da empresa:{" "}
              {error instanceof Error ? error.message : "erro desconhecido"}
            </div>
          )}
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-primary text-primary-foreground font-display text-2xl font-bold">
              {(draft.trade_name || draft.legal_name || "GE").slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="text-sm font-medium">Identidade da empresa</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Upload de logo fica desativado até existir armazenamento configurado.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Razão social">
              <Input
                value={draft.legal_name}
                onChange={(event) => patchDraft({ legal_name: event.target.value })}
                disabled={isLoading}
              />
            </Field>
            <Field label="Nome fantasia">
              <Input
                value={draft.trade_name}
                onChange={(event) => patchDraft({ trade_name: event.target.value })}
                disabled={isLoading}
              />
            </Field>
            <Field label="CNPJ">
              <CpfCnpjInput
                value={draft.cnpj}
                onValueChange={(value) => patchDraft({ cnpj: value })}
                personType="company"
                disabled={isLoading}
              />
            </Field>
            <Field label="Inscrição estadual">
              <Input
                value={draft.state_registration}
                onChange={(event) => patchDraft({ state_registration: event.target.value })}
                disabled={isLoading}
              />
            </Field>
            <Field label="Telefone">
              <PhoneInput
                value={draft.phone}
                onValueChange={(value) => patchDraft({ phone: value })}
                disabled={isLoading}
              />
            </Field>
            <Field label="E-mail">
              <Input
                type="email"
                value={draft.email}
                onChange={(event) => patchDraft({ email: event.target.value })}
                disabled={isLoading}
              />
            </Field>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="font-display font-semibold mb-3">Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="CEP">
                <CepInput
                  value={draft.zip_code}
                  onValueChange={(value) => patchDraft({ zip_code: value })}
                  disabled={isLoading}
                />
              </Field>
              <Field label="Cidade">
                <Input
                  value={draft.city}
                  onChange={(event) => patchDraft({ city: event.target.value })}
                  disabled={isLoading}
                />
              </Field>
              <Field label="UF">
                <UfInput
                  value={draft.state}
                  onValueChange={(value) => patchDraft({ state: value })}
                  disabled={isLoading}
                />
              </Field>
              <Field label="Rua">
                <Input
                  value={draft.street}
                  onChange={(event) => patchDraft({ street: event.target.value })}
                  disabled={isLoading}
                />
              </Field>
              <Field label="Número">
                <Input
                  value={draft.number}
                  onChange={(event) => patchDraft({ number: event.target.value })}
                  disabled={isLoading}
                />
              </Field>
              <Field label="Bairro">
                <Input
                  value={draft.neighborhood}
                  onChange={(event) => patchDraft({ neighborhood: event.target.value })}
                  disabled={isLoading}
                />
              </Field>
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={isLoading || saveMutation.isPending}>
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando...
                </>
              ) : (
                "Salvar alterações"
              )}
            </Button>
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
      toast.success("Acesso removido");
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
            <NewUserDialog />
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
                          aria-label={`Remover acesso de ${u.name}`}
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
        title="Remover acesso?"
        description="Isso remove o acesso ao sistema. O funcionário e o histórico de vendas/compras continuam preservados."
        confirmLabel={deleteMutation.isPending ? "Removendo..." : "Remover acesso"}
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
  const queryClient = useQueryClient();
  const {
    data: items = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: accessoryKeys.all,
    queryFn: listAccessories,
  });
  const [draft, setDraft] = useState("");
  const [confirmDeactivateId, setConfirmDeactivateId] = useState<number | null>(null);
  const createMutation = useMutation({
    mutationFn: createAccessory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: accessoryKeys.all });
      await queryClient.invalidateQueries({ queryKey: accessoryKeys.active });
      setDraft("");
      toast.success("Acessório salvo");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Falha ao salvar acessório.",
      );
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      setAccessoryActive(id, active),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: accessoryKeys.all });
      await queryClient.invalidateQueries({ queryKey: accessoryKeys.active });
      setConfirmDeactivateId(null);
      toast.success("Acessório atualizado");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error ? mutationError.message : "Falha ao atualizar acessório.",
      );
    },
  });
  const add = () => {
    if (!draft.trim()) return;
    createMutation.mutate(draft);
  };
  const confirmDeactivate = items.find((item) => item.id === confirmDeactivateId);

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="font-display font-semibold">Catálogo de acessórios</h3>
          <p className="text-xs text-muted-foreground">
            Acessórios disponíveis para associação aos veículos. Itens desativados não aparecem em
            novos cadastros, mas vínculos antigos permanecem preservados.
          </p>
        </div>
        {error && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            Falha ao carregar acessórios:{" "}
            {error instanceof Error ? error.message : "erro desconhecido"}
          </div>
        )}
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
            disabled={createMutation.isPending}
          />
          <Button onClick={add} disabled={createMutation.isPending}>
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Adicionar
          </Button>
        </div>
        {isLoading ? (
          <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
            Carregando acessórios...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-md border border-border p-6 text-sm text-muted-foreground">
            Nenhum acessório cadastrado ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-md border border-border px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{item.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {item.active ? "Disponível para novos veículos" : "Inativo no catálogo"}
                  </div>
                </div>
                <Badge variant={item.active ? "secondary" : "outline"}>
                  {item.active ? "Ativo" : "Inativo"}
                </Badge>
                <Switch
                  checked={item.active}
                  disabled={statusMutation.isPending}
                  onCheckedChange={(active) => {
                    if (active) {
                      statusMutation.mutate({ id: item.id, active: true });
                      return;
                    }
                    setConfirmDeactivateId(item.id);
                  }}
                />
              </div>
            ))}
          </div>
        )}
        <ConfirmActionDialog
          open={confirmDeactivateId != null}
          onOpenChange={(open) => {
            if (!open) setConfirmDeactivateId(null);
          }}
          title="Desativar acessório?"
          description={
            confirmDeactivate
              ? `"${confirmDeactivate.name}" deixará de aparecer em novos cadastros, mas continuará preservado nos veículos que já usam esse item.`
              : "O acessório será desativado no catálogo."
          }
          confirmLabel={statusMutation.isPending ? "Desativando..." : "Desativar"}
          confirmDisabled={statusMutation.isPending || confirmDeactivateId == null}
          onConfirm={() => {
            if (confirmDeactivateId == null) return;
            statusMutation.mutate({ id: confirmDeactivateId, active: false });
          }}
        />
      </CardContent>
    </Card>
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

function NewUserDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: employees = [] } = useQuery({
    queryKey: employeeKeys.all,
    queryFn: listEmployees,
  });
  const availableEmployees = employees.filter((employee) => !employee.user_id);
  const [employeeId, setEmployeeId] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<EmployeeAccessRole>("seller");
  const [active, setActive] = useState(true);
  const createMutation = useMutation({
    mutationFn: createSystemUser,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: userKeys.all });
      await queryClient.invalidateQueries({ queryKey: employeeKeys.all });
      toast.success("Acesso criado para o funcionário");
      resetForm();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao criar usuário.");
    },
  });

  const selectedEmployee = employees.find((employee) => String(employee.id) === employeeId);

  const resetForm = () => {
    setOpen(false);
    setEmployeeId("");
    setPassword("");
    setRole("seller");
    setActive(true);
  };

  const submit = () => {
    if (!selectedEmployee) {
      toast.error("Selecione um funcionário cadastrado.");
      return;
    }

    if (!selectedEmployee.person.email) {
      toast.error("Cadastre um e-mail antes de criar o acesso.");
      return;
    }

    if (password.trim().length < 8) {
      toast.error("Informe uma senha temporária com no mínimo 8 caracteres.");
      return;
    }

    createMutation.mutate({
      employeeId: selectedEmployee.id,
      password,
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
          <Plus className="h-4 w-4" /> Criar acesso
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar acesso</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Funcionário">
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um funcionário sem acesso" />
              </SelectTrigger>
              <SelectContent>
                {availableEmployees.length === 0 ? (
                  <SelectItem value="none" disabled>
                    Nenhum funcionário disponível
                  </SelectItem>
                ) : (
                  availableEmployees.map((employee) => (
                    <SelectItem key={employee.id} value={String(employee.id)}>
                      {employee.person.name} — {employee.position}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </Field>
          {selectedEmployee && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              O acesso será criado para {selectedEmployee.person.name}
              {selectedEmployee.person.email
                ? ` usando ${selectedEmployee.person.email}.`
                : ". Cadastre um e-mail antes de continuar."}
            </div>
          )}
          <Field label="Senha temporária">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
            />
          </Field>
          <Field label="Perfil de acesso">
            <Select value={role} onValueChange={(value) => setRole(value as EmployeeAccessRole)}>
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
          <Button onClick={submit} disabled={createMutation.isPending}>
            <Plus className="h-4 w-4" />
            {createMutation.isPending ? "Criando..." : "Criar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
