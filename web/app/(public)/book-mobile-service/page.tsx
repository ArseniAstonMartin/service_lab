import { redirect } from "next/navigation";

/**
 * /book-mobile-service has no page of its own -- it always starts at
 * the contact step, same as /order redirecting to /order/vehicle on
 * the order host (lib/domain/site-routing.ts).
 */
export default function BookMobileServiceRedirect() {
  redirect("/book-mobile-service/contact");
}
