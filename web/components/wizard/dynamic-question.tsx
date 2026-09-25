"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileUpload } from "@/components/wizard/file-upload";
import type { QuestionSummary } from "@/lib/actions/questions";

type DynamicQuestionProps = {
  question: QuestionSummary;
  /** The current answer as a plain string — a Blob URL for `photo`
   * questions, the raw text/choice otherwise. Empty string = unanswered. */
  value: string;
  onChange: (value: string) => void;
  error?: string;
};

/**
 * Renders one data-driven question from getQuestions() (TASK-020),
 * covering all 4 QuestionAnswerType values so no page ever needs its
 * own per-question markup. `photo` reuses TASK-018's FileUpload
 * (purpose "wizard"), the same component used for the compatibility
 * step's sticker photo — cloning's original/donor photos are just two
 * more instances of this same question type, not special-cased.
 */
export function DynamicQuestion({ question, value, onChange, error }: DynamicQuestionProps) {
  const inputId = `question-${question.questionCode}`;

  return (
    <div className="space-y-2">
      <Label htmlFor={inputId}>
        {question.label}
        {question.required ? <span className="text-destructive"> *</span> : null}
      </Label>

      {question.answerType === "text" ? (
        <Input id={inputId} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : null}

      {question.answerType === "textarea" ? (
        <Textarea id={inputId} value={value} onChange={(event) => onChange(event.target.value)} />
      ) : null}

      {question.answerType === "yes_no" ? (
        <div className="flex gap-2" role="radiogroup" aria-label={question.label}>
          {(["yes", "no"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              variant={value === option ? "default" : "outline"}
              size="sm"
              aria-pressed={value === option}
              onClick={() => onChange(option)}
            >
              {option === "yes" ? "Yes" : "No"}
            </Button>
          ))}
        </div>
      ) : null}

      {question.answerType === "photo" ? (
        <FileUpload
          value={value || null}
          onChange={(url) => onChange(url ?? "")}
          purpose="wizard"
          pathPrefix="pending/answers"
        />
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
