import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

/**
 * Server-only Resend client (TASK-041). Constructed lazily on first
 * actual use, same reasoning as lib/stripe.ts's Stripe client: a
 * module-scope `new Resend(env.RESEND_API_KEY)` would run during
 * Next's "Collecting page data" build step for every route that
 * imports this module (even transitively), forcing a real
 * RESEND_API_KEY to exist just to build.
 */
let client: Resend | null = null;

function getClient(): Resend {
  if (!client) {
    client = new Resend(env.RESEND_API_KEY);
  }
  return client;
}

export const resend: Resend = new Proxy({} as Resend, {
  get(_target, prop, receiver) {
    const value = Reflect.get(getClient(), prop, receiver);
    return typeof value === "function" ? value.bind(getClient()) : value;
  },
}) as Resend;
