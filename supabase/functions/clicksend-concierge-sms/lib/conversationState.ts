import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  createEmptyState,
} from "./serviceLogic.ts";
import type {
  InterpreterOutput,
  JsonRecord,
  SmsConversationRecord,
  SmsMessageRecord,
} from "./types.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  global: {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  },
});

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function safeObject(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

export async function getOrCreateConversation(input: {
  channel: string;
  customerPhone: string;
  businessPhone: string;
  providerConversationId: string;
}) {
  const existing = await supabase
    .from("sms_booking_conversations")
    .select("*")
    .eq("channel", normalizeString(input.channel) || "sms_webhook")
    .eq("customer_phone", normalizeString(input.customerPhone))
    .limit(1)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data) {
    return existing.data as SmsConversationRecord;
  }

  const insert = await supabase
    .from("sms_booking_conversations")
    .insert({
      channel: normalizeString(input.channel) || "sms_webhook",
      customer_phone: normalizeString(input.customerPhone),
      business_phone: normalizeString(input.businessPhone) || null,
      latest_intent: "unclear",
      state: createEmptyState(normalizeString(input.customerPhone)),
      metadata: {
        provider_conversation_id: normalizeString(input.providerConversationId) || null,
      },
      status: "active",
      last_message_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (insert.error) throw insert.error;
  return insert.data as SmsConversationRecord;
}

export async function listRecentMessages(conversationId: string, limit = 12) {
  const query = await supabase
    .from("sms_booking_messages")
    .select("*")
    .eq("conversation_id", normalizeString(conversationId))
    .order("created_at", { ascending: false })
    .limit(limit);

  if (query.error) throw query.error;
  const rows = Array.isArray(query.data) ? query.data : [];
  return rows.reverse() as SmsMessageRecord[];
}

export async function storeMessage(input: {
  conversationId: string;
  direction: "inbound" | "outbound";
  provider: string;
  providerMessageId: string;
  fromPhone: string;
  toPhone: string;
  body: string;
  rawPayload: JsonRecord;
  ai?: JsonRecord;
}) {
  const messageId = normalizeString(input.providerMessageId);
  if (messageId) {
    const existing = await supabase
      .from("sms_booking_messages")
      .select("id")
      .eq("provider", normalizeString(input.provider) || "sms_webhook")
      .eq("direction", normalizeString(input.direction))
      .eq("provider_message_id", messageId)
      .limit(1)
      .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) return existing.data;
  }

  const insert = await supabase
    .from("sms_booking_messages")
    .insert({
      conversation_id: normalizeString(input.conversationId),
      direction: normalizeString(input.direction),
      provider: normalizeString(input.provider) || "sms_webhook",
      provider_message_id: messageId || null,
      from_phone: normalizeString(input.fromPhone) || null,
      to_phone: normalizeString(input.toPhone) || null,
      body: normalizeString(input.body),
      raw_payload: safeObject(input.rawPayload),
      ai: safeObject(input.ai),
    })
    .select("id")
    .single();

  if (insert.error) throw insert.error;
  return insert.data;
}

export async function updateConversationInterpretation(
  conversationId: string,
  interpretation: InterpreterOutput,
) {
  const existingQuery = await supabase
    .from("sms_booking_conversations")
    .select("metadata")
    .eq("id", normalizeString(conversationId))
    .limit(1)
    .maybeSingle();

  if (existingQuery.error) throw existingQuery.error;
  const existingMetadata = safeObject(existingQuery.data?.metadata);

  const update = await supabase
    .from("sms_booking_conversations")
    .update({
      customer_name: interpretation.updatedState.client_name,
      latest_intent: interpretation.updatedState.intent,
      state: interpretation.updatedState,
      metadata: {
        ...existingMetadata,
        booking_request: interpretation.bookingRequest,
        next_action: interpretation.nextAction,
        internal_notes: interpretation.internalNotes,
      },
      status: interpretation.nextAction === "handoff_to_human" ? "needs_handoff" : "active",
      last_message_at: new Date().toISOString(),
    })
    .eq("id", normalizeString(conversationId));

  if (update.error) throw update.error;
}

export async function getConversationByPhone(phone: string) {
  const conversationQuery = await supabase
    .from("sms_booking_conversations")
    .select("*")
    .eq("customer_phone", normalizeString(phone))
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (conversationQuery.error) throw conversationQuery.error;
  if (!conversationQuery.data) return null;

  const conversation = conversationQuery.data as SmsConversationRecord;
  const messages = await listRecentMessages(conversation.id, 50);
  return { conversation, messages };
}
