export interface RouteDefinition {
  path: string;
  label: string;
  isPublic?: boolean;
  requiresAdmin?: boolean;
  requiresOwner?: boolean;
  isLazy?: boolean;
}

export const DASHBOARD_ROUTES: RouteDefinition[] = [
  { path: '/', label: 'Home', isPublic: true },
  { path: '/login', label: 'Login', isPublic: true },
  { path: '/signup', label: 'Signup', isPublic: true },
  { path: '/magic-link', label: 'Magic Link Login', isPublic: true },
  { path: '/features', label: 'Features', isPublic: true, isLazy: true },
  { path: '/pricing', label: 'Pricing', isPublic: true, isLazy: true },
  { path: '/docs', label: 'Docs', isPublic: true, isLazy: true },
  { path: '/dashboard', label: 'Dashboard', isPublic: false },
  { path: '/instances', label: 'WhatsApp Instances', isPublic: false },
  { path: '/ai-studio', label: 'AI Studio', isPublic: false },
  { path: '/knowledge-center', label: 'Knowledge Center', isPublic: false },
  { path: '/products', label: 'Products', isPublic: false },
  { path: '/customers', label: 'Customers', isPublic: false },
  { path: '/inbox', label: 'Inbox', isPublic: false },
  { path: '/crm', label: 'CRM', isPublic: false },
  { path: '/followups', label: 'Follow-ups', isPublic: false, isLazy: true },
  { path: '/customer-updates', label: 'Customer Updates', isPublic: false, isLazy: true },
  { path: '/orders', label: 'Orders', isPublic: false },
  { path: '/integrations', label: 'Integrations', isPublic: false, isLazy: true },
  { path: '/wallet', label: 'Wallet & Billing', isPublic: false },
  { path: '/team', label: 'Team', isPublic: false, requiresOwner: true },
  { path: '/admin', label: 'Admin Directory', isPublic: false, requiresAdmin: true, isLazy: true },
  { path: '/global_dashboard', label: 'Global Dashboard', isPublic: false },
];
