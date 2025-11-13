import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getRepository } from '@/lib/data-source';
import { Transcription } from '@/entities/Transcription';

// GET - Fetch all transcriptions for the authenticated user
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
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const transcriptionRepo = await getRepository(Transcription);

    const [transcriptions, total] = await transcriptionRepo.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
      skip: offset,
    });

    return NextResponse.json({
      success: true,
      transcriptions,
      total,
      limit,
      offset,
    });

  } catch (error: any) {
    console.error('Error fetching transcriptions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcriptions', details: error.message },
      { status: 500 }
    );
  }
}

// POST - Create a new transcription
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
    const { text, duration, metadata } = body;

    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'Transcription text is required' },
        { status: 400 }
      );
    }

    const transcriptionRepo = await getRepository(Transcription);

    // Create new transcription
    const newTranscription = transcriptionRepo.create({
      userId,
      text: text.trim(),
      duration: duration || null,
      // Store metadata like slice count, etc. if needed in the future
    });

    await transcriptionRepo.save(newTranscription);

    return NextResponse.json({
      success: true,
      transcription: newTranscription,
    }, { status: 201 });

  } catch (error: any) {
    console.error('Error creating transcription:', error);
    return NextResponse.json(
      { error: 'Failed to create transcription', details: error.message },
      { status: 500 }
    );
  }
}

// DELETE - Remove a transcription
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
        { error: 'Transcription ID is required' },
        { status: 400 }
      );
    }

    const transcriptionRepo = await getRepository(Transcription);

    // Find and delete the transcription
    const transcription = await transcriptionRepo.findOne({
      where: { id, userId },
    });

    if (!transcription) {
      return NextResponse.json(
        { error: 'Transcription not found' },
        { status: 404 }
      );
    }

    await transcriptionRepo.remove(transcription);

    return NextResponse.json({
      success: true,
      message: 'Transcription deleted successfully',
    });

  } catch (error: any) {
    console.error('Error deleting transcription:', error);
    return NextResponse.json(
      { error: 'Failed to delete transcription', details: error.message },
      { status: 500 }
    );
  }
}
