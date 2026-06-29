import { useState } from "react";
import { useOnboarding } from "./useOnboarding";

export const useInviteTeamStep = (onSuccess: () => void) => {
  const { inviteMembers, isInviting } = useOnboarding();

  const [emails, setEmails] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [role, setRole] = useState<"MEMBER" | "MANAGER" | "ADMIN">("MEMBER");
  const [error, setError] = useState<string | null>(null);
  const [isLastChipHighlighted, setIsLastChipHighlighted] = useState(false);
  const [inviteResults, setInviteResults] = useState<{
    invited: string[];
    alreadyMember: string[];
    alreadyInvited: string[];
    failed: string[];
  } | null>(null);

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const addEmail = (emailStr: string) => {
    const trimmed = emailStr.trim().replace(/,$/, "");
    if (!trimmed) return;

    if (emails.length >= 20) return;

    if (emails.includes(trimmed)) {
      setInputValue("");
      return;
    }

    setEmails([...emails, trimmed]);
    setInputValue("");
    setIsLastChipHighlighted(false);
    setError(null);
  };

  const removeEmail = (index: number) => {
    setEmails(emails.filter((_, i) => i !== index));
    setIsLastChipHighlighted(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addEmail(inputValue);
    } else if (e.key === "Backspace" && !inputValue) {
      if (isLastChipHighlighted) {
        removeEmail(emails.length - 1);
      } else if (emails.length > 0) {
        setIsLastChipHighlighted(true);
      }
    } else {
      setIsLastChipHighlighted(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    let finalEmails = [...emails];
    if (inputValue.trim()) {
      const trimmed = inputValue.trim().replace(/,$/, "");
      if (trimmed && !emails.includes(trimmed)) {
        finalEmails.push(trimmed);
      }
    }

    if (finalEmails.length === 0) {
      setError("Please add at least one email invite or skip.");
      return;
    }

    const hasInvalid = finalEmails.some((email) => !EMAIL_REGEX.test(email));
    if (hasInvalid) {
      setError("Please remove or fix invalid email addresses.");
      return;
    }

    try {
      const results = await inviteMembers({ emails: finalEmails, role });
      setInviteResults(results);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || "Failed to send invites.");
    }
  };

  return {
    emails,
    inputValue,
    setInputValue: (val: string) => {
      setInputValue(val);
      setIsLastChipHighlighted(false);
    },
    role,
    setRole,
    error,
    isLastChipHighlighted,
    inviteResults,
    isInviting,
    removeEmail,
    handleKeyDown,
    handleSubmit,
    isValidEmail: (email: string) => EMAIL_REGEX.test(email),
  };
};
