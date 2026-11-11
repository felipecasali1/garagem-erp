import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import {
  SupplierForm,
  createEmptySupplierDraft,
} from "@/modules/suppliers/components/supplier-form";
import type { SupplierDraft } from "@/modules/suppliers/types";
import { createSupplierFromDraft, supplierKeys } from "@/modules/suppliers/services/suppliers";
import { getIdempotencyAttempt } from "@/shared/lib/idempotency";

export const Route = createFileRoute("/_app/suppliers/new")({
  head: () => ({ meta: [{ title: "Novo Fornecedor | GaragemERP" }] }),
  component: NewSupplier,
});

function NewSupplier() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createAttemptRef = useRef<ReturnType<typeof getIdempotencyAttempt> | null>(null);
  const [draft, setDraft] = useState<SupplierDraft>(() => createEmptySupplierDraft());

  const createMutation = useMutation({
    mutationFn: ({ draft, idempotencyKey }: { draft: SupplierDraft; idempotencyKey: string }) =>
      createSupplierFromDraft(draft, idempotencyKey),
    onSuccess: async (supplier, variables) => {
      if (createAttemptRef.current?.key === variables.idempotencyKey) {
        createAttemptRef.current = null;
      }
      await queryClient.invalidateQueries({ queryKey: supplierKeys.all });
      toast.success("Fornecedor cadastrado");
      await navigate({ to: "/suppliers/$id", params: { id: String(supplier.id) } });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao cadastrar fornecedor.");
    },
  });

  const submit = () => {
    if (!draft.name.trim()) {
      toast.error("Informe o nome do fornecedor");
      return;
    }
    if (!draft.document.trim()) {
      toast.error("Informe o CPF/CNPJ do fornecedor");
      return;
    }
    const attempt = getIdempotencyAttempt(draft, createAttemptRef.current);
    createAttemptRef.current = attempt;
    createMutation.mutate({ draft, idempotencyKey: attempt.key });
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        <Button variant="ghost" size="sm" asChild type="button">
          <Link to="/suppliers">
            <ArrowLeft className="h-4 w-4" /> Fornecedores
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Novo Fornecedor
        </h1>
      </div>
      <SupplierForm
        draft={draft}
        saving={createMutation.isPending}
        submitLabel="Salvar"
        onSubmit={submit}
        onChange={setDraft}
      />
    </div>
  );
}
