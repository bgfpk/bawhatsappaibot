/**
 * Personal Assistant Permission Service
 * 
 * Implements granular, deny-by-default permissions for Personal Assistant actions.
 */

export interface PersonalAssistantPermissions {
  communication: boolean;
  personalData: boolean;
  orders: boolean;
  appointments: boolean;
  calendar: boolean;
  contacts: boolean;
  gmail: boolean;
  drive: boolean;
}

export type PersonalAssistantPermissionKey = keyof PersonalAssistantPermissions;

export const ALL_PERMISSION_KEYS: PersonalAssistantPermissionKey[] = [
  "communication",
  "personalData",
  "orders",
  "appointments",
  "calendar",
  "contacts",
  "gmail",
  "drive",
];

/**
 * Returns default permissions with every category strictly denied (false).
 */
export function createDefaultPersonalAssistantPermissions(): PersonalAssistantPermissions {
  return {
    communication: false,
    personalData: false,
    orders: false,
    appointments: false,
    calendar: false,
    contacts: false,
    gmail: false,
    drive: false,
  };
}

/**
 * Normalizes an arbitrary permissions input object into a strictly validated
 * PersonalAssistantPermissions object with deny-by-default fallback.
 */
export function normalizePersonalAssistantPermissions(input?: any): PersonalAssistantPermissions {
  const defaults = createDefaultPersonalAssistantPermissions();
  if (!input || typeof input !== "object") {
    return defaults;
  }

  return {
    communication: Boolean(input.communication),
    personalData: Boolean(input.personalData || input.personal_data),
    orders: Boolean(input.orders),
    appointments: Boolean(input.appointments),
    calendar: Boolean(input.calendar),
    contacts: Boolean(input.contacts),
    gmail: Boolean(input.gmail),
    drive: Boolean(input.drive),
  };
}

/**
 * Checks if a specific permission category is granted.
 */
export function checkPersonalAssistantPermission(
  permissions: PersonalAssistantPermissions | undefined,
  category: PersonalAssistantPermissionKey
): boolean {
  if (!permissions) return false;
  return Boolean(permissions[category]);
}
