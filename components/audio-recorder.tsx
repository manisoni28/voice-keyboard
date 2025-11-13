"use client";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { formatTime } from "@/lib/audio/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Square, Pause, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

interface AudioRecorderProps {
  onRecordingComplete?: (slices: any[]) => void;
}

export function AudioRecorder({ onRecordingComplete }: AudioRecorderProps) {
  const {
    isRecording,
    isPaused,
    recordingTime,
    audioSlices,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    error,
  } = useAudioRecorder({ sliceIntervalMs: 5000 }); // 5 second slices

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const handleStart = async () => {
    await startRecording();
    toast.success("Recording started");
  };

  const handleStop = () => {
    stopRecording();
    toast.success("Recording stopped");
    if (onRecordingComplete) {
      onRecordingComplete(audioSlices);
    }
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
    <Card className="border-2">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center space-x-2">
            <Mic className="h-5 w-5" />
            <span>Voice Recorder</span>
          </span>
          {isRecording && (
            <Badge variant={isPaused ? "secondary" : "default"} className="animate-pulse">
              {isPaused ? "Paused" : "Recording"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Speak naturally - audio is processed in 5-second slices for real-time transcription
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
        {!isRecording && audioSlices.length === 0 && (
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
              Audio is automatically sliced every 5 seconds for processing
            </div>
          </div>
        )}

        {/* Slice Counter Visual */}
        {audioSlices.length > 0 && (
          <div className="border rounded-lg p-4 bg-muted/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Audio Slices</span>
              <Badge variant="secondary">{audioSlices.length}</Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {audioSlices.map((_, index) => (
                <div
                  key={index}
                  className="h-8 w-8 rounded bg-primary/20 flex items-center justify-center text-xs font-medium"
                >
                  {index + 1}
                </div>
              ))}
              {isRecording && (
                <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
