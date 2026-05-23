import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/vehicles")({
  component: VehiclesLayout,
});

function VehiclesLayout() {
  return <Outlet />;
}
