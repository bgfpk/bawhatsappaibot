import React, { useEffect, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn, focusElement } from '../utils';

/* ==========================================
 * OVERLAY SCROLL LOCK & STACK MANAGER
 * ========================================== */

interface OverlayEntry {
  id: string;
  onClose: () => void;
  isDismissible: boolean;
}

let activeOverlayCount = 0;
let originalBodyOverflow: string | null = null;
let originalRootInert: boolean = false;
let originalRootAriaHidden: string | null = null;
const overlayStack: OverlayEntry[] = [];

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape' && overlayStack.length > 0) {
      const top = overlayStack[overlayStack.length - 1];
      if (top.isDismissible) {
        e.stopPropagation();
        top.onClose();
      }
    }
  });
}

function lockBodyScroll() {
  if (typeof document !== 'undefined') {
    if (activeOverlayCount === 0) {
      originalBodyOverflow = document.body.style.overflow;
      const root = document.getElementById('root');
      if (root) {
        originalRootInert = root.hasAttribute('inert');
        originalRootAriaHidden = root.getAttribute('aria-hidden');
        root.setAttribute('aria-hidden', 'true');
        root.setAttribute('inert', '');
      }
    }
    activeOverlayCount++;
    document.body.style.overflow = 'hidden';
  }
}

function unlockBodyScroll() {
  activeOverlayCount = Math.max(0, activeOverlayCount - 1);
  if (typeof document !== 'undefined' && activeOverlayCount === 0) {
    document.body.style.overflow = originalBodyOverflow ?? '';
    originalBodyOverflow = null;
    const root = document.getElementById('root');
    if (root) {
      if (originalRootInert) {
        root.setAttribute('inert', '');
      } else {
        root.removeAttribute('inert');
      }
      if (originalRootAriaHidden !== null) {
        root.setAttribute('aria-hidden', originalRootAriaHidden);
      } else {
        root.removeAttribute('aria-hidden');
      }
    }
  }
}

export function registerOverlay(id: string, onClose: () => void, isDismissible: boolean = true) {
  overlayStack.push({ id, onClose, isDismissible });
}

export function unregisterOverlay(id: string) {
  const index = overlayStack.findIndex(item => item.id === id);
  if (index !== -1) {
    overlayStack.splice(index, 1);
  }
}

export function getActiveOverlayCount() {
  return activeOverlayCount;
}

