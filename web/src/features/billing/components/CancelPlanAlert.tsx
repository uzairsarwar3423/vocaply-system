"use client";

import React from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { useCancelSubscription } from "../hooks/useCancelSubscription";
import { getCancelConsequenceCopy } from "../data/plan-features.config";
import type { PlanId } from "../types";

interface CancelPlanAlertProps {
  open: boolean;
  planId: PlanId;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * CancelPlanAlert — destructive confirmation flow (plan §4.8):
 * - Default-focused button is "Keep my plan" (the non-destructive option).
 *   Safety convention identical to Day 41's Disconnect flow.
 * - Body copy sourced from getCancelConsequenceCopy(plan) — auditable, central,
 *   cannot silently drift from backend behavior (plan §6.7).
 * - No animation beyond standard AlertDialog open — most serious action on the page;
 *   earns zero "flair," only clarity.
 */
export function CancelPlanAlert({ open, planId, onClose, onSuccess }: CancelPlanAlertProps) {
  const cancelMutation = useCancelSubscription();
  const isPending = cancelMutation.isPending;

  const handleConfirm = () => {
    cancelMutation.mutate(undefined, {
      onSuccess: () => {
        onSuccess();
      },
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={(val) => !val && onClose()}>
      <AlertDialogContent className="max-w-md font-sans select-none">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-heading font-semibold text-base text-foreground tracking-tight">
            Cancel your plan?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[13px] font-sans font-normal text-muted-foreground mt-2 leading-[20px]">
            {getCancelConsequenceCopy(planId)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="mt-4 gap-2">
          {/* Default focus: Keep my plan — the non-destructive option (plan §4.8) */}
          <AlertDialogCancel
            onClick={onClose}
            disabled={isPending}
            className="text-[13px] font-sans h-9"
            autoFocus
          >
            Keep my plan
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={isPending}
            className="text-[13px] font-sans h-9 bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isPending ? "Cancelling…" : "Cancel plan"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
