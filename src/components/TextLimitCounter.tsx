import React from "react";

export function TextLimitCounter({ value, limit, label = "characters" }: { value: any; limit: number; label?: string }) {
  const used = String(value || "").length;
  const remaining = Math.max(0, Number(limit || 0) - used);
  const nearLimit = limit > 0 && remaining <= Math.max(20, Math.floor(limit * 0.1));
  return (
    <p className={`text-[10px] font-bold ${nearLimit ? "text-amber-600 dark:text-amber-300" : "text-gray-400 dark:text-neutral-500"}`}>
      {used} / {limit} {label}. Remaining: {remaining}
    </p>
  );
}
