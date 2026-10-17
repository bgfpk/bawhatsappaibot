import type {
  Owner360Profile,
  OwnerAddress,
  OwnerContactMethod,
  OwnerCustomFact,
  OwnerDataPrivacyPolicy,
} from "../../../services/owner360-types.ts";

export type {
  Owner360Profile,
  OwnerAddress,
  OwnerContactMethod,
  OwnerCustomFact,
  OwnerDataPrivacyPolicy,
};

export type OwnerProfileTabId =
  | "basic"
  | "contacts"
  | "addresses"
  | "locale"
  | "communication"
  | "availability"
  | "facts";

export interface OwnerProfileEditorProps {
  isOpen?: boolean;
  onClose?: () => void;
  isInline?: boolean;
}

export interface OwnerProfileSectionProps {
  profile: Owner360Profile;
  onChange: (updated: Owner360Profile) => void;
  onError?: (msg: string) => void;
}
