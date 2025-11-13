"use client";

const DEFAULT_AMPLITUDE_THRESHOLD = 0.015;
const DEFAULT_RATIO_THRESHOLD = 0.005;

export interface VoiceActivityOptions {
  amplitudeThreshold?: number;
  ratioThreshold?: number;
}

export async function hasSpeech(
  blob: Blob,
  options: VoiceActivityOptions = {}
): Promise<boolean> {
  if (typeof window === "undefined" || !window.AudioContext) {
    return true;
  }

  const amplitudeThreshold =
    options.amplitudeThreshold ?? DEFAULT_AMPLITUDE_THRESHOLD;
  const ratioThreshold = options.ratioThreshold ?? DEFAULT_RATIO_THRESHOLD;

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioContext = new window.AudioContext();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));

    const channelData = audioBuffer.getChannelData(0);
    if (!channelData || channelData.length === 0) {
      await audioContext.close();
      return false;
    }

    let sumSquares = 0;
    let aboveThresholdCount = 0;

    for (let i = 0; i < channelData.length; i++) {
      const sample = channelData[i];
      const absSample = Math.abs(sample);
      sumSquares += sample * sample;
      if (absSample >= amplitudeThreshold) {
        aboveThresholdCount += 1;
      }
    }

    const rms = Math.sqrt(sumSquares / channelData.length);
    const ratio = aboveThresholdCount / channelData.length;

    await audioContext.close();

    return rms >= amplitudeThreshold || ratio >= ratioThreshold;
  } catch (error) {
    console.warn("[VAD] Failed to analyze audio slice, defaulting to has speech.", error);
    return true;
  }
}

