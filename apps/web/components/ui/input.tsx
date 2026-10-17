import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-[var(--ca-border-default)] bg-[var(--ca-surface-2)] px-3 py-1 text-sm text-[var(--ca-text-primary)] shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-[var(--ca-text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ca-focus-ring)] focus-visible:border-[var(--ca-brand)] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
