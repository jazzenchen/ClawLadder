// PasswordDialog — sudo password prompt for Homebrew install
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PasswordDialogProps {
  password: string;
  setPassword: (v: string) => void;
  passwordError: string;
  validating: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function PasswordDialog({
  password,
  setPassword,
  passwordError,
  validating,
  onSubmit,
  onCancel,
}: PasswordDialogProps) {
  return (
    <div className="h-full w-full flex items-center justify-center bg-background">
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open && !validating) onCancel();
        }}
      >
        <DialogContent showCloseButton={!validating}>
          <DialogHeader>
            <DialogTitle>输入管理员密码</DialogTitle>
            <DialogDescription>安装过程需要管理员权限（sudo）</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="flex flex-col gap-3"
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">密码</Label>
              <Input
                id="password"
                type="password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={validating}
                aria-invalid={!!passwordError}
              />
              {passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={validating}>
                {validating ? "验证中…" : "确认"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
