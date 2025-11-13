import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getRepository } from '@/lib/data-source';
import { Dictionary } from '@/entities/Dictionary';
import { invalidateDictionaryCache } from '@/app/api/transcribe/route';

// GET - Fetch all dictionary entries for the authenticated user
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const dictionaryRepo = await getRepository(Dictionary);

    const entries = await dictionaryRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return NextResponse.json({
      success: true,
      entries,
    });

  } catch (error: any) {
    console.error('Error fetching dictionary:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dictionary entries', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Create a new dictionary entry
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const { word, context } = body;

    if (!word || word.trim().length === 0) {
      return NextResponse.json(
        { error: 'Word is required' },
        { status: 400 }
      );
    }

    const dictionaryRepo = await getRepository(Dictionary);

    // Check for duplicate words
    const existingEntry = await dictionaryRepo.findOne({
      where: { userId, word: word.trim() },
    });

    if (existingEntry) {
      return NextResponse.json(
        { error: 'This word already exists in your dictionary' },
        { status: 400 }
      );
    }

    // Create new entry
    const newEntry = dictionaryRepo.create({
      userId,
      word: word.trim(),
      context: context?.trim() || null,
    });

    await dictionaryRepo.save(newEntry);

    // Invalidate cache so next transcription uses updated dictionary
    invalidateDictionaryCache(userId);

    return NextResponse.json({
      success: true,
      entry: newEntry,
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating dictionary entry:', error);
    return NextResponse.json(
      { error: 'Failed to create dictionary entry', details: error.message },
      { status: 500 }
    );
  }
}

// PUT - Update an existing dictionary entry
export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const { id, word, context } = body;

    if (!id) {
      return NextResponse.json(
        { error: 'Entry ID is required' },
        { status: 400 }
      );
    }

    if (!word || word.trim().length === 0) {
      return NextResponse.json(
        { error: 'Word is required' },
        { status: 400 }
      );
    }

    const dictionaryRepo = await getRepository(Dictionary);

    // Find the entry
    const entry = await dictionaryRepo.findOne({
      where: { id, userId },
    });

    if (!entry) {
      return NextResponse.json(
        { error: 'Dictionary entry not found' },
        { status: 404 }
      );
    }

    // Check for duplicate words (excluding current entry)
    const duplicateEntry = await dictionaryRepo.findOne({
      where: { userId, word: word.trim() },
    });

    if (duplicateEntry && duplicateEntry.id !== id) {
      return NextResponse.json(
        { error: 'This word already exists in your dictionary' },
        { status: 400 }
      );
    }

    // Update entry
    entry.word = word.trim();
    entry.context = context?.trim() || null;

    await dictionaryRepo.save(entry);

    // Invalidate cache so next transcription uses updated dictionary
    invalidateDictionaryCache(userId);

    return NextResponse.json({
      success: true,
      entry,
    });

  } catch (error: any) {
    console.error('Error updating dictionary entry:', error);
    return NextResponse.json(
      { error: 'Failed to update dictionary entry', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Remove a dictionary entry
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { error: 'Entry ID is required' },
        { status: 400 }
      );
    }

    const dictionaryRepo = await getRepository(Dictionary);

    // Find and delete the entry
    const entry = await dictionaryRepo.findOne({
      where: { id, userId },
    });

    if (!entry) {
      return NextResponse.json(
        { error: 'Dictionary entry not found' },
        { status: 404 }
      );
    }

    await dictionaryRepo.remove(entry);

    // Invalidate cache so next transcription uses updated dictionary
    invalidateDictionaryCache(userId);

    return NextResponse.json({
      success: true,
      message: 'Dictionary entry deleted successfully',
    });

  } catch (error: any) {
    console.error('Error deleting dictionary entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete dictionary entry', details: error.message },
      { status: 500 }
    );
  }
}
