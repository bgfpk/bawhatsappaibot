import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-2 text-sm text-[var(--ca-text-primary)] placeholder:text-[var(--ca-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ca-focus-ring)] focus-visible:border-[var(--ca-brand)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
