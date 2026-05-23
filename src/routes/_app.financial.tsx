import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/financial")({
  component: FinancialLayout,
});

function FinancialLayout() {
  return <Outlet />;
}
