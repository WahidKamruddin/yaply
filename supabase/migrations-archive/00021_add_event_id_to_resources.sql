-- Link albums, notes, and budgets optionally to an event
ALTER TABLE public.albums  ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.notes   ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
ALTER TABLE public.budgets ADD COLUMN event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;
