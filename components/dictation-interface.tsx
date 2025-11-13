"use client";

import { useAudioRecorder, AudioSlice } from "@/hooks/useAudioRecorder";
import { useTranscription } from "@/hooks/useTranscription";
import { formatTime } from "@/lib/audio/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Pause, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAudioPreferences } from "@/hooks/useAudioPreferences";
import { RECORDING_STATE_EVENT, TRANSCRIPTION_CREATED_EVENT, RecordingStatePayload, TranscriptionCreatedPayload } from "@/lib/events";

export function DictationInterface() {
  const { preferences } = useAudioPreferences();
  const sliceIntervalMs = preferences.sliceIntervalMs ?? 5000;
  const selectedDeviceId = preferences.deviceId;

  // Get transcription hook first
  const {
    transcribedText,
    isTranscribing,
    transcriptionStatuses,
    processAudioSlices,
    processSliceRealtime,
    saveTranscription,
    reset: resetTranscription,
    error: transcriptionError,
  } = useTranscription();

  // Real-time slice processing callback (now processSliceRealtime is available)
  const handleSliceCreated = useCallback(async (slice: AudioSlice, sliceIndex: number) => {
    console.log(`🎤 Slice ${sliceIndex} created - Starting REAL-TIME transcription`);
    // Process slice immediately in the background while recording continues
    await processSliceRealtime(slice, sliceIndex);
  }, [processSliceRealtime]);

  const {
    isRecording,
    isPaused,
    recordingTime,
    audioSlices,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    error: recordingError,
  } = useAudioRecorder({
    sliceIntervalMs,
    deviceId: selectedDeviceId,
    onSliceCreated: handleSliceCreated, // Enable real-time processing!
  });

  const [recordingDuration, setRecordingDuration] = useState(0);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [hasAutoSaved, setHasAutoSaved] = useState(false);

  const audioSlicesRef = useRef<AudioSlice[]>([]);
  const transcribedTextRef = useRef("");
  const transcriptionStatusesRef = useRef(transcriptionStatuses);
  
  useEffect(() => {
    audioSlicesRef.current = audioSlices;
  }, [audioSlices]);

  useEffect(() => {
    transcribedTextRef.current = transcribedText;
  }, [transcribedText]);

  useEffect(() => {
    transcriptionStatusesRef.current = transcriptionStatuses;
  }, [transcriptionStatuses]);

  const sliceIntervalSeconds = useMemo(
    () => Math.round(sliceIntervalMs / 1000),
    [sliceIntervalMs]
  );

  // Show recording errors
  useEffect(() => {
    if (recordingError) {
      toast.error(recordingError);
    }
  }, [recordingError]);

  // Show transcription errors
  useEffect(() => {
    if (transcriptionError) {
      toast.error(transcriptionError);
    }
  }, [transcriptionError]);

  const broadcastRecordingState = useCallback((payload: RecordingStatePayload) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(RECORDING_STATE_EVENT, { detail: payload }));
    }
  }, []);

  const broadcastTranscriptionCreated = useCallback((payload: TranscriptionCreatedPayload) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(TRANSCRIPTION_CREATED_EVENT, { detail: payload }));
    }
  }, []);

  const finalizeRecording = useRef<((duration: number) => Promise<void>) | undefined>(undefined);

  finalizeRecording.current = async (duration: number) => {
    // Slices are already processed in real-time, just save the final text
    const finalText = transcribedTextRef.current.trim();

    console.log(`Finalizing recording: duration=${duration}s, text length=${finalText.length}`);

    if (!finalText || finalText.length === 0) {
      console.log("No transcription text to save");
      toast.warning("Recording was silent. Nothing was saved.");
      setIsAutoSaving(false);
      return;
    }

    setIsAutoSaving(true);

    try {
      console.log("Saving transcription to database...");
      const { success, id } = await saveTranscription(finalText, duration);

      if (success) {
        setHasAutoSaved(true);
        console.log(`Transcription saved successfully with id: ${id}`);
        toast.success("Transcription saved automatically!");
        if (id) {
          broadcastTranscriptionCreated({ transcriptionId: id });
        } else {
          broadcastTranscriptionCreated({ transcriptionId: "" });
        }
      } else {
        console.error("Save transcription returned success=false");
        toast.error("Automatic save failed. You can try saving manually.");
      }
    } catch (error: any) {
      console.error("Error saving transcription:", error);
      toast.error("Failed to save transcription. Please try again.");
    } finally {
      setIsAutoSaving(false);
    }
  };

  const handleStart = async () => {
    resetTranscription();
    setHasAutoSaved(false);
    await startRecording();
    broadcastRecordingState({
      status: "recording",
      startedAt: Date.now(),
      sliceIntervalMs,
      deviceLabel: preferences.deviceLabel,
    });
    toast.success("Recording started");
  };

  const handleStop = async () => {
    const duration = recordingTime;
    const expectedSliceCount = audioSlicesRef.current.length;
    
    setRecordingDuration(duration);
    stopRecording();
    broadcastRecordingState({ status: "stopped" });
    toast.success("Recording stopped");

    // Wait a moment for the final slice to be created and processed
    await new Promise(resolve => setTimeout(resolve, 300));

    // Now wait for all transcriptions to complete
    let checkCount = 0;
    const MAX_CHECKS = 60; // 30 seconds max wait (60 * 500ms)
    
    const checkAndSave = () => {
      checkCount++;
      const currentSliceCount = audioSlicesRef.current.length;
      const currentStatuses = transcriptionStatusesRef.current;
      
      // Check if we have status for all slices
      const hasAllStatuses = currentStatuses.length >= currentSliceCount;
      
      // Check if all slices are processed
      const allProcessed = hasAllStatuses && currentStatuses.every(
        s => s.status === "completed" || s.status === "error" || s.status === "skipped"
      );

      console.log(`Auto-save check #${checkCount}: ${currentStatuses.length}/${currentSliceCount} statuses, allProcessed: ${allProcessed}`);

      if (allProcessed && currentSliceCount > 0) {
        // All done, save now
        console.log("All slices processed, saving transcription...");
        if (finalizeRecording.current) {
          finalizeRecording.current(duration);
        }
      } else if (currentSliceCount === 0) {
        // No slices recorded
        console.log("No slices to process");
        toast.warning("No audio recorded");
      } else if (checkCount >= MAX_CHECKS) {
        // Timeout - save what we have
        console.warn("Auto-save timeout reached, saving current transcription");
        if (finalizeRecording.current && transcribedTextRef.current.trim()) {
          finalizeRecording.current(duration);
        } else {
          toast.error("Transcription processing timed out");
        }
      } else {
        // Still processing, check again
        setTimeout(checkAndSave, 500);
      }
    };

    // Start checking
    checkAndSave();
  };

  const handlePauseResume = () => {
    if (isPaused) {
      resumeRecording();
      toast.info("Recording resumed");
    } else {
      pauseRecording();
      toast.info("Recording paused");
    }
  };

  return (
    <div className="space-y-6">
      {/* Recording Card */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center space-x-2">
              <Mic className="h-5 w-5" />
              <span>Voice Recorder</span>
            </span>
            {isRecording && isPaused && (
              <Badge variant="secondary" className="animate-pulse">
                Paused
              </Badge>
            )}
            {isAutoSaving && (
              <Badge variant="default" className="animate-pulse">
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                Saving
              </Badge>
            )}
          </CardTitle>
            <CardDescription>
              Speak naturally — Audio is processed for real-time transcription.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Recording Timer */}
          <div className="text-center">
            <div className="text-5xl font-bold font-mono mb-2">
              {formatTime(recordingTime)}
            </div>
          </div>

          {/* Recording Controls */}
          <div className="flex justify-center items-center space-x-4">
            {!isRecording ? (
              <Button
                size="lg"
                onClick={handleStart}
                className="h-16 w-16 rounded-full"
                disabled={isTranscribing}
              >
                <Mic className="h-6 w-6" />
              </Button>
            ) : (
              <>
                <Button
                  size="lg"
                  variant="outline"
                  onClick={handlePauseResume}
                  className="h-14 w-14 rounded-full"
                >
                  {isPaused ? (
                    <Play className="h-5 w-5" />
                  ) : (
                    <Pause className="h-5 w-5" />
                  )}
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={handleStop}
                  className="h-16 w-16 rounded-full"
                >
                  <Square className="h-6 w-6" />
                </Button>
              </>
            )}
          </div>

          {/* Status Messages */}
          {!isRecording && audioSlices.length === 0 && !transcribedText && (
            <div className="text-center text-sm text-muted-foreground">
              Click the microphone button to start recording
            </div>
          )}

          {isRecording && (
            <div className="space-y-2">
              <div className="flex items-center justify-center space-x-2">
                <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-sm text-muted-foreground">
                  {isPaused ? "Recording paused" : "Recording in progress..."}
                </span>
              </div>
              <div className="text-xs text-center text-muted-foreground">
                Your speech is being transcribed in real-time
                {preferences.deviceLabel ? ` using ${preferences.deviceLabel}` : ""}.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
