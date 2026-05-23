import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Save, Plus, X, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Badge } from "@/shared/components/ui/badge";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "sonner";
import { DEFAULT_ACCESSORIES } from "@/shared/lib/accessories";
import {
  CATEGORY_LABEL,
  PRIORITY_META,
  type ChecklistCategory,
  type ChecklistPriority,
} from "@/modules/checklist";
import { brl } from "@/shared/lib/format";

export const Route = createFileRoute("/_app/vehicles/new")({
  head: () => ({ meta: [{ title: "Novo Veículo | GaragemERP" }] }),
  component: NewVehicle,
});

type DraftChecklist = {
  id: string;
  title: string;
  category: ChecklistCategory;
  priority: ChecklistPriority;
  estimated_cost: number;
  due_date?: string;
};

function NewVehicle() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // Accessories
  const [accessories, setAccessories] = useState<string[]>([]);
  const [customAcc, setCustomAcc] = useState("");
  const toggleAcc = (a: string) =>
    setAccessories((p) => (p.includes(a) ? p.filter((x) => x !== a) : [...p, a]));
  const addCustomAcc = () => {
    const v = customAcc.trim();
    if (!v) return;
    if (!accessories.includes(v)) setAccessories((p) => [...p, v]);
    setCustomAcc("");
  };

  // Checklist draft
  const [checklist, setChecklist] = useState<DraftChecklist[]>([]);
  const [draft, setDraft] = useState<DraftChecklist>({
    id: "",
    title: "",
    category: "mechanical",
    priority: "medium",
    estimated_cost: 0,
    due_date: undefined,
  });
  const addChecklist = () => {
    if (!draft.title.trim()) {
      toast.error("Informe o título da tarefa");
      return;
    }
    setChecklist((p) => [...p, { ...draft, id: `d_${Date.now()}` }]);
    setDraft({
      id: "",
      title: "",
      category: "mechanical",
      priority: "medium",
      estimated_cost: 0,
      due_date: undefined,
    });
  };
  const removeChecklist = (id: string) =>
    setChecklist((p) => p.filter((x) => x.id !== id));

  const totalEstimated = checklist.reduce((s, x) => s + (x.estimated_cost || 0), 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setTimeout(() => {
      toast.success("Veículo cadastrado", {
        description: `${accessories.length} acessório(s) e ${checklist.length} item(ns) de checklist`,
      });
      navigate({ to: "/vehicles" });
    }, 600);
  };

  return (
    <form onSubmit={submit} className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild type="button">
          <Link to="/vehicles">
            <ArrowLeft className="h-4 w-4" /> Estoque
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Adicionar Veículo
        </h1>
        <Button type="submit" disabled={saving}>
          <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Identificação</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Placa" required>
              <Input placeholder="ABC-1D23" required />
            </Field>
            <Field label="Chassi">
              <Input placeholder="9BWZZZ377VT004251" />
            </Field>
            <Field label="VIN">
              <Input placeholder="1HGBH41JXMN109186" />
            </Field>
            <Field label="Marca" required>
              <Input placeholder="Toyota" required />
            </Field>
            <Field label="Modelo" required>
              <Input placeholder="Corolla" required />
            </Field>
            <Field label="Versão">
              <Input placeholder="XEi 2.0" />
            </Field>
            <Field label="Cor" required>
              <Input placeholder="Prata" required />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Especificações</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Combustível">
              <Select defaultValue="flex">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="flex">Flex</SelectItem>
                  <SelectItem value="gasoline">Gasolina</SelectItem>
                  <SelectItem value="diesel">Diesel</SelectItem>
                  <SelectItem value="electric">Elétrico</SelectItem>
                  <SelectItem value="hybrid">Híbrido</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Câmbio">
              <Select defaultValue="automatic">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="automatic">Automático</SelectItem>
                  <SelectItem value="cvt">CVT</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Quilometragem">
              <Input type="number" placeholder="0" />
            </Field>
            <Field label="Ano fabricação">
              <Input type="number" placeholder="2024" />
            </Field>
            <Field label="Ano modelo">
              <Input type="number" placeholder="2024" />
            </Field>
            <Field label="Status">
              <Select defaultValue="available">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Disponível</SelectItem>
                  <SelectItem value="reserved">Reservado</SelectItem>
                  <SelectItem value="in_repair">Em reparo</SelectItem>
                  <SelectItem value="sold">Vendido</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <h2 className="font-display font-semibold">Valores</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Custo de aquisição">
              <Input type="number" placeholder="0,00" />
            </Field>
            <Field label="Preço de venda">
              <Input type="number" placeholder="0,00" />
            </Field>
          </div>
          <Field label="Observações">
            <Textarea rows={3} placeholder="Anotações internas..." />
          </Field>
        </CardContent>
      </Card>

      {/* Accessories */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold">Acessórios</h2>
              <p className="text-xs text-muted-foreground">
                Selecione os acessórios presentes no veículo.
              </p>
            </div>
            <Badge variant="secondary">{accessories.length} selecionado(s)</Badge>
          </div>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_ACCESSORIES.map((a) => {
              const active = accessories.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAcc(a)}
                  className={
                    "px-3 py-1.5 rounded-full text-xs border transition-colors " +
                    (active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-accent")
                  }
                >
                  {a}
                </button>
              );
            })}
          </div>
          {accessories.filter((a) => !DEFAULT_ACCESSORIES.includes(a)).length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
              {accessories
                .filter((a) => !DEFAULT_ACCESSORIES.includes(a))
                .map((a) => (
                  <Badge key={a} variant="outline" className="gap-1">
                    {a}
                    <button type="button" onClick={() => toggleAcc(a)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
            </div>
          )}
          <div className="flex gap-2">
            <Input
              placeholder="Adicionar acessório personalizado..."
              value={customAcc}
              onChange={(e) => setCustomAcc(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomAcc();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addCustomAcc}>
              <Plus className="h-4 w-4" /> Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Preparation checklist */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold">Checklist de Preparação</h2>
              <p className="text-xs text-muted-foreground">
                Cadastre tarefas iniciais (reparos, vistoria, fotos, etc).
              </p>
            </div>
            <div className="text-sm">
              Custo estimado:{" "}
              <span className="font-semibold">{brl(totalEstimated)}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
            <div className="md:col-span-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Título
              </Label>
              <Input
                placeholder="Ex.: Polimento"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </div>
            <div className="md:col-span-3">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Categoria
              </Label>
              <Select
                value={draft.category}
                onValueChange={(v) =>
                  setDraft({ ...draft, category: v as ChecklistCategory })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABEL).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Prioridade
              </Label>
              <Select
                value={draft.priority}
                onValueChange={(v) =>
                  setDraft({ ...draft, priority: v as ChecklistPriority })
                }
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_META).map(([k, m]) => (
                    <SelectItem key={k} value={k}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Custo est.
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={draft.estimated_cost}
                onChange={(e) =>
                  setDraft({ ...draft, estimated_cost: Number(e.target.value) || 0 })
                }
              />
            </div>
            <div className="md:col-span-1">
              <Button type="button" className="w-full" onClick={addChecklist}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="md:col-span-4">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Prazo
              </Label>
              <DatePicker
                value={draft.due_date}
                onChange={(v) => setDraft({ ...draft, due_date: v })}
              />
            </div>
          </div>

          {checklist.length === 0 ? (
            <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
              Nenhum item adicionado ao checklist ainda.
            </div>
          ) : (
            <div className="space-y-2">
              {checklist.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-md border border-border p-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{c.title}</div>
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-2 mt-0.5">
                      <span>{CATEGORY_LABEL[c.category]}</span>
                      <span>•</span>
                      <span>{PRIORITY_META[c.priority].label}</span>
                      {c.due_date && (
                        <>
                          <span>•</span>
                          <span>Prazo: {c.due_date}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-medium">{brl(c.estimated_cost)}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeChecklist(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}
