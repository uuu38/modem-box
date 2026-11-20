import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { ToastItem } from "../types/modem";
import { cn } from "./ui/primitives";

export function ToastContainer({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-5 top-16 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-center gap-2.5 rounded-[10px] border bg-[#1A2332]/95 px-3.5 py-2.5 text-[12.5px] font-medium text-[#F1F5F9] shadow-[0_12px_32px_rgba(0,0,0,0.5)] backdrop-blur-md",
            t.type === "success" && "border-[#10B981]/35",
            t.type === "error" && "border-[#EF4444]/35",
            t.type === "info" && "border-[#14B8A6]/35"
          )}
        >
          {t.type === "success" && (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-[#10B981]" />
          )}
          {t.type === "error" && (
            <AlertCircle className="h-4 w-4 shrink-0 text-[#EF4444]" />
          )}
          {t.type === "info" && (
            <Info className="h-4 w-4 shrink-0 text-[#14B8A6]" />
          )}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
