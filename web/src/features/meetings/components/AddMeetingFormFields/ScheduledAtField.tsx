"use client";

import React, { useRef, useEffect, useState } from "react";
import { useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { DuplicateUrlError } from "../DuplicateUrlError";
import { cn } from "@/lib/utils";
import { format, parse } from "date-fns";
import { Calendar as CalendarIcon, Clock, ChevronDown } from "lucide-react";

export function ScheduledAtField() {
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext();

  const [isDateOpen, setIsDateOpen] = useState(false);
  const [isTimeOpen, setIsTimeOpen] = useState(false);
  const [typedTimeText, setTypedTimeText] = useState("");

  const hourListRef = useRef<HTMLDivElement>(null);
  const minListRef = useRef<HTMLDivElement>(null);

  const activeHourRef = useRef<HTMLButtonElement>(null);
  const activeMinRef = useRef<HTMLButtonElement>(null);

  const timeInputRef = useRef<HTMLInputElement>(null);

  const scheduledDate = watch("scheduledDate") as string | undefined;
  const scheduledTime = watch("scheduledTime") as string | undefined;

  const dateError = errors.scheduledDate?.message as string | undefined;
  const timeError = errors.scheduledTime?.message as string | undefined;
  const errorMessage = dateError || timeError;

  // Generate hours (1-12)
  const hoursList = Array.from({ length: 12 }, (_, i) => i + 1);

  // Generate minutes (00-59)
  const minutesList = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

  // Parse date string (YYYY-MM-DD) into Date object
  const selectedDate = scheduledDate ? parse(scheduledDate, "yyyy-MM-dd", new Date()) : undefined;

  // Parse active hour, minute and period from scheduledTime ("HH:mm")
  const [hoursStr, minutesStr] = (scheduledTime || "12:00").split(":");
  const hoursNum = parseInt(hoursStr, 10) || 0;
  const currentMinStr = minutesStr || "00";

  const currentPeriod = hoursNum >= 12 ? "PM" : "AM";
  const currentHour = hoursNum % 12 === 0 ? 12 : hoursNum % 12;

  // Robust parsing of user-typed time string into HH:mm (24-hour format)
  const parseCustomTime = (inputStr: string): string | null => {
    const cleaned = inputStr.trim().toLowerCase();
    if (!cleaned) return null;

    // 1. 12-hour format with AM/PM (e.g. "09:01 PM", "9:1 am", "9:02pm", "12:05am")
    const ampmMatch = cleaned.match(/^(\d{1,2})[:.\s-]?(\d{2})?\s*(am|pm)$/);
    if (ampmMatch) {
      let hours = parseInt(ampmMatch[1], 10);
      const minutes = ampmMatch[2] ? parseInt(ampmMatch[2], 10) : 0;
      const period = ampmMatch[3];

      if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;

      if (period === "pm" && hours < 12) {
        hours += 12;
      } else if (period === "am" && hours === 12) {
        hours = 0;
      }

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    // 2. 24-hour format or general military time (e.g. "14:02", "9:01", "09.02")
    const militaryMatch = cleaned.match(/^(\d{1,2})[:.\s-](\d{2})$/);
    if (militaryMatch) {
      const hours = parseInt(militaryMatch[1], 10);
      const minutes = parseInt(militaryMatch[2], 10);

      if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

      return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    }

    // 3. Raw hour input (e.g. "9" -> "09:00", "13" -> "13:00")
    const rawHourMatch = cleaned.match(/^(\d{1,2})$/);
    if (rawHourMatch) {
      const hours = parseInt(rawHourMatch[1], 10);
      if (hours >= 0 && hours <= 23) {
        return `${String(hours).padStart(2, "0")}:00`;
      }
    }

    return null;
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setValue("scheduledDate", format(date, "yyyy-MM-dd"), {
        shouldDirty: true,
        shouldValidate: true,
      });
      setIsDateOpen(false);
    }
  };

  const updateTime = (hour: number, minute: number, period: string) => {
    let finalHour = hour;
    if (period === "PM" && hour < 12) {
      finalHour += 12;
    } else if (period === "AM" && hour === 12) {
      finalHour = 0;
    }

    const hourStr = String(finalHour).padStart(2, "0");
    const minStr = String(minute).padStart(2, "0");
    const val = `${hourStr}:${minStr}`;

    setValue("scheduledTime", val, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const handleHourSelect = (hour: number) => {
    updateTime(hour, parseInt(currentMinStr, 10), currentPeriod);
  };

  const handleMinSelect = (min: number) => {
    updateTime(currentHour, min, currentPeriod);
  };

  const handlePeriodSelect = (period: string) => {
    updateTime(currentHour, parseInt(currentMinStr, 10), period);
  };

  // Get formatted date label
  const getFormattedDateDisplay = () => {
    if (!scheduledDate) return "Select date";
    try {
      const dateObj = parse(scheduledDate, "yyyy-MM-dd", new Date());
      return format(dateObj, "PPP"); // e.g. "June 28, 2026"
    } catch {
      return "Select date";
    }
  };

  // Get formatted time label
  const getFormattedTimeDisplay = (timeVal = scheduledTime) => {
    if (!timeVal) return "Select time";
    try {
      const [hours, minutes] = timeVal.split(":").map(Number);
      const tempDate = new Date();
      tempDate.setHours(hours, minutes);
      return format(tempDate, "hh:mm a"); // e.g. "08:30 PM"
    } catch {
      return "Select time";
    }
  };

  // Sync scheduledTime changes to text input state
  useEffect(() => {
    if (scheduledTime) {
      setTypedTimeText(getFormattedTimeDisplay(scheduledTime));
    }
  }, [scheduledTime]);

  const handleTimeInputFocus = () => {
    setIsTimeOpen(true);
    // Micro-interaction: Select the input text so user can type over it immediately
    setTimeout(() => {
      timeInputRef.current?.select();
    }, 50);
  };

  const handleTimeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTypedTimeText(val);

    // Dynamic parsing as they type: if they enter a fully valid format, update form context state
    const parsed = parseCustomTime(val);
    if (parsed) {
      setValue("scheduledTime", parsed, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  const handleTimeInputBlur = () => {
    const parsed = parseCustomTime(typedTimeText);
    if (parsed) {
      setValue("scheduledTime", parsed, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setTypedTimeText(getFormattedTimeDisplay(parsed));
    } else {
      // Revert to original valid time if input is garbage
      setTypedTimeText(getFormattedTimeDisplay(scheduledTime));
    }
  };

  const handleTimeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      timeInputRef.current?.blur();
      setIsTimeOpen(false);
    }
  };

  // Micro-interaction: Auto-scroll Hour and Minute lists to center when opened
  useEffect(() => {
    if (isTimeOpen) {
      const timer = setTimeout(() => {
        activeHourRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
        activeMinRef.current?.scrollIntoView({ block: "center", behavior: "auto" });
      }, 80);
      return () => clearTimeout(timer);
    }
  }, [isTimeOpen]);

  return (
    <div className="flex flex-col gap-1.5 w-full font-sans">
      <Label className="text-xs font-semibold text-muted uppercase tracking-wider select-none">
        Scheduled Date & Time
      </Label>

      {/* Hidden inputs to keep react-hook-form registration bound */}
      <input type="hidden" {...register("scheduledDate")} />
      <input type="hidden" {...register("scheduledTime")} />

      <div className="flex gap-2">
        {/* Date Selector */}
        <Popover open={isDateOpen} onOpenChange={setIsDateOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "w-[60%] flex h-10 items-center justify-between rounded-lg border bg-card px-3 text-sm text-foreground shadow-xs transition-all duration-120 hover:bg-zinc-50 dark:hover:bg-zinc-900 cursor-pointer focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10",
                dateError ? "border-red-500 focus:ring-red-500/10" : "border-zinc-200 dark:border-zinc-800"
              )}
            >
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground/80 shrink-0" />
                <span className="font-medium text-xs select-none">
                  {getFormattedDateDisplay()}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground/60 shrink-0" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            disablePortal={true}
            className="w-auto p-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-lg rounded-xl z-[150]"
          >
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={handleDateSelect}
              className="p-0 border-0"
            />
          </PopoverContent>
        </Popover>

        {/* Time Selector - Editable Combobox Input */}
        <Popover open={isTimeOpen} onOpenChange={setIsTimeOpen}>
          <PopoverTrigger asChild>
            <div
              className={cn(
                "w-[40%] flex h-10 items-center justify-between rounded-lg border bg-card px-3 shadow-xs transition-all duration-120 hover:bg-zinc-50 dark:hover:bg-zinc-900 focus-within:ring-2 focus-within:ring-zinc-900/10 dark:focus-within:ring-zinc-100/10",
                timeError ? "border-red-500 focus-within:ring-red-500/10" : "border-zinc-200 dark:border-zinc-800"
              )}
            >
              <div className="flex items-center gap-2 w-full">
                <Clock className="h-4 w-4 text-muted-foreground/80 shrink-0" />
                <input
                  ref={timeInputRef}
                  type="text"
                  value={typedTimeText}
                  onFocus={handleTimeInputFocus}
                  onChange={handleTimeInputChange}
                  onBlur={handleTimeInputBlur}
                  onKeyDown={handleTimeInputKeyDown}
                  placeholder="Select time"
                  className="w-full bg-transparent border-none outline-none text-xs font-medium text-foreground focus:ring-0 p-0"
                />
              </div>
              <ChevronDown
                className="h-4 w-4 text-muted-foreground/60 shrink-0 cursor-pointer"
                onClick={() => setIsTimeOpen(!isTimeOpen)}
              />
            </div>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={6}
            disablePortal={true}
            className="w-48 p-3 bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-lg rounded-xl z-[150] flex flex-col gap-2.5"
          >
            {/* Display header */}
            <div className="text-center py-1.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg text-xs font-semibold border border-zinc-100 dark:border-zinc-900 font-mono text-zinc-800 dark:text-zinc-200 select-none">
              {getFormattedTimeDisplay()}
            </div>

            {/* Column Headers */}
            <div className="flex items-center justify-center gap-1.5 text-[9px] font-bold text-muted-foreground/80 uppercase tracking-wider select-none px-1">
              <div className="flex-1 text-center">Hour</div>
              <div className="w-2 shrink-0"></div>
              <div className="flex-1 text-center">Min</div>
            </div>

            {/* Scroll lists container */}
            <div className="flex items-center justify-center gap-1.5 h-[150px] select-none border-b border-zinc-100 dark:border-zinc-900 pb-2.5">
              {/* Hours Column */}
              <div
                ref={hourListRef}
                className="flex-1 flex flex-col overflow-y-auto h-full scrollbar-none py-16 scroll-py-16"
              >
                {hoursList.map((hour) => {
                  const isActive = hour === currentHour;
                  return (
                    <button
                      key={hour}
                      ref={isActive ? activeHourRef : null}
                      type="button"
                      onClick={() => handleHourSelect(hour)}
                      className={cn(
                        "w-full text-center py-1 rounded-md text-xs transition-all duration-100 font-medium cursor-pointer shrink-0",
                        isActive
                          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 font-semibold"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {hour}
                    </button>
                  );
                })}
              </div>

              <span className="text-zinc-300 dark:text-zinc-700 font-semibold text-xs select-none shrink-0">:</span>

              {/* Minutes Column */}
              <div
                ref={minListRef}
                className="flex-1 flex flex-col overflow-y-auto h-full scrollbar-none py-16 scroll-py-16"
              >
                {minutesList.map((minStr) => {
                  const min = parseInt(minStr, 10);
                  const isActive = minStr === currentMinStr;
                  return (
                    <button
                      key={minStr}
                      ref={isActive ? activeMinRef : null}
                      type="button"
                      onClick={() => handleMinSelect(min)}
                      className={cn(
                        "w-full text-center py-1 rounded-md text-xs transition-all duration-100 font-medium cursor-pointer shrink-0",
                        isActive
                          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-50 dark:text-zinc-900 font-semibold"
                          : "hover:bg-zinc-100 dark:hover:bg-zinc-900 text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {minStr}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* AM/PM Segmented Control */}
            <div className="grid grid-cols-2 gap-1 bg-zinc-50 dark:bg-zinc-900 p-0.5 rounded-lg border border-zinc-100 dark:border-zinc-900">
              <button
                type="button"
                onClick={() => handlePeriodSelect("AM")}
                className={cn(
                  "py-1 text-center text-xs font-semibold rounded-md transition-all cursor-pointer",
                  currentPeriod === "AM"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                AM
              </button>
              <button
                type="button"
                onClick={() => handlePeriodSelect("PM")}
                className={cn(
                  "py-1 text-center text-xs font-semibold rounded-md transition-all cursor-pointer",
                  currentPeriod === "PM"
                    ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-50 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                PM
              </button>
            </div>

            {/* Done Action Button */}
            <button
              type="button"
              onClick={() => setIsTimeOpen(false)}
              className="w-full h-8 text-xs font-semibold bg-zinc-900 text-zinc-50 hover:bg-zinc-900/90 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-50/90 rounded-lg transition-all duration-100 cursor-pointer shadow-xs mt-1"
            >
              Done
            </button>
          </PopoverContent>
        </Popover>
      </div>

      {errorMessage && <DuplicateUrlError message={errorMessage} />}
    </div>
  );
}
