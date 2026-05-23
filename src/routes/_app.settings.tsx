import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
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
import { initials, fmtDate } from "@/shared/lib/format";
import { employees } from "@/shared/mock-data";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Configurações | GaragemERP" }] }),
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

function SettingsPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader title="Configurações" description="Empresa, usuários, acessórios e preferências." />
      <Tabs defaultValue="company">
        <TabsList className="mb-4">
          <TabsTrigger value="company"><Building2 className="h-4 w-4 mr-2" />Empresa</TabsTrigger>
          <TabsTrigger value="users"><Users className="h-4 w-4 mr-2" />Usuários</TabsTrigger>
          <TabsTrigger value="accessories"><Sparkles className="h-4 w-4 mr-2" />Acessórios</TabsTrigger>
          <TabsTrigger value="general"><Sliders className="h-4 w-4 mr-2" />Geral</TabsTrigger>
        </TabsList>

        <TabsContent value="company"><CompanyTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="accessories"><AccessoriesTab /></TabsContent>
        <TabsContent value="general"><GeneralTab /></TabsContent>
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
            <Field label="Razão social"><Input defaultValue="Garagem Elite Comércio de Veículos LTDA" /></Field>
            <Field label="Nome fantasia"><Input defaultValue="GaragemERP" /></Field>
            <Field label="CNPJ"><Input defaultValue="12.345.678/0001-90" /></Field>
            <Field label="Inscrição estadual"><Input defaultValue="123.456.789.000" /></Field>
            <Field label="Telefone"><Input defaultValue="(11) 4002-8922" /></Field>
            <Field label="E-mail"><Input type="email" defaultValue="contato@garagemerp.com.br" /></Field>
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="font-display font-semibold mb-3">Endereço</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Field label="CEP"><Input defaultValue="04567-000" /></Field>
              <Field label="Cidade"><Input defaultValue="São Paulo" /></Field>
              <Field label="UF">
                <Select defaultValue="SP">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["SP", "RJ", "MG", "PR", "RS", "SC", "BA"].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Rua"><Input defaultValue="Av. Brigadeiro Faria Lima" /></Field>
              <Field label="Número"><Input defaultValue="1500" /></Field>
              <Field label="Bairro"><Input defaultValue="Itaim Bibi" /></Field>
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
  const users = employees.slice(0, 3).map((e, i) => ({
    id: e.id,
    name: e.person.name,
    email: e.person.email,
    isAdmin: i === 0,
    lastLogin: ["2025-05-08", "2025-05-07", "2025-05-05"][i],
  }));
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="font-display font-semibold">Usuários do sistema</h3>
            <p className="text-xs text-muted-foreground">{users.length} usuários ativos</p>
          </div>
          <NewUserDialog />

        </div>
        <div className="divide-y divide-border">
          {users.map((u) => (
            <div key={u.id} className="flex items-center gap-4 px-6 py-4">
              <Avatar><AvatarFallback className="bg-muted text-xs">{initials(u.name)}</AvatarFallback></Avatar>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{u.name}</div>
                <div className="text-xs text-muted-foreground truncate">{u.email}</div>
              </div>
              <div className="text-xs text-muted-foreground hidden md:block">
                Último acesso: {fmtDate(u.lastLogin)}
              </div>
              {u.isAdmin && (
                <Badge variant="outline" className="border-primary/30 text-primary">
                  <Shield className="h-3 w-3 mr-1" /> Admin
                </Badge>
              )}
              <Switch defaultChecked={u.isAdmin} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AccessoriesTab() {
  const [items, setItems] = useState(initialAccessories);
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    setItems((s) => [...s, draft.trim()]);
    setDraft("");
    toast.success("Acessório adicionado");
  };
  const remove = (name: string) => setItems((s) => s.filter((n) => n !== name));
  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <h3 className="font-display font-semibold">Catálogo de acessórios</h3>
          <p className="text-xs text-muted-foreground">Acessórios disponíveis para associação aos veículos.</p>
        </div>
        <div className="flex gap-2">
          <Input placeholder="Ex.: Sensor de chuva" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <Button onClick={add}><Plus className="h-4 w-4" /> Adicionar</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.map((name) => (
            <div key={name} className="group flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full border border-border bg-muted/40 text-sm">
              {name}
              <button onClick={() => remove(name)} className="opacity-50 hover:opacity-100 hover:text-destructive transition">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
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
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentual</SelectItem>
                  <SelectItem value="fixed">Valor fixo</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Taxa padrão (%)"><Input type="number" defaultValue={2.5} /></Field>
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

function NewUserDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("seller");
  const [active, setActive] = useState(true);

  const submit = () => {
    if (!name.trim() || !email.trim()) {
      toast.error("Preencha nome e e-mail");
      return;
    }
    toast.success(`Usuário ${name} criado e convite enviado`);
    setOpen(false);
    setName("");
    setEmail("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          <Field label="Nome completo"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="E-mail"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Field label="Perfil de acesso">
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
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
          <Button onClick={submit}><Plus className="h-4 w-4" /> Criar usuário</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
