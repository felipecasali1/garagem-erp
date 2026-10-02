import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { DEFAULT_PAGE_SIZE, getPaginationState } from "@/shared/lib/pagination";

type ListPaginationProps = {
  page: number;
  total: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
};

export function ListPagination({
  page,
  total,
  pageSize = DEFAULT_PAGE_SIZE,
  onPageChange,
}: ListPaginationProps) {
  const { displayPage, totalPages, range } = getPaginationState(page, total, pageSize);

  return (
    <div className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm text-muted-foreground">
        {total === 0 ? "0 de 0" : `${range.from}–${range.to} de ${total}`}
      </span>
      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(displayPage - 1)}
          disabled={displayPage <= 1}
        >
          <ChevronLeft className="h-4 w-4" />
          Anterior
        </Button>
        <span className="min-w-24 text-center text-sm text-muted-foreground">
          Página {displayPage} de {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(displayPage + 1)}
          disabled={displayPage >= totalPages}
        >
          Próxima
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
