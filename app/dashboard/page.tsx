import { auth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Book } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DictationInterface } from "@/components/dictation-interface";
import { TranscriptionList } from "@/components/transcription-list";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div>
        <h1 className="text-3xl font-bold mb-2">
          Welcome back, {session?.user?.name}!
        </h1>
        <p className="text-muted-foreground">
          Start dictating or manage your transcriptions and dictionary
        </p>
      </div>

      {/* Dictation Interface */}
      <DictationInterface />

      {/* Transcription History */}
      <TranscriptionList />

      {/* Quick Actions */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <div className="flex items-center space-x-2">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <Book className="h-5 w-5 text-green-500" />
              </div>
              <CardTitle>Dictionary</CardTitle>
            </div>
            <CardDescription>
              Manage your custom vocabulary for better transcription accuracy
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dictionary">
              <Button variant="outline" className="w-full">
                <Book className="mr-2 h-4 w-4" />
                Manage Dictionary
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
            <CardDescription>
              Sound clip slicing for efficient transcription
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Click the microphone to start recording</p>
            <p>2. Audio is sliced and processed in real-time</p>
            <p>3. Your custom dictionary improves accuracy</p>
            <p>4. Copy or save your transcription when done</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
