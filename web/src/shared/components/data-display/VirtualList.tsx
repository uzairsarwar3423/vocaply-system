"use client"

import * as React from "react"
import { useVirtualizer, Virtualizer } from "@tanstack/react-virtual"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export interface VirtualListProps<T> {
  items: T[]
  estimateSize: (index: number) => number
  renderItem: (item: T, index: number) => React.ReactNode
  overscan?: number
  scrollRef?: React.RefObject<HTMLDivElement | null>
  getItemKey?: (item: T, index: number) => string | number
  className?: string
  containerClassName?: string
  onVirtualizerMount?: (virtualizer: Virtualizer<HTMLDivElement, Element>) => void
}

export function VirtualList<T>({
  items,
  estimateSize,
  renderItem,
  overscan = 8,
  scrollRef,
  getItemKey,
  className,
  containerClassName,
  onVirtualizerMount,
}: VirtualListProps<T>) {
  const internalRef = React.useRef<HTMLDivElement>(null)
  const containerRef = scrollRef || internalRef

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => containerRef.current,
    estimateSize,
    overscan,
    getItemKey: getItemKey ? (index) => getItemKey(items[index], index) : undefined,
  })

  React.useEffect(() => {
    if (onVirtualizerMount) {
      onVirtualizerMount(virtualizer)
    }
  }, [virtualizer, onVirtualizerMount])

  return (
    <ScrollArea
      className={cn("h-full w-full", className)}
      viewportRef={containerRef}
    >
      <div
        className={cn("relative w-full", containerClassName)}
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => (
          <div
            key={virtualItem.key}
            data-index={virtualItem.index}
            ref={virtualizer.measureElement}
            className="absolute top-0 left-0 w-full"
            style={{
              transform: `translateY(${virtualItem.start}px)`,
            }}
          >
            {renderItem(items[virtualItem.index], virtualItem.index)}
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}
