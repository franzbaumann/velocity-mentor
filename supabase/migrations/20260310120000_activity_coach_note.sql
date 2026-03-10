-- Add coach_note column for AI-generated activity feedback
ALTER TABLE activity ADD COLUMN IF NOT EXISTS coach_note text;
