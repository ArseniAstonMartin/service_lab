import { Confirmation } from "@/components/wizard/confirmation";
import { requestSiteUrls } from "@/lib/site-urls";

export default async function ConfirmationPage() {
  const urls = await requestSiteUrls();
  return <Confirmation marketingUrl={urls.marketing} />;
}
