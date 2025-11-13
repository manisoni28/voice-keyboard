"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Mic, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAudioPreferences } from "@/hooks/useAudioPreferences";

interface MediaDeviceInfoLite {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

function normalizeDevices(devices: MediaDeviceInfo[]): MediaDeviceInfoLite[] {
  return devices
    .filter((device) => device.kind === "audioinput")
    .map((device) => ({
      deviceId: device.deviceId,
      label: device.label || "Microphone (permission required)",
      kind: device.kind,
    }));
}

export function AudioDeviceSelector() {
  const { preferences, setPreferences } = useAudioPreferences();
  const [devices, setDevices] = useState<MediaDeviceInfoLite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const hasPermission = useMemo(
    () => devices.some((device) => device.label && device.label !== "Microphone (permission required)"),
    [devices]
  );

  const loadDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      setPermissionError("Audio devices are not supported in this browser.");
      return;
    }

    try {
      setIsLoading(true);
      setPermissionError(null);

      // Request permission if we do not have any labels yet.
      if (!hasPermission) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const mediaDevices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = normalizeDevices(mediaDevices);

      setDevices(audioInputs);

      if (audioInputs.length === 0) {
        setPermissionError("No microphone devices detected. Connect a microphone and try again.");
      } else {
        setPermissionError(null);
      }
    } catch (error: any) {
      console.error("[AudioDeviceSelector] Failed to enumerate devices", error);

      if (error?.name === "NotAllowedError") {
        setPermissionError("Microphone access denied. Enable permissions and refresh.");
        toast.error("Microphone access denied. Please enable it and refresh.");
      } else {
        setPermissionError("Unable to access microphone devices.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [hasPermission]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextDeviceId = event.target.value;
    const deviceLabel = devices.find((device) => device.deviceId === nextDeviceId)?.label;

    setPreferences((current) => ({
      ...current,
      deviceId: nextDeviceId || undefined,
      deviceLabel,
    }));

    toast.success(deviceLabel ? `Microphone set to ${deviceLabel}` : "Microphone selection cleared");
  };

  const selectedDeviceId = preferences.deviceId ?? "";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Audio Settings</CardTitle>
        <CardDescription>Select your preferred microphone input.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Mic className="h-4 w-4" />
            <span>{preferences.deviceLabel || "Default microphone in use"}</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={loadDevices}
            disabled={isLoading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="microphone">Microphone Device</Label>
          <select
            id="microphone"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            value={selectedDeviceId}
            onChange={handleChange}
            disabled={devices.length === 0 || isLoading}
          >
            <option value="">System default</option>
            {devices.map((device) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Microphone ${device.deviceId.slice(0, 4)}`}
              </option>
            ))}
          </select>
        </div>

        {permissionError && (
          <p className="text-sm text-destructive" role="alert">
            {permissionError}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          Your selection is stored locally and reused for future recordings.
        </p>
      </CardContent>
    </Card>
  );
}

