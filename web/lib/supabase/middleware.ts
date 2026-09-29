import "server-only";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on admin requests and gates both
 * rewritten subdomain pages and legacy /admin/* pages behind it.
 *
 * This mirrors Supabase's own Next.js SSR middleware pattern: build the
 * response AFTER reading the (possibly refreshed) cookies from the
 * request, so the refreshed session cookie actually reaches the browser.
 * Never add logic between creating `supabase` and calling
 * `supabase.auth.getUser()` — that call is what performs the refresh.
 */
export async function updateSession(
  request: NextRequest,
  effectivePath = request.nextUrl.pathname,
  loginPath = "/admin/login",
) {
  const createResponse = () => {
    if (effectivePath === request.nextUrl.pathname) return NextResponse.next({ request });
    const target = request.nextUrl.clone();
    target.pathname = effectivePath;
    return NextResponse.rewrite(target, { request: { headers: request.headers } });
  };
  let response = createResponse();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = createResponse();
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAdminRoute = effectivePath === "/admin" || effectivePath.startsWith("/admin/");
  const isLoginRoute = effectivePath === "/admin/login";

  if (isAdminRoute && !isLoginRoute && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = loginPath;
    loginUrl.search = "";
    const redirect = NextResponse.redirect(loginUrl);
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    redirect.headers.set("Cache-Control", "private, no-store");
    return redirect;
  }

  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}
