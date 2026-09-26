/**
 * What the customer should put in the inbound box. Shared by the public
 * tracking page and the printable slip (TASK-029). Pure — no Prisma.
 */

export function packingItems(input: {
  categoryName: string;
  partNumber: string | null;
  questionSetCode: string | null;
  originalPartNumber: string | null;
  donorPartNumber: string | null;
}): string[] {
  if (input.questionSetCode === "CLONING") {
    return [
      input.originalPartNumber
        ? `Your original module (part number ${input.originalPartNumber})`
        : "Your original module",
      input.donorPartNumber
        ? `The donor module (part number ${input.donorPartNumber})`
        : "The donor module",
    ];
  }

  const part = input.partNumber ? ` (part number ${input.partNumber})` : "";
  return [`The ${input.categoryName} module you're having serviced${part}`];
}

export function answerByCode(
  answers: { questionCode: string; answerValue: string }[],
  code: string,
): string | null {
  return answers.find((a) => a.questionCode === code)?.answerValue ?? null;
}
