"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAudioPreferences } from "@/hooks/useAudioPreferences";

const SLICE_INTERVAL_OPTIONS = [
  {
    value: 3000,
    label: "3 seconds",
    description: "Fastest updates, slightly higher load",
  },
  {
    value: 5000,
    label: "5 seconds",
    description: "Balanced accuracy and latency",
  },
  {
    value: 7000,
    label: "7 seconds",
    description: "Higher accuracy, fewer network calls",
  },
] as const;

export function TranscriptionPreferences() {
  const { preferences, setPreferences } = useAudioPreferences();

  const selectedInterval = preferences.sliceIntervalMs ?? 5000;

  const selectedOption = useMemo(
    () =>
      SLICE_INTERVAL_OPTIONS.find((option) => option.value === selectedInterval) ??
      SLICE_INTERVAL_OPTIONS[1],
    [selectedInterval]
  );

  const handleIntervalChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = Number.parseInt(event.target.value, 10);
    setPreferences((current) => ({
      ...current,
      sliceIntervalMs: nextValue,
    }));
    toast.success(
      `Slice interval set to ${
        SLICE_INTERVAL_OPTIONS.find((option) => option.value === nextValue)?.label ?? `${nextValue / 1000} seconds`
      }`
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Transcription Preferences</CardTitle>
        <CardDescription>
          Control how frequently audio slices are sent for processing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2 text-sm text-muted-foreground">
          <SlidersHorizontal className="h-4 w-4" />
          <span>{selectedOption.description}</span>
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium">Slice Interval</Label>
          <div className="grid gap-2">
            {SLICE_INTERVAL_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex items-start space-x-3 rounded-lg border p-3 transition-colors ${
                  selectedInterval === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/60"
                }`}
              >
                <input
                  type="radio"
                  name="slice-interval"
                  value={option.value}
                  checked={selectedInterval === option.value}
                  onChange={handleIntervalChange}
                  className="mt-1 h-4 w-4 accent-primary"
                />
                <div>
                  <p className="font-medium">{option.label}</p>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          This preference is applied to new recording sessions. Longer intervals improve accuracy by
          providing more context, while shorter intervals improve responsiveness.
        </p>
      </CardContent>
    </Card>
  );
}

