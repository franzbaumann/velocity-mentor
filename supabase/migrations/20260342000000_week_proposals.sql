-- Weekly Plan Proposal System: store generated week proposals for athlete approval

CREATE TABLE IF NOT EXISTS week_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  week_start_date date NOT NULL,
  sessions_json jsonb NOT NULL,
  week_summary_json jsonb NOT NULL,
  coach_message text NOT NULL,
  generated_at timestamptz DEFAULT now(),
  responded_at timestamptz,
  UNIQUE(user_id, week_start_date)
);

CREATE INDEX IF NOT EXISTS idx_week_proposals_user_status ON week_proposals (user_id, status);

ALTER TABLE week_proposals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own proposals" ON week_proposals;
CREATE POLICY "Users manage own proposals" ON week_proposals
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
