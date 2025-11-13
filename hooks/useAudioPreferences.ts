"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export interface AudioPreferences {
  deviceId?: string;
  deviceLabel?: string;
  sliceIntervalMs?: number;
}

type PreferencesUpdater =
  | AudioPreferences
  | ((current: AudioPreferences) => AudioPreferences);

const STORAGE_KEY = "voice-keyboard.audioPreferences";
const BROADCAST_EVENT = "voice-keyboard:audio-preferences-updated";

const defaultPreferences: AudioPreferences = {
  sliceIntervalMs: 5000,
};

function readPreferences(): AudioPreferences {
  if (typeof window === "undefined") {
    return defaultPreferences;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return defaultPreferences;
    }

    const parsed = JSON.parse(raw) as AudioPreferences;
    return {
      ...defaultPreferences,
      ...parsed,
    };
  } catch (error) {
    console.warn("[AudioPreferences] Failed to parse stored preferences", error);
    return defaultPreferences;
  }
}

function persistPreferences(preferences: AudioPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(BROADCAST_EVENT, { detail: preferences })
      );
    }, 0);
  } catch (error) {
    console.warn("[AudioPreferences] Failed to persist preferences", error);
  }
}

export function useAudioPreferences() {
  const [preferences, setPreferencesState] = useState<AudioPreferences>(
    () => readPreferences()
  );

  const setPreferences = useCallback((value: PreferencesUpdater) => {
    setPreferencesState((current) => {
      const next =
        typeof value === "function"
          ? (value as (current: AudioPreferences) => AudioPreferences)(current)
          : value;

      const merged = {
        ...defaultPreferences,
        ...next,
      };

      persistPreferences(merged);
      return merged;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences(defaultPreferences);
  }, [setPreferences]);

  // Sync with storage events (other tabs)
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          const parsed = JSON.parse(event.newValue) as AudioPreferences;
          setPreferencesState({
            ...defaultPreferences,
            ...parsed,
          });
        } catch (error) {
          console.warn("[AudioPreferences] Failed to parse storage event", error);
        }
      }
    };

    const handleBroadcast = (event: Event) => {
      const customEvent = event as CustomEvent<AudioPreferences>;
      if (customEvent.detail) {
        setPreferencesState({
          ...defaultPreferences,
          ...customEvent.detail,
        });
      }
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(BROADCAST_EVENT, handleBroadcast);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(BROADCAST_EVENT, handleBroadcast);
    };
  }, []);

  const value = useMemo(
    () => ({
      preferences,
      setPreferences,
      resetPreferences,
    }),
    [preferences, setPreferences, resetPreferences]
  );

  return value;
}

