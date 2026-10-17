import { BookingConfirmation } from "@/components/booking/confirmation";
import { requestSiteUrls } from "@/lib/site-urls";

export default async function BookingConfirmationPage() {
  const urls = await requestSiteUrls();
  return <BookingConfirmation marketingUrl={urls.marketing} />;
}
