'use client';

import { CheckCircle, AlertCircle, XCircle, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ConfidenceBadgeProps {
  confidence: number;
  edited?: boolean;
  className?: string;
}

export function ConfidenceBadge({ confidence, edited = false, className }: ConfidenceBadgeProps) {
  if (edited) {
    return (
      <span
        title="Editado manualmente"
        className={cn('inline-flex items-center text-blue-500', className)}
      >
        <PenLine className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (confidence >= 85) {
    return (
      <span
        title={`Alta confianza (${confidence}%)`}
        className={cn('inline-flex items-center text-green-600', className)}
      >
        <CheckCircle className="h-3.5 w-3.5" />
      </span>
    );
  }

  if (confidence >= 70) {
    return (
      <span
        title={`Verificar este campo (${confidence}%)`}
        className={cn('inline-flex items-center text-amber-500', className)}
      >
        <AlertCircle className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <span
      title={`Confianza baja, revisar manualmente (${confidence}%)`}
      className={cn('inline-flex items-center text-red-600', className)}
    >
      <XCircle className="h-3.5 w-3.5" />
    </span>
  );
}
