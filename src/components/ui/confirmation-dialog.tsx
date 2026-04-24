"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle, Trash2, AlertCircle } from "lucide-react";

type ConfirmationVariant = "danger" | "warning" | "info";

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmationVariant;
  onConfirm: () => void;
  loading?: boolean;
}

const variantConfig = {
  danger: { icon: Trash2, color: "text-destructive", bg: "bg-destructive/10", buttonVariant: "destructive" as const },
  warning: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-100", buttonVariant: "default" as const },
  info: { icon: AlertCircle, color: "text-blue-600", bg: "bg-blue-100", buttonVariant: "default" as const },
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  onConfirm,
  loading = false,
}: ConfirmationDialogProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${config.bg}`}>
              <Icon className={`h-5 w-5 ${config.color}`} />
            </div>
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={config.buttonVariant} onClick={onConfirm} disabled={loading}>
            {loading ? "Processing..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useConfirmation() {
  const [state, setState] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: ConfirmationVariant;
    confirmLabel: string;
    onConfirm: () => void;
  }>({
    open: false,
    title: "",
    description: "",
    variant: "danger",
    confirmLabel: "Confirm",
    onConfirm: () => {},
  });

  const confirm = (options: {
    title: string;
    description: string;
    variant?: ConfirmationVariant;
    confirmLabel?: string;
    onConfirm: () => void;
  }) => {
    setState({
      open: true,
      title: options.title,
      description: options.description,
      variant: options.variant || "danger",
      confirmLabel: options.confirmLabel || "Confirm",
      onConfirm: options.onConfirm,
    });
  };

  const close = () => setState((prev) => ({ ...prev, open: false }));

  return { state, confirm, close };
}
