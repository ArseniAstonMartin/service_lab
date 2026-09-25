import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Global-cached Prisma Client singleton.
 *
 * Next.js dev mode hot-reloads modules on every file save, which would
 * otherwise create a new PrismaClient (and a new DB connection pool) each
 * time. Caching the instance on `globalThis` survives the reload; in
 * production each server instance still gets exactly one client.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
