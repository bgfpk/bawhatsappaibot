import React, { forwardRef, useId } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '../utils';

/* ==========================================
 * FIELD CONTAINER & CONTEXT
 * ========================================== */

interface FieldContextValue {
  id: string;
  descriptionId: string;
  errorId: string;
  isInvalid: boolean;
  isRequired: boolean;
  isDisabled: boolean;
  hasDescription: boolean;
  setHasDescription: (val: boolean) => void;
  hasError: boolean;
  setHasError: (val: boolean) => void;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

function useFieldContext() {
  return React.useContext(FieldContext);
}

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  id?: string;
  isInvalid?: boolean;
  isRequired?: boolean;
  isDisabled?: boolean;
}

export const Field = forwardRef<HTMLDivElement, FieldProps>(
  ({ children, id: explicitId, isInvalid = false, isRequired = false, isDisabled = false, className, ...props }, ref) => {
    const generatedId = useId();
    const id = explicitId || generatedId;
    const descriptionId = `${id}-description`;
    const errorId = `${id}-error`;
    const childArray = React.Children.toArray(children);
    const initialHasDesc = childArray.some(
      (child) => React.isValidElement(child) && ((child.type as any)?.displayName === 'Description' || child.type === Description)
    );
    const initialHasErr = childArray.some(
      (child) => React.isValidElement(child) && ((child.type as any)?.displayName === 'ErrorMessage' || child.type === ErrorMessage)
    );

    const [hasDescription, setHasDescription] = React.useState(initialHasDesc);
    const [hasError, setHasError] = React.useState(initialHasErr);

    return (
      <FieldContext.Provider
        value={{
          id,
          descriptionId,
          errorId,
          isInvalid,
          isRequired,
          isDisabled,
          hasDescription,
          setHasDescription,
          hasError,
          setHasError,
        }}
      >
        <div ref={ref} className={cn('flex flex-col gap-1.5 w-full', className)} {...props}>
          {children}
        </div>
      </FieldContext.Provider>
    );
  }
);
Field.displayName = 'Field';

