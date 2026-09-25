import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { UnauthorizedError, requireAdmin } from "@/lib/supabase/require-admin";

/**
 * Issues short-lived, purpose-scoped client upload tokens for Vercel
 * Blob (the browser uploads directly to Blob using the token this
 * returns — the file bytes never pass through this server).
 *
 * The client never gets a general-purpose token: every token this
 * route hands out is constrained by onBeforeGenerateToken to a specific
 * purpose, content-type allowlist, size limit and path prefix, decided
 * here on the server from the client's declared `purpose`, never from
 * anything else the client sends.
 */

const IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/heic", "image/webp"];
const LABEL_CONTENT_TYPES = [...IMAGE_CONTENT_TYPES, "application/pdf"];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

type UploadPurpose = "wizard" | "label";

function isUploadPurpose(value: unknown): value is UploadPurpose {
  return value === "wizard" || value === "label";
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let purpose: unknown;
        try {
          purpose = clientPayload ? JSON.parse(clientPayload).purpose : undefined;
        } catch {
          purpose = undefined;
        }

        if (!isUploadPurpose(purpose)) {
          throw new Error("clientPayload must be JSON with a 'purpose' of 'wizard' or 'label'");
        }

        if (purpose === "label") {
          // Return-label uploads are admin-only. requireAdmin() throws
          // UnauthorizedError when there is no admin session, which
          // aborts token generation — the caller never gets a token.
          await requireAdmin();

          if (!pathname.startsWith("labels/")) {
            throw new Error("Label uploads must be under the labels/ path prefix");
          }

          return {
            allowedContentTypes: LABEL_CONTENT_TYPES,
            maximumSizeInBytes: MAX_SIZE_BYTES,
            addRandomSuffix: true,
          };
        }

        // purpose === "wizard": public (any customer filling out the
        // order wizard), confined to the pending/ prefix so it can
        // never collide with, or be mistaken for, admin-uploaded labels.
        if (!pathname.startsWith("pending/")) {
          throw new Error("Wizard uploads must be under the pending/ path prefix");
        }

        return {
          allowedContentTypes: IMAGE_CONTENT_TYPES,
          maximumSizeInBytes: MAX_SIZE_BYTES,
          addRandomSuffix: true,
        };
      },
      onUploadCompleted: async () => {
        // Intentionally a no-op: nothing is persisted to the database
        // here. The wizard (TASK-018/020/022) and admin label upload
        // (TASK-033) Server Actions receive the resulting Blob URL from
        // the client afterwards and are responsible for validating it
        // with isVercelBlobUrl() (lib/blob.ts) before writing it down —
        // this route's only job is authorizing and shaping the upload.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload token request failed" },
      { status: 400 },
    );
  }
}
