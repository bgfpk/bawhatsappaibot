import React, { forwardRef } from 'react';
import { Loader2 } from 'lucide-react';
import { cn, ICON_SIZES } from '../utils';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'destructive' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon-only';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  loadingLabel?: string;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
  'aria-label'?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingLabel = 'Loading...',
      leadingIcon,
      trailingIcon,
      disabled,
      type = 'button',
      className,
      'aria-label': ariaLabel,
      ...props
    },
    ref
  ) => {
    // Validate accessibility for icon-only variant
    if (size === 'icon-only' && !ariaLabel && !props['aria-labelledby']) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('Button: Icon-only buttons require an aria-label or aria-labelledby prop for accessibility.');
      }
    }

    const isIconOnly = size === 'icon-only';
    const isDisabled = disabled || isLoading;

    // Base styles
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--ca-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--ca-canvas-0)] disabled:pointer-events-none disabled:opacity-50 min-h-[44px] min-w-0 max-w-full box-border leading-snug break-words select-none';

    // Variant styles using semantic design tokens
    const variantStyles: Record<ButtonVariant, string> = {
      primary:
        'bg-[var(--ca-brand)] text-[var(--ca-brand-fg)] hover:bg-[var(--ca-brand-hover)] active:bg-[var(--ca-brand-active)] border border-transparent shadow-sm',
      secondary:
        'bg-[var(--ca-surface-2)] text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-3)] active:bg-[var(--ca-surface-4)] border border-[var(--ca-border-default)] shadow-sm',
      quiet:
        'bg-transparent text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-2)] active:bg-[var(--ca-surface-3)] border border-transparent',
      destructive:
        'bg-[var(--ca-danger)] text-[var(--ca-danger-fg)] hover:bg-[var(--ca-danger-hover)] active:bg-[var(--ca-danger-active)] border border-transparent shadow-sm',
      link:
        'bg-transparent text-[var(--ca-brand)] hover:underline active:opacity-80 border border-transparent p-0 min-h-0 min-w-0',
    };

    // Size styles
    const sizeStyles: Record<ButtonSize, string> = {
      sm: 'text-xs px-3 py-1.5 gap-1.5 min-h-[36px]',
      md: 'text-sm px-4 py-2 gap-2 min-h-[40px]',
      lg: 'text-base px-5 py-2.5 gap-2.5 min-h-[48px]',
      'icon-only': 'p-2.5 gap-0 min-h-[44px] min-w-[44px]',
    };

    const effectiveAriaLabel = isIconOnly ? ariaLabel || 'Button' : ariaLabel;

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        aria-label={effectiveAriaLabel}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2
              size={size === 'sm' ? ICON_SIZES.sm : ICON_SIZES.md}
              className="animate-spin text-current shrink-0"
              aria-hidden="true"
            />
            {!isIconOnly && <span className="min-w-0 break-words leading-tight">{loadingLabel || children}</span>}
          </>
        ) : (
          <>
            {leadingIcon && (
              <span className="inline-flex shrink-0 items-center" aria-hidden="true">
                {leadingIcon}
              </span>
            )}
            {children && <span className="min-w-0 break-words leading-tight">{children}</span>}
            {trailingIcon && (
              <span className="inline-flex shrink-0 items-center" aria-hidden="true">
                {trailingIcon}
              </span>
            )}
          </>
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
