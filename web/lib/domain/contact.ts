import { z } from "zod";

export const CONTACT_TOPICS = [
  "Local auto service",
  "Diagnostics",
  "Module / mail-in service",
  "Hybrid battery",
  "Key & immobilizer",
  "Other question",
] as const;
export const contactSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(100)
    .regex(/^[^\r\n]+$/),
  email: z.string().trim().email().max(254),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[0-9+() .-]*$/),
  topic: z.enum(CONTACT_TOPICS),
  message: z.string().trim().min(20).max(3000),
  website: z.string().max(200).optional(),
});
export type ContactState = { success: boolean; message: string };

type SearchValue = string | string[] | undefined;
const singleValue = (value: SearchValue) => (typeof value === "string" ? value : "");
export function parseDirectorySearch(input: {
  q?: SearchValue;
  make?: SearchValue;
  page?: SearchValue;
}) {
  const page = Number(singleValue(input.page) || "1");
  return {
    q: singleValue(input.q).trim().slice(0, 100),
    make: singleValue(input.make).trim().slice(0, 50),
    page: Number.isInteger(page) && page > 0 && page <= 1000 ? page : 1,
  };
}
