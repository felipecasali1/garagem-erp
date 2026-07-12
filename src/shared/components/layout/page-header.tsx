import { Plus } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

type ActionObj = { label: string; onClick?: () => void; to?: string };

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ActionObj | ReactNode;
}) {
  const isObj =
    action && typeof action === "object" && !("$$typeof" in (action as object)) && "label" in (action as object);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div>
        <h1 className="text-2xl font-display font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
      {action ? (
        isObj ? (
          (() => {
            const a = action as ActionObj;
            if (a.to) {
              return (
                <Button asChild>
                  <Link to={a.to}>
                    <Plus className="h-4 w-4" />
                    {a.label}
                  </Link>
                </Button>
              );
            }
            return (
              <Button onClick={a.onClick}>
                <Plus className="h-4 w-4" />
                {a.label}
              </Button>
            );
          })()
        ) : (
          <div>{action as ReactNode}</div>
        )
      ) : null}
    </div>
  );
}
