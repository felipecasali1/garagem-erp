import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import {
  SupplierForm,
  createEmptySupplierDraft,
} from "@/modules/suppliers/components/supplier-form";
import type { SupplierDraft } from "@/modules/suppliers/types";
import { createSupplierFromDraft } from "@/modules/suppliers/services/suppliers";

export const Route = createFileRoute("/_app/suppliers/new")({
  head: () => ({ meta: [{ title: "Novo Fornecedor | GaragemERP" }] }),
  component: NewSupplier,
});

function NewSupplier() {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<SupplierDraft>(() => createEmptySupplierDraft());

  const createMutation = useMutation({
    mutationFn: createSupplierFromDraft,
    onSuccess: async (supplier) => {
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
    createMutation.mutate(draft);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
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
