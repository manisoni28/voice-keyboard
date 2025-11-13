# Voice Keyboard - AI-Powered Voice to Text App

An AI-powered voice keyboard application that converts speech into well-formatted text using sound clip slicing for real-time transcription.

## Tech Stack

- **Frontend & Backend:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **UI Components:** ShadCN UI
- **Database:** PostgreSQL with TypeORM
- **Authentication:** NextAuth.js v5
- **Voice-to-Text:** Google Gemini 2.5 Flash (via @google/generative-ai)
- **Audio Recording:** RecordRTC with Web Audio API
- **Transcription Method:** Sound Clip Slicing (as per PRD)
- **Hosting:** Railway

## Project Structure

```
voice-keyboard/
├── app/                    # Next.js 15 app router
│   ├── globals.css        # Global styles with Tailwind
│   ├── layout.tsx         # Root layout
│   └── page.tsx           # Home page
├── components/            # React components
│   └── ui/               # ShadCN UI components
├── entities/             # TypeORM entities
│   ├── User.ts
│   ├── Transcription.ts
│   └── Dictionary.ts
├── lib/                  # Utilities and configurations
│   ├── data-source.ts   # TypeORM data source
│   └── utils.ts         # Helper functions
├── types/               # TypeScript type definitions
└── public/             # Static assets
```

## Phase 1 Setup - Completed ✅

### 1.1 Initialize Next.js Project ✅
- ✅ Created Next.js 15 project with TypeScript
- ✅ Set up folder structure (app/, components/, lib/, types/, entities/)
- ✅ Configured TypeScript with decorator support for TypeORM
- ✅ Installed and configured Tailwind CSS

### 1.2 Install Core Dependencies ✅
- ✅ Installed ShadCN UI and core components (button, input, card, form, sonner, label)
- ✅ Installed NextAuth v5 (beta) for authentication
- ✅ Installed TypeORM with PostgreSQL driver and reflect-metadata
- ✅ Installed RecordRTC for audio recording
- ✅ Installed Google Generative AI SDK for Gemini transcription
- ✅ Installed react-hook-form and zod for form handling

### 1.3 TypeORM Configuration ✅
- ✅ Created TypeORM data source configuration with singleton pattern
- ✅ Enabled TypeScript decorator support in tsconfig.json
- ✅ Configured Next.js for TypeORM entity loading

### 1.4 Database Setup ✅
- ✅ Defined TypeORM entities:
  - User entity (id, email, password, name, createdAt)
  - Transcription entity (id, userId, text, duration, createdAt, updatedAt)
  - Dictionary entity (id, userId, word, context, createdAt)
- ✅ Set up entity relationships (OneToMany, ManyToOne)

### 1.5 Environment Configuration ✅
- ✅ Created .env.example with all required variables
- ✅ Created .env.local for local development
- ✅ Created .gitignore for security

## Getting Started

### Prerequisites

- Node.js 18+ installed
- PostgreSQL database (Railway or local)
- Google Gemini API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd voice-keyboard
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your credentials:
- `DATABASE_URL`: Your PostgreSQL connection string from Railway
- `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
- `GEMINI_API_KEY`: Your Google Generative AI key (get from https://aistudio.google.com)
- `GEMINI_MODEL_ID` (optional): Primary model (defaults to `gemini-2.5-flash`)
- `GEMINI_MODEL_FALLBACKS` (optional): Comma-separated fallback models, e.g. `gemini-1.5-flash,gemini-1.5-flash-8b`

### Railway Database Setup

1. Go to [Railway](https://railway.com) and create an account
2. Create a new project
3. Add a PostgreSQL database
4. Copy the `DATABASE_URL` from Railway variables
5. Paste it into your `.env.local` file

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Database Synchronization

In development mode, TypeORM will automatically synchronize the database schema with your entities. In production, you should use migrations.

### Create a Migration (for production)

```bash
npm run typeorm migration:generate -- -n MigrationName
npm run typeorm migration:run
```

## Features

- ✅ User authentication (signup/login)
- ✅ Real-time voice transcription with sound clip slicing
- ✅ Transcription history with copy-to-clipboard
- ✅ Custom dictionary for specialized vocabulary
- ✅ Responsive design for all devices
- ✅ Audio device selection
- ✅ Pause/resume recording
- ✅ Real-time slice processing visualization
- ⏳ Railway deployment

## How It Works

The app uses **sound clip slicing** for efficient transcription:

1. **Audio Capture**: Records audio in configurable slices (default: 5 seconds)
2. **Real-time Processing**: Each slice is sent to Gemini API as it's captured
3. **Incremental Transcription**: Results are merged continuously with context preservation
4. **Low Latency**: Maximum delay is just the time to process the final slice

This approach provides a better user experience than recording the entire session and transcribing at the end, while being simpler and more reliable than WebSocket streaming.
