import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getRepository } from '@/lib/data-source';
import { Dictionary } from '@/entities/Dictionary';
import { GoogleGenerativeAI } from '@google/generative-ai';

const PRIMARY_GEMINI_MODEL = process.env.GEMINI_MODEL_ID || 'gemini-2.5-flash-lite';
const DEFAULT_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-pro'];
const MODEL_CANDIDATES = [PRIMARY_GEMINI_MODEL, ...DEFAULT_FALLBACKS];
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 800;

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id;
    const formData = await request.formData();
    const audioFile = formData.get('audio') as File | null;
    const sliceIndex = formData.get('sliceIndex') as string;
    const previousContext = formData.get('previousContext') as string | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // 🧠 Fetch custom vocabulary for better accuracy
    const dictionaryRepo = await getRepository(Dictionary);
    const dictionaryWords = await dictionaryRepo.find({ where: { userId } });

    // 🧩 Construct enhanced prompt
    const basePrompt = `
You are an advanced AI transcription engine used in a professional voice keyboard app.
Your task is to accurately convert spoken voice into clear, natural, well-punctuated text.

Follow these rules:
1. Transcribe exactly what is said.
2. Fix grammar and punctuation naturally.
3. Preserve the intent and tone.
4. Never hallucinate or invent new text.
5. Avoid filler words ("uh", "um") unless intentional.
6. Do not include timestamps or meta output.
7. Return only the transcribed text.

${dictionaryWords.length > 0 ? `
USER DICTIONARY (preferred spellings):
${dictionaryWords
          .slice(0, 50)
          .map((entry) => `- "${entry.word}"${entry.context ? ` (${entry.context})` : ''}`)
          .join('\n')}
` : ''}

${previousContext ? `
PREVIOUS CONTEXT (for name/term consistency only):
"${previousContext}"
` : ''}

Now transcribe the following audio accurately.
`.trim();

    // Convert audio to base64
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    const genAI = new GoogleGenerativeAI(apiKey);
    let lastError: unknown = null;

    // 🌀 Try each model with retries
    for (const modelId of MODEL_CANDIDATES) {
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelId,
            generationConfig: {
              temperature: 0.1,
              topP: 0.9,
              maxOutputTokens: 2048,
            },
          });

          // 👇 Explicitly tell Gemini to transcribe
          const parts = [
            { text: basePrompt },
            {
              inlineData: {
                mimeType: audioFile.type || 'audio/webm',
                data: base64Audio,
              },
            },
            { text: 'Please transcribe the above audio clip into natural written text.' },
          ];

          console.log(`🎙️ Attempting transcription with ${modelId}, attempt ${attempt}...`);

          const result = await model.generateContent({
            contents: [{ role: 'user', parts }],
          });

          const res = result.response;
          let text = '';

          // ✅ Robust extraction for Gemini 2.5+ responses
          if (typeof res.text === 'function') {
            text = res.text().trim();
          } else if (res?.candidates?.length) {
            const partsArray = res.candidates[0]?.content?.parts || [];
            text = partsArray.map((p: any) => p.text || '').join(' ').trim();
          }

          if (!text) {
            console.warn(
              `⚠️ Empty transcription (model=${modelId}, attempt=${attempt})`,
              JSON.stringify(res, null, 2).slice(0, 600)
            );
            throw new Error(`Empty transcription (model=${modelId}, attempt=${attempt})`);
          }

          // 🧼 Clean up artifacts
          text = text
            .replace(/\b\d{2}:\d{2}\b/g, '') // remove timestamps
            .replace(/\s+/g, ' ')
            .replace(/^(Output|Transcription|Result)[:\-]?\s*/i, '')
            .trim();

          console.log(`✅ Transcription success (model=${modelId}, attempt=${attempt})`);

          return NextResponse.json({
            success: true,
            text,
            sliceIndex: parseInt(sliceIndex),
            model: modelId,
            attempts: attempt,
            timestamp: Date.now(),
          });
        } catch (err: any) {
          lastError = err;
          const retryable =
            err instanceof Error &&
            /(overloaded|timeout|temporarily unavailable|503|rate limit)/i.test(err.message);

          console.warn(`⚠️ Transcription failed (model=${modelId}, attempt=${attempt}):`, err);

          if (retryable && attempt < MAX_RETRIES) {
            const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
            console.log(`⏳ Retrying after ${delay}ms...`);
            await new Promise((res) => setTimeout(res, delay));
            continue;
          }

          break;
        }
      }
    }

    throw lastError ?? new Error('All models failed to transcribe');
  } catch (error: any) {
    console.error('❌ Transcription error:', error);
    return NextResponse.json(
      {
        error: 'Transcription failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
