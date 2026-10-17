/**
 * Shape of the /book-mobile-service wizard's client-side state, held in
 * BookingProvider (components/booking/wizard-store.tsx) and persisted
 * to sessionStorage. Deliberately separate from lib/wizard/types.ts's
 * WizardState: this is a different flow, with its own storage key, so
 * the two never collide in the same browser tab, and this state is
 * never trusted server-side either — bookMobileService re-validates
 * everything itself.
 */

export type BookingContact = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type BookingVehicle = {
  make: string;
  model: string;
  year: number;
};

export type BookingState = {
  contact: BookingContact | null;
  vehicle: BookingVehicle | null;
  /** Service slugs from lib/booking/catalog.ts, in the order added. */
  selectedServices: string[];
  note: string;
  /** Set once bookMobileService succeeds; read by the confirmation
   * page, then nothing else needs the booking afterward. */
  bookingId: string | null;
};

export const initialBookingState: BookingState = {
  contact: null,
  vehicle: null,
  selectedServices: [],
  note: "",
  bookingId: null,
};
