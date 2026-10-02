export const DEFAULT_PAGE_SIZE = 20;

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function normalizePage(value: unknown) {
  const page = typeof value === "number" ? value : Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function getTotalPages(total: number, pageSize = DEFAULT_PAGE_SIZE) {
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

export function getPageRange(page: number, total: number, pageSize = DEFAULT_PAGE_SIZE) {
  if (total <= 0) {
    return { from: 0, to: 0 };
  }

  return {
    from: (page - 1) * pageSize + 1,
    to: Math.min(page * pageSize, total),
  };
}
