import { redirect } from "next/navigation";

/**
 * /order/module used to be its own wizard step; it's now folded into
 * /order/vehicle (vehicle + module + part number combined into a single
 * first step). Kept as a redirect, not removed, so a stale bookmark, an
 * old browser-history entry, or a tab left open mid-checkout from before
 * this change still lands somewhere useful instead of a 404.
 */
export default function OrderModuleRedirect() {
  redirect("/order/vehicle");
}
