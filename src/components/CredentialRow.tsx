import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { Badge, Button, cn } from "./ui/primitives";

interface CredentialRowProps {
  label: string;
  value?: string | null;
  isSecret?: boolean;
  /** External override for reveal state (e.g. "show all passwords" toggle) */
  forceRevealed?: boolean;
  /** Stacked 2-line layout ideal for 3-column horizontal grids */
  compact?: boolean;
  badgeText?: string;
  badgeTone?: "neutral" | "teal" | "success" | "warning" | "danger";
  emptyPlaceholder?: string;
  onCopied?: (label: string) => void;
}

export function CredentialRow({
  label,
  value,
  isSecret = false,
  forceRevealed,
  compact = false,
  badgeText,
  badgeTone = "neutral",
  emptyPlaceholder = "—",
  onCopied,
}: CredentialRowProps) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (forceRevealed !== undefined) {
      setRevealed(forceRevealed);
    }
  }, [forceRevealed]);

  const hasValue = Boolean(value && value.trim().length > 0);
  const isShown = !isSecret || revealed;

  const handleCopy = async () => {
    if (!hasValue || !value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      onCopied?.(label);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable in restricted WebView context
    }
  };

  const displayText = !hasValue
    ? emptyPlaceholder
    : isShown
    ? value
    : "••••••••••••";

  if (compact) {
    return (
      <div
        className={cn(
          "group flex flex-col justify-between gap-1.5 rounded-[8px]",
          "bg-[#1A2332]/85 px-3.5 py-2.5 border border-white/[0.06]",
          "transition-colors duration-150 hover:bg-[#1E293B] hover:border-white/[0.12]"
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-[#7E91AA]">
              {label}
            </span>
            {badgeText && <Badge tone={badgeTone}>{badgeText}</Badge>}
          </div>
          <div className="flex items-center gap-0.5">
            {isSecret && hasValue && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setRevealed((prev) => !prev)}
                title={revealed ? "隐藏密码" : "显示明文"}
                className="h-6 w-6 text-[#94A3B8] hover:text-[#F1F5F9]"
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
                "h-6 w-6 opacity-75 group-hover:opacity-100",
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

        <span
          title={hasValue && isShown ? value ?? "" : undefined}
          className={cn(
            "truncate font-mono text-[13px] font-medium tabular-nums select-text",
            hasValue ? "text-[#F1F5F9]" : "text-[#7E91AA]",
            !isShown && hasValue && "tracking-[0.18em] text-[#94A3B8]"
          )}
        >
          {displayText}
        </span>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group flex min-h-[44px] items-center justify-between gap-3 rounded-[8px]",
        "bg-[#1A2332]/85 px-3.5 py-2 border border-white/[0.06]",
        "transition-colors duration-150 hover:bg-[#1E293B] hover:border-white/[0.12]"
      )}
    >
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-[12px] font-medium text-[#94A3B8]">{label}</span>
        {badgeText && <Badge tone={badgeTone}>{badgeText}</Badge>}
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        <span
          title={hasValue && isShown ? value ?? "" : undefined}
          className={cn(
            "truncate font-mono text-[13px] font-medium tabular-nums select-text",
            hasValue ? "text-[#F1F5F9]" : "text-[#7E91AA]",
            !isShown && hasValue && "tracking-[0.18em] text-[#94A3B8]"
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
