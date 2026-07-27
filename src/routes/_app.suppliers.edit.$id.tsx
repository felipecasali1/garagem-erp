import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/shared/components/ui/button";
import { SupplierForm } from "@/modules/suppliers/components/supplier-form";
import type { SupplierDraft } from "@/modules/suppliers/types";
import {
  getSupplierById,
  supplierKeys,
  updateSupplier,
} from "@/modules/suppliers/services/suppliers";

export const Route = createFileRoute("/_app/suppliers/edit/$id")({
  head: () => ({ meta: [{ title: "Editar Fornecedor | GaragemERP" }] }),
  component: EditSupplier,
});

function EditSupplier() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const supplierId = Number(id);
  const { data: supplier, isLoading } = useQuery({
    queryKey: supplierKeys.detail(supplierId),
    queryFn: () => getSupplierById(supplierId),
    enabled: Number.isFinite(supplierId),
  });
  const [draft, setDraft] = useState<SupplierDraft | null>(null);

  useEffect(() => {
    if (!supplier) return;
    setDraft({
      type: supplier.person.type,
      name: supplier.person.name,
      document: supplier.person.cpf ?? supplier.person.cnpj ?? "",
      phone: supplier.person.phone,
      email: supplier.person.email,
      notes: supplier.notes ?? "",
      supplier_type: supplier.supplier_type,
      primary_address: {
        zip_code: supplier.person.primary_address?.zip_code ?? "",
        city: supplier.person.primary_address?.city ?? "",
        state: supplier.person.primary_address?.state ?? "",
        neighborhood: supplier.person.primary_address?.neighborhood ?? "",
        street: supplier.person.primary_address?.street ?? "",
        number: supplier.person.primary_address?.number ?? "",
        complement: supplier.person.primary_address?.complement ?? "",
      },
    });
  }, [supplier]);

  const updateMutation = useMutation({
    mutationFn: (values: SupplierDraft) => updateSupplier(supplierId, values),
    onSuccess: async () => {
      toast.success("Fornecedor atualizado");
      await navigate({ to: "/suppliers/$id", params: { id } });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Falha ao atualizar fornecedor.");
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto py-16 text-sm text-muted-foreground">
        Carregando fornecedor...
      </div>
    );
  }

  if (!supplier || !draft) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20">
        <h2 className="font-display text-xl mb-2">Fornecedor não encontrado</h2>
        <Button onClick={() => navigate({ to: "/suppliers" })}>Voltar</Button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild type="button">
          <Link to="/suppliers/$id" params={{ id }}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight flex-1">
          Editar Fornecedor
        </h1>
      </div>
      <SupplierForm
        draft={draft}
        saving={updateMutation.isPending}
        submitLabel="Salvar"
        onSubmit={() => updateMutation.mutate(draft)}
        onChange={setDraft}
      />
    </div>
  );
}
