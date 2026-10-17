import React, { useEffect, useState } from 'react';

/**
 * Class name composition utility without external dependencies.
 * Concatenates falsy-filtered class names and handles simple string arrays/objects.
 */
export function cn(...inputs: Array<string | false | null | undefined | Record<string, boolean>>): string {
  const classes: string[] = [];

  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string') {
      classes.push(input);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) classes.push(key);
      }
    }
  }

  return classes.join(' ');
}

/**
 * Reduced motion hook and helper.
 */
export function isReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(isReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mediaQuery.matches);

    mediaQuery.addEventListener?.('change', onChange);
    return () => mediaQuery.removeEventListener?.('change', onChange);
  }, []);

  return reduced;
}

/**
 * Keyboard activation helper for non-button interactive elements.
 */
export function isKeyboardActivation(e: React.KeyboardEvent): boolean {
  return e.key === 'Enter' || e.key === ' ';
}

/**
 * Focus return helper.
 */
export function focusElement(el: HTMLElement | null) {
  if (el && typeof el.focus === 'function') {
    el.focus();
  }
}

/**
 * Icon Size Scale
 */
export const ICON_SIZES = {
  xs: 14,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export type IconSizeKey = keyof typeof ICON_SIZES;

/**
 * Accessible Status Vocabulary Mapping
 */
export type StatusType =
  | 'Connected'
  | 'Connecting'
  | 'QR Required'
  | 'Disconnected'
  | 'Paused'
  | 'Failed'
  | 'Active'
  | 'Inactive'
  | 'Pending'
  | 'Success'
  | 'Warning'
  | 'Error';

export interface StatusMeta {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'muted';
  ariaLabel: string;
}

export const STATUS_MAP: Record<StatusType, StatusMeta> = {
  Connected: { label: 'Connected', tone: 'success', ariaLabel: 'Status: Connected' },
  Connecting: { label: 'Connecting', tone: 'info', ariaLabel: 'Status: Connecting in progress' },
  'QR Required': { label: 'QR Required', tone: 'warning', ariaLabel: 'Status: QR scan required' },
  Disconnected: { label: 'Disconnected', tone: 'muted', ariaLabel: 'Status: Disconnected' },
  Paused: { label: 'Paused', tone: 'warning', ariaLabel: 'Status: Paused' },
  Failed: { label: 'Failed', tone: 'danger', ariaLabel: 'Status: Action failed' },
  Active: { label: 'Active', tone: 'success', ariaLabel: 'Status: Active' },
  Inactive: { label: 'Inactive', tone: 'muted', ariaLabel: 'Status: Inactive' },
  Pending: { label: 'Pending', tone: 'info', ariaLabel: 'Status: Pending' },
  Success: { label: 'Success', tone: 'success', ariaLabel: 'Status: Successful' },
  Warning: { label: 'Warning', tone: 'warning', ariaLabel: 'Status: Warning' },
  Error: { label: 'Error', tone: 'danger', ariaLabel: 'Status: Error' },
};
