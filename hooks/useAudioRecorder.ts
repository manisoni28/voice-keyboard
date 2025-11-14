"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface AudioSlice {
  blob: Blob;
  timestamp: number;
  duration: number;
}

export interface UseAudioRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  recordingTime: number;
  audioSlices: AudioSlice[];
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  error: string | null;
}

export interface UseAudioRecorderOptions {
  sliceIntervalMs?: number;
  onSliceCreated?: (slice: AudioSlice, sliceIndex: number) => void;
  deviceId?: string;
  audioConstraints?: MediaTrackConstraints;
}

export function useAudioRecorder(
  options: UseAudioRecorderOptions = {}
): UseAudioRecorderReturn {
  const {
    sliceIntervalMs = 5000,
    onSliceCreated,
    deviceId,
    audioConstraints,
  } = options;
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioSlices, setAudioSlices] = useState<AudioSlice[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const sliceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);
  const sliceCountRef = useRef<number>(0);
  const pendingSliceRef = useRef<boolean>(false);

  const finalizeSlice = useCallback(() => {
    if (chunksRef.current.length > 0) {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      const slice: AudioSlice = {
        blob,
        timestamp: Date.now(),
        duration: sliceIntervalMs,
      };

      const currentSliceIndex = sliceCountRef.current;
      sliceCountRef.current += 1;

      console.log(`✅ Finalized slice ${currentSliceIndex}, size: ${blob.size} bytes, chunks: ${chunksRef.current.length}`);

      setAudioSlices((prev) => [...prev, slice]);
      chunksRef.current = []; // Clear chunks for next slice
      pendingSliceRef.current = false;

      // CRITICAL: Trigger callback immediately for real-time processing
      // This allows transcription to happen in the BACKGROUND while recording continues
      if (onSliceCreated) {
        onSliceCreated(slice, currentSliceIndex);
      }
    } else {
      console.warn(`⚠️ No chunks available for slice ${sliceCountRef.current}`);
      pendingSliceRef.current = false;
    }
  }, [sliceIntervalMs, onSliceCreated]);

  const createAudioSlice = useCallback(() => {
    // Stop and restart MediaRecorder to create valid WebM files with headers
    if (mediaRecorderRef.current && streamRef.current && mediaRecorderRef.current.state === "recording") {
      console.log(`🎤 Stopping MediaRecorder for slice ${sliceCountRef.current}...`);

      pendingSliceRef.current = true;

      // Stop will trigger ondataavailable with complete WebM file
      mediaRecorderRef.current.stop();

      // Restart MediaRecorder immediately for next slice
      setTimeout(() => {
        if (streamRef.current && !isPaused) {
          console.log(`🎬 Restarting MediaRecorder for next slice...`);

          const mediaRecorder = new MediaRecorder(streamRef.current, {
            mimeType: "audio/webm",
          });

          mediaRecorderRef.current = mediaRecorder;

          // Re-attach ondataavailable handler
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              chunksRef.current.push(event.data);
              console.log(`📦 Chunk received: ${event.data.size} bytes, total chunks: ${chunksRef.current.length}`);

              // If we're waiting to finalize a slice, do it now
              if (pendingSliceRef.current) {
                console.log(`🎬 Data arrived, finalizing slice immediately`);
                finalizeSlice();
              }
            }
          };

          // Start recording again
          mediaRecorder.start();
          console.log(`✅ MediaRecorder restarted`);
        }
      }, 50);
    }
  }, [finalizeSlice, isPaused]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Check for microphone permission first
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName });
        if (permissionStatus.state === 'denied') {
          throw new DOMException(
            'Microphone access was denied. Please enable it in your browser settings.',
            'NotAllowedError'
          );
        }
      } catch (permCheckError) {
        // Permission API might not be supported in all browsers, continue with getUserMedia
        console.log('Permission API not supported, proceeding with getUserMedia');
      }

      // Request microphone permission
      const constraintOptions: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100,
        ...audioConstraints,
      };

      if (deviceId) {
        constraintOptions.deviceId = { exact: deviceId };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: constraintOptions,
      });

      streamRef.current = stream;

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];
      setAudioSlices([]);
      sliceCountRef.current = 0; // Reset slice counter

      // Handle data available
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log(`📦 Chunk received: ${event.data.size} bytes, total chunks: ${chunksRef.current.length}`);

          // If we're waiting to finalize a slice, do it now
          if (pendingSliceRef.current) {
            console.log(`🎬 Data arrived, finalizing slice immediately`);
            finalizeSlice();
          }
        }
      };

      // Start recording - will be stopped/restarted every 5 seconds
      mediaRecorder.start();
      setIsRecording(true);
      startTimeRef.current = Date.now();

      // Start timer for UI
      timerRef.current = setInterval(() => {
        setRecordingTime((Date.now() - startTimeRef.current) / 1000);
      }, 100);

      // Start slice timer (create slice every 5 seconds)
      sliceTimerRef.current = setInterval(() => {
        createAudioSlice();
      }, sliceIntervalMs);
    } catch (err) {
      console.error("Error starting recording:", err);

      if (err instanceof DOMException) {
        switch (err.name) {
          case "NotAllowedError":
            setError(
              "Microphone access was denied. Please enable it in your browser settings."
            );
            return;
          case "NotFoundError":
            setError(
              "Selected microphone device is not available. Please choose a different input."
            );
            return;
          default:
            setError(err.message);
            return;
        }
      }

      setError(
        err instanceof Error
          ? err.message
          : "Failed to access microphone. Please check permissions."
      );
    }
  }, [sliceIntervalMs, createAudioSlice, finalizeSlice, deviceId, audioConstraints]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('🛑 Stopping recording...');

      // Clear slice timer first
      if (sliceTimerRef.current) {
        clearInterval(sliceTimerRef.current);
        sliceTimerRef.current = null;
      }

      // Stop MediaRecorder - will trigger ondataavailable with final slice
      if (mediaRecorderRef.current.state === "recording") {
        pendingSliceRef.current = true;
        mediaRecorderRef.current.stop();
      }

      setIsRecording(false);
      setIsPaused(false);

      // Clear UI timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Stop media stream after ensuring data is captured
      setTimeout(() => {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      }, 200);

      setRecordingTime(0);
    }
  }, [isRecording]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording && !isPaused) {
      console.log('⏸️ Pausing recording...');

      // Stop current MediaRecorder and capture current slice
      if (mediaRecorderRef.current.state === "recording") {
        pendingSliceRef.current = true;
        mediaRecorderRef.current.stop();
      }

      setIsPaused(true);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (sliceTimerRef.current) {
        clearInterval(sliceTimerRef.current);
        sliceTimerRef.current = null;
      }
    }
  }, [isRecording, isPaused]);

  const resumeRecording = useCallback(() => {
    if (streamRef.current && isRecording && isPaused) {
      console.log('▶️ Resuming recording...');

      // Create new MediaRecorder
      const mediaRecorder = new MediaRecorder(streamRef.current, {
        mimeType: "audio/webm",
      });

      mediaRecorderRef.current = mediaRecorder;

      // Re-attach ondataavailable handler
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
          console.log(`📦 Chunk received: ${event.data.size} bytes`);

          if (pendingSliceRef.current) {
            console.log(`🎬 Data arrived, finalizing slice`);
            finalizeSlice();
          }
        }
      };

      // Start recording
      mediaRecorder.start();
      setIsPaused(false);

      // Restart timers
      timerRef.current = setInterval(() => {
        setRecordingTime((Date.now() - startTimeRef.current) / 1000);
      }, 100);

      sliceTimerRef.current = setInterval(() => {
        createAudioSlice();
      }, sliceIntervalMs);
    }
  }, [isRecording, isPaused, sliceIntervalMs, createAudioSlice, finalizeSlice]);

  // Cleanup effect: Stop recording and release microphone when component unmounts
  useEffect(() => {
    return () => {
      console.log('🧹 Cleaning up audio recorder on unmount...');

      // Clear all timers
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      if (sliceTimerRef.current) {
        clearInterval(sliceTimerRef.current);
        sliceTimerRef.current = null;
      }

      // Stop MediaRecorder if active
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        try {
          mediaRecorderRef.current.stop();
        } catch (e) {
          console.warn('Failed to stop MediaRecorder on cleanup:', e);
        }
        mediaRecorderRef.current = null;
      }

      // Release microphone stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.stop();
          console.log('🎤 Microphone track stopped on cleanup');
        });
        streamRef.current = null;
      }
    };
  }, []);

  return {
    isRecording,
    isPaused,
    recordingTime,
    audioSlices,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    error,
  };
}
