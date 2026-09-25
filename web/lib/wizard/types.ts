/**
 * Shape of the client-side wizard state, held in WizardProvider
 * (components/wizard/wizard-store.tsx) and persisted to sessionStorage.
 * This is UI/session state only — never imported by /lib/domain or any
 * server code, and it is NOT trusted server-side: every Server Action
 * that consumes it (checkCompatibility, placeOrder, ...) revalidates
 * everything server-side rather than taking these values as given.
 */

export type WizardVehicle = {
  make: string;
  model: string;
  year: number;
};

export type WizardMatchedService = {
  id: string;
  name: string;
  priceCents: number;
};

export type WizardMatchResult = {
  matched: boolean;
  entryId: string | null;
  services: WizardMatchedService[];
};

export type WizardContact = {
  name: string;
  email: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zip: string;
};

export type WizardState = {
  vehicle: WizardVehicle | null;
  categoryId: string | null;
  partNumber: string;
  stickerPhotoUrl: string | null;
  matchResult: WizardMatchResult | null;
  serviceId: string | null;
  description: string;
  /** questionCode -> answer, for text/yes_no/textarea questions. */
  answers: Record<string, string>;
  /** questionCode -> Blob URL, for photo questions (cloning donor/original). */
  photoAnswers: Record<string, string>;
  contact: WizardContact | null;
  /** Generated once per wizard session; sent with placeOrder so a
   * duplicate submit (double-click, back button) returns the existing
   * order instead of creating a second one. */
  idempotencyKey: string | null;
};

export const initialWizardState: WizardState = {
  vehicle: null,
  categoryId: null,
  partNumber: "",
  stickerPhotoUrl: null,
  matchResult: null,
  serviceId: null,
  description: "",
  answers: {},
  photoAnswers: {},
  contact: null,
  idempotencyKey: null,
};
