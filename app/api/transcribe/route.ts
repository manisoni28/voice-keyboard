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

// Dictionary cache to avoid repeated DB queries during a recording session
interface DictionaryCacheEntry {
  words: Dictionary[];
  timestamp: number;
}

const dictionaryCache = new Map<string, DictionaryCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes - enough for a recording session

// Clean up expired cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of dictionaryCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      dictionaryCache.delete(userId);
      console.log(`🗑️ Cleared expired dictionary cache for user ${userId}`);
    }
  }
}, 60 * 1000); // Check every minute

// Helper function to invalidate cache when dictionary is updated
export function invalidateDictionaryCache(userId: string) {
  dictionaryCache.delete(userId);
  console.log(`🔄 Invalidated dictionary cache for user ${userId}`);
}

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

    // 🧠 Fetch custom vocabulary for better accuracy (with caching)
    let dictionaryWords: Dictionary[];
    const cachedEntry = dictionaryCache.get(userId);
    const now = Date.now();

    if (cachedEntry && (now - cachedEntry.timestamp) < CACHE_TTL_MS) {
      // Use cached dictionary
      dictionaryWords = cachedEntry.words;
      console.log(`✅ Using cached dictionary for user ${userId} (${dictionaryWords.length} words)`);
    } else {
      // Fetch from database and cache it
      const dictionaryRepo = await getRepository(Dictionary);
      const fetchedWords = await dictionaryRepo.find({ where: { userId } }) as Dictionary[];
      dictionaryWords = fetchedWords;
      dictionaryCache.set(userId, { words: dictionaryWords, timestamp: now });
      console.log(`📚 Fetched and cached dictionary for user ${userId} (${dictionaryWords.length} words)`);
    }
    const dictionaryBlock = dictionaryWords.length
      ? `REFERENCE_DICTIONARY (for recognition and spelling support only):
${dictionaryWords
        .slice(0, 100)
        .map((w) => `- ${w.word}${w.context ? ` — ${w.context}` : ''}`)
        .join('\n')}
Use these terms only if the speaker clearly says them or something that phonetically matches them.
Do NOT add, infer, or force them if they were not spoken.
`
      : '';

    const basePrompt = `
You are a professional AI transcription system powering a real-time voice keyboard app.
You receive audio in small slices. Each slice must be transcribed independently but flow naturally with the previous text.

Follow these exact rules:

1. **Transcribe only what was spoken in this slice.**
   - Do NOT repeat or rewrite any part of the previous transcript.
   - Do NOT summarize or guess what comes next.
2. **Continuity:** Read the previous context to understand where this slice begins,
   then continue naturally without duplication or abrupt phrasing.
3. **Formatting:** Apply correct grammar, punctuation, and capitalization naturally.
4. **Accuracy:** Do not invent words or phrases that were not actually spoken.
5. **Clarity:** Remove filler sounds ("uh", "um"), false starts, or stutters unless intentional.
6. **Dictionary:** Use reference dictionary spellings *only if* the spoken term matches phonetically.
7. **No Speech Detection:** If the audio contains no speech, only silence, or only background noise, you must return absolutely NOTHING - not a single character, not any explanation, apology, or comment. Just leave your response completely blank/empty.
8. **Output:** Return ONLY the clean text corresponding to this slice — no timestamps, notes, or repetition.

${previousContext ? `PREVIOUS CONTEXT (already finalized, do not repeat):\n"${previousContext}"\n` : ''}

${dictionaryBlock}

Now transcribe the newly provided audio slice accurately and naturally:
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

          // 🔇 Handle empty response (no speech detected)
          if (!text) {
            console.log(`🔇 No speech detected (model=${modelId}, attempt=${attempt})`);

            // Return success with empty text - don't retry with other models
            // This is not an error, Gemini correctly identified no speech
            return NextResponse.json({
              success: true,
              text: '',
              sliceIndex: parseInt(sliceIndex),
              model: modelId,
              attempts: attempt,
              timestamp: Date.now(),
              noSpeech: true,
            });
          }

          // 🧼 Clean up artifacts
          text = text
            .replace(/\b\d{2}:\d{2}\b/g, '') // remove timestamps
            .replace(/\s+/g, ' ')
            .replace(/^(Output|Transcription|Result)[:\-]?\s*/i, '')
            // Remove common AI hallucinations
            .replace(/Please transcribe the above audio clip into natural written text\.?/gi, '')
            .replace(/I'?m not sure what you'?re asking me to transcribe\.?/gi, '')
            .replace(/Please provide the audio or text you would like me to process\.?/gi, '')
            .replace(/I cannot transcribe\.?/gi, '')
            .replace(/I don'?t have access to audio\.?/gi, '')
            .replace(/Please provide audio\.?/gi, '')
            .replace(/\s+/g, ' ') // clean up extra spaces after removal
            .trim();

          // 🔇 Detect "no speech" apologetic messages and treat as empty
          const noSpeechPatterns = [
            /^I'?m sorry,?\s+(this|the)\s+audio\s+slice\s+(contains?|has)\s+no\s+speech\.?$/i,
            /^(No|There\s+is\s+no)\s+speech\s+(detected|found|in\s+this\s+audio)\.?$/i,
            /^This\s+audio\s+(contains?|has)\s+(only\s+)?(silence|background\s+noise|no\s+speech)\.?$/i,
            /^(Silence|No\s+audio|Empty\s+audio)\.?$/i,
          ];

          if (noSpeechPatterns.some(pattern => pattern.test(text))) {
            console.log(`🔇 Detected apologetic no-speech message (model=${modelId}, attempt=${attempt}): "${text}"`);

            // Treat as no speech - return empty text
            return NextResponse.json({
              success: true,
              text: '',
              sliceIndex: parseInt(sliceIndex),
              model: modelId,
              attempts: attempt,
              timestamp: Date.now(),
              noSpeech: true,
            });
          }

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
