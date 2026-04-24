"use client";

import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface SortHeaderProps {
  label: string;
  field: string;
  currentSort: string;
  currentDirection: "asc" | "desc";
  onSort: (field: string) => void;
}

export function SortHeader({ label, field, currentSort, currentDirection, onSort }: SortHeaderProps) {
  const isActive = currentSort === field;
  return (
    <button
      className={cn(
        "flex items-center gap-1 hover:text-foreground transition-colors font-medium",
        isActive ? "text-foreground" : "text-muted-foreground"
      )}
      onClick={() => onSort(field)}
    >
      {label}
      {isActive ? (
        currentDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
      ) : (
        <ArrowUpDown className="h-3 w-3 opacity-50" />
      )}
    </button>
  );
}
