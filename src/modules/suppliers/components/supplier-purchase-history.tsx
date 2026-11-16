import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/shared/components/ui/button";
import { ListPagination } from "@/shared/components/list-pagination";
import { StatusBadge } from "@/shared/components/status-badge";
import { canAccessPath, type AccessRole } from "@/shared/auth/access-control";
import { getTotalPages } from "@/shared/lib/pagination";
import { brl, fmtDate } from "@/shared/lib/format";
import {
  getSupplierPurchaseHistory,
  purchaseHistoryKeys,
} from "@/modules/suppliers/services/purchase-history";

export function SupplierPurchaseHistory({
  supplierId,
  accessRole,
}: {
  supplierId: number;
  accessRole: AccessRole | null;
}) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: purchaseHistoryKeys.page(supplierId, page),
    queryFn: () => getSupplierPurchaseHistory(supplierId, page),
    enabled: Number.isFinite(supplierId),
  });
  useEffect(() => {
    if (history.data && page > getTotalPages(history.data.total, 10)) {
      setPage(getTotalPages(history.data.total, 10));
    }
  }, [history.data, page]);
  return (
    <>
      {history.isLoading ? (
        <div className="text-sm text-muted-foreground py-8">Carregando histórico...</div>
      ) : history.isError ? (
        <div className="text-sm text-destructive py-8">
          Falha ao carregar histórico.{" "}
          <Button variant="outline" size="sm" onClick={() => void history.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : history.data?.total === 0 ? (
        <div className="text-sm text-muted-foreground py-8">
          Nenhuma compra no histórico deste fornecedor.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr>
                <th>Data</th>
                <th>Veículo</th>
                <th>Placa</th>
                <th>Valor final</th>
                <th>Status</th>
                <th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.data.map((purchase) => (
                <tr key={purchase.id} className="border-t">
                  <td className="py-3">{fmtDate(purchase.purchase_date)}</td>
                  <td>
                    {purchase.brand} {purchase.model}
                  </td>
                  <td>{purchase.plate}</td>
                  <td>{brl(purchase.total_value)}</td>
                  <td>
                    <StatusBadge kind="purchase" value={purchase.status} />
                  </td>
                  <td className="text-right">
                    {canAccessPath(accessRole, "/purchases") && (
                      <Button variant="ghost" size="icon" aria-label="Ver compra" asChild>
                        <Link to="/purchases/$id" params={{ id: String(purchase.id) }}>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {history.data && (
            <ListPagination
              page={page}
              total={history.data.total}
              pageSize={10}
              onPageChange={setPage}
            />
          )}
        </div>
      )}
    </>
  );
}
