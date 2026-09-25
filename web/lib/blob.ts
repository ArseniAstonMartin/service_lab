import "server-only";

/**
 * True when `url` looks like a Vercel Blob URL for a public store —
 * i.e. an https URL on the *.public.blob.vercel-storage.com domain that
 * Vercel Blob issues for every upload.
 *
 * The upload token route (app/api/uploads/token/route.ts) is what
 * actually authenticates an upload (a short-lived, purpose-scoped
 * token); this check exists for the OTHER side of the flow — every
 * Server Action that later receives a client-supplied Blob URL and
 * writes it to the database (TASK-018 sticker photos, TASK-020 cloning
 * donor/original photos, TASK-033 return labels) must call this first.
 * The client can send any string as that URL, so the shape check is the
 * only thing worth trusting at that point.
 */
export function isVercelBlobUrl(url: string): boolean {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return parsed.protocol === "https:" && /\.public\.blob\.vercel-storage\.com$/.test(parsed.hostname);
}
