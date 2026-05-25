"use client";

import { cn } from "@/lib/utils";

interface ConfidenceFieldProps {
  label: string;
  value: string | number;
  confidence: number;
  onChange?: (value: string) => void;
  editable?: boolean;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const cls =
    confidence >= 90
      ? "bg-green-100 text-green-700"
      : confidence >= 70
        ? "bg-yellow-100 text-yellow-700"
        : "bg-red-100 text-red-700";

  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", cls)}>
      {confidence}% confianza
    </span>
  );
}

export function ConfidenceField({
  label,
  value,
  confidence,
  onChange,
  editable = false,
}: ConfidenceFieldProps) {
  const borderColor =
    confidence >= 90
      ? "border-green-500"
      : confidence >= 70
        ? "border-yellow-500"
        : "border-red-500";

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <ConfidenceBadge confidence={confidence} />
      </div>
      <input
        type="text"
        value={String(value)}
        onChange={(e) => onChange?.(e.target.value)}
        readOnly={!editable}
        className={cn(
          "w-full rounded-md border-2 bg-background px-3 py-2 text-sm transition-colors focus:outline-none",
          borderColor,
          confidence < 70 && "bg-red-50",
          editable
            ? "focus:ring-2 focus:ring-ring focus:ring-offset-1"
            : "cursor-default select-text opacity-80"
        )}
      />
    </div>
  );
}
