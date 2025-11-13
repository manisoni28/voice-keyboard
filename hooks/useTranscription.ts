"use client";

import { useState, useCallback, useRef } from "react";
import { AudioSlice } from "./useAudioRecorder";
import { hasSpeech } from "@/lib/audio/vad";

export interface TranscriptionResult {
  text: string;
  sliceIndex: number;
  timestamp: number;
}

export interface TranscriptionStatus {
  sliceIndex: number;
  status: "pending" | "processing" | "completed" | "error" | "skipped";
  text?: string;
  error?: string;
}

export interface UseTranscriptionReturn {
  transcribedText: string;
  isTranscribing: boolean;
  transcriptionStatuses: TranscriptionStatus[];
  processAudioSlices: (slices: AudioSlice[]) => Promise<string>;
  processSliceRealtime: (slice: AudioSlice, sliceIndex: number) => Promise<void>;
  saveTranscription: (text: string, duration: number) => Promise<{ success: boolean; id?: string }>;
  reset: () => void;
  error: string | null;
}

export function useTranscription(): UseTranscriptionReturn {
  const [transcribedText, setTranscribedText] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionStatuses, setTranscriptionStatuses] = useState<TranscriptionStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeRequestsRef = useRef<Map<number, AbortController>>(new Map());
  const processedTextRef = useRef<string>("");
  const sliceTextsRef = useRef<Map<number, string>>(new Map()); // Store texts by slice index

  // Reassemble text in correct order from slice texts
  const reassembleText = useCallback(() => {
    const sliceTexts = sliceTextsRef.current;
    if (sliceTexts.size === 0) return "";

    // Get all slice indices and sort them
    const sortedIndices = Array.from(sliceTexts.keys()).sort((a, b) => a - b);
    
    // Concatenate texts in order
    let fullText = "";
    for (const index of sortedIndices) {
      const sliceText = sliceTexts.get(index) || "";
      if (sliceText.length > 0) {
        const needsSpace = fullText.length > 0 &&
                          !fullText.endsWith(' ') &&
                          !sliceText.startsWith(' ');
        fullText += (needsSpace ? " " : "") + sliceText;
      }
    }
    
    return fullText;
  }, []);

  // Process audio slices sequentially with context continuity
  const processAudioSlices = useCallback(async (slices: AudioSlice[]) => {
    if (slices.length === 0) {
      setError("No audio slices to process");
      return "";
    }

    setIsTranscribing(true);
    setError(null);
    setTranscribedText("");

    // Initialize statuses
    const initialStatuses: TranscriptionStatus[] = slices.map((_, index) => ({
      sliceIndex: index,
      status: "pending",
    }));
    setTranscriptionStatuses(initialStatuses);

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    let mergedText = "";
    try {
      // Process each slice sequentially
      for (let i = 0; i < slices.length; i++) {
        const slice = slices[i];

        const sliceHasSpeech = await hasSpeech(slice.blob);

        if (!sliceHasSpeech) {
          setTranscriptionStatuses((prev) =>
            prev.map((status) =>
              status.sliceIndex === i
                ? { ...status, status: "skipped", text: "" }
                : status
            )
          );
          continue;
        }

        // Update status to processing
        setTranscriptionStatuses((prev) =>
          prev.map((status) =>
            status.sliceIndex === i
              ? { ...status, status: "processing" }
              : status
          )
        );

        try {
          // Prepare form data
          const formData = new FormData();

          // Convert blob to file
          const audioFile = new File([slice.blob], `slice-${i}.webm`, {
            type: "audio/webm",
          });

          formData.append("audio", audioFile);
          formData.append("sliceIndex", i.toString());

          // Add previous context for continuity (last 100 chars of previous text)
          if (mergedText.length > 0) {
            const contextLength = Math.min(100, mergedText.length);
            const previousContext = mergedText.slice(-contextLength);
            formData.append("previousContext", previousContext);
          }

          // Call transcribe API
          const response = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
            signal: abortControllerRef.current.signal,
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || "Transcription failed");
          }

          const data = await response.json();
          const sliceText = data.text || "";

          // Merge text (add space if needed)
          if (mergedText.length > 0 && sliceText.length > 0) {
            mergedText += " " + sliceText;
          } else {
            mergedText += sliceText;
          }

          // Update transcribed text in real-time
          setTranscribedText(mergedText);

          // Mark slice as completed
          setTranscriptionStatuses((prev) =>
            prev.map((status) =>
              status.sliceIndex === i
                ? { ...status, status: "completed", text: sliceText }
                : status
            )
          );

        } catch (sliceError: any) {
          // Handle individual slice errors
          console.error(`Error processing slice ${i}:`, sliceError);

          // Mark slice as error
          setTranscriptionStatuses((prev) =>
            prev.map((status) =>
              status.sliceIndex === i
                ? { ...status, status: "error", error: sliceError.message }
                : status
            )
          );

          // Continue with next slice (don't stop entire process)
          // Optionally: implement retry logic here
        }
      }

      setIsTranscribing(false);

      return mergedText;
    } catch (err: any) {
      console.error("Transcription process error:", err);
      setError(err.message || "Failed to process audio");
      setIsTranscribing(false);
      throw err;
    }
  }, []);

  // Save completed transcription to database
  const saveTranscription = useCallback(async (
    text: string,
    duration: number
  ): Promise<{ success: boolean; id?: string }> => {
    try {
      const response = await fetch("/api/transcriptions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          duration,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to save transcription");
      }

      const data = await response.json();

      return {
        success: true,
        id: data.transcription?.id,
      };
    } catch (err: any) {
      console.error("Error saving transcription:", err);
      setError(err.message || "Failed to save transcription");
      return {
        success: false,
      };
    }
  }, []);

  // Process a single slice in real-time (called as slices are created during recording)
  // This is the core of our sound clip slicing architecture from the PRD
  const processSliceRealtime = useCallback(async (slice: AudioSlice, sliceIndex: number) => {
    console.log(`🎤 [PRD Slicing] Processing slice ${sliceIndex} in REAL-TIME during recording`);

    // Add status for this slice
    setTranscriptionStatuses((prev) => {
      // Check if status already exists
      const exists = prev.some(s => s.sliceIndex === sliceIndex);
      if (exists) return prev;
      return [...prev, { sliceIndex, status: "pending" }];
    });

    // Set transcribing flag (will be cleared when all active requests complete)
    setIsTranscribing(true);

    const MAX_RETRIES = 2;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Check for speech (Voice Activity Detection)
        const sliceHasSpeech = await hasSpeech(slice.blob);

        if (!sliceHasSpeech) {
          console.log(`🔇 Slice ${sliceIndex} has no speech - skipping`);
          
          // Store empty text for this slice to maintain order
          sliceTextsRef.current.set(sliceIndex, "");
          
          setTranscriptionStatuses((prev) =>
            prev.map((status) =>
              status.sliceIndex === sliceIndex
                ? { ...status, status: "skipped", text: "" }
                : status
            )
          );
          
          // Check if all requests are done
          if (activeRequestsRef.current.size === 0) {
            setIsTranscribing(false);
          }
          
          return;
        }

        // Update status to processing
        setTranscriptionStatuses((prev) =>
          prev.map((status) =>
            status.sliceIndex === sliceIndex
              ? { ...status, status: "processing" }
              : status
          )
        );

        // Prepare form data
        const formData = new FormData();
        const audioFile = new File([slice.blob], `slice-${sliceIndex}.webm`, {
          type: "audio/webm",
        });
        formData.append("audio", audioFile);
        formData.append("sliceIndex", sliceIndex.toString());

        // Add previous context for continuity (last 150 chars for better context)
        // This helps Gemini maintain consistent spelling and phrasing across slices
        if (processedTextRef.current.length > 0) {
          const contextLength = Math.min(150, processedTextRef.current.length);
          const previousContext = processedTextRef.current.slice(-contextLength);
          formData.append("previousContext", previousContext);
        }

        // Create abort controller for this request
        const abortController = new AbortController();
        activeRequestsRef.current.set(sliceIndex, abortController);

        // Call transcribe API in the background while recording continues
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
          signal: abortController.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errorData.error || `Transcription failed (HTTP ${response.status})`);
        }

        const data = await response.json();
        const sliceText = data.text || "";

        console.log(`✅ Slice ${sliceIndex} transcribed:`, sliceText.substring(0, 60) + "...");

        // Store slice text by index (for correct ordering later)
        sliceTextsRef.current.set(sliceIndex, sliceText);
        
        // Reassemble all texts in correct order and update display
        const orderedText = reassembleText();
        processedTextRef.current = orderedText;
        setTranscribedText(orderedText);

        // Mark slice as completed
        setTranscriptionStatuses((prev) =>
          prev.map((status) =>
            status.sliceIndex === sliceIndex
              ? { ...status, status: "completed", text: sliceText }
              : status
          )
        );

        // Clean up abort controller
        activeRequestsRef.current.delete(sliceIndex);

        // Check if all requests are done
        if (activeRequestsRef.current.size === 0) {
          setIsTranscribing(false);
        }

        // Success! Break out of retry loop
        return;

      } catch (error: any) {
        if (error.name === "AbortError") {
          console.log(`Slice ${sliceIndex} request aborted`);
          activeRequestsRef.current.delete(sliceIndex);
          
          // Check if all requests are done
          if (activeRequestsRef.current.size === 0) {
            setIsTranscribing(false);
          }
          
          return;
        }

        lastError = error;
        console.warn(`⚠️ Slice ${sliceIndex} attempt ${attempt}/${MAX_RETRIES} failed:`, error.message);

        // Only retry for retryable errors (network issues, timeouts, 503s)
        const isRetryable = /(?:network|timeout|503|overloaded|try again)/i.test(error.message);

        if (isRetryable && attempt < MAX_RETRIES) {
          // Wait before retrying (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          continue;
        } else {
          // Non-retryable error or max retries reached
          break;
        }
      }
    }

    // All retries failed
    console.error(`❌ Slice ${sliceIndex} failed after ${MAX_RETRIES} attempts:`, lastError?.message);

    // Mark slice as error
    setTranscriptionStatuses((prev) =>
      prev.map((status) =>
        status.sliceIndex === sliceIndex
          ? { ...status, status: "error", error: lastError?.message || "Transcription failed" }
          : status
      )
    );

    // Clean up abort controller
    activeRequestsRef.current.delete(sliceIndex);

    // Check if all requests are done
    if (activeRequestsRef.current.size === 0) {
      setIsTranscribing(false);
    }

  }, []);

  // Reset state
  const reset = useCallback(() => {
    // Cancel ongoing requests
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Cancel all active realtime requests
    activeRequestsRef.current.forEach((controller) => controller.abort());
    activeRequestsRef.current.clear();

    setTranscribedText("");
    setIsTranscribing(false);
    setTranscriptionStatuses([]);
    setError(null);
    processedTextRef.current = "";
    sliceTextsRef.current.clear(); // Clear slice texts
  }, []);

  return {
    transcribedText,
    isTranscribing,
    transcriptionStatuses,
    processAudioSlices,
    processSliceRealtime,
    saveTranscription,
    reset,
    error,
  };
}
