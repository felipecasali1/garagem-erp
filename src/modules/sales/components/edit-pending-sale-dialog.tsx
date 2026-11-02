import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { brl, fmtDate } from "@/shared/lib/format";
import type { PaymentMethod, Sale } from "@/shared/types/domain";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { getSaleById, updateSalePayment } from "@/modules/sales/services/sales";
import type { UpdateSalePaymentInput } from "@/modules/sales/services/sales";

type EditablePaymentMethod = Exclude<PaymentMethod, "trade_in">;
type SaleDraft = {
  salePrice: string;
  discount: string;
  notes: string;
  paymentMethod: EditablePaymentMethod;
  downPayment: string;
  installmentsCount: string;
  paymentDate: string;
};
type ConflictState = {
  latest: Sale | null;
  loading: boolean;
  error?: string;
};

const paymentLabels: Record<EditablePaymentMethod, string> = {
  cash: "À vista",
  financing: "Financiamento",
  card: "Cartão",
  pix: "PIX",
};

function draftFromSale(sale: Sale): SaleDraft {
  return {
    salePrice: String(sale.total_value + sale.discount),
    discount: String(sale.discount),
    notes: sale.notes ?? "",
    paymentMethod:
      sale.payment?.payment_method === "trade_in"
        ? "financing"
        : (sale.payment?.payment_method ?? "financing"),
    downPayment: String(sale.payment?.down_payment ?? 0),
    installmentsCount: String(sale.payment?.installments_count ?? 1),
    paymentDate: sale.payment?.payment_date ?? sale.sale_date,
  };
}

function isStaleRecord(error: unknown): boolean {
  return error instanceof Error && error.message.includes("STALE_RECORD");
}

