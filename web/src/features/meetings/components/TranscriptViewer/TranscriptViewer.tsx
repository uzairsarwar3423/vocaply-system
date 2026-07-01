"use client"

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react"
import { Virtualizer } from "@tanstack/react-virtual"
import { VirtualList } from "@/shared/components/data-display/VirtualList"
import { TranscriptToolbar } from "./TranscriptToolbar"
import { TranscriptTurn } from "./TranscriptTurn"
import { TranscriptEmptyState } from "./TranscriptEmptyState"
import { useTranscriptSearch } from "./useTranscriptSearch"
import { useTranscriptScroll } from "../../hooks/useTranscriptScroll"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface TranscriptData {
  id: string
  meeting_id: string
  raw_transcript: any[]
  normalized_transcript?: any[]
  processing_status: string
}

interface TranscriptViewerProps {
  transcript: TranscriptData | null
  meetingStatus: string
  onRetry?: () => void
}

export function TranscriptViewer({
  transcript,
  meetingStatus,
  onRetry,
}: TranscriptViewerProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [isScrolled, setIsScrolled] = useState(false)
  const [selectedSpeaker, setSelectedSpeaker] = useState<string | null>(null)

  // Virtualizer instance reference
  const virtualizerRef = useRef<Virtualizer<HTMLDivElement, Element> | null>(null)
  const getVirtualizer = useCallback(() => virtualizerRef.current, [])

  // 1. Map raw or normalized backend transcript turns to expected TranscriptTurn structure
  const turns = useMemo(() => {
    if (!transcript) return []

    // Use normalized_transcript if available and non-empty, otherwise raw_transcript
    const sourceTurns =
      Array.isArray(transcript.normalized_transcript) &&
      transcript.normalized_transcript.length > 0
        ? transcript.normalized_transcript
        : Array.isArray(transcript.raw_transcript)
        ? transcript.raw_transcript
        : []

    return sourceTurns.map((turn, index) => {
      // 1. Resolve Speaker Name
      let speaker = "Unknown Speaker"
      if (turn.speaker) {
        speaker = turn.speaker
      } else if (turn.speaker_name) {
        speaker = turn.speaker_name
      } else if (turn.participant?.name) {
        speaker = turn.participant.name
      } else if (turn.speaker_tag) {
        speaker = turn.speaker_tag
      }

      // 2. Resolve Speaker ID
      const speakerId = turn.speaker_user_id || turn.speakerId || undefined

      // 3. Resolve Text
      let text = ""
      if (typeof turn.cleaned_text === "string") {
        text = turn.cleaned_text
      } else if (typeof turn.text === "string") {
        text = turn.text
      } else if (Array.isArray(turn.words)) {
        text = turn.words.map((w: any) => w.text).join(" ").trim()
      }

      // 4. Resolve Start Time
      let start_time = 0
      if (typeof turn.startTime === "number") {
        start_time = turn.startTime
      } else if (typeof turn.start_time === "number") {
        start_time = turn.start_time
      } else if (typeof turn.start_timestamp === "number") {
        start_time = turn.start_timestamp
      } else if (turn.start_timestamp && typeof turn.start_timestamp.relative === "number") {
        start_time = turn.start_timestamp.relative
      } else if (Array.isArray(turn.words) && turn.words.length > 0) {
        const firstWord = turn.words[0]
        start_time =
          typeof firstWord.start_time === "number"
            ? firstWord.start_time
            : typeof firstWord.start_timestamp === "number"
            ? firstWord.start_timestamp
            : firstWord.start_timestamp?.relative || 0
      }

      // 5. Resolve End Time
      let end_time = 0
      if (typeof turn.endTime === "number") {
        end_time = turn.endTime
      } else if (typeof turn.end_time === "number") {
        end_time = turn.end_time
      } else if (typeof turn.end_timestamp === "number") {
        end_time = turn.end_timestamp
      } else if (turn.end_timestamp && typeof turn.end_timestamp.relative === "number") {
        end_time = turn.end_timestamp.relative
      } else if (Array.isArray(turn.words) && turn.words.length > 0) {
        const lastWord = turn.words[turn.words.length - 1]
        end_time =
          typeof lastWord.end_time === "number"
            ? lastWord.end_time
            : typeof lastWord.end_timestamp === "number"
            ? lastWord.end_timestamp
            : lastWord.end_timestamp?.relative || 0
      }

      return {
        id: turn.id || `turn-${index}`,
        speaker,
        speakerId,
        confidence: turn.confidence !== undefined ? turn.confidence : 1.0,
        text,
        start_time,
        end_time,
      }
    })
  }, [transcript])

  // 2. Compute list of unique speakers with turn counts for the filter dropdown
  const speakers = useMemo(() => {
    const counts: Record<string, number> = {}
    turns.forEach((t) => {
      counts[t.speaker] = (counts[t.speaker] || 0) + 1
    })
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
  }, [turns])

  // 3. Filter turns list based on current speaker selection
  const filteredTurns = useMemo(() => {
    if (!selectedSpeaker) return turns
    return turns.filter((t) => t.speaker === selectedSpeaker)
  }, [turns, selectedSpeaker])

  // 4. Initialize search capabilities on the (filtered) turns list
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    currentMatchIndex,
    goToNextMatch,
    goToPrevMatch,
    clearSearch,
  } = useTranscriptSearch(filteredTurns)

  // 5. Initialize jump-to-time capabilities and temporal pulse highlighting
  const { pulseId, jumpToTime } = useTranscriptScroll(filteredTurns, getVirtualizer)

  // 6. Monitor scroll position of the custom viewport to elevate sticky header
  useEffect(() => {
    const viewport = scrollRef.current
    if (!viewport) return

    const handleScroll = () => {
      setIsScrolled(viewport.scrollTop > 0)
    }

    viewport.addEventListener("scroll", handleScroll, { passive: true })
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [])

  // 7. Scroll to current search match
  useEffect(() => {
    const virtualizer = virtualizerRef.current
    if (virtualizer && currentMatchIndex >= 0 && searchResults.length > 0) {
      const targetIndex = searchResults[currentMatchIndex]
      virtualizer.scrollToIndex(targetIndex, { align: "center", behavior: "smooth" })
    }
  }, [currentMatchIndex, searchResults])

  // Handle copying turn text to clipboard
  const handleCopy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(
      () => {
        toast.success("Transcript snippet copied successfully.")
      },
      () => {
        toast.error("Could not copy text to clipboard.")
      }
    )
  }, [])

  // Handle virtualizer mounting callback
  const handleVirtualizerMount = useCallback((v: Virtualizer<HTMLDivElement, Element>) => {
    virtualizerRef.current = v
  }, [])

  // Expose jumpToTime globally on window in development for ease of testing
  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      ;(window as any).jumpToTranscriptTime = jumpToTime
    }
    return () => {
      if (process.env.NODE_ENV === "development") {
        delete (window as any).jumpToTranscriptTime
      }
    }
  }, [jumpToTime])

  // Guard: If meeting is not DONE or has failed, render empty/processing state
  if (meetingStatus !== "DONE" || !transcript) {
    return <TranscriptEmptyState status={meetingStatus} onRetry={onRetry} />
  }

  return (
    <div className="flex flex-col h-[calc(100vh-220px)] min-h-[450px] border border-border rounded-lg bg-background overflow-hidden">
      <TranscriptToolbar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        onSearchNext={goToNextMatch}
        onSearchPrev={goToPrevMatch}
        searchMatchCount={searchResults.length}
        searchCurrentMatchIndex={currentMatchIndex}
        onSearchClear={clearSearch}
        speakers={speakers}
        selectedSpeaker={selectedSpeaker}
        onSpeakerSelect={setSelectedSpeaker}
        totalTurns={filteredTurns.length}
        isScrolled={isScrolled}
      />

      <div className="flex-1 min-h-0 relative">
        <VirtualList
          items={filteredTurns}
          estimateSize={() => 72}
          overscan={8}
          scrollRef={scrollRef}
          getItemKey={(turn) => turn.id}
          className="h-full w-full"
          onVirtualizerMount={handleVirtualizerMount}
          renderItem={(turn, index) => {
            const isMatch = searchResults.includes(index)
            const isActiveMatch =
              isMatch && currentMatchIndex >= 0 && searchResults[currentMatchIndex] === index

            return (
              <div
                className={cn(
                  "transition-colors duration-300",
                  pulseId === turn.id && "bg-primary/10 animate-pulse"
                )}
              >
                <TranscriptTurn
                  turn={turn}
                  isHighlighted={isMatch}
                  isActiveMatch={isActiveMatch}
                  searchQuery={searchQuery}
                  onCopy={handleCopy}
                />
              </div>
            )
          }}
        />
      </div>
    </div>
  )
}
