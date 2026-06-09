-- Create the passes table
CREATE TABLE IF NOT EXISTS public.passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  remaining_uses INTEGER NOT NULL,
  total_uses INTEGER NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS) on the table
ALTER TABLE public.passes ENABLE ROW LEVEL SECURITY;

-- Create an RLS policy that allows users to SELECT only their own passes
CREATE POLICY "Users can view their own passes"
  ON public.passes
  FOR SELECT
  USING (auth.uid() = user_id);

-- Create an RLS policy giving admins full access to passes
CREATE POLICY "Admins have full access to passes"
  ON public.passes
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()
    )
  );