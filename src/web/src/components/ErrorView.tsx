// ErrorView — error phase with optional detail
import { Button } from "@/components/ui/button";

interface ErrorViewProps {
  message: string;
  detail?: string;
  onBack: () => void;
}

export function ErrorView({ message, detail, onBack }: ErrorViewProps) {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center gap-4 bg-background p-8">
      <p className="text-sm text-destructive">{message}</p>
      {detail && (
        <div className="w-full max-w-lg">
          <pre className="text-xs font-mono text-muted-foreground bg-muted/30 border border-border/40 rounded-lg p-4 max-h-48 overflow-auto whitespace-pre-wrap">
            {detail}
          </pre>
        </div>
      )}
      <Button variant="outline" onClick={onBack}>
        返回
      </Button>
    </div>
  );
}
