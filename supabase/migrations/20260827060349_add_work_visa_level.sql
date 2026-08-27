-- New test tier: "Work & Visa English" (code WV) — a professional-level
-- certification distinct from the CEFR ladder, aimed at work permit and
-- visa applications. ADD VALUE runs alone, in its own migration file, so it
-- is always committed before any later statement could reference it.
ALTER TYPE public.test_level ADD VALUE 'WV';
