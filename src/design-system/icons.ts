import React from 'react';
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  QrCode,
  PauseCircle,
  XCircle,
  Clock,
  LucideProps,
} from 'lucide-react';
import { StatusType, ICON_SIZES, IconSizeKey } from './utils';

export const DEFAULT_ICON_STROKE_WIDTH = 1.75;

export interface IconProps extends Omit<LucideProps, 'size'> {
  size?: IconSizeKey | number;
  label?: string;
  className?: string;
}

/**
 * Returns normalized numeric icon size in pixels
 */
export function getIconSize(size: IconSizeKey | number = 'md'): number {
  if (typeof size === 'number') return size;
  return ICON_SIZES[size] || ICON_SIZES.md;
}

/**
 * Status Icon Map
 */
export const STATUS_ICONS: Record<StatusType, React.ComponentType<LucideProps>> = {
  Connected: CheckCircle2,
  Connecting: Loader2,
  'QR Required': QrCode,
  Disconnected: XCircle,
  Paused: PauseCircle,
  Failed: AlertCircle,
  Active: CheckCircle2,
  Inactive: XCircle,
  Pending: Clock,
  Success: CheckCircle2,
  Warning: AlertTriangle,
  Error: AlertCircle,
};

/**
 * Helper to render accessibility props for icons.
 * If label is supplied, it becomes a semantic img with aria-label.
 * Otherwise, it is decorative with aria-hidden="true".
 */
export function getIconAriaProps(label?: string) {
  if (label) {
    return {
      role: 'img',
      'aria-label': label,
    };
  }
  return {
    'aria-hidden': true as const,
  };
}
