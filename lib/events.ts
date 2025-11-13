export const RECORDING_STATE_EVENT = "voice-keyboard:recording-state";
export const TRANSCRIPTION_CREATED_EVENT = "voice-keyboard:transcription-created";

export type RecordingStatePayload =
  | {
      status: "recording";
      startedAt: number;
      sliceIntervalMs: number;
      deviceLabel?: string;
    }
  | {
      status: "stopped";
    };

export interface TranscriptionCreatedPayload {
  transcriptionId: string;
}

