import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--ca-brand-soft)] text-[var(--ca-brand)] border-[var(--ca-brand)]/20",
        secondary:
          "border-transparent bg-[var(--ca-surface-3)] text-[var(--ca-text-primary)]",
        destructive:
          "border-transparent bg-[var(--ca-rose)]/15 text-[var(--ca-rose)] border-[var(--ca-rose)]/30",
        success:
          "border-transparent bg-[var(--ca-teal)]/15 text-[var(--ca-teal)] border-[var(--ca-teal)]/30",
        warning:
          "border-transparent bg-[var(--ca-amber)]/15 text-[var(--ca-amber)] border-[var(--ca-amber)]/30",
        outline: "text-[var(--ca-text-primary)] border-[var(--ca-border-strong)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
