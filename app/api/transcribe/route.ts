import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getRepository } from '@/lib/data-source';
import { Dictionary } from '@/entities/Dictionary';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Groq from 'groq-sdk';

// Transcription engine priority
const USE_WHISPER_PRIMARY = true; // Set to false to use Gemini as primary

// Whisper configuration
const GROQ_WHISPER_MODEL = 'whisper-large-v3-turbo'; // Fastest Whisper model
const OPENAI_WHISPER_MODEL = 'whisper-1';

// Gemini fallback configuration
const PRIMARY_GEMINI_MODEL = process.env.GEMINI_MODEL_ID || 'gemini-2.5-flash-lite';
const DEFAULT_FALLBACKS = ['gemini-2.5-flash', 'gemini-2.5-pro'];
const MODEL_CANDIDATES = [PRIMARY_GEMINI_MODEL, ...DEFAULT_FALLBACKS];
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

// Post-processing validation model - using OpenAI for better accuracy
const OPENAI_VALIDATION_MODEL = 'gpt-4o-mini'; // Fast, accurate, cost-effective

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

/**
 * Remove duplicates from transcription using string-based heuristics (fast first pass)
 */
function removeDuplicatesHeuristic(text: string, previousContext: string | null): string {
  if (!previousContext || !text) return text;

  const prevLower = previousContext.toLowerCase().trim();
  const textLower = text.toLowerCase().trim();

  // Case 1: Exact duplicate
  if (textLower === prevLower) {
    console.log(`🚫 Removed exact duplicate`);
    return '';
  }

  // Case 2: New text starts with the entire previous context
  if (textLower.startsWith(prevLower)) {
    const cleaned = text.slice(previousContext.length).trim();
    console.log(`🚫 Removed previous context prefix (${previousContext.length} chars)`);
    return cleaned;
  }

  // Case 3: New text ends with significant overlap from previous context
  // Check last 50 chars of previous context
  const overlapCheckLength = Math.min(50, Math.floor(previousContext.length * 0.5));
  const prevSuffix = prevLower.slice(-overlapCheckLength);

  if (textLower.startsWith(prevSuffix)) {
    const cleaned = text.slice(overlapCheckLength).trim();
    console.log(`🚫 Removed overlapping suffix (${overlapCheckLength} chars)`);
    return cleaned;
  }

  // Case 4: Check for word-level overlap at the start
  const prevWords = previousContext.split(/\s+/);
  const textWords = text.split(/\s+/);

  // If more than 50% of the previous context words appear at the start of new text
  if (prevWords.length >= 3) {
    const lastNWords = prevWords.slice(-Math.min(10, prevWords.length));
    const overlapCount = lastNWords.filter((word, idx) =>
      textWords[idx]?.toLowerCase() === word.toLowerCase()
    ).length;

    if (overlapCount >= Math.ceil(lastNWords.length * 0.7)) {
      const cleaned = textWords.slice(overlapCount).join(' ');
      console.log(`🚫 Removed word-level overlap (${overlapCount} words)`);
      return cleaned;
    }
  }

  return text;
}

/**
 * Calculate simple similarity ratio between two strings (0-1)
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase().replace(/[^\w\s]/g, '');
  const s2 = str2.toLowerCase().replace(/[^\w\s]/g, '');

  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Build Whisper prompt with context and custom vocabulary
 * Whisper uses the prompt to maintain consistent spelling and context across audio segments
 */
function buildWhisperPrompt(previousContext: string | null, dictionaryWords: Dictionary[]): string {
  // Include more context (up to 400 chars) for better continuity
  // This helps Whisper understand technical terms, proper nouns, and sentence structure
  const contextPart = previousContext
    ? `${previousContext.slice(-400)}...` // Last 400 chars with ellipsis to show continuation
    : '';

  // Include custom vocabulary to improve accuracy for specialized terms
  const vocabularyPart = dictionaryWords.length > 0
    ? ` Custom terms: ${dictionaryWords.slice(0, 30).map(w => w.word).join(', ')}.`
    : '';

  return `${contextPart}${vocabularyPart}`.trim();
}

/**
 * Transcribe using Groq Whisper (fastest, most accurate)
 */
