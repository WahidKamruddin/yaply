-- Voice messages (iOS composer "Voice message" button; web renders <audio>).
-- Adds a new value to the message_type enum. Stored like other media:
-- content = '', iv = null, enc_v = null, media_url = public Storage URL,
-- media_mime = 'audio/mp4'. Not E2E encrypted (media never is).
alter type public.message_type add value if not exists 'voice';
