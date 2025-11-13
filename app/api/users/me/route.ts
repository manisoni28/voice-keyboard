import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRepository } from "@/lib/data-source";
import { User } from "@/entities/User";
import { Transcription } from "@/entities/Transcription";
import { Dictionary } from "@/entities/Dictionary";

async function ensureAuthenticatedUser() {
  const session = await auth();

  if (!session?.user?.id) {
    return null;
  }

  return session.user.id;
}

async function loadUser(userId: string) {
  const userRepository = await getRepository(User);
  return userRepository.findOne({
    where: { id: userId },
  });
}

async function computeUsageStats(userId: string) {
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

export async function GET() {
  try {
    const userId = await ensureAuthenticatedUser();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await loadUser(userId);

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const stats = await computeUsageStats(userId);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
      stats,
    });
  } catch (error) {
    console.error("[UserSettings][GET] Failed to load profile", error);
    return NextResponse.json(
      { error: "Failed to load user settings" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const userId = await ensureAuthenticatedUser();

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { name } = await request.json();

    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json(
        { error: "Name is required" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      return NextResponse.json(
        { error: "Name must be at least 2 characters" },
        { status: 400 }
      );
    }

    if (trimmedName.length > 100) {
      return NextResponse.json(
        { error: "Name must be 100 characters or fewer" },
        { status: 400 }
      );
    }

    const userRepository = await getRepository(User);
    const user = await userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    user.name = trimmedName;
    await userRepository.save(user);

    return NextResponse.json({
      message: "Profile updated successfully",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error("[UserSettings][PATCH] Failed to update profile", error);
    return NextResponse.json(
      { error: "Failed to update profile" },
      { status: 500 }
    );
  }
}

