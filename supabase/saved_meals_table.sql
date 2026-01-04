-- ============================================================================
-- SAVED MEALS TABLE
-- Stores user's saved meal combinations for quick @ mention access
-- ============================================================================

CREATE TABLE IF NOT EXISTS saved_meals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- slug like "can-sushi"
  display_name TEXT NOT NULL, -- Pretty name like "Can Sushi"
  description TEXT NOT NULL, -- Full ingredient description
  summary TEXT NOT NULL, -- Short AI summary for dropdown preview
  total_calories INTEGER NOT NULL DEFAULT 0,
  total_protein INTEGER NOT NULL DEFAULT 0,
  items JSONB NOT NULL DEFAULT '[]', -- Array of {description, calories, protein, emoji}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint: one meal name per user
  UNIQUE(user_id, name)
);

-- Index for quick lookup by user
CREATE INDEX IF NOT EXISTS idx_saved_meals_user_id ON saved_meals(user_id);

-- Index for name lookups
CREATE INDEX IF NOT EXISTS idx_saved_meals_name ON saved_meals(user_id, name);

-- Enable Row Level Security
ALTER TABLE saved_meals ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own saved meals
CREATE POLICY "Users can view own saved meals"
  ON saved_meals FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved meals"
  ON saved_meals FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved meals"
  ON saved_meals FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved meals"
  ON saved_meals FOR DELETE
  USING (auth.uid() = user_id);

