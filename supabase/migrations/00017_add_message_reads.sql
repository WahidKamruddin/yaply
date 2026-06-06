CREATE TABLE IF NOT EXISTS public.message_reads (
  message_id  uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  read_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS message_reads_message_idx ON public.message_reads(message_id);
ALTER TABLE public.message_reads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "message_reads: insert own"
  ON public.message_reads FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "message_reads: select in conversation"
  ON public.message_reads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversation_members cm ON cm.conversation_id = m.conversation_id
      WHERE m.id = message_reads.message_id AND cm.user_id = auth.uid()
    )
  );
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reads;
