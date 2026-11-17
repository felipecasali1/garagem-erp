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
  getCustomerPurchaseHistory,
  purchaseHistoryKeys,
} from "@/modules/customers/services/purchase-history";

export function CustomerPurchaseHistory({
  customerId,
  accessRole,
}: {
  customerId: number;
  accessRole: AccessRole | null;
}) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: purchaseHistoryKeys.page(customerId, page),
    queryFn: () => getCustomerPurchaseHistory(customerId, page),
    enabled: Number.isFinite(customerId),
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
          Nenhuma venda no histórico deste cliente.
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
              {history.data?.data.map((sale) => (
                <tr key={sale.id} className="border-t">
                  <td className="py-3">{fmtDate(sale.sale_date)}</td>
                  <td>
                    {sale.brand} {sale.model}
                  </td>
                  <td>{sale.plate}</td>
                  <td>{brl(sale.total_value)}</td>
                  <td>
                    <StatusBadge kind="sale" value={sale.status} />
                  </td>
                  <td className="text-right">
                    {canAccessPath(accessRole, "/sales") && (
                      <Button variant="ghost" size="icon" aria-label="Ver venda" asChild>
                        <Link to="/sales/$id" params={{ id: String(sale.id) }}>
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
