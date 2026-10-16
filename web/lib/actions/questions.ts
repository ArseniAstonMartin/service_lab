"use server";

import "server-only";
import { z } from "zod";
import type { QuestionAnswerType } from "@prisma/client";
import { prisma } from "@/lib/db";

export type QuestionSummary = {
  questionCode: string;
  label: string;
  answerType: QuestionAnswerType;
  required: boolean;
};

const getQuestionsSchema = z.object({
  serviceId: z.string().min(1),
});

/**
 * Returns the dynamic question set for a selected service (PRD 4.4):
 * the service's own question set (by Service.questionSetCode), followed
 * by the FOLLOW_UP set — except for a service whose category has
 * requiresPartNumber false (Vehicle Diagnostics), where FOLLOW_UP's
 * "after this module is reinstalled" questions don't apply at all: that
 * category doesn't have a module going back into the vehicle to ask
 * about. Excluded the same way a service whose OWN questionSetCode
 * already *is* "FOLLOW_UP" is excluded below (there is none today).
 *
 * Schema note: nothing on Service records whether that specific service
 * "requires follow-up work after reinstalling the module" (PRD 4.4) —
 * there's no per-service flag for it, only the one questionSetCode a
 * service already has. Rather than hardcode a category/name-based guess
 * here (which tasks.json's "data-driven, not hardcoded per page"
 * requirement is aimed at avoiding), FOLLOW_UP is appended for every
 * other service query, since every other service in the seed data ends
 * with the module going back into the customer's vehicle.
 */
export async function getQuestions(serviceId: string): Promise<QuestionSummary[]> {
  const parsed = getQuestionsSchema.parse({ serviceId });

  let id: bigint;
  try {
    id = BigInt(parsed.serviceId);
  } catch {
    throw new Error("Invalid serviceId");
  }

  const service = await prisma.service.findUnique({
    where: { id },
    include: { category: true },
  });
  if (!service) {
    throw new Error("Service not found");
  }

  const ownQuestions = await prisma.questionDefinition.findMany({
    where: { questionSetCode: service.questionSetCode },
    orderBy: { sortOrder: "asc" },
  });

  const followUpQuestions =
    service.questionSetCode === "FOLLOW_UP" || !service.category.requiresPartNumber
      ? []
      : await prisma.questionDefinition.findMany({
          where: { questionSetCode: "FOLLOW_UP" },
          orderBy: { sortOrder: "asc" },
        });

  return [...ownQuestions, ...followUpQuestions].map((q) => ({
    questionCode: q.questionCode,
    label: q.label,
    answerType: q.answerType,
    required: q.required,
  }));
}
