"use client";

import React, { useState, useRef, useEffect } from "react";

interface OnboardingSkipConfirmProps {
  onConfirm: () => void;
}

export function OnboardingSkipConfirm({ onConfirm }: OnboardingSkipConfirmProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const skipBtnRef = useRef<HTMLButtonElement>(null);
  const yesBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isConfirming && yesBtnRef.current) {
      yesBtnRef.current.focus();
    }
  }, [isConfirming]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setIsConfirming(false);
      setTimeout(() => {
        skipBtnRef.current?.focus();
      }, 0);
    }
  };

  const handleCancel = () => {
    setIsConfirming(false);
    setTimeout(() => {
      skipBtnRef.current?.focus();
    }, 0);
  };

  if (isConfirming) {
    return (
      <div
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1.5 text-xs font-sans text-muted-foreground select-none h-9"
      >
        <span>Skip?</span>
        <button
          type="button"
          ref={yesBtnRef}
          onClick={onConfirm}
          className="text-foreground hover:underline font-medium focus-visible:outline-none focus-visible:underline px-1 py-0.5 rounded"
        >
          Yes
        </button>
        <span className="opacity-30">/</span>
        <button
          type="button"
          onClick={handleCancel}
          className="text-muted-foreground hover:text-foreground hover:underline font-medium focus-visible:outline-none focus-visible:underline px-1 py-0.5 rounded"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      ref={skipBtnRef}
      onClick={() => setIsConfirming(true)}
      className="text-xs font-sans text-muted-foreground hover:text-foreground hover:underline font-medium transition-all focus-visible:outline-none focus-visible:underline h-9"
    >
      Skip this step
    </button>
  );
}
