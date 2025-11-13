"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

interface ProfileSettingsFormProps {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    createdAt?: string;
  };
}

function getInitials(name?: string | null) {
  if (!name) return "U";

  const trimmed = name.trim();
  if (!trimmed) return "U";

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProfileSettingsForm({ user }: ProfileSettingsFormProps) {
  const { data: session, update } = useSession();
  const [name, setName] = useState(user.name ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChanges = useMemo(() => name.trim() !== (user.name ?? ""), [name, user.name]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name cannot be empty.");
      return;
    }

    if (trimmedName.length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }

    try {
      setIsSaving(true);

      const response = await fetch("/api/users/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: trimmedName }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to update profile");
      }

      const data = await response.json();

      toast.success("Profile updated successfully.");
      setName(data.user.name ?? trimmedName);

      if (session) {
        await update({
          ...session,
          user: {
            ...session.user,
            name: data.user.name ?? trimmedName,
          },
        });
      }
    } catch (err: any) {
      console.error("[ProfileSettings] Failed to update profile", err);
      const message =
        err instanceof Error ? err.message : "Failed to update profile.";
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setName(user.name ?? "");
    setError(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Update your profile information.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="flex items-center space-x-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                {getInitials(name || user.name)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-base">{user.name || "Unnamed User"}</p>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              {user.createdAt && (
                <p className="text-xs text-muted-foreground mt-1">
                  Member since {new Date(user.createdAt).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Enter your name"
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={user.email ?? ""}
                disabled
              />
              <p className="text-xs text-muted-foreground">
                Email changes will be available in a future update.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}

            <div className="flex items-center space-x-2">
              <Button type="submit" disabled={!hasChanges || isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleReset}
                disabled={!hasChanges || isSaving}
              >
                Reset
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

