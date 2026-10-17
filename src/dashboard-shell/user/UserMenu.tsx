import React, { useState } from 'react';
import { User, LogOut, Sun, Moon, Settings, Shield } from 'lucide-react';
import { Popover } from '../../design-system/primitives';
import { cn } from '../../design-system/utils';

export interface UserMenuProps {
  currentUser?: {
    name?: string;
    email?: string;
    avatarUrl?: string;
    role?: string;
  } | null;
  isAdmin?: boolean;
  isDarkMode?: boolean;
  onToggleDarkMode?: () => void;
  onNavigateToSettings?: () => void;
  onNavigateToAdmin?: () => void;
  onSignOut?: () => void;
  className?: string;
}

export const UserMenu: React.FC<UserMenuProps> = ({
  currentUser,
  isAdmin = false,
  isDarkMode = true,
  onToggleDarkMode,
  onNavigateToSettings,
  onNavigateToAdmin,
  onSignOut,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const userName = currentUser?.name || currentUser?.email?.split('@')[0] || 'Account User';
  const userEmail = currentUser?.email || 'contact-fa220c05da45@example.invalid';
  const initials = userName
    .split(' ')
    .map((part) => part[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  return (
    <Popover
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
      align="right"
      ariaLabel="User Profile Menu"
      trigger={
        <button
          type="button"
          aria-label={`User menu for ${userName}`}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            'flex items-center gap-2.5 p-1.5 rounded-xl hover:bg-[var(--ca-surface-2)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ca-focus-ring)] select-none',
            className
          )}
        >
          <div className="w-8 h-8 rounded-full bg-[var(--ca-brand)] text-[var(--ca-brand-fg)] font-bold text-xs flex items-center justify-center shadow-sm shrink-0">
            {initials}
          </div>
          <div className="hidden md:block text-left pr-1 max-w-[120px]">
            <p className="text-xs font-semibold text-[var(--ca-text-primary)] truncate">{userName}</p>
            <p className="text-[10px] text-[var(--ca-text-muted)] truncate">{isAdmin ? 'Admin Role' : 'User Role'}</p>
          </div>
        </button>
      }
    >
      <div className="w-56 space-y-3">
        <div className="pb-2 border-b border-[var(--ca-border-subtle)]">
          <p className="text-xs font-bold text-[var(--ca-text-primary)] truncate">{userName}</p>
          <p className="text-[11px] text-[var(--ca-text-muted)] truncate">{userEmail}</p>
        </div>

        <div className="space-y-1" role="menu">
          {onToggleDarkMode && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onToggleDarkMode();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-2)] rounded-md transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                {isDarkMode ? (
                  <Sun size={14} className="text-amber-400" aria-hidden="true" />
                ) : (
                  <Moon size={14} className="text-indigo-400" aria-hidden="true" />
                )}
                <span>{isDarkMode ? 'Light Theme' : 'Dark Theme'}</span>
              </div>
              <span className="text-[10px] text-[var(--ca-text-muted)] uppercase tracking-wider font-semibold">
                {isDarkMode ? 'Dark' : 'Light'}
              </span>
            </button>
          )}

          {onNavigateToSettings && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onNavigateToSettings();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-2)] rounded-md transition-colors text-left"
            >
              <Settings size={14} className="text-[var(--ca-text-muted)]" aria-hidden="true" />
              <span>Account Settings</span>
            </button>
          )}

          {isAdmin && onNavigateToAdmin && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onNavigateToAdmin();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--ca-text-primary)] hover:bg-[var(--ca-surface-2)] rounded-md transition-colors text-left"
            >
              <Shield size={14} className="text-[var(--ca-brand)]" aria-hidden="true" />
              <span>Platform Admin</span>
            </button>
          )}

          {onSignOut && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onSignOut();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-[var(--ca-danger-text)] hover:bg-[var(--ca-danger-soft)] rounded-md transition-colors text-left mt-1"
            >
              <LogOut size={14} aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </div>
    </Popover>
  );
};
