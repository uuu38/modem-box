import { useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { Badge, Button, cn } from "./ui/primitives";

interface CredentialRowProps {
  label: string;
  value?: string | null;
  isSecret?: boolean;
  badgeText?: string;
  badgeTone?: "neutral" | "teal" | "success" | "warning" | "danger";
  emptyPlaceholder?: string;
  onCopied?: (label: string) => void;
}

export function CredentialRow({
  label,
  value,
  isSecret = false,
  badgeText,
  badgeTone = "neutral",
  emptyPlaceholder = "—",
  onCopied,
}: CredentialRowProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  const hasValue = Boolean(value && value.trim().length > 0);

  const handleCopy = async () => {
    if (!hasValue || !value) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    onCopied?.(label);
    setTimeout(() => setCopied(false), 1500);
  };

  const displayText = !hasValue
    ? emptyPlaceholder
    : isSecret && !revealed
    ? "••••••••••••"
    : value;

  return (
    <div
      className={cn(
        "group flex min-h-[46px] items-center justify-between gap-3 rounded-[8px]",
        "bg-[#1A2332]/85 px-3.5 py-2 border border-white/[0.06]",
        "transition-colors duration-150 hover:bg-[#1E293B] hover:border-white/[0.12]"
      )}
    >
      <div className="flex items-center gap-2 shrink-0">
        <span className="text-[12px] font-medium text-[#94A3B8]">{label}</span>
        {badgeText && <Badge tone={badgeTone}>{badgeText}</Badge>}
      </div>

      <div className="flex items-center gap-1.5 min-w-0">
        <span
          title={hasValue && (!isSecret || revealed) ? value ?? "" : undefined}
          className={cn(
            "truncate font-mono text-[13px] font-medium tabular-nums select-text",
            hasValue ? "text-[#F1F5F9]" : "text-[#64748B]",
            isSecret && !revealed && hasValue && "tracking-[0.18em] text-[#94A3B8]"
          )}
        >
          {displayText}
        </span>

        {isSecret && hasValue && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setRevealed((prev) => !prev)}
            title={revealed ? "隐藏密码" : "显示明文"}
            className="text-[#94A3B8] hover:text-[#F1F5F9]"
          >
            {revealed ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!hasValue}
          onClick={handleCopy}
          title={hasValue ? `复制${label}` : "暂无数据可复制"}
          className={cn(
            "opacity-75 group-hover:opacity-100",
            copied
              ? "text-[#10B981] bg-[#10B981]/12 hover:bg-[#10B981]/15 hover:text-[#10B981] opacity-100"
              : "text-[#94A3B8] hover:text-[#F1F5F9]"
          )}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </div>
  );
}