export function EditPendingSaleDialog({
  sale,
  open,
  onOpenChange,
  onSaved,
}: {
  sale: Sale;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<SaleDraft | null>(null);
  const [baseSale, setBaseSale] = useState<Sale>(sale);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const draftRef = useRef<SaleDraft | null>(null);
  const baseSaleRef = useRef<Sale>(sale);
  const idempotencyAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!open || draftRef.current) return;
    const initialDraft = draftFromSale(sale);
    draftRef.current = initialDraft;
    baseSaleRef.current = sale;
    setDraft(initialDraft);
    setBaseSale(sale);
    setConflict(null);
  }, [open, sale]);

  const saveMutation = useMutation<number, Error, UpdateSalePaymentInput>({
    mutationFn: updateSalePayment,
    onSuccess: async () => {
      await onSaved();
      toast.success("Venda atualizada");
      idempotencyAttemptRef.current = null;
      draftRef.current = null;
      setDraft(null);
      setConflict(null);
      onOpenChange(false);
    },
    onError: async (error) => {
      if (!isStaleRecord(error)) {
        toast.error(error.message || "Falha ao atualizar venda.");
        return;
      }

      setConflict({ latest: null, loading: true });
      try {
        const latest = await getSaleById(sale.id);
        setConflict({ latest, loading: false });
      } catch (refreshError) {
        setConflict({
          latest: null,
          loading: false,
          error:
            refreshError instanceof Error
              ? refreshError.message
              : "Não foi possível carregar os dados atuais.",
        });
      }
    },
  });

  function updateField<Key extends keyof SaleDraft>(key: Key, value: SaleDraft[Key]) {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, [key]: value };
    draftRef.current = next;
    setDraft(next);
  }

  function submitDraft(targetSale: Sale, forceNewKey = false) {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;
    if (!targetSale.payment) {
      toast.error("Esta venda não possui pagamento vinculado para editar.");
      return;
    }

    const salePrice = Number(currentDraft.salePrice);
    const discount = Number(currentDraft.discount);
    const downPayment = Number(currentDraft.downPayment);
    const installmentsCount = Number(currentDraft.installmentsCount);
    const totalValue = salePrice - discount;
    if (
      !Number.isFinite(salePrice) ||
      salePrice <= 0 ||
      !Number.isFinite(discount) ||
      totalValue <= 0
    ) {
      toast.error("O valor final da venda deve ser maior que zero.");
      return;
    }
    if (
      currentDraft.paymentMethod === "financing" &&
      (!Number.isFinite(downPayment) || downPayment < 0 || downPayment > totalValue)
    ) {
      toast.error("A entrada deve estar entre zero e o valor final da venda.");
      return;
    }
    if (!Number.isInteger(installmentsCount) || installmentsCount < 1) {
      toast.error("Informe uma quantidade válida de parcelas.");
      return;
    }

    const command = {
      saleId: targetSale.id,
      expectedSaleUpdatedAt: targetSale.updated_at,
      expectedPaymentUpdatedAt: targetSale.payment.updated_at,
      salePrice,
      discount,
      notes: currentDraft.notes,
      paymentMethod: currentDraft.paymentMethod,
      downPayment: currentDraft.paymentMethod === "financing" ? downPayment : 0,
      installmentsCount,
      paymentDate: currentDraft.paymentDate || undefined,
    } satisfies Omit<UpdateSalePaymentInput, "idempotencyKey">;
    const fingerprint = JSON.stringify(command);
    const idempotencyKey =
      !forceNewKey && idempotencyAttemptRef.current?.fingerprint === fingerprint
        ? idempotencyAttemptRef.current.key
        : crypto.randomUUID();
    idempotencyAttemptRef.current = { fingerprint, key: idempotencyKey };

    const input: UpdateSalePaymentInput = { ...command, idempotencyKey };
    saveMutation.mutate(input);
  }

  async function refreshConflict() {
    setConflict((current) => ({ latest: current?.latest ?? null, loading: true }));
    try {
      const latest = await getSaleById(sale.id);
      setConflict({ latest, loading: false });
    } catch (error) {
      setConflict({
        latest: null,
        loading: false,
        error:
          error instanceof Error ? error.message : "Não foi possível carregar os dados atuais.",
      });
    }
  }

  function reloadFromConflict() {
    const latest = conflict?.latest;
    if (!latest) return;
    const nextDraft = draftFromSale(latest);
    draftRef.current = nextDraft;
    baseSaleRef.current = latest;
    setDraft(nextDraft);
    setBaseSale(latest);
    idempotencyAttemptRef.current = null;
    setConflict(null);
  }

  function reapplyDraft() {
    const latest = conflict?.latest;
    if (!latest || latest.status !== "pending") return;
    baseSaleRef.current = latest;
    setBaseSale(latest);
    setConflict(null);
    submitDraft(latest, true);
  }

  const canEdit = baseSale.status === "pending" && Boolean(baseSale.payment);
  const finalValue = draft ? Number(draft.salePrice) - Number(draft.discount) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar venda #{sale.id}</DialogTitle>
          <DialogDescription>
            Ajuste os valores e as condições de pagamento enquanto a venda estiver pendente.
          </DialogDescription>
        </DialogHeader>

        {draft && (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              submitDraft(baseSaleRef.current);
            }}
          >
            {!canEdit && (
              <div className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-muted-foreground">
                Esta venda não está mais pendente ou não possui pagamento vinculado para edição.
              </div>
            )}

            {conflict && (
              <div
                role="alert"
                className="space-y-3 rounded-md border border-warning/50 bg-warning/5 p-4"
              >
                <div>
                  <p className="font-medium">Outra pessoa alterou esta venda.</p>
                  <p className="text-sm text-muted-foreground">
                    Seu formulário continua preservado. Compare os dados atuais e escolha como
                    prosseguir.
                  </p>
                </div>
                {conflict.loading && <p className="text-sm">Carregando dados atuais...</p>}
                {conflict.error && <p className="text-sm text-destructive">{conflict.error}</p>}
                {conflict.latest && (
                  <div className="rounded border bg-background p-3 text-sm">
                    <p>
                      Versão atual:{" "}
                      {conflict.latest.status === "pending"
                        ? "pendente"
                        : conflict.latest.status === "completed"
                          ? "concluída"
                          : "cancelada"}
                      {" · "}
                      Total {brl(conflict.latest.total_value)}
                      {conflict.latest.payment &&
                        ` · ${paymentLabels[conflict.latest.payment.payment_method === "trade_in" ? "financing" : conflict.latest.payment.payment_method]}`}
                    </p>
                    <p className="text-muted-foreground">
                      Entrada {brl(conflict.latest.payment?.down_payment ?? 0)}
                      {" · "}
                      Pagamento atualizado{" "}
                      {fmtDate(conflict.latest.payment?.payment_date ?? conflict.latest.sale_date)}
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={conflict.loading}
                    onClick={() => void refreshConflict()}
                  >
                    Atualizar dados
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!conflict.latest || saveMutation.isPending}
                    onClick={reloadFromConflict}
                  >
                    Recarregar formulário
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={
                      !conflict.latest ||
                      conflict.latest.status !== "pending" ||
                      saveMutation.isPending
                    }
                    onClick={reapplyDraft}
                  >
                    Reaplicar minhas alterações
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span>Valor bruto da venda</span>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.salePrice}
                  disabled={!canEdit || saveMutation.isPending}
                  onChange={(event) => updateField("salePrice", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Desconto</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.discount}
                  disabled={!canEdit || saveMutation.isPending}
                  onChange={(event) => updateField("discount", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Forma de pagamento</span>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={draft.paymentMethod}
                  disabled={!canEdit || saveMutation.isPending}
                  onChange={(event) =>
                    updateField("paymentMethod", event.target.value as EditablePaymentMethod)
                  }
                >
                  {Object.entries(paymentLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                <span>Entrada prevista</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.downPayment}
                  disabled={
                    !canEdit || draft.paymentMethod !== "financing" || saveMutation.isPending
                  }
                  onChange={(event) => updateField("downPayment", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Quantidade de parcelas</span>
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.installmentsCount}
                  disabled={
                    !canEdit || draft.paymentMethod !== "financing" || saveMutation.isPending
                  }
                  onChange={(event) => updateField("installmentsCount", event.target.value)}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span>Data prevista do pagamento</span>
                <Input
                  type="date"
                  value={draft.paymentDate}
                  disabled={!canEdit || saveMutation.isPending}
                  onChange={(event) => updateField("paymentDate", event.target.value)}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm">
              <span>Observações</span>
              <textarea
                className="min-h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={draft.notes}
                disabled={!canEdit || saveMutation.isPending}
                onChange={(event) => updateField("notes", event.target.value)}
              />
            </label>

            <p className="text-sm text-muted-foreground">
              Valor final: <strong className="text-foreground">{brl(finalValue)}</strong>
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                disabled={saveMutation.isPending}
                onClick={() => {
                  draftRef.current = null;
                  setDraft(null);
                  setConflict(null);
                  idempotencyAttemptRef.current = null;
                  onOpenChange(false);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={!canEdit || saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : "Salvar alterações"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
