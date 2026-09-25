"use server";

import { prisma } from "@/lib/db";

/**
 * A module category as offered on /order/module. `id` is stringified
 * here because ModuleCategory.id is a Prisma BigInt, which Next.js
 * cannot serialize across the Server Component -> Client Component
 * boundary (or store as-is in wizard state / sessionStorage as JSON).
 */
export type ModuleCategoryOption = {
  id: string;
  name: string;
};

export async function getModuleCategories(): Promise<ModuleCategoryOption[]> {
  const rows = await prisma.moduleCategory.findMany({
    orderBy: { name: "asc" },
  });

  return rows.map((row) => ({ id: row.id.toString(), name: row.name }));
}
