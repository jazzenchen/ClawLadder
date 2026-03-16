import { Monitor, Cpu, HardDrive, MemoryStick, Fingerprint, Hash } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { DeviceInfo } from "@/lib/api";

interface DeviceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceInfo?: DeviceInfo | null;
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/20 last:border-0">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm  mt-0.5 break-all">{value || "—"}</p>
      </div>
    </div>
  );
}

export function DeviceDialog({ open, onOpenChange, deviceInfo }: DeviceDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-md max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            设备信息
          </DialogTitle>
          <DialogDescription>当前运行 OpenClaw 的设备详情</DialogDescription>
        </DialogHeader>

        <div className="space-y-0">
          <InfoRow
            icon={<Monitor className="w-4 h-4" />}
            label="设备型号"
            value={deviceInfo?.model}
          />
          <InfoRow
            icon={<Cpu className="w-4 h-4" />}
            label="芯片"
            value={deviceInfo?.chip}
          />
          <InfoRow
            icon={<MemoryStick className="w-4 h-4" />}
            label="内存"
            value={deviceInfo?.memory}
          />
          <InfoRow
            icon={<HardDrive className="w-4 h-4" />}
            label="磁盘"
            value={deviceInfo?.disk}
          />
          <InfoRow
            icon={<Monitor className="w-4 h-4" />}
            label="操作系统"
            value={deviceInfo?.osVersion}
          />
          <InfoRow
            icon={<Fingerprint className="w-4 h-4" />}
            label="序列号"
            value={deviceInfo?.serial}
          />
          <InfoRow
            icon={<Hash className="w-4 h-4" />}
            label="硬件 UUID"
            value={deviceInfo?.hardwareUUID}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
