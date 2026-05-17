# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start dev server at localhost:8080
npm run build      # production build
npm run lint       # ESLint
npm run test       # run tests once (Vitest)
npm run test:watch # run tests in watch mode
```

Run a single test file:
```bash
npx vitest run src/path/to/file.test.ts
```

Deploy: hosted on Vercel with a catch-all rewrite to `index.html` (SPA). Supabase Edge Functions are deployed separately via the Supabase CLI.

## Environment Variables

Required in `.env`:
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key

## Architecture

**Lexicon English Certification** — a web app where users book English proficiency exams (CEFR levels A1–C2), take them online, and receive verifiable certificates.

### Stack
- React 18 + TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix primitives)
- Supabase (Postgres DB + Auth + Storage + Edge Functions)
- TanStack Query for server state, React Router v6 for routing
- jsPDF + qrcode for PDF certificate generation

### User Flow
1. **Auth** (`/auth`) — Supabase email auth; profile row created automatically
2. **Dashboard** (`/dashboard`) — user books an exam slot for a chosen CEFR level; pricing is in USD but displayed in local currency
3. **Exam** (`/exam/:id`) — three-step flow: *Listening* (Web Speech API TTS dictation, 2 plays max) → *Reading* (passage displayed; user records audio response via MediaRecorder) → *Review/Submit*
4. **Admin approval** (`/admin`) — admin reviews submitted attempts (listening transcription + reading audio URL), calls the `approve-attempt` Edge Function which issues a certificate
5. **Results** (`/results/:id`) — shows band, skill percentages
6. **Certificate** (`/certificate/:number`) — downloadable PDF with QR code linking to `/verify/:number`
7. **Verify** (`/verify`) — public, unauthenticated certificate lookup

### Database Tables (Supabase)
- `profiles` — user display name, country
- `bookings` — exam bookings; statuses: `pending | confirmed | completed | cancelled`
- `exam_attempts` — the actual exam session; statuses: `not_started | in_progress | submitted | graded`; `approval_status`: `pending | approved | rejected`
- `questions` — MCQ bank keyed by level and section
- `certificates` — issued on approval; `certificate_number` format: `LEC-{year}-{8chars}`
- `user_roles` — `admin | user`; admin check done by querying this table in `useAuth`

### Edge Functions (`supabase/functions/`)
All written in Deno/TypeScript. They use the service role key for privileged DB writes and verify the caller's JWT via the anon key before acting.

- **`start-exam`** — creates an `exam_attempts` row with a randomly selected listening prompt and reading passage for the given level
- **`submit-exam`** — marks attempt as `submitted`, updates booking to `completed`, stores the candidate's listening response text and reading audio URL
- **`approve-attempt`** — admin-only; grades attempt, sets `final_band`, and inserts a row into `certificates` with per-skill percentages

### Key Lib Modules
- [src/lib/auth.ts](src/lib/auth.ts) — `useAuth()` hook (user, session, isAdmin) and `signOut()`
- [src/lib/currency.ts](src/lib/currency.ts) — static FX rate table, country→currency mapping, localStorage persistence, `formatPrice()`. Currency preference synced between localStorage (`lexicon_currency`) and the `profiles.country` column.
- [src/lib/levels.ts](src/lib/levels.ts) — `LEVELS` array (code, name, price in USD, duration), `bandFromScore()`, and `WRITING_PROMPTS` per level
- [src/hooks/useCurrency.ts](src/hooks/useCurrency.ts) — React hook that reactively reads currency from storage via a custom `currency-change` window event

### Path Alias
`@/` maps to `src/` — use it for all internal imports.

### Admin Access
The `/admin` page requires both `isAdmin` (from `user_roles` table) and a session-storage passcode (`lexicon_admin_unlocked`). The `approve-attempt` Edge Function independently re-checks admin role server-side.

### Certificate PDF Generation
Done entirely client-side in [src/pages/Certificate.tsx](src/pages/Certificate.tsx) using jsPDF. Embeds logo, stamp, and signature as data URLs alongside a QR code pointing to the public verify URL.
