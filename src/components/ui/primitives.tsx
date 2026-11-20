import * as React from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-[12px] bg-[#151B28] border border-white/[0.08]",
      "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_10px_30px_-10px_rgba(0,0,0,0.45)]",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "icon";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    const variants = {
      primary:
        "bg-[#14B8A6] text-[#042F2E] font-semibold hover:bg-[#2DD4BF] shadow-[0_1px_12px_rgba(20,184,166,0.25)]",
      secondary:
        "bg-[#1A2332] text-[#F1F5F9] border border-white/[0.1] hover:bg-[#212C3F] hover:border-white/[0.16]",
      ghost:
        "bg-transparent text-[#94A3B8] hover:text-[#F1F5F9] hover:bg-white/[0.06]",
      danger:
        "bg-[#EF4444]/15 text-[#F87171] border border-[#EF4444]/30 hover:bg-[#EF4444]/25",
      success:
        "bg-[#10B981]/15 text-[#34D399] border border-[#10B981]/30 hover:bg-[#10B981]/25",
    };

    const sizes = {
      sm: "h-8 px-3 text-xs rounded-[8px]",
      md: "h-9 px-4 text-[13px] rounded-[8px]",
      icon: "h-7 w-7 rounded-[6px] p-0",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium",
          "transition-all duration-150 active:scale-[0.98]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#14B8A6]/60",
          "disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "teal" | "success" | "warning" | "danger";
  className?: string;
}) {
  const tones = {
    neutral: "bg-white/[0.06] text-[#94A3B8] border-white/[0.08]",
    teal: "bg-[#14B8A6]/12 text-[#2DD4BF] border-[#14B8A6]/25",
    success: "bg-[#10B981]/12 text-[#34D399] border-[#10B981]/25",
    warning: "bg-[#F59E0B]/12 text-[#FBBF24] border-[#F59E0B]/25",
    danger: "bg-[#EF4444]/12 text-[#F87171] border-[#EF4444]/25",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-9 w-full rounded-[8px] border border-white/[0.1] bg-[#0B0F19] px-3 text-[13px] text-[#F1F5F9]",
      "placeholder:text-[#64748B] transition-colors",
      "focus:border-[#14B8A6]/70 focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/20",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";
