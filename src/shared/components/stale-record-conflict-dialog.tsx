import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { Button } from "@/shared/components/ui/button";

export function StaleRecordConflictDialog({
  open,
  onOpenChange,
  title = "Este registro mudou",
  description,
  currentSummary,
  draftSummary,
  canReapply = true,
  onReload,
  onReapply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description: string;
  currentSummary?: string[];
  draftSummary?: string[];
  canReapply?: boolean;
  onReload: () => void;
  onReapply: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {(currentSummary || draftSummary) && (
          <div className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm sm:grid-cols-2">
            {currentSummary && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Dados atuais
                </div>
                {currentSummary.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
            {draftSummary && (
              <div>
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Seu rascunho
                </div>
                {draftSummary.map((line) => (
                  <div key={line}>{line}</div>
                ))}
              </div>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Manter rascunho</AlertDialogCancel>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onReload();
              onOpenChange(false);
            }}
          >
            Carregar versão atual
          </Button>
          <Button
            type="button"
            onClick={() => {
              onReapply();
              onOpenChange(false);
            }}
            disabled={!canReapply}
          >
            Reaplicar minha alteração
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
