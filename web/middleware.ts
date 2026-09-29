import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { routeForHost } from "@/lib/domain/site-routing";

export async function middleware(request: NextRequest) {
  const decision = routeForHost(
    request.headers.get("host") ?? request.nextUrl.host,
    request.nextUrl.pathname,
    request.method,
  );
  if (decision.kind === "redirect") {
    const url = request.nextUrl.clone();
    if (decision.origin) {
      const origin = new URL(decision.origin);
      url.protocol = origin.protocol;
      url.hostname = origin.hostname;
      url.port = origin.port;
    }
    url.pathname = decision.pathname;
    return NextResponse.redirect(url, 307);
  }
  if (decision.admin) return updateSession(request, decision.pathname, decision.loginPath);
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Host routing excludes static assets. Authentication refresh is only
     * needed on admin routes; public marketing never waits on Supabase Auth.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff2)$).*)",
  ],
};
