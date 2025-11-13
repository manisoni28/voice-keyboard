import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function Home() {
  const session = await auth();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <div className="max-w-3xl text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">
            Voice Keyboard
          </h1>
          <p className="text-xl text-muted-foreground">
            AI-Powered Voice to Text Transcription
          </p>
          <p className="text-muted-foreground">
            Speak naturally and get perfectly formatted text instantly.
            Save time with AI-powered dictation using sound clip slicing technology.
          </p>
        </div>

        <div className="flex gap-4 justify-center">
          <Link href="/signup">
            <Button size="lg">Get Started</Button>
          </Link>
          <Link href="/login">
            <Button size="lg" variant="outline">
              Sign In
            </Button>
          </Link>
        </div>

        <div className="pt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          <div className="space-y-2">
            <h3 className="font-semibold">⚡ Real-time Processing</h3>
            <p className="text-sm text-muted-foreground">
              Get instant results with our realtime buffering technology
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">🎯 Custom Dictionary</h3>
            <p className="text-sm text-muted-foreground">
              Add specialized terms and spellings for perfect accuracy
            </p>
          </div>
          <div className="space-y-2">
            <h3 className="font-semibold">📋 Easy Copy & Paste</h3>
            <p className="text-sm text-muted-foreground">
              One-click copy to use your transcriptions anywhere
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
