import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { DatePicker } from "@/shared/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import type { FinancialTransactionWithLinks } from "@/modules/financial/services/transactions";
import {
  getFinancialTransactionById,
  isManualFinancialTransaction,
  updateManualFinancialTransaction,
  type UpdateManualFinancialTransactionInput,
} from "@/modules/financial/services/transactions";

type FinancialTransactionDraft = {
  amount: string;
  transactionDate: string;
  dueDate: string;
  description: string;
  related: string;
};

type ConflictState = {
  latest: FinancialTransactionWithLinks | null;
  loading: boolean;
  error?: string;
};

function draftFromTransaction(
  transaction: FinancialTransactionWithLinks,
): FinancialTransactionDraft {
  return {
    amount: String(transaction.amount),
    transactionDate: transaction.transaction_date,
    dueDate: transaction.due_date ?? "",
    description: transaction.description,
    related: transaction.related ?? "",
  };
}

function canEditTransaction(transaction: FinancialTransactionWithLinks) {
  return (
    isManualFinancialTransaction(transaction) &&
    (transaction.status === "pending" || transaction.status === "overdue")
  );
}

function isStaleRecord(error: unknown) {
  return error instanceof Error && error.message.includes("STALE_RECORD");
}

export function EditManualFinancialTransactionDialog({
  transaction,
  open,
  onOpenChange,
  onSaved,
}: {
  transaction: FinancialTransactionWithLinks;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<FinancialTransactionDraft | null>(null);
  const [baseTransaction, setBaseTransaction] = useState(transaction);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const draftRef = useRef<FinancialTransactionDraft | null>(null);
  const baseTransactionRef = useRef(transaction);
  const idempotencyAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!open || draftRef.current) return;
    const initialDraft = draftFromTransaction(transaction);
    draftRef.current = initialDraft;
    baseTransactionRef.current = transaction;
    setDraft(initialDraft);
    setBaseTransaction(transaction);
    setConflict(null);
  }, [open, transaction]);

  const saveMutation = useMutation<number, Error, UpdateManualFinancialTransactionInput>({
    mutationFn: updateManualFinancialTransaction,
    onSuccess: async () => {
      await onSaved();
      toast.success("Lançamento atualizado");
      idempotencyAttemptRef.current = null;
      draftRef.current = null;
      setDraft(null);
      setConflict(null);
      onOpenChange(false);
    },
    onError: async (error) => {
      if (!isStaleRecord(error)) {
        toast.error(error.message || "Falha ao atualizar lançamento.");
        return;
      }

      setConflict({ latest: null, loading: true });
      try {
        const latest = await getFinancialTransactionById(transaction.id);
        setConflict({ latest, loading: false });
      } catch (refreshError) {
        setConflict({
          latest: null,
          loading: false,
          error:
            refreshError instanceof Error
              ? refreshError.message
              : "Não foi possível carregar a versão atual do lançamento.",
        });
      }
    },
  });

  function updateField<Key extends keyof FinancialTransactionDraft>(
    key: Key,
    value: FinancialTransactionDraft[Key],
  ) {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, [key]: value };
    draftRef.current = next;
    setDraft(next);
  }

  function submitDraft(target: FinancialTransactionWithLinks, forceNewKey = false) {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;

    const amount = Number(currentDraft.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Informe um valor maior que zero.");
      return;
    }
    if (!currentDraft.transactionDate || !currentDraft.description.trim()) {
      toast.error("Preencha a descrição e a data do lançamento.");
      return;
    }

    const command = {
      transactionId: target.id,
      expectedUpdatedAt: target.updated_at,
      amount,
      transactionDate: currentDraft.transactionDate,
      dueDate: currentDraft.dueDate || undefined,
      description: currentDraft.description.trim(),
      related: currentDraft.related.trim() || undefined,
    } satisfies Omit<UpdateManualFinancialTransactionInput, "idempotencyKey">;
    const fingerprint = JSON.stringify(command);
    const idempotencyKey =
      !forceNewKey && idempotencyAttemptRef.current?.fingerprint === fingerprint
        ? idempotencyAttemptRef.current.key
        : crypto.randomUUID();
    idempotencyAttemptRef.current = { fingerprint, key: idempotencyKey };
    saveMutation.mutate({ ...command, idempotencyKey });
  }

  async function refreshConflict() {
    setConflict((current) => ({ latest: current?.latest ?? null, loading: true }));
    try {
      const latest = await getFinancialTransactionById(transaction.id);
      setConflict({ latest, loading: false });
    } catch (error) {
      setConflict({
        latest: null,
        loading: false,
        error: error instanceof Error ? error.message : "Não foi possível atualizar os dados.",
      });
    }
  }

  function reloadFromConflict() {
    const latest = conflict?.latest;
    if (!latest) return;
    const nextDraft = draftFromTransaction(latest);
    draftRef.current = nextDraft;
    baseTransactionRef.current = latest;
    setDraft(nextDraft);
    setBaseTransaction(latest);
    idempotencyAttemptRef.current = null;
    setConflict(null);
  }

  function reapplyDraft() {
    const latest = conflict?.latest;
    if (!latest || !canEditTransaction(latest)) return;
    baseTransactionRef.current = latest;
    setBaseTransaction(latest);
    setConflict(null);
    submitDraft(latest, true);
  }

  function closeDialog() {
    draftRef.current = null;
    setDraft(null);
    setConflict(null);
    idempotencyAttemptRef.current = null;
    onOpenChange(false);
  }

  const canEdit =
    canEditTransaction(baseTransaction) &&
    (conflict?.latest == null || canEditTransaction(conflict.latest));

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          draftRef.current = null;
          setDraft(null);
          setConflict(null);
          idempotencyAttemptRef.current = null;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar lançamento #{transaction.id}</DialogTitle>
        </DialogHeader>

        {conflict && (
          <div className="space-y-3 rounded-md border border-warning/40 bg-warning/5 p-4 text-sm">
            <div>
              <p className="font-medium">Este lançamento mudou enquanto você editava.</p>
              <p className="text-muted-foreground">
                Seu rascunho foi preservado. Compare a versão atual e escolha como continuar.
              </p>
              {conflict.error && <p className="mt-2 text-destructive">{conflict.error}</p>}
              {conflict.latest && (
                <p className="mt-2 text-muted-foreground">
                  Status {conflict.latest.status} · Valor{" "}
                  {conflict.latest.amount.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </p>
              )}
            </div>
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
                  !conflict.latest || !canEditTransaction(conflict.latest) || saveMutation.isPending
                }
                onClick={reapplyDraft}
              >
                Reaplicar minhas alterações
              </Button>
            </div>
          </div>
        )}

        {draft && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              submitDraft(baseTransactionRef.current);
            }}
          >
            <label className="grid gap-2 text-sm">
              <span>Valor</span>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={draft.amount}
                disabled={!canEdit || saveMutation.isPending}
                onChange={(event) => updateField("amount", event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Data do lançamento</span>
              <DatePicker
                value={draft.transactionDate}
                onChange={(value) => updateField("transactionDate", value ?? "")}
                required
                name="transaction_date"
                disabled={!canEdit || saveMutation.isPending}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Vencimento</span>
              <DatePicker
                value={draft.dueDate || undefined}
                onChange={(value) => updateField("dueDate", value ?? "")}
                placeholder="Sem vencimento"
                name="due_date"
                disabled={!canEdit || saveMutation.isPending}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Descrição</span>
              <Input
                value={draft.description}
                disabled={!canEdit || saveMutation.isPending}
                onChange={(event) => updateField("description", event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Relacionado a</span>
              <Textarea
                rows={2}
                value={draft.related}
                disabled={!canEdit || saveMutation.isPending}
                onChange={(event) => updateField("related", event.target.value)}
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Fechar
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
