import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/financial/transactions")({
  component: FinancialTransactionsLayout,
});

function FinancialTransactionsLayout() {
  return <Outlet />;
}
