import { useState, useEffect } from "react";
import { useOnboarding } from "./useOnboarding";
import { useAuth } from "@/features/auth/hooks/useAuth";

export type SlugStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export const useCreateTeamStep = (onSuccess: () => void) => {
  const { createTeam, updateTeam, checkSlug } = useOnboarding();
  const { user } = useAuth();

  const [name, setName] = useState(user?.team?.name || "");
  const [slug, setSlug] = useState("");
  const [slugStatus, setSlugStatus] = useState<SlugStatus>("idle");
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);

  const hasTeam = !!user?.teamId;

  // Sync with user team name once loaded
  useEffect(() => {
    if (user?.team?.name && !name) {
      setName(user.team.name);
    }
  }, [user?.team?.name]);

  // Format slug automatically from team name
  const handleNameChange = (val: string) => {
    setName(val);
    if (slugStatus === "idle" || slug === "") {
      const generatedSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setSlug(generatedSlug);
    }
  };

  // Debounced check for slug availability
  useEffect(() => {
    if (!slug) {
      setSlugStatus("idle");
      setSuggestion(null);
      setIsCheckingSlug(false);
      return;
    }

    const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
    if (!SLUG_REGEX.test(slug)) {
      setSlugStatus("invalid");
      setSuggestion(null);
      setIsCheckingSlug(false);
      return;
    }

    setIsCheckingSlug(true);
    setSlugStatus("checking");

    const delayDebounce = setTimeout(async () => {
      try {
        const res = await checkSlug(slug);
        if (res.available) {
          setSlugStatus("available");
          setSuggestion(null);
        } else {
          setSlugStatus("taken");
          setSuggestion(res.suggestion || null);
        }
      } catch (err) {
        setSlugStatus("idle");
      } finally {
        setIsCheckingSlug(false);
      }
    }, 350);

    return () => clearTimeout(delayDebounce);
  }, [slug, checkSlug]);

  const acceptSuggestion = (suggested: string) => {
    setSlug(suggested);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Team name is required");
      return;
    }

    if (!slug.trim()) {
      setError("Workspace URL Slug is required");
      return;
    }

    if (slugStatus === "invalid") {
      setError("URL must be alphanumeric with hyphens only.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (hasTeam) {
        await updateTeam({
          name: name.trim(),
          ...(slug && slugStatus === "available" ? { slug: slug.trim() } : {}),
        });
      } else {
        await createTeam({ name: name.trim(), slug: slug.trim() });
      }
      onSuccess();
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      if (errorData?.code === "DUPLICATE" && errorData?.details?.field === "slug") {
        // Intercept race condition and suggest alternative silently
        setSlugStatus("taken");
        setSuggestion(errorData.details.suggestion || `${slug}-1`);
      } else {
        setError(errorData?.message || "Failed to save team workspace.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    name,
    setName: handleNameChange,
    slug,
    setSlug: (val: string) => setSlug(val.toLowerCase().trim()),
    slugStatus,
    suggestion,
    error,
    isSubmitting,
    isCheckingSlug,
    hasTeam,
    acceptSuggestion,
    handleSubmit,
  };
};
