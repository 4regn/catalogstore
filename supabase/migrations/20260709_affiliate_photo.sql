-- Affiliate profile photo
-- Run this in your Supabase SQL editor.

alter table affiliates add column if not exists photo_url text;
