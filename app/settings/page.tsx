import { auth } from "@/lib/auth";
import { getRepository } from "@/lib/data-source";
import { User } from "@/entities/User";
import { Transcription } from "@/entities/Transcription";
import { Dictionary } from "@/entities/Dictionary";
import { ProfileSettingsForm } from "@/components/settings/profile-settings-form";
import { AudioDeviceSelector } from "@/components/settings/audio-device-selector";
import { TranscriptionPreferences } from "@/components/settings/transcription-preferences";
import { AccountDetailsCard } from "@/components/settings/account-details-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

async function fetchUsageStats(userId: string) {
  const transcriptionRepository = await getRepository(Transcription);
  const dictionaryRepository = await getRepository(Dictionary);

  const [totalTranscriptions, totalDictionaryEntries, totalDurationRaw] = await Promise.all([
    transcriptionRepository.count({
      where: { userId },
    }),
    dictionaryRepository.count({
      where: { userId },
    }),
    transcriptionRepository
      .createQueryBuilder("transcription")
      .select("SUM(transcription.duration)", "total")
      .where("transcription.userId = :userId", { userId })
      .getRawOne<{ total: string | null }>(),
  ]);

  const totalDurationSeconds = totalDurationRaw?.total ? Number(totalDurationRaw.total) : 0;

  return {
    totalTranscriptions,
    totalDictionaryEntries,
    totalDurationSeconds,
  };
}

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unable to load settings without an authenticated session.");
  }

  const userRepository = await getRepository(User);
  const user = await userRepository.findOne({
    where: { id: session.user.id },
  });

  if (!user) {
    throw new Error("User account not found.");
  }

  const stats = await fetchUsageStats(user.id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold mb-2">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account details, audio preferences, and transcription settings.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileSettingsForm
          user={{
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt?.toISOString(),
          }}
        />
        <AccountDetailsCard
          details={{
            email: user.email,
            createdAt: user.createdAt,
          }}
          stats={stats}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <AudioDeviceSelector />
        <TranscriptionPreferences />
      </div>

      <Card className="border-destructive/60">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Permanently delete your account and transcription history.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="destructive" disabled>
            Delete Account
          </Button>
          <p className="text-xs text-muted-foreground">
            Account deletion is coming soon. Contact support if you need help right away.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
