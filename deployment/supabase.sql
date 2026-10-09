create extension if not exists pgcrypto;

create table if not exists public.digestlect_sync (
  key_hash text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.digestlect_sync enable row level security;
revoke all on table public.digestlect_sync from anon, authenticated;

create or replace function public.get_digestlect_state(p_key text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select payload
  from public.digestlect_sync
  where key_hash = encode(digest(upper(regexp_replace(p_key, '[^A-Z2-9]', '', 'g')), 'sha256'), 'hex');
$$;

create or replace function public.set_digestlect_state(p_key text, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if length(regexp_replace(p_key, '[^A-Z2-9]', '', 'g')) <> 16 then
    raise exception 'invalid sync key';
  end if;

  insert into public.digestlect_sync (key_hash, payload, updated_at)
  values (
    encode(digest(upper(regexp_replace(p_key, '[^A-Z2-9]', '', 'g')), 'sha256'), 'hex'),
    p_payload,
    now()
  )
  on conflict (key_hash) do update
  set payload = excluded.payload, updated_at = excluded.updated_at;
end;
$$;

revoke all on function public.get_digestlect_state(text) from public;
revoke all on function public.set_digestlect_state(text, jsonb) from public;
grant execute on function public.get_digestlect_state(text) to anon, authenticated;
grant execute on function public.set_digestlect_state(text, jsonb) to anon, authenticated;

