"use client";

import React, { useState, useEffect, useRef } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { TitleField } from "./AddMeetingFormFields/TitleField";
import { MeetingUrlField } from "./AddMeetingFormFields/MeetingUrlField";
import { PlatformField } from "./AddMeetingFormFields/PlatformField";
import { ScheduledAtField } from "./AddMeetingFormFields/ScheduledAtField";
import { PlanLimitBanner } from "./PlanLimitBanner";
import { useCreateMeeting } from "../hooks/useCreateMeeting";
import { detectPlatformAndId } from "../hooks/usePlatformDetect";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const addMeetingSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    platform: z.enum(["ZOOM", "GOOGLE_MEET", "TEAMS", "WEBEX", "MANUAL"]),
    meetingUrl: z
      .string()
      .trim()
      .min(1, "Meeting URL is required")
      .refine(
        (val) => {
          try {
            new URL(val.startsWith("http") ? val : `https://${val}`);
            return true;
          } catch {
            return false;
          }
        },
        { message: "Provide a valid URL" }
      ),
    scheduledDate: z.string().min(1, "Date is required"),
    scheduledTime: z.string().min(1, "Time is required"),
  })
  .superRefine((data, ctx) => {
    if (data.scheduledDate && data.scheduledTime) {
      const combinedStr = `${data.scheduledDate}T${data.scheduledTime}`;
      const scheduledDate = new Date(combinedStr);
      if (isNaN(scheduledDate.getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid date or time",
          path: ["scheduledDate"],
        });
      } else if (scheduledDate.getTime() < Date.now()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Must be in the future",
          path: ["scheduledDate"],
        });
      }
    }
  });

type FormValues = z.infer<typeof addMeetingSchema>;

interface AddMeetingFormProps {
  onSuccess: (meeting: any) => void;
  onPlanLimitHit: () => void;
  onCancel: () => void;
}

export function AddMeetingForm({ onSuccess, onPlanLimitHit, onCancel }: AddMeetingFormProps) {
  const [hasPlanLimit, setHasPlanLimit] = useState(false);
  const [isConfirmingDiscard, setIsConfirmingDiscard] = useState(false);
  const discardTimerRef = useRef<NodeJS.Timeout | null>(null);

  const createMutation = useCreateMeeting();

  const methods = useForm<FormValues>({
    resolver: zodResolver(addMeetingSchema),
    defaultValues: {
      title: "",
      platform: "MANUAL",
      meetingUrl: "",
      scheduledDate: format(new Date(), "yyyy-MM-dd"),
      scheduledTime: (() => {
        const now = new Date();
        const minutes = now.getMinutes();
        const nextHalfHour = new Date(now);
        if (minutes < 30) {
          nextHalfHour.setMinutes(30, 0, 0);
        } else {
          nextHalfHour.setHours(now.getHours() + 1, 0, 0, 0);
        }
        return format(nextHalfHour, "HH:mm");
      })(),
    },
  });

  const {
    handleSubmit,
    setError,
    formState: { isSubmitting, isDirty },
    setValue,
  } = methods;

  useEffect(() => {
    return () => {
      if (discardTimerRef.current) {
        clearTimeout(discardTimerRef.current);
      }
    };
  }, []);

  const handleCancelClick = () => {
    if (isDirty) {
      if (isConfirmingDiscard) {
        onCancel();
      } else {
        setIsConfirmingDiscard(true);
        discardTimerRef.current = setTimeout(() => {
          setIsConfirmingDiscard(false);
        }, 4000);
      }
    } else {
      onCancel();
    }
  };

  const handleKeepEditing = () => {
    if (discardTimerRef.current) {
      clearTimeout(discardTimerRef.current);
    }
    setIsConfirmingDiscard(false);
  };

  const onSubmit = async (values: FormValues) => {
    const currentUrl = values.meetingUrl;
    const detected = detectPlatformAndId(currentUrl);
    let finalPlatform = values.platform;
    if (detected.platform && detected.platform !== values.platform) {
      finalPlatform = detected.platform;
      setValue("platform", finalPlatform);
    }

    const scheduledAt = new Date(`${values.scheduledDate}T${values.scheduledTime}`).toISOString();

    createMutation.mutate(
      {
        title: values.title,
        platform: finalPlatform,
        meetingUrl: values.meetingUrl,
        scheduledAt,
      },
      {
        onSuccess: (data) => {
          toast.success("Meeting scheduled successfully");
          onSuccess(data);
        },
        onError: (error: any) => {
          const status = error?.response?.status;
          if (status === 402) {
            setHasPlanLimit(true);
            onPlanLimitHit();
          } else if (status === 409) {
            setError("meetingUrl", {
              type: "server",
              message: "This meeting URL is already scheduled",
            });
          } else {
            toast.error("Couldn't schedule meeting — try again");
          }
        },
      }
    );
  };

  const isPending = isSubmitting || createMutation.isPending;

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col flex-1 justify-between h-full">
        <div className="flex-1 flex flex-col">
          {hasPlanLimit && (
            <PlanLimitBanner
              onUpgradeClick={() => {
                window.location.href = "/pricing";
              }}
            />
          )}

          <div className="flex flex-col gap-5">
            <TitleField />
            <MeetingUrlField />
            <PlatformField />
            <ScheduledAtField />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-zinc-950 border-t border-border pt-4 mt-6 flex items-center justify-between h-16 shrink-0">
          <div className="text-3xs text-muted-foreground font-mono">
            Esc to cancel
          </div>
          
          <div className="flex items-center gap-2">
            {isConfirmingDiscard ? (
              <div className="flex items-center gap-1.5 animate-in fade-in-0 duration-120">
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  className="h-9 text-xs bg-red-600 hover:bg-red-700 text-white cursor-pointer px-3"
                  onClick={onCancel}
                >
                  Discard
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 text-xs cursor-pointer px-3"
                  onClick={handleKeepEditing}
                >
                  Keep editing
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="h-9 text-xs bg-white dark:bg-zinc-900 border border-border cursor-pointer"
                onClick={handleCancelClick}
                disabled={isPending}
              >
                Cancel
              </Button>
            )}

            {!isConfirmingDiscard && (
              <Button
                type="submit"
                className={cn(
                  "h-9 text-xs bg-black text-white hover:bg-black/90 dark:bg-white dark:text-black dark:hover:bg-white/90 font-medium cursor-pointer px-4",
                  isPending && "opacity-70 cursor-not-allowed"
                )}
                disabled={isPending || hasPlanLimit}
              >
                {isPending && (
                  <span
                    className="h-3 w-3 border-2 border-current border-t-transparent rounded-full mr-1.5 animate-spin"
                    style={{ animationDuration: "500ms" }}
                  />
                )}
                {isPending ? "Scheduling..." : "Schedule meeting"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
