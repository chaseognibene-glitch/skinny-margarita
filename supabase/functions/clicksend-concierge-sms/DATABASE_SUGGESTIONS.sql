create extension if not exists pgcrypto;

create table if not exists public.sms_booking_conversations (
  id uuid primary key default gen_random_uuid(),
  channel text not null default 'sms_webhook',
  customer_phone text not null,
  business_phone text,
  provider_conversation_id text,
  customer_name text,
  status text not null default 'active',
  latest_intent text not null default 'unclear',
  state jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  last_message_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists sms_booking_conversations_channel_phone_idx
  on public.sms_booking_conversations (channel, customer_phone);

create index if not exists sms_booking_conversations_status_idx
  on public.sms_booking_conversations (status);

create table if not exists public.sms_booking_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.sms_booking_conversations(id) on delete cascade,
  direction text not null check (direction in ('inbound', 'outbound')),
  provider text not null default 'sms_webhook',
  provider_message_id text,
  from_phone text,
  to_phone text,
  body text not null default '',
  ai jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists sms_booking_messages_conversation_created_idx
  on public.sms_booking_messages (conversation_id, created_at desc);

create unique index if not exists sms_booking_messages_provider_direction_message_idx
  on public.sms_booking_messages (provider, direction, provider_message_id)
  where provider_message_id is not null and provider_message_id <> '';

create or replace function public.set_sms_booking_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists sms_booking_conversations_set_updated_at
  on public.sms_booking_conversations;

create trigger sms_booking_conversations_set_updated_at
before update on public.sms_booking_conversations
for each row
execute function public.set_sms_booking_conversations_updated_at();