async function transcribeWithGroq(
  audioFile: File,
  prompt: string
): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.log('⏭️ Skipping Groq - no API key configured');
    return null;
  }

  try {
    const groq = new Groq({ apiKey });

    console.log(`🎙️ Attempting transcription with Groq Whisper (${GROQ_WHISPER_MODEL})...`);
    console.log(`🔍 File info: name=${audioFile.name}, size=${audioFile.size}, type=${audioFile.type}`);

    // Convert File to proper format for server-side SDKs
    // The file is already in the correct format from FormData, but we need to ensure it has the right properties
    const fileToSend = new File(
      [await audioFile.arrayBuffer()],
      audioFile.name.endsWith('.webm') ? audioFile.name : `audio-${Date.now()}.webm`,
      { type: 'audio/webm' }
    );

    const transcription = await groq.audio.transcriptions.create({
      file: fileToSend,
      model: GROQ_WHISPER_MODEL,
      prompt: prompt || undefined,
      response_format: 'json',
      language: 'en',
      temperature: 0.0, // Most deterministic for accuracy
    });

    const text = transcription.text.trim();
    console.log(`✅ Groq Whisper success: "${text}"`);

    return {
      text,
      model: GROQ_WHISPER_MODEL,
    };
  } catch (error: any) {
    console.error(`❌ Groq Whisper failed:`, error);
    console.error(`Error stack:`, error.stack);
    return null;
  }
}

/**
 * Transcribe using OpenAI Whisper (industry standard fallback)
 */
async function transcribeWithOpenAI(
  audioFile: File,
  prompt: string
): Promise<{ text: string; model: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('⏭️ Skipping OpenAI - no API key configured');
    return null;
  }

  try {
    const openai = new OpenAI({ apiKey });

    console.log(`🎙️ Attempting transcription with OpenAI Whisper (${OPENAI_WHISPER_MODEL})...`);

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: OPENAI_WHISPER_MODEL,
      prompt: prompt || undefined,
      response_format: 'json',
      language: 'en',
      temperature: 0.0,
    });

    const text = transcription.text.trim();
    console.log(`✅ OpenAI Whisper success: "${text}"`);

    return {
      text,
      model: OPENAI_WHISPER_MODEL,
    };
  } catch (error: any) {
    console.warn(`⚠️ OpenAI Whisper failed:`, error.message);
    return null;
  }
}

/**
 * OpenAI-powered post-processing to validate and clean transcription output
 * Uses GPT-4o-mini for fast, accurate duplicate detection and text cleaning
 */
