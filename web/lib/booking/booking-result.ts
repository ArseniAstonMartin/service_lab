/**
 * Small sessionStorage-backed handoff from the services step's submit
 * handler to /book-mobile-service/confirmation -- mirrors
 * lib/wizard/order-result.ts's pattern exactly. bookMobileService() is
 * called from the last step that still has the full booking state in
 * hand, and that state is reset immediately after a successful submit,
 * so the confirmation screen can't read it itself; it reads this
 * separate, short-lived record instead, written right before the reset.
 */

const BOOKING_RESULT_KEY = "mobile-service-booking-result";

export type BookingResult = {
  bookingId: string;
  serviceTitles: string[];
};

export function writeBookingResult(result: BookingResult): void {
  try {
    window.sessionStorage.setItem(BOOKING_RESULT_KEY, JSON.stringify(result));
  } catch {
    // sessionStorage can throw (private browsing, quota exceeded); the
    // confirmation page just falls back to its "no booking found" state.
  }
}

export function readBookingResult(): BookingResult | null {
  try {
    const raw = window.sessionStorage.getItem(BOOKING_RESULT_KEY);
    return raw ? (JSON.parse(raw) as BookingResult) : null;
  } catch {
    return null;
  }
}