/* ==========================================
 * LABEL
 * ========================================== */

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export const Label = forwardRef<HTMLLabelElement, LabelProps>(({ children, className, htmlFor, ...props }, ref) => {
  const ctx = useFieldContext();
  const targetId = htmlFor || ctx?.id;

  return (
    <label
      ref={ref}
      htmlFor={targetId}
      className={cn(
        'text-xs font-semibold uppercase tracking-wider text-[var(--ca-text-muted)] select-none',
        ctx?.isDisabled && 'opacity-60 cursor-not-allowed',
        className
      )}
      {...props}
    >
      {children}
      {ctx?.isRequired && (
        <span className="text-[var(--ca-danger)] ml-1 font-bold" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
});
Label.displayName = 'Label';

/* ==========================================
 * DESCRIPTION
 * ========================================== */

export interface DescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const Description = forwardRef<HTMLParagraphElement, DescriptionProps>(({ children, className, id, ...props }, ref) => {
  const ctx = useFieldContext();
  const descId = id || ctx?.descriptionId;

  React.useEffect(() => {
    if (ctx?.setHasDescription) {
      ctx.setHasDescription(true);
      return () => ctx.setHasDescription(false);
    }
  }, [ctx]);

  return (
    <p
      ref={ref}
      id={descId}
      className={cn('text-xs text-[var(--ca-text-muted)] leading-relaxed', className)}
      {...props}
    >
      {children}
    </p>
  );
});
Description.displayName = 'Description';

/* ==========================================
 * ERROR MESSAGE
 * ========================================== */

export interface ErrorMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {}

export const ErrorMessage = forwardRef<HTMLParagraphElement, ErrorMessageProps>(({ children, className, id, ...props }, ref) => {
  const ctx = useFieldContext();
  const errId = id || ctx?.errorId;

  React.useEffect(() => {
    if (children && ctx?.setHasError) {
      ctx.setHasError(true);
      return () => ctx.setHasError(false);
    }
  }, [children, ctx]);

  if (!children) return null;

  return (
    <p
      ref={ref}
      id={errId}
      role="alert"
      className={cn('text-xs font-medium text-[var(--ca-danger-text)] flex items-center gap-1', className)}
      {...props}
    >
      {children}
    </p>
  );
});
ErrorMessage.displayName = 'ErrorMessage';

/* ==========================================
 * INPUT
 * ========================================== */

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  isInvalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, isInvalid: explicitInvalid, id: explicitId, disabled, required, ...props }, ref) => {
    const ctx = useFieldContext();
    const id = explicitId || ctx?.id;
    const isInvalid = explicitInvalid ?? ctx?.isInvalid;
    const isDisabled = disabled ?? ctx?.isDisabled;
    const isRequired = required ?? ctx?.isRequired;

    const describedBy = [
      ctx?.hasDescription ? ctx.descriptionId : null,
      (isInvalid && ctx?.hasError) ? ctx.errorId : null,
    ].filter(Boolean).join(' ') || undefined;

    return (
      <input
        ref={ref}
        id={id}
        disabled={isDisabled}
        required={isRequired}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          'w-full min-h-[40px] px-3.5 py-2 text-sm bg-[var(--ca-surface-2)] text-[var(--ca-text-primary)] placeholder-[var(--ca-text-faint)] border border-[var(--ca-border-default)] rounded-lg transition-colors focus:outline-none focus:ring-3 focus:ring-[var(--ca-focus-ring)] focus:border-[var(--ca-brand)] disabled:opacity-50 disabled:cursor-not-allowed',
          isInvalid && 'border-[var(--ca-danger)] focus:ring-[var(--ca-danger-soft)] focus:border-[var(--ca-danger)]',
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

/* ==========================================
 * TEXTAREA
 * ========================================== */

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  isInvalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, isInvalid: explicitInvalid, id: explicitId, disabled, required, ...props }, ref) => {
    const ctx = useFieldContext();
    const id = explicitId || ctx?.id;
    const isInvalid = explicitInvalid ?? ctx?.isInvalid;
    const isDisabled = disabled ?? ctx?.isDisabled;
    const isRequired = required ?? ctx?.isRequired;

    const describedBy = [
      ctx?.hasDescription ? ctx.descriptionId : null,
      (isInvalid && ctx?.hasError) ? ctx.errorId : null,
    ].filter(Boolean).join(' ') || undefined;

    return (
      <textarea
        ref={ref}
        id={id}
        disabled={isDisabled}
        required={isRequired}
        aria-invalid={isInvalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          'w-full min-h-[96px] p-3 text-sm bg-[var(--ca-surface-2)] text-[var(--ca-text-primary)] placeholder-[var(--ca-text-faint)] border border-[var(--ca-border-default)] rounded-lg transition-colors resize-y focus:outline-none focus:ring-3 focus:ring-[var(--ca-focus-ring)] focus:border-[var(--ca-brand)] disabled:opacity-50 disabled:cursor-not-allowed',
          isInvalid && 'border-[var(--ca-danger)] focus:ring-[var(--ca-danger-soft)] focus:border-[var(--ca-danger)]',
          className
        )}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

/* ==========================================
 * SELECT
 * ========================================== */

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  isInvalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, isInvalid: explicitInvalid, id: explicitId, disabled, required, ...props }, ref) => {
    const ctx = useFieldContext();
    const id = explicitId || ctx?.id;
    const isInvalid = explicitInvalid ?? ctx?.isInvalid;
    const isDisabled = disabled ?? ctx?.isDisabled;
    const isRequired = required ?? ctx?.isRequired;

    const describedBy = [
      ctx?.hasDescription ? ctx.descriptionId : null,
      (isInvalid && ctx?.hasError) ? ctx.errorId : null,
    ].filter(Boolean).join(' ') || undefined;

    return (
      <select
        ref={ref}
        id={id}
        disabled={isDisabled}
        required={required ?? ctx?.isRequired}
        aria-invalid={isInvalid || undefined}
        className={cn(
          'w-full min-h-[40px] px-3.5 py-2 text-sm bg-[var(--ca-surface-2)] text-[var(--ca-text-primary)] border border-[var(--ca-border-default)] rounded-lg transition-colors focus:outline-none focus:ring-3 focus:ring-[var(--ca-focus-ring)] focus:border-[var(--ca-brand)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer',
          isInvalid && 'border-[var(--ca-danger)]',
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = 'Select';

/* ==========================================
 * CHECKBOX
 * ========================================== */

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, id: explicitId, disabled, ...props }, ref) => {
    const generatedId = useId();
    const id = explicitId || generatedId;

    return (
      <label htmlFor={id} className="inline-flex items-center gap-2.5 cursor-pointer min-h-[44px] select-none">
        <input
          ref={ref}
          id={id}
          type="checkbox"
          disabled={disabled}
          className={cn(
            'w-4 h-4 rounded border-[var(--ca-border-strong)] bg-[var(--ca-surface-2)] text-[var(--ca-brand)] focus:ring-2 focus:ring-[var(--ca-focus-ring)] accent-[var(--ca-brand)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          {...props}
        />
        {label && <span className="text-sm text-[var(--ca-text-primary)]">{label}</span>}
      </label>
    );
  }
);
Checkbox.displayName = 'Checkbox';

/* ==========================================
 * RADIO
 * ========================================== */

export interface RadioProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: React.ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, id: explicitId, disabled, ...props }, ref) => {
    const generatedId = useId();
    const id = explicitId || generatedId;

    return (
      <label htmlFor={id} className="inline-flex items-center gap-2.5 cursor-pointer min-h-[44px] select-none">
        <input
          ref={ref}
          id={id}
          type="radio"
          disabled={disabled}
          className={cn(
            'w-4 h-4 border-[var(--ca-border-strong)] bg-[var(--ca-surface-2)] text-[var(--ca-brand)] focus:ring-2 focus:ring-[var(--ca-focus-ring)] accent-[var(--ca-brand)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          {...props}
        />
        {label && <span className="text-sm text-[var(--ca-text-primary)]">{label}</span>}
      </label>
    );
  }
);
Radio.displayName = 'Radio';

/* ==========================================
 * SWITCH (ACCESSIBLE TOGGLE)
 * ========================================== */

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const Switch: React.FC<SwitchProps> = ({
  checked,
  onChange,
  label,
  disabled = false,
  id: explicitId,
  className,
}) => {
  const generatedId = useId();
  const id = explicitId || generatedId;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      onChange(!checked);
    }
  };

  return (
    <label htmlFor={id} className="inline-flex items-center gap-3 cursor-pointer min-h-[44px] select-none">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        onKeyDown={handleKeyDown}
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)] focus:ring-offset-2 focus:ring-offset-[var(--ca-canvas-0)] disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-[var(--ca-brand)]' : 'bg-[var(--ca-surface-4)]',
          className
        )}
      >
        <span
          className={cn(
            'pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
      </button>
      {label && <span className="text-sm text-[var(--ca-text-primary)]">{label}</span>}
    </label>
  );
};
Switch.displayName = 'Switch';

/* ==========================================
 * SEARCH FIELD
 * ========================================== */

export interface SearchFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(
  ({ className, value, onChange, onClear, placeholder = 'Search...', ...props }, ref) => {
    const hasValue = Boolean(value);

    return (
      <div className="relative flex items-center w-full">
        <Search
          size={16}
          className="absolute left-3.5 text-[var(--ca-text-muted)] pointer-events-none"
          aria-hidden="true"
        />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className={cn(
            'w-full min-h-[40px] pl-9 pr-9 py-2 text-sm bg-[var(--ca-surface-2)] text-[var(--ca-text-primary)] placeholder-[var(--ca-text-faint)] border border-[var(--ca-border-default)] rounded-lg transition-colors focus:outline-none focus:ring-3 focus:ring-[var(--ca-focus-ring)] focus:border-[var(--ca-brand)]',
            className
          )}
          {...props}
        />
        {hasValue && onClear && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className="absolute right-3 text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] focus:outline-none p-1"
          >
            <X size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }
);
SearchField.displayName = 'SearchField';
