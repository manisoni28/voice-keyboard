import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface AccountDetailsCardProps {
  details: {
    email: string | null;
    createdAt?: Date | string | null;
  };
  stats: {
    totalTranscriptions: number;
    totalDictionaryEntries: number;
    totalDurationSeconds?: number;
  };
}

function formatDate(value?: Date | string | null) {
  if (!value) return "—";

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatDuration(seconds?: number) {
  if (!seconds || seconds <= 0) {
    return "—";
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}m ${remainingSeconds}s`;
}

export function AccountDetailsCard({ details, stats }: AccountDetailsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account Details</CardTitle>
        <CardDescription>Helpful context and usage statistics.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Email</p>
          <p className="text-base">{details.email}</p>
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Member Since</p>
          <p className="text-base">{formatDate(details.createdAt)}</p>
        </div>

        <Separator />

        <div className="grid gap-3">
          <StatRow label="Transcriptions saved" value={stats.totalTranscriptions.toLocaleString()} />
          <StatRow label="Dictionary entries" value={stats.totalDictionaryEntries.toLocaleString()} />
          <StatRow label="Recorded audio processed" value={formatDuration(stats.totalDurationSeconds)} />
        </div>
      </CardContent>
    </Card>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

