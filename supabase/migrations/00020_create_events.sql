-- ─── Events (covers both /plan and /event) ──────────────────────────────────
CREATE TABLE public.events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by      uuid        NOT NULL REFERENCES public.profiles(id)      ON DELETE CASCADE,
  name            text        NOT NULL,
  description     text,
  location        text,
  status          text        NOT NULL DEFAULT 'planning'
                                CHECK (status IN ('planning', 'confirmed')),
  starts_at       timestamptz,
  ends_at         timestamptz,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX events_conversation_idx ON public.events (conversation_id);

-- ─── Per-member availability slots (when2meet data) ─────────────────────────
CREATE TABLE public.event_availability (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  slots      jsonb       NOT NULL DEFAULT '[]',
  updated_at timestamptz DEFAULT now(),
  UNIQUE (event_id, user_id)
);

-- ─── RSVP once event is confirmed ───────────────────────────────────────────
CREATE TABLE public.event_rsvp (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  response   text        NOT NULL DEFAULT 'pending'
                           CHECK (response IN ('going', 'maybe', 'not_going', 'pending')),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (event_id, user_id)
);

-- ─── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_rsvp         ENABLE ROW LEVEL SECURITY;

-- events
CREATE POLICY "events: member select"
  ON public.events FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.conversation_members cm
    WHERE cm.conversation_id = events.conversation_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "events: member insert"
  ON public.events FOR INSERT
  WITH CHECK (
    auth.uid() = created_by AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
      WHERE cm.conversation_id = events.conversation_id AND cm.user_id = auth.uid()
    )
  );

CREATE POLICY "events: creator update"
  ON public.events FOR UPDATE
  USING (auth.uid() = created_by);

CREATE POLICY "events: creator delete"
  ON public.events FOR DELETE
  USING (auth.uid() = created_by);

-- event_availability
CREATE POLICY "availability: member select"
  ON public.event_availability FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.conversation_members cm ON cm.conversation_id = e.conversation_id
    WHERE e.id = event_availability.event_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "availability: owner insert"
  ON public.event_availability FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "availability: owner update"
  ON public.event_availability FOR UPDATE
  USING (auth.uid() = user_id);

-- event_rsvp
CREATE POLICY "rsvp: member select"
  ON public.event_rsvp FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.events e
    JOIN public.conversation_members cm ON cm.conversation_id = e.conversation_id
    WHERE e.id = event_rsvp.event_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "rsvp: owner insert"
  ON public.event_rsvp FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "rsvp: owner update"
  ON public.event_rsvp FOR UPDATE
  USING (auth.uid() = user_id);
