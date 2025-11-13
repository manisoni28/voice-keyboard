"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatTime } from "@/lib/audio/utils";
import { RECORDING_STATE_EVENT, TRANSCRIPTION_CREATED_EVENT, RecordingStatePayload } from "@/lib/events";

interface Transcription {
  id: string;
  text: string;
  duration: number | null;
  createdAt: string;
  updatedAt: string;
}

interface TranscriptionItemProps {
  transcription: Transcription;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCopy: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}

function TranscriptionItem({
  transcription,
  isExpanded,
  onToggleExpand,
  onCopy,
  onDelete,
  isDeleting
}: TranscriptionItemProps) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const checkTruncation = () => {
      const element = textRef.current;
      if (element) {
        // Check if the content is taller than the clamped height
        setIsTruncated(element.scrollHeight > element.clientHeight);
      }
    };

    checkTruncation();
    window.addEventListener('resize', checkTruncation);
    return () => window.removeEventListener('resize', checkTruncation);
  }, [transcription.text]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  return (
    <div className="border rounded-lg p-4 space-y-2 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-1">
          <div className="flex items-center space-x-2">
            <span className="text-xs text-muted-foreground">
              {formatDate(transcription.createdAt)}
            </span>
            {transcription.duration && (
              <Badge variant="outline" className="text-xs">
                {formatTime(transcription.duration)}
              </Badge>
            )}
          </div>
          <p
            ref={textRef}
            className={`text-sm ${!isExpanded ? "line-clamp-3" : ""}`}
          >
            {transcription.text}
          </p>
          {(isTruncated || isExpanded) && (
            <Button
              size="sm"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={onToggleExpand}
            >
              {isExpanded ? "View Less" : "View More"}
            </Button>
          )}
        </div>
      </div>
      <div className="flex justify-end space-x-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={onCopy}
        >
          <Copy className="h-3 w-3 mr-1" />
          Copy
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDelete}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3 mr-1" />
          )}
          Delete
        </Button>
      </div>
    </div>
  );
}

