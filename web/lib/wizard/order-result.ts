/**
 * Small sessionStorage-backed handoff from /order/shipping's submit
 * handler to /order/confirmation (TASK-023).
 *
 * placeOrder() is called from the shipping form — the last step that
 * still has the full wizard state in hand — and the wizard state is
 * reset immediately after a successful submit (this task's acceptance
 * criteria require it cleared), so the confirmation screen can't read
 * wizard state itself. It reads this separate, short-lived record
 * instead, written right before that reset. Deliberately NOT part of
 * WizardState/wizard-store.tsx: it has a different lifecycle (written
 * once, read on the next page, never round-tripped through `update()`)
 * and must survive the wizard reset that clears everything else.
 */

const ORDER_RESULT_KEY = "ecu-order-result";

export type OrderResult = {
  orderNumber: string;
  trackingToken: string;
  status: string;
  /** True once the order is matched to a confirmed service (the
   * awaiting_payment path); false on the pending-review path. */
  matched: boolean;
  categoryName: string | null;
  /** True when the selected service's question set was CLONING —
   * decided from which photo questions were answered on /order/details
   * (original_photo / donor_photo), since the wizard never stores
   * questionSetCode itself. */
  isCloning: boolean;
  originalPartNumber: string | null;
  donorPartNumber: string | null;
};

export function writeOrderResult(result: OrderResult): void {
  try {
    window.sessionStorage.setItem(ORDER_RESULT_KEY, JSON.stringify(result));
  } catch {
    // sessionStorage can throw (private browsing, quota exceeded); the
    // confirmation page just falls back to its "no order found" state.
  }
}

export function readOrderResult(): OrderResult | null {
  try {
    const raw = window.sessionStorage.getItem(ORDER_RESULT_KEY);
    return raw ? (JSON.parse(raw) as OrderResult) : null;
  } catch {
    return null;
  }
}