async function validateTranscriptionWithOpenAI(
  transcribedText: string,
  previousContext: string | null
): Promise<string> {
  if (!previousContext || !transcribedText) {
    return transcribedText;
  }

  // Skip validation if text is very short (likely correct)
  if (transcribedText.split(/\s+/).length <= 3) {
    return transcribedText;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.log('⏭️ Skipping OpenAI validation - no API key');
    return transcribedText;
  }

  try {
    const openai = new OpenAI({ apiKey });

    console.log(`🔍 Running OpenAI (${OPENAI_VALIDATION_MODEL}) validation for duplicate detection...`);

    const completion = await openai.chat.completions.create({
      model: OPENAI_VALIDATION_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are a transcription quality control system. Your job is to detect and remove duplicate content between consecutive audio transcription slices.

Rules:
1. Compare the NEW TRANSCRIPTION against the PREVIOUS TRANSCRIPT
2. Remove any duplicate or overlapping content from the NEW TRANSCRIPTION
3. Keep only genuinely new spoken words
4. Maintain original capitalization and punctuation
5. Do NOT add, modify, or interpret - only remove duplicates
6. If the NEW TRANSCRIPTION is entirely duplicate, return exactly: [DUPLICATE]
7. Otherwise, return ONLY the cleaned new content, no explanations`
        },
        {
          role: 'user',
          content: `PREVIOUS TRANSCRIPT (already finalized):
"${previousContext}"

NEW TRANSCRIPTION (current audio slice):
"${transcribedText}"

Output the cleaned transcription (new content only):`
        }
      ],
      temperature: 0.0, // Maximum determinism
      max_tokens: 500,
      response_format: { type: 'text' }
    });

    let validatedText = completion.choices[0]?.message?.content?.trim() || '';

    // Check if it's marked as duplicate
    if (validatedText === '[DUPLICATE]' || validatedText.toLowerCase().includes('[duplicate]')) {
      console.log(`✅ OpenAI detected complete duplicate - returning empty`);
      return '';
    }

    // Additional cleaning - remove any prefixes the model might add
    validatedText = validatedText
      .replace(/^(Output|Result|Cleaned transcription|Here is the cleaned transcription)[:\-]?\s*/i, '')
      .replace(/^["'](.*)["']$/,'$1') // Remove surrounding quotes if any
      .trim();

    console.log(`✅ OpenAI validation complete: "${transcribedText}" → "${validatedText}"`);

    return validatedText;
  } catch (error: any) {
    console.warn(`⚠️ OpenAI validation failed:`, error.message);
    // If validation fails, return original (safer than blocking)
    return transcribedText;
  }
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
    // Build Whisper prompt with context and vocabulary
    const whisperPrompt = buildWhisperPrompt(previousContext, dictionaryWords);

    let transcriptionResult: { text: string; model: string } | null = null;
    let lastError: unknown = null;

    // 🎯 PRIMARY: Try Whisper models first (much more accurate for speech-to-text)
    if (USE_WHISPER_PRIMARY) {
      console.log(`🚀 Starting Whisper transcription for slice ${sliceIndex}`);
      console.log(`📊 Audio file: size=${audioFile.size} bytes, type=${audioFile.type}`);

      // Try Groq Whisper first (fastest)
      transcriptionResult = await transcribeWithGroq(audioFile, whisperPrompt);

      // Fallback to OpenAI Whisper if Groq fails
      if (!transcriptionResult) {
        console.log(`⚠️ Groq failed, trying OpenAI Whisper...`);
        transcriptionResult = await transcribeWithOpenAI(audioFile, whisperPrompt);
      }

      if (!transcriptionResult) {
        console.error(`❌ Both Whisper services failed! Falling back to Gemini.`);
      }

      // If Whisper succeeded, process and return
      if (transcriptionResult) {
        let text = transcriptionResult.text;

        // Handle empty/silence
        if (!text || text.toLowerCase().includes('silence') || text.toLowerCase().includes('no speech')) {
          return NextResponse.json({
            success: true,
            text: '',
            sliceIndex: parseInt(sliceIndex),
            model: transcriptionResult.model,
            engine: 'whisper',
            timestamp: Date.now(),
            noSpeech: true,
          });
        }

        console.log(`📝 Raw Whisper transcription: "${text}"`);

        // Apply deduplication
        text = removeDuplicatesHeuristic(text, previousContext);

        if (!text) {
          console.log(`🔇 Heuristic detected complete duplicate - returning empty`);
          return NextResponse.json({
            success: true,
            text: '',
            sliceIndex: parseInt(sliceIndex),
            model: transcriptionResult.model,
            engine: 'whisper',
            timestamp: Date.now(),
            duplicate: true,
          });
        }

        // Check similarity
        if (previousContext) {
          const similarity = calculateSimilarity(text, previousContext);
          console.log(`📊 Similarity score: ${(similarity * 100).toFixed(1)}%`);

          if (similarity > 0.90) {
            console.log(`🚫 Very high similarity (${(similarity * 100).toFixed(1)}%) - likely duplicate`);
            return NextResponse.json({
              success: true,
              text: '',
              sliceIndex: parseInt(sliceIndex),
              model: transcriptionResult.model,
              engine: 'whisper',
              timestamp: Date.now(),
              duplicate: true,
            });
          }

          // 🔍 STEP 3: OpenAI-powered validation for additional accuracy
          if (text.split(/\s+/).length > 3) {
            try {
              text = await validateTranscriptionWithOpenAI(text, previousContext);

              if (!text) {
                console.log(`🔇 OpenAI validation detected complete duplicate - returning empty`);
                return NextResponse.json({
                  success: true,
                  text: '',
                  sliceIndex: parseInt(sliceIndex),
                  model: transcriptionResult.model,
                  engine: 'whisper',
                  timestamp: Date.now(),
                  duplicate: true,
                });
              }
            } catch (validationError: any) {
              console.warn(`⚠️ OpenAI validation failed:`, validationError.message);
              // Continue with heuristic-cleaned text
            }
          }
        }

        console.log(`✨ Final cleaned text: "${text}"`);

        return NextResponse.json({
          success: true,
          text,
          sliceIndex: parseInt(sliceIndex),
          model: transcriptionResult.model,
          engine: 'whisper',
          timestamp: Date.now(),
        });
      }
    }

    // 🔄 FALLBACK: Use Gemini if Whisper is disabled or failed
    console.log('⚠️ Whisper unavailable, falling back to Gemini...');

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

    const geminiPrompt = `
You are a professional AI transcription system powering a real-time voice keyboard app.
You receive audio in small slices. Each slice must be transcribed independently but flow naturally with the previous text.

🚨 CRITICAL RULE - NO REPETITION:
${previousContext ? `The previous context is: "${previousContext}"\nThis is ALREADY TYPED. Do NOT include ANY of these words in your output.\nTranscribe ONLY the NEW audio in this slice. If the new audio is identical to previous context, return [NO_SPEECH].` : 'This is the first slice - transcribe everything you hear.'}

Follow these exact rules:

1. **Transcribe ONLY NEW content from THIS audio slice**
   - NEVER repeat, rephrase, or include ANY words from the previous context
   - If you're unsure, return ONLY the words that are definitely NEW
   - The previous context is provided for understanding continuity, NOT for inclusion

2. **Continuity:** Use the previous context to understand where this slice begins,
   then continue naturally - but ONLY with genuinely new spoken words

3. **Formatting:** Apply correct grammar, punctuation, and capitalization naturally.

4. **Accuracy:** Do not invent words or phrases that were not actually spoken.

5. **Clarity:** Remove filler sounds ("uh", "um"), false starts, or stutters unless intentional.

6. **Dictionary:** Use reference dictionary spellings *only if* the spoken term matches phonetically.

7. **No Speech Detection:** If the audio contains:
   - No speech / only silence / only background noise → return: [NO_SPEECH]
   - Speech that repeats the previous context → return: [NO_SPEECH]
   Do NOT return any other text, explanations, or variations.

8. **Output:** Return ONLY the clean NEW text from this slice — no timestamps, notes, explanations, or ANY repetition from previous context.

${dictionaryBlock}

${previousContext ? `\n⚠️  REMINDER: Previous context "${previousContext}" is ALREADY TYPED. Return ONLY what's NEW in this audio slice.\n` : ''}

Now transcribe the newly provided audio slice accurately (NEW content only):
`.trim();

    // Convert audio to base64 for Gemini
    const arrayBuffer = await audioFile.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    const genAI = new GoogleGenerativeAI(apiKey);

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
            { text: geminiPrompt },
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

          // 🔇 Detect [NO_SPEECH] marker or other "no speech" messages
          const noSpeechPatterns = [
            /^\[NO_SPEECH\]$/i,  // Our specific marker
            /^NO_SPEECH$/i,      // Without brackets
            /^I'?m sorry,?\s+(this|the)\s+audio\s+slice\s+(contains?|has)\s+no\s+speech\.?$/i,
            /^(No|There\s+is\s+no)\s+speech\s+(detected|found|in\s+this\s+audio)\.?$/i,
            /^This\s+audio\s+(contains?|has)\s+(only\s+)?(silence|background\s+noise|no\s+speech)\.?$/i,
            /^(Silence|No\s+audio|Empty\s+audio)\.?$/i,
          ];

          if (noSpeechPatterns.some(pattern => pattern.test(text))) {
            console.log(`🔇 Detected no-speech marker/message (model=${modelId}, attempt=${attempt}): "${text}"`);

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
          console.log(`📝 Raw transcription: "${text}"`);

          // 🧹 STEP 1: Apply fast heuristic-based deduplication
          let cleanedText = removeDuplicatesHeuristic(text, previousContext);

          if (!cleanedText) {
            console.log(`🔇 Heuristic detected complete duplicate - returning empty`);
            return NextResponse.json({
              success: true,
              text: '',
              sliceIndex: parseInt(sliceIndex),
              model: modelId,
              attempts: attempt,
              timestamp: Date.now(),
              duplicate: true,
            });
          }

          // 🧠 STEP 2: Check similarity (if very similar, likely a repeat)
          if (previousContext) {
            const similarity = calculateSimilarity(cleanedText, previousContext);
            console.log(`📊 Similarity score: ${(similarity * 100).toFixed(1)}%`);

            if (similarity > 0.85) {
              console.log(`🚫 High similarity detected (${(similarity * 100).toFixed(1)}%) - likely duplicate`);
              // Very high similarity suggests it's mostly duplicate content
              // But don't return empty - let AI validation make final decision
            }
          }

          // 🔍 STEP 3: OpenAI-powered validation (only if there's previous context and text is substantial)
          if (previousContext && cleanedText.split(/\s+/).length > 3) {
            try {
              cleanedText = await validateTranscriptionWithOpenAI(cleanedText, previousContext);

              if (!cleanedText) {
                console.log(`🔇 OpenAI validation detected complete duplicate - returning empty`);
                return NextResponse.json({
                  success: true,
                  text: '',
                  sliceIndex: parseInt(sliceIndex),
                  model: modelId,
                  attempts: attempt,
                  timestamp: Date.now(),
                  duplicate: true,
                });
              }
            } catch (validationError) {
              console.warn(`⚠️ OpenAI validation failed:`, validationError);
              // Continue with heuristic-cleaned text
            }
          }

          console.log(`✨ Final cleaned text: "${cleanedText}"`);

          return NextResponse.json({
            success: true,
            text: cleanedText,
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
