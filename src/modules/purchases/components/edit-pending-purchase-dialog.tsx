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
import { brl } from "@/shared/lib/format";
import type { Purchase } from "@/shared/types/domain";
import {
  getPurchaseById,
  updatePurchase,
  type UpdatePurchaseInput,
} from "@/modules/purchases/services/purchases";

type PurchaseDraft = {
  totalValue: string;
  purchaseDate: string;
  notes: string;
};

type ConflictState = {
  latest: Purchase | null;
  loading: boolean;
  error?: string;
};

function draftFromPurchase(purchase: Purchase): PurchaseDraft {
  return {
    totalValue: String(purchase.total_value),
    purchaseDate: purchase.purchase_date,
    notes: purchase.notes ?? "",
  };
}

function isStaleRecord(error: unknown) {
  return error instanceof Error && error.message.includes("STALE_RECORD");
}

function statusLabel(status: Purchase["status"]) {
  if (status === "pending") return "pendente";
  if (status === "completed") return "concluída";
  return "cancelada";
}

export function EditPendingPurchaseDialog({
  purchase,
  open,
  onOpenChange,
  onSaved,
}: {
  purchase: Purchase;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<PurchaseDraft | null>(null);
  const [basePurchase, setBasePurchase] = useState(purchase);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const draftRef = useRef<PurchaseDraft | null>(null);
  const basePurchaseRef = useRef(purchase);
  const idempotencyAttemptRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!open || draftRef.current) return;
    const initialDraft = draftFromPurchase(purchase);
    draftRef.current = initialDraft;
    basePurchaseRef.current = purchase;
    setDraft(initialDraft);
    setBasePurchase(purchase);
    setConflict(null);
  }, [open, purchase]);

  const saveMutation = useMutation<number, Error, UpdatePurchaseInput>({
    mutationFn: updatePurchase,
    onSuccess: async () => {
      await onSaved();
      toast.success("Compra atualizada");
      idempotencyAttemptRef.current = null;
      draftRef.current = null;
      setDraft(null);
      setConflict(null);
      onOpenChange(false);
    },
    onError: async (error) => {
      if (!isStaleRecord(error)) {
        toast.error(error.message || "Falha ao atualizar compra.");
        return;
      }

      setConflict({ latest: null, loading: true });
      try {
        const latest = await getPurchaseById(purchase.id);
        setConflict({ latest, loading: false });
      } catch (refreshError) {
        setConflict({
          latest: null,
          loading: false,
          error:
            refreshError instanceof Error
              ? refreshError.message
              : "Não foi possível carregar os dados atuais da compra.",
        });
      }
    },
  });

  function updateField<Key extends keyof PurchaseDraft>(key: Key, value: PurchaseDraft[Key]) {
    const current = draftRef.current;
    if (!current) return;
    const next = { ...current, [key]: value };
    draftRef.current = next;
    setDraft(next);
  }

  function submitDraft(targetPurchase: Purchase, forceNewKey = false) {
    const currentDraft = draftRef.current;
    if (!currentDraft) return;

    const totalValue = Number(currentDraft.totalValue);
    if (!Number.isFinite(totalValue) || totalValue < 0) {
      toast.error("Informe um valor de compra válido.");
      return;
    }
    if (!currentDraft.purchaseDate) {
      toast.error("Informe a data da compra.");
      return;
    }

    const command = {
      purchaseId: targetPurchase.id,
      expectedUpdatedAt: targetPurchase.updated_at,
      supplierId: targetPurchase.supplier_id,
      totalValue,
      purchaseDate: currentDraft.purchaseDate,
      notes: currentDraft.notes,
    } satisfies Omit<UpdatePurchaseInput, "idempotencyKey">;
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
      const latest = await getPurchaseById(purchase.id);
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
    const nextDraft = draftFromPurchase(latest);
    draftRef.current = nextDraft;
    basePurchaseRef.current = latest;
    setDraft(nextDraft);
    setBasePurchase(latest);
    idempotencyAttemptRef.current = null;
    setConflict(null);
  }

  function reapplyDraft() {
    const latest = conflict?.latest;
    if (!latest || latest.status !== "pending") return;
    basePurchaseRef.current = latest;
    setBasePurchase(latest);
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
    basePurchase.status === "pending" &&
    conflict?.latest?.status !== "completed" &&
    conflict?.latest?.status !== "canceled";

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
          <DialogTitle>Editar compra #{purchase.id}</DialogTitle>
        </DialogHeader>

        {conflict && (
          <div className="space-y-3 rounded-md border border-warning/40 bg-warning/5 p-4 text-sm">
            <div>
              <p className="font-medium">Esta compra mudou enquanto você editava.</p>
              <p className="text-muted-foreground">
                Seu rascunho foi preservado. Compare os dados atuais e escolha como continuar.
              </p>
              {conflict.error && <p className="mt-2 text-destructive">{conflict.error}</p>}
              {conflict.latest && (
                <p className="mt-2 text-muted-foreground">
                  Situação {statusLabel(conflict.latest.status)} · Valor{" "}
                  {brl(conflict.latest.total_value)} · Data {conflict.latest.purchase_date}
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
                  !conflict.latest || conflict.latest.status !== "pending" || saveMutation.isPending
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
              submitDraft(basePurchaseRef.current);
            }}
          >
            <label className="grid gap-2 text-sm">
              <span>Valor da compra</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={draft.totalValue}
                disabled={!canEdit || saveMutation.isPending}
                onChange={(event) => updateField("totalValue", event.target.value)}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Data da compra</span>
              <DatePicker
                value={draft.purchaseDate}
                onChange={(value) => updateField("purchaseDate", value ?? "")}
                required
                name="purchase_date"
                disabled={!canEdit || saveMutation.isPending}
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span>Observações</span>
              <Textarea
                rows={3}
                value={draft.notes}
                disabled={!canEdit || saveMutation.isPending}
                onChange={(event) => updateField("notes", event.target.value)}
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