export function TranscriptionList() {
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [activeRecording, setActiveRecording] = useState<{
    startedAt: number;
    sliceIntervalMs: number;
    deviceLabel?: string;
  } | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const LIMIT = 10;

  const fetchTranscriptions = useCallback(async (append = false, currentOffset = 0) => {
    try {
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setOffset(0); // Reset offset for fresh load
      }

      const response = await fetch(`/api/transcriptions?limit=${LIMIT}&offset=${currentOffset}`);

      if (!response.ok) {
        throw new Error("Failed to fetch transcriptions");
      }

      const data = await response.json();
      const newTranscriptions = data.transcriptions || [];

      if (append) {
        // Prevent duplicates by filtering out existing IDs
        setTranscriptions((prev) => {
          const existingIds = new Set(prev.map(t => t.id));
          const uniqueNew = newTranscriptions.filter((t: Transcription) => !existingIds.has(t.id));
          return [...prev, ...uniqueNew];
        });
      } else {
        setTranscriptions(newTranscriptions);
      }

      setTotal(data.total || 0);
      const newOffset = currentOffset + newTranscriptions.length;
      setOffset(newOffset);
      setHasMore(newOffset < (data.total || 0));
    } catch (error: any) {
      console.error("Error fetching transcriptions:", error);
      toast.error("Failed to load transcriptions");
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, []);

  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      fetchTranscriptions(true, offset);
    }
  }, [isLoadingMore, hasMore, fetchTranscriptions, offset]);

  useEffect(() => {
    fetchTranscriptions(false);
  }, []);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasMore, isLoadingMore, loadMore]);

  useEffect(() => {
    const handleRecordingState = (event: Event) => {
      const customEvent = event as CustomEvent<RecordingStatePayload>;
      const detail = customEvent.detail;

      if (detail?.status === "recording") {
        setActiveRecording({
          startedAt: detail.startedAt,
          sliceIntervalMs: detail.sliceIntervalMs,
          deviceLabel: detail.deviceLabel,
        });
      } else if (detail?.status === "stopped") {
        setActiveRecording(null);
        setElapsedMs(0);
      }
    };

    const handleTranscriptionCreated = async () => {
      // Reset and reload from beginning
      setHasMore(true);
      await fetchTranscriptions(false, 0);
      setActiveRecording(null);
      setElapsedMs(0);
    };

    window.addEventListener(RECORDING_STATE_EVENT, handleRecordingState as EventListener);
    window.addEventListener(TRANSCRIPTION_CREATED_EVENT, handleTranscriptionCreated);

    return () => {
      window.removeEventListener(RECORDING_STATE_EVENT, handleRecordingState as EventListener);
      window.removeEventListener(TRANSCRIPTION_CREATED_EVENT, handleTranscriptionCreated);
    };
  }, [fetchTranscriptions]);

  useEffect(() => {
    if (!activeRecording) {
      return;
    }

    const updateElapsed = () => {
      setElapsedMs(Date.now() - activeRecording.startedAt);
    };

    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [activeRecording]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard!");
    } catch (err) {
      toast.error("Failed to copy to clipboard");
    }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Are you sure you want to delete this transcription?")) {
      return;
    }

    try {
      setDeletingId(id);
      const response = await fetch(`/api/transcriptions?id=${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete transcription");
      }

      toast.success("Transcription deleted");
      // Reset and refresh list
      setHasMore(true);
      await fetchTranscriptions(false, 0);
    } catch (error: any) {
      console.error("Error deleting transcription:", error);
      toast.error("Failed to delete transcription");
    } finally {
      setDeletingId(null);
    }
  }, [fetchTranscriptions]);

  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const activeRecordingDuration = useMemo(
    () => Math.max(0, Math.floor(elapsedMs / 1000)),
    [elapsedMs]
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const activeRecordingBanner = activeRecording ? (
    <div className="border border-primary/40 bg-primary/5 rounded-lg p-4 flex items-center justify-between">
      <div className="space-y-1">
        <p className="text-sm font-medium text-primary">Recording in progress</p>
        <p className="text-xs text-muted-foreground">
          Elapsed {formatTime(activeRecordingDuration)}
          {activeRecording.deviceLabel ? ` • ${activeRecording.deviceLabel}` : ""}
        </p>
      </div>
      <Badge variant="outline" className="animate-pulse">
        <span className="h-2 w-2 rounded-full bg-red-500 mr-2 inline-block" />
        Live
      </Badge>
    </div>
  ) : null;

  if (transcriptions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Transcriptions</CardTitle>
          <CardDescription>Your transcription history will appear here</CardDescription>
        </CardHeader>
        <CardContent>
          {activeRecordingBanner}
          {!activeRecordingBanner && (
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm mb-2">No transcriptions yet</p>
              <p className="text-xs">Start recording to create your first transcription</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Recent Transcriptions</span>
          <Badge variant="secondary">{total > 0 ? total : transcriptions.length}</Badge>
        </CardTitle>
        <CardDescription>
          {total > 0 ? `Showing ${transcriptions.length} of ${total}` : "Your latest transcriptions"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {activeRecordingBanner}

        {transcriptions.map((transcription) => (
          <TranscriptionItem
            key={transcription.id}
            transcription={transcription}
            isExpanded={expandedIds.has(transcription.id)}
            onToggleExpand={() => toggleExpanded(transcription.id)}
            onCopy={() => handleCopy(transcription.text)}
            onDelete={() => handleDelete(transcription.id)}
            isDeleting={deletingId === transcription.id}
          />
        ))}

        {/* Intersection observer target for infinite scroll */}
        {hasMore && (
          <div ref={loadMoreRef} className="py-4">
            {isLoadingMore ? (
              <div className="flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading more...</span>
              </div>
            ) : (
              <Button
                variant="outline"
                className="w-full"
                onClick={loadMore}
              >
                Load More
              </Button>
            )}
          </div>
        )}

        {!hasMore && transcriptions.length > 0 && (
          <div className="text-center py-4 text-sm text-muted-foreground">
            All transcriptions loaded
          </div>
        )}
      </CardContent>
    </Card>
  );
}
