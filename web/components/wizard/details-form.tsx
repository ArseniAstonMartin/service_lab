"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DynamicQuestion } from "@/components/wizard/dynamic-question";
import { useWizard } from "@/components/wizard/wizard-store";
import { useStepGuard } from "@/components/wizard/use-step-guard";
import { getQuestions, type QuestionSummary } from "@/lib/actions/questions";

/**
 * /order/details: the always-required description, plus the
 * data-driven question set for the selected service (TASK-020).
 *
 * The pending-review path (state.serviceId is null — the compatibility
 * step routed here directly because nothing matched) shows only the
 * description, per the acceptance criteria: there is no service yet to
 * drive any questions off of.
 */
export function DetailsForm() {
  const router = useRouter();
  const { state, update } = useWizard();
  // Redirects to /order/compatibility (no check run yet) or
  // /order/service (matched but no service chosen yet) — TASK-024.
  const ready = useStepGuard("details");

  const serviceId = state.serviceId;
  const isMatchedPath = Boolean(serviceId);

  const [description, setDescription] = useState(state.description);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const [questions, setQuestions] = useState<QuestionSummary[]>([]);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(isMatchedPath);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Seed the answer map from whatever the wizard already has (text and
  // photo answers share one map here; they're split back apart on
  // submit based on each question's answerType).
  const [values, setValues] = useState<Record<string, string>>({
    ...state.answers,
    ...state.photoAnswers,
  });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!serviceId) return;

    setIsLoadingQuestions(true);
    setLoadError(null);

    getQuestions(serviceId)
      .then(setQuestions)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load questions."))
      .finally(() => setIsLoadingQuestions(false));
  }, [serviceId]);

  function handleValueChange(questionCode: string, next: string) {
    setValues((prev) => ({ ...prev, [questionCode]: next }));
    setFieldErrors((prev) => {
      if (!prev[questionCode]) return prev;
      const { [questionCode]: _removed, ...rest } = prev;
      return rest;
    });
  }

  function handleNext() {
    const trimmedDescription = description.trim();
    if (!trimmedDescription) {
      setDescriptionError("Please describe what's needed and what happened to the module.");
      return;
    }
    setDescriptionError(null);

    const errors: Record<string, string> = {};
    for (const question of questions) {
      if (question.required && !(values[question.questionCode] ?? "").trim()) {
        errors[question.questionCode] = "This is required.";
      }
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const answers: Record<string, string> = {};
    const photoAnswers: Record<string, string> = {};
    for (const question of questions) {
      const value = values[question.questionCode];
      if (!value) continue;
      if (question.answerType === "photo") {
        photoAnswers[question.questionCode] = value;
      } else {
        answers[question.questionCode] = value;
      }
    }

    update({ description: trimmedDescription, answers, photoAnswers });
    router.push("/order/shipping");
  }

  const canContinue = !isLoadingQuestions;

  if (!ready) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="description">
          Describe what's needed and what happened to the module
          <span className="text-destructive"> *</span>
        </Label>
        <Textarea
          id="description"
          rows={4}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value);
            if (descriptionError) setDescriptionError(null);
          }}
        />
        {descriptionError ? <p className="text-xs text-destructive">{descriptionError}</p> : null}
      </div>

      {isMatchedPath ? (
        isLoadingQuestions ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading questions...
          </div>
        ) : loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : (
          <div className="space-y-5">
            {questions.map((question) => (
              <DynamicQuestion
                key={question.questionCode}
                question={question}
                value={values[question.questionCode] ?? ""}
                onChange={(next) => handleValueChange(question.questionCode, next)}
                error={fieldErrors[question.questionCode]}
              />
            ))}
          </div>
        )
      ) : null}

      <Button type="button" className="w-full" disabled={!canContinue} onClick={handleNext}>
        Next
      </Button>
    </div>
  );
}