/* ==========================================
 * DIALOG (MODAL)
 * ========================================== */

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  isDismissible?: boolean;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  isDismissible = true,
  initialFocusRef,
  className,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();
  const dialogId = useId();

  // Save active element on open and restore on close/unmount
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      lockBodyScroll();
      registerOverlay(dialogId, onClose, isDismissible);

      const timer = setTimeout(() => {
        if (initialFocusRef?.current) {
          initialFocusRef.current.focus();
        } else if (dialogRef.current) {
          const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusables.length > 0) {
            focusables[0].focus();
          } else {
            dialogRef.current.focus();
          }
        }
      }, 50);

      return () => {
        clearTimeout(timer);
        unregisterOverlay(dialogId);
        unlockBodyScroll();
        if (triggerRef.current && document.body.contains(triggerRef.current)) {
          focusElement(triggerRef.current);
        }
      };
    }
  }, [isOpen, initialFocusRef, dialogId, onClose, isDismissible]);

  // Focus trap Tab handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = Array.from<HTMLElement>(
          dialogRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const sizeStyles = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
  };

  const modalContent = (
    <div
      className="fixed inset-0 z-[var(--ca-z-modal)] flex items-center justify-center p-4 bg-[var(--ca-overlay)] backdrop-blur-sm transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget && isDismissible) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'w-full rounded-2xl bg-[var(--ca-surface-1)] border border-[var(--ca-border-default)] shadow-[var(--ca-shadow-modal)] flex flex-col max-h-[90vh] overflow-hidden focus:outline-none animate-in fade-in zoom-in-95 duration-150',
          sizeStyles[size],
          className
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-[var(--ca-border-subtle)]">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-[var(--ca-text-primary)]">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-xs text-[var(--ca-text-muted)] mt-1 leading-relaxed">
                {description}
              </p>
            )}
          </div>
          {isDismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="p-2 text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] rounded-lg hover:bg-[var(--ca-surface-2)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar flex-1">{children}</div>

        {/* Footer */}
        {footer && (
          <div className="flex items-center justify-end gap-3 p-4 bg-[var(--ca-surface-2)] border-t border-[var(--ca-border-subtle)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return modalContent;
  }

  return createPortal(modalContent, document.body);
};

/* ==========================================
 * DRAWER (SLIDE-OVER)
 * ========================================== */

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  position?: 'right' | 'left';
  isDismissible?: boolean;
  className?: string;
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  position = 'right',
  isDismissible = true,
  className,
}) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const drawerId = useId();

  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement as HTMLElement;
      lockBodyScroll();
      registerOverlay(drawerId, onClose, isDismissible);

      const timer = setTimeout(() => {
        if (drawerRef.current) {
          const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          );
          if (focusables.length > 0) {
            focusables[0].focus();
          } else {
            drawerRef.current.focus();
          }
        }
      }, 50);

      return () => {
        clearTimeout(timer);
        unregisterOverlay(drawerId);
        unlockBodyScroll();
        if (triggerRef.current && document.body.contains(triggerRef.current)) {
          focusElement(triggerRef.current);
        }
      };
    }
  }, [isOpen, drawerId, onClose, isDismissible]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = Array.from<HTMLElement>(
          drawerRef.current.querySelectorAll(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        );
        if (focusables.length === 0) return;

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  const drawerContent = (
    <div
      className="fixed inset-0 z-[var(--ca-z-drawer)] flex bg-[var(--ca-overlay)] backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && isDismissible) onClose();
      }}
    >
      <div
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'w-full max-w-md bg-[var(--ca-surface-1)] border-l border-[var(--ca-border-default)] shadow-[var(--ca-shadow-floating)] flex flex-col h-full overflow-hidden ml-auto',
          position === 'left' && 'ml-0 mr-auto border-l-0 border-r',
          className
        )}
      >
        <div className="flex items-center justify-between p-5 border-b border-[var(--ca-border-subtle)]">
          <h2 id={titleId} className="text-base font-bold text-[var(--ca-text-primary)]">
            {title}
          </h2>
          {isDismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="p-2 text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] rounded-lg hover:bg-[var(--ca-surface-2)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)]"
            >
              <X size={18} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar flex-1">{children}</div>

        {footer && (
          <div className="flex items-center justify-end gap-3 p-4 bg-[var(--ca-surface-2)] border-t border-[var(--ca-border-subtle)]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );

  if (typeof document === 'undefined') {
    return drawerContent;
  }

  return createPortal(drawerContent, document.body);
};

/* ==========================================
 * TOOLTIP
 * ========================================== */

export interface TooltipProps {
  content: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom';
}

export const Tooltip: React.FC<TooltipProps> = ({ content, children, position = 'top' }) => {
  const [isVisible, setIsVisible] = React.useState(false);
  const tooltipId = useId();

  const posStyles = {
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {React.cloneElement(children, {
        'aria-describedby': isVisible ? tooltipId : undefined,
      })}
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={cn(
            'absolute z-[var(--ca-z-popover)] px-2.5 py-1 text-xs font-medium text-[var(--ca-text-inverse)] bg-[var(--ca-text-primary)] rounded shadow-md whitespace-nowrap pointer-events-none animate-in fade-in duration-100',
            posStyles[position]
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
};

/* ==========================================
 * POPOVER
 * ========================================== */

export interface PopoverProps {
  isOpen: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  placement?: 'bottom' | 'top';
  ariaLabel?: string;
  className?: string;
}

export const Popover: React.FC<PopoverProps> = ({
  isOpen,
  onClose,
  trigger,
  children,
  align = 'left',
  placement = 'bottom',
  ariaLabel,
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  useEffect(() => {
    if (!isOpen) return;

    registerOverlay(popoverId, onClose, true);

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      unregisterOverlay(popoverId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, popoverId, onClose]);

  const posStyles = {
    bottom: 'top-full mt-2',
    top: 'bottom-full mb-2',
  };

  const alignStyles = {
    left: 'left-0',
    right: 'right-0',
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      {React.isValidElement(trigger)
        ? React.cloneElement(trigger as React.ReactElement<any>, {
            'aria-haspopup': 'dialog',
            'aria-expanded': isOpen,
            'aria-controls': isOpen ? popoverId : undefined,
          })
        : trigger}
      {isOpen && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={ariaLabel}
          className={cn(
            'absolute z-[var(--ca-z-popover)] min-w-[200px] p-4 rounded-xl bg-[var(--ca-surface-1)] border border-[var(--ca-border-default)] shadow-[var(--ca-shadow-floating)] focus:outline-none animate-in fade-in duration-100',
            posStyles[placement],
            alignStyles[align],
            className
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
};

/* ==========================================
 * DROPDOWN MENU
 * ========================================== */

export interface DropdownMenuProps {
  isOpen: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  ariaLabel?: string;
  className?: string;
}

export const DropdownMenu: React.FC<DropdownMenuProps> = ({
  isOpen,
  onClose,
  trigger,
  children,
  align = 'left',
  ariaLabel = 'Actions menu',
  className,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen) return;

    registerOverlay(menuId, onClose, true);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!menuRef.current) return;
      const items = Array.from(
        menuRef.current.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])')
      ) as HTMLElement[];
      if (items.length === 0) return;

      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
        items[nextIndex].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
        items[prevIndex].focus();
      } else if (e.key === 'Home') {
        e.preventDefault();
        items[0].focus();
      } else if (e.key === 'End') {
        e.preventDefault();
        items[items.length - 1].focus();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      unregisterOverlay(menuId);
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, menuId, onClose]);

  return (
    <div ref={containerRef} className="relative inline-block">
      {React.isValidElement(trigger)
        ? React.cloneElement(trigger as React.ReactElement<any>, {
            'aria-haspopup': 'menu',
            'aria-expanded': isOpen,
            'aria-controls': isOpen ? menuId : undefined,
          })
        : trigger}
      {isOpen && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={ariaLabel}
          tabIndex={-1}
          className={cn(
            'absolute z-[var(--ca-z-popover)] min-w-[180px] py-1.5 rounded-xl bg-[var(--ca-surface-1)] border border-[var(--ca-border-default)] shadow-[var(--ca-shadow-floating)] focus:outline-none animate-in fade-in duration-100 top-full mt-2',
            align === 'right' ? 'right-0' : 'left-0',
            className
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
};

export interface DropdownMenuItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

export const DropdownMenuItem: React.FC<DropdownMenuItemProps> = ({
  children,
  onClick,
  disabled = false,
  destructive = false,
  icon,
  className,
}) => {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      aria-disabled={disabled}
      onClick={() => {
        if (!disabled && onClick) onClick();
      }}
      className={cn(
        'w-full flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-2)] focus:bg-[var(--ca-surface-2)] focus:outline-none transition-colors cursor-pointer text-left',
        destructive && 'text-[var(--ca-danger)] hover:bg-[var(--ca-danger-soft)] focus:bg-[var(--ca-danger-soft)]',
        disabled && 'opacity-50 cursor-not-allowed pointer-events-none text-[var(--ca-text-muted)]',
        className
      )}
    >
      {icon && <span className="w-4 h-4 flex items-center justify-center shrink-0" aria-hidden="true">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

export const DropdownMenuSeparator: React.FC = () => (
  <div role="separator" className="my-1 border-t border-[var(--ca-border-subtle)]" />
);
