import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonRecord
  | JsonValue[];

type JsonRecord = Record<string, JsonValue>;

type SmsIntent =
  | "book"
  | "reschedule"
  | "cancel"
  | "pricing_question"
  | "general_question"
  | "unclear";

type NextAction =
  | "ask_clarifying_question"
  | "search_availability"
  | "ready_to_book"
  | "answer_question"
  | "handoff_to_human";

type BookingAction =
  | "view_appointments"
  | "cancel_appointment"
  | "reschedule_appointment"
  | "select_appointment"
  | "set_service"
  | "change_service"
  | "add_service"
  | "remove_service"
  | "answer_service_decision"
  | "set_stylist"
  | "set_timing"
  | "ask_availability"
  | "widen_timing"
  | "check_anyone"
  | "check_next_available"
  | "do_both"
  | "confirm_slot"
  | "reject_slots"
  | "reset"
  | "handoff"
  | "unknown";

type BookingActionResult = {
  action: BookingAction;
  confidence: number;
  entities: {
    service?: string | null;
    remove_services?: string[];
    staff?: string | null;
    timing?: string | null;
    exclude_staff?: string[];
    selection?: number | null;
  };
};

type TimingPreference = {
  raw_text: string | null;
  date_range: string | null;
  day_preferences: string[];
  time_preferences: string[];
  urgency: string | null;
};

type ServiceDecisionQuestionKey =
  | "dimensional_placement"
  | "gray_coverage_scope"
  | "gloss_vs_brightness"
  | "extensions_triage"
  | "haircut_scope"
  | "blowout_finish"
  | "consultation_entry";

type DecisionAnswer = {
  question_key: ServiceDecisionQuestionKey;
  answer_key: string;
};

type RequestedService = {
  label: string;
  family: string | null;
  confidence: number | null;
  notes: string | null;
};

type StructuredBookingState = {
  intent: SmsIntent;
  client_name: string | null;
  phone: string | null;
  is_existing_client: boolean | null;
  requested_services: RequestedService[];
  service_stack: string[];
  service_family: string | null;
  service_family_confidence: number | null;
  service_candidate: string | null;
  service_candidate_confidence: number | null;
  needs_service_decision: boolean;
  decision_question_key: ServiceDecisionQuestionKey | null;
  decision_answer: DecisionAnswer | null;
  service_modifiers: string[];
  stylist_preference: string | null;
  timing_preference: TimingPreference;
  known_constraints: string[];
  missing_required_info: string[];
  ready_to_search_availability: boolean;
  ready_to_book: boolean;
  confidence: number;
  client_facing_reply: string;
};

type BookingRequestDraft = {
  intent: SmsIntent;
  phone: string | null;
  client_name: string | null;
  stylist_preference: string | null;
  requested_services: RequestedService[];
  service_stack: string[];
  service_family: string | null;
  service_candidate: string | null;
  needs_service_decision: boolean;
  decision_answer: DecisionAnswer | null;
  service_modifiers: string[];
  timing_preference: TimingPreference;
  ready_to_search_availability: boolean;
  ready_to_book: boolean;
  resolved_services: ResolvedBoulevardService[];
  service_preferences: BookingServicePreference[];
  unresolved_service_labels: string[];
};

type BookingServicePreference = {
  requested_label: string;
  service_id: string | null;
  service_name: string | null;
  staff_preference: string | null;
};

type ResolvedBoulevardService = {
  requested_label: string;
  service_id: string;
  service_name: string;
  category: string | null;
  match_reason: string;
};

type BoulevardCatalogService = {
  id: string;
  name: string;
  category: string | null;
  note?: string | null;
};

type BookingKnowledgeEntry = {
  service_id: string;
  name: string;
  category: string | null;
  boulevard_note: string | null;
  family: string | null;
  canonical_label: string | null;
  ai_meaning: string;
  client_language: string[];
  use_when: string[];
  do_not_use_when: string[];
  missing_info_to_confirm: string[];
  booking_rules: string[];
  common_pairings: string[];
  intent_keywords: string[];
  modifiers: string[];
  staff: string[];
};

type DerivedStaffDirectoryEntry = {
  id: string;
  name: string;
  role?: string | null;
  services?: Array<{
    id: string;
    name: string;
    category?: string | null;
    description?: string | null;
    price?: number | null;
    duration_minutes?: number | null;
  }>;
};

type BookingKnowledgeContext = {
  candidate_services: BookingKnowledgeEntry[];
  family_hints: {
    family: string;
    meaning: string;
    common_missing_info: string[];
  }[];
  family_objects: {
    family: string;
    meaning: string;
    decision_question: string | null;
    common_missing_info: string[];
    child_services: {
      service_id: string;
      name: string;
      canonical_label: string | null;
      client_language: string[];
      staff: string[];
    }[];
  }[];
};

type CuratedServiceRule = {
  canonical_label: string;
  matches: string[];
  preferred_service_names: string[];
};

const SERVICE_STACK_ORDER = [
  "Consultation",
  "Extensions maintenance",
  "Color correction consultation",
  "Root touch-up",
  "Single Process",
  "Face Frame",
  "Partial Highlight",
  "Full Highlight",
  "Gloss",
  "Treatment",
  "Haircut",
  "Blowout",
];

type InterpreterOutput = {
  updatedState: StructuredBookingState;
  clientFacingReply: string;
  internalNotes: string;
  nextAction: NextAction;
  bookingRequest: BookingRequestDraft;
  offeredSlots?: AvailabilitySlotSuggestion[];
};

type AvailabilitySlotSuggestion = {
  id: string;
  label: string;
  start_at: string;
  date: string;
};

type PlannedReplyDecision = {
  nextAction: NextAction;
  reply: string;
};

type BookingSearchReadiness = {
  hasServiceIntent: boolean;
  hasResolvedServices: boolean;
  hasServiceDetailsResolved: boolean;
  hasUsableTiming: boolean;
  hasStaffPreference: boolean;
  blockers: string[];
};

type PaymentSessionRecord = {
  id: string;
  token: string;
  conversation_id: string | null;
  customer_phone: string | null;
  business_phone: string | null;
  service_id: string | null;
  service_name: string | null;
  staff_id: string | null;
  staff_name: string | null;
  slot_id: string | null;
  slot_label: string | null;
  slot_start_at: string | null;
  requested_date: string | null;
  requested_time_text: string | null;
  customer_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  metadata: JsonRecord;
  booking_result: JsonRecord | null;
  expires_at: string | null;
  created_at?: string;
  updated_at?: string;
};

type UpcomingAppointmentLookupItem = {
  appointment_id: string;
  public_token: string;
  label: string;
  start_at: string | null;
  staff_name: string | null;
  service_summary: string;
  state: string | null;
};

type AppointmentLookupIntent = "view" | "cancel" | "reschedule";

type InboundSmsMessage = {
  provider: string;
  providerMessageId: string;
  providerConversationId: string;
  fromPhone: string;
  toPhone: string;
  body: string;
  timestamp: string;
  rawPayload: JsonRecord;
};

type SmsConversationRecord = {
  id: string;
  channel: string;
  customer_phone: string;
  business_phone: string | null;
  customer_name: string | null;
  status: string;
  latest_intent: string | null;
  state: JsonRecord;
  metadata: JsonRecord;
  created_at?: string;
  updated_at?: string;
};

type SmsMessageRecord = {
  id?: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  provider: string;
  provider_message_id?: string | null;
  from_phone?: string | null;
  to_phone?: string | null;
  body: string;
  ai?: JsonRecord;
  raw_payload?: JsonRecord;
  created_at?: string;
};

type AiInterpreterResult = {
  updated_state: Partial<StructuredBookingState>;
  client_facing_reply: string;
  internal_notes: string;
  next_action: NextAction;
};

type AiConsistencyReviewResult = {
  updated_state: {
    missing_required_info: string[];
    ready_to_search_availability: boolean;
    ready_to_book: boolean;
  };
  client_facing_reply: string;
  internal_notes: string;
  next_action: NextAction;
};

type LifecycleInputSnapshot = {
  message: string;
  provider: string | null;
  fromPhone: string | null;
  toPhone: string | null;
};

type LifecycleInterpretationSnapshot = {
  detectedAction: unknown;
  internalNotes: string | null;
};

type LifecycleStateSnapshot<TState> = {
  before: TState;
  after: TState;
};

type LifecycleDecisionSnapshot = {
  nextAction: string | null;
  blockers: string[];
  readyToSearchAvailability: boolean;
  readyToBook: boolean;
  needsServiceDecision: boolean;
  decisionQuestionKey: string | null;
};

type LifecycleResponseSnapshot = {
  reply: string | null;
  internalNotes: string | null;
};

type LifecycleTrace<TState> = {
  input: LifecycleInputSnapshot;
  interpretation: LifecycleInterpretationSnapshot;
  state: LifecycleStateSnapshot<TState>;
  decision: LifecycleDecisionSnapshot;
  response: LifecycleResponseSnapshot;
};

const SUPABASE_URL =
  Deno.env.get("SUPABASE_URL") ||
  Deno.env.get("PROJECT_SUPABASE_URL") ||
  Deno.env.get("APP_SUPABASE_URL") ||
  "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("PROJECT_SUPABASE_SERVICE_ROLE_KEY") ||
  Deno.env.get("APP_SUPABASE_SERVICE_ROLE_KEY") ||
  "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
const OPENAI_URL = Deno.env.get("OPENAI_URL") || "https://api.openai.com/v1/chat/completions";
const CLICKSEND_USERNAME = Deno.env.get("CLICKSEND_USERNAME") || "";
const CLICKSEND_API_KEY = Deno.env.get("CLICKSEND_API_KEY") || "";
const CLICKSEND_SENDER_ID = Deno.env.get("CLICKSEND_SENDER_ID") || "";
const SALON_NAME = Deno.env.get("SMS_CONCIERGE_BRAND_NAME") || "Hairstories";
const SMS_FINISH_BOOKING_URL =
  Deno.env.get("SMS_FINISH_BOOKING_URL") ||
  Deno.env.get("FINISH_BOOKING_URL") ||
  "";
const SMS_APPOINTMENT_MANAGE_URL =
  Deno.env.get("SMS_APPOINTMENT_MANAGE_URL") ||
  "https://hairstories.com/appt";
const BOULEVARD_BOOKING_PROXY_URL =
  Deno.env.get("BOULEVARD_BOOKING_PROXY_URL") ||
  (SUPABASE_URL ? `${SUPABASE_URL.replace(/\/+$/, "")}/functions/v1/boulevard-booking-proxy` : "");
const BOULEVARD_LOCATION_ID = Deno.env.get("BOULEVARD_LOCATION_ID") || "";

const CORS_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

function normalizeLowerString(value: unknown) {
  return normalizeString(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  const raw = normalizeString(value);
  if (!raw) return "";
  if (raw.startsWith("+")) return `+${raw.slice(1).replace(/\D+/g, "")}`;
  const digits = raw.replace(/\D+/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

function splitName(fullName: string) {
  const clean = normalizeString(fullName);
  if (!clean) return { first: "", last: "" };
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first: clean, last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function safeObject(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function safeArray<T = unknown>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

function isClickSendConfigured() {
  return !!(CLICKSEND_USERNAME && CLICKSEND_API_KEY);
}

function isClickSendProvider(value: string) {
  return normalizeLowerString(value).includes("clicksend");
}

function inferSmsProvider(body: JsonRecord, merged: JsonRecord) {
  const explicitProvider = normalizeString(body.provider || merged.provider);
  if (explicitProvider) return explicitProvider;
  if (normalizeString(merged.SmsMessageSid || merged.MessageSid)) return "twilio";

  const hasClickSendLikeShape = !!(
    normalizeString(merged.from_phone || merged.from || merged.phone || merged.sender) &&
    normalizeString(merged.to_phone || merged.to || merged.recipient) &&
    normalizeString(merged.body || merged.message || merged.text || merged.sms || merged.content)
  );

  if (hasClickSendLikeShape && isClickSendConfigured()) return "clicksend";
  if (hasClickSendLikeShape) return "clicksend";
  return "sms_webhook";
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = normalizeString(value);
    const key = clean.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function deriveLifecycleDecisionSnapshot(state: {
  missing_required_info?: string[];
  ready_to_search_availability?: boolean;
  ready_to_book?: boolean;
  needs_service_decision?: boolean;
  decision_question_key?: string | null;
}, nextAction: unknown): LifecycleDecisionSnapshot {
  const blockers = uniqueStrings(
    Array.isArray(state.missing_required_info)
      ? state.missing_required_info.map((item) => normalizeString(item))
      : [],
  );

  if (state.needs_service_decision && normalizeString(state.decision_question_key)) {
    blockers.unshift(`decision:${normalizeLowerString(state.decision_question_key)}`);
  }

  return {
    nextAction: normalizeString(nextAction) || null,
    blockers: uniqueStrings(blockers),
    readyToSearchAvailability: state.ready_to_search_availability === true,
    readyToBook: state.ready_to_book === true,
    needsServiceDecision: state.needs_service_decision === true,
    decisionQuestionKey: normalizeString(state.decision_question_key) || null,
  };
}

function buildLifecycleTrace<TState>(input: {
  message: string;
  provider?: string | null;
  fromPhone?: string | null;
  toPhone?: string | null;
  detectedAction?: unknown;
  stateBefore: TState;
  stateAfter: TState & {
    missing_required_info?: string[];
    ready_to_search_availability?: boolean;
    ready_to_book?: boolean;
    needs_service_decision?: boolean;
    decision_question_key?: string | null;
  };
  nextAction?: unknown;
  reply?: string | null;
  internalNotes?: string | null;
}): LifecycleTrace<TState> {
  return {
    input: {
      message: normalizeString(input.message),
      provider: normalizeString(input.provider) || null,
      fromPhone: normalizeString(input.fromPhone) || null,
      toPhone: normalizeString(input.toPhone) || null,
    },
    interpretation: {
      detectedAction: input.detectedAction ?? null,
      internalNotes: normalizeString(input.internalNotes) || null,
    },
    state: {
      before: input.stateBefore,
      after: input.stateAfter,
    },
    decision: deriveLifecycleDecisionSnapshot(input.stateAfter, input.nextAction),
    response: {
      reply: normalizeString(input.reply) || null,
      internalNotes: normalizeString(input.internalNotes) || null,
    },
  };
}

function buildAppointmentManageUrl(publicToken: string) {
  const token = normalizeString(publicToken);
  if (!token) return "";
  const separator = SMS_APPOINTMENT_MANAGE_URL.includes("?") ? "&" : "?";
  return `${SMS_APPOINTMENT_MANAGE_URL}${separator}c=${encodeURIComponent(token)}`;
}

function formatAppointmentDateTime(startAt: string) {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function summarizeAppointmentServices(rawServiceNames: unknown) {
  const names = safeArray(rawServiceNames).map((value) => normalizeString(value)).filter(Boolean);
  if (!names.length) return "appointment";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

function normalizeUpcomingAppointmentRow(row: JsonRecord): UpcomingAppointmentLookupItem | null {
  const appointmentId = normalizeString(row.boulevard_appointment_id);
  const publicToken = normalizeString(row.public_token);
  if (!appointmentId || !publicToken) return null;
  const startAt = normalizeString(row.start_at) || null;
  const staffName = normalizeString(row.staff_name) || null;
  const serviceSummary = summarizeAppointmentServices(row.service_names);
  const when = startAt ? formatAppointmentDateTime(startAt) : "upcoming";
  const withStaff = staffName ? ` with ${staffName}` : "";
  return {
    appointment_id: appointmentId,
    public_token: publicToken,
    label: `${when}: ${serviceSummary}${withStaff}`,
    start_at: startAt,
    staff_name: staffName,
    service_summary: serviceSummary,
    state: normalizeString(row.state) || null,
  };
}

function normalizeStoredUpcomingAppointmentItem(row: JsonRecord): UpcomingAppointmentLookupItem | null {
  const existingAppointmentId = normalizeString(row.appointment_id);
  const existingPublicToken = normalizeString(row.public_token);
  if (existingAppointmentId && existingPublicToken) {
    return {
      appointment_id: existingAppointmentId,
      public_token: existingPublicToken,
      label: normalizeString(row.label),
      start_at: normalizeString(row.start_at) || null,
      staff_name: normalizeString(row.staff_name) || null,
      service_summary: normalizeString(row.service_summary) || "appointment",
      state: normalizeString(row.state) || null,
    };
  }
  return normalizeUpcomingAppointmentRow(row);
}

async function fetchUpcomingAppointmentsByPhone(phone: string, limit = 5) {
  const normalizedPhone = normalizePhone(phone);
  if (!normalizedPhone) return [];

  const normalizeRows = (rows: JsonRecord[]) =>
    safeArray<JsonRecord>(rows)
      .map((row) => normalizeUpcomingAppointmentRow(row))
      .filter((row): row is UpcomingAppointmentLookupItem => !!row)
      .filter((row) => !["cancelled", "canceled"].includes(normalizeLowerString(row.state)));

  const exactQuery = await supabase
    .from("boulevard_appointments")
    .select("boulevard_appointment_id, public_token, start_at, staff_name, service_names, state, client_phone")
    .eq("client_phone", normalizedPhone)
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(limit);

  if (exactQuery.error) throw exactQuery.error;

  const exactMatches = normalizeRows(safeArray<JsonRecord>(exactQuery.data));
  if (exactMatches.length) return exactMatches;

  const fallbackQuery = await supabase
    .from("boulevard_appointments")
    .select("boulevard_appointment_id, public_token, start_at, staff_name, service_names, state, client_phone")
    .gte("start_at", new Date().toISOString())
    .order("start_at", { ascending: true })
    .limit(250);

  if (fallbackQuery.error) throw fallbackQuery.error;

  const normalizedMatches = safeArray<JsonRecord>(fallbackQuery.data)
    .filter((row) => normalizePhone(row.client_phone) === normalizedPhone);

  return normalizeRows(normalizedMatches).slice(0, limit);
}

function detectAppointmentLookupIntent(message: string): AppointmentLookupIntent | null {
  const lower = normalizeLowerString(message);
  if (!lower) return null;
  if (/\b(cancel|cancellation|need to cancel)\b/.test(lower)) return "cancel";
  if (/\b(reschedule|rebook|move my appointment|change my appointment|move my appt|change my appt)\b/.test(lower)) return "reschedule";
  if (
    /\b(upcoming appointments?|upcoming appts?|what appointments do i have|what appts do i have|what do i have coming up|show my appointments?|show my appts?|do i have any appts?(?: booked)?|do i have any appointments?(?: booked)?|any appointments? booked|look up my appointments?|look up my appts?|check my appointments?|check my appts?)\b/.test(lower)
  ) {
    return "view";
  }
  return null;
}

function isAppointmentLookupNamePrompt(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  return (
    /\bconfirm your full name\b/.test(lower) ||
    /\blook up your appointments\b/.test(lower)
  );
}

function extractSelectionIndex(message: string, max: number) {
  const clean = normalizeLowerString(message);
  if (!clean || max < 1) return -1;
  const numeric = clean.match(/\b([1-9])\b/);
  if (numeric) {
    const value = Number(numeric[1]);
    if (value >= 1 && value <= max) return value - 1;
  }
  if (/\b(first|1st)\b/.test(clean)) return 0;
  if (/\b(second|2nd)\b/.test(clean)) return max >= 2 ? 1 : -1;
  if (/\b(third|3rd)\b/.test(clean)) return max >= 3 ? 2 : -1;
  if (/\b(last)\b/.test(clean)) return max - 1;
  return -1;
}

function isConversationResetRequest(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  return /\b(start over|reset|restart|new conversation|new convo|begin again|clear this out|fresh start)\b/.test(lower);
}

async function sendClickSendSms(to: string, body: string) {
  if (!isClickSendConfigured()) {
    throw new Error("ClickSend SMS is not configured");
  }

  const basic = btoa(`${CLICKSEND_USERNAME}:${CLICKSEND_API_KEY}`);
  const payload = {
    messages: [
      {
        source: "javascript",
        body,
        to,
        from: CLICKSEND_SENDER_ID || undefined,
      },
    ],
  };

  const response = await fetch("https://rest.clicksend.com/v3/sms/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basic}`,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await response.text();
  let data: unknown = null;
  try {
    data = rawText ? JSON.parse(rawText) : null;
  } catch {
    data = rawText || null;
  }

  if (!response.ok) {
    throw new Error(`ClickSend request failed: status=${response.status}; body=${rawText}`);
  }

  return data;
}

function extractClickSendProviderMessageId(result: unknown) {
  const root = safeObject(result);
  const data = safeObject(root.data);
  const messages = safeArray<JsonRecord>(data.messages);
  const first = safeObject(messages[0]);
  return normalizeString(first.message_id || first.messageId || first.id);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function randomToken(length = 24) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join("");
}

function normalizeMissingInfoLabel(value: string) {
  const lower = normalizeLowerString(value);
  if (!lower) return "";
  if (
    lower.includes("time") ||
    lower.includes("day") ||
    lower.includes("timing") ||
    lower.includes("date range") ||
    lower.includes("date_or_range") ||
    lower.includes("specific date") ||
    lower.includes("specific_date")
  ) return "timing";
  if (lower === "date") return "timing";
  if (lower.includes("placement") || lower.includes("where") || lower.includes("lightness")) return "service_details";
  if (lower.includes("service detail") || lower.includes("specific service")) return "service_details";
  if (lower.includes("service")) return "service";
  if (lower.includes("stylist")) return "stylist_preference";
  if (lower.includes("current appointment")) return "current_appointment";
  if (lower.includes("existing client") || lower.includes("first time")) return "existing_client_status";
  if (lower.includes("phone")) return "phone";
  return lower.replace(/\s+/g, "_");
}

function normalizeStylistPreference(value: string) {
  const clean = normalizeString(value);
  const lower = normalizeLowerString(clean).replace(/_/g, " ");
  if (!lower) return "";
  if (
    /\b(any|anyone|anybody|whoever)\b/.test(lower) &&
    (
      /\bexcept\b/.test(lower) ||
      /\bbut not\b/.test(lower) ||
      /\bother than\b/.test(lower) ||
      /\bif\b/.test(lower)
    )
  ) return "any";
  if (
    (/\b(anyone|anybody|whoever)\b/.test(lower) || /\bopen to\b/.test(lower)) &&
    (/\bif\b/.test(lower) || /\bexcept\b/.test(lower) || /\bbut not\b/.test(lower) || /\bother than\b/.test(lower)) &&
    (/\bdoes not do\b/.test(lower) || /\bdoesn't do\b/.test(lower) || /\bdoesnt do\b/.test(lower) || /\bunavailable\b/.test(lower) || /\bbooked\b/.test(lower) || /\bcan't do\b/.test(lower) || /\bcannot do\b/.test(lower))
  ) return "any";
  if (/^anyone but\b/.test(lower) || /^anybody but\b/.test(lower) || /^whoever but\b/.test(lower)) return "any";
  if (
    [
      "any",
      "anyone",
      "anybody",
      "whoever",
      "no preference",
      "no pref",
      "open to anyone",
      "open to anybody",
      "whoever is available",
      "first available",
      "soonest available",
      "any stylist",
      "anyone on the team",
      "no stylist preference",
      "stylist 1",
      "option 1",
      "first stylist on list",
      "first stylist on the list",
      "first one",
      "i dont care",
      "i do not care",
      "no i dont care",
      "no i do not care",
      "dont care",
      "do not care",
      "doesnt matter",
      "doesn't matter",
      "it doesnt matter",
      "it doesn't matter",
      "whatever works",
      "whatever is open",
      "whatever's open",
      "whoever works",
    ].includes(lower)
  ) return "any";
  return clean;
}

function sanitizeStylistPreference(value: string | null | undefined, services: RequestedService[]) {
  const normalized = normalizeStylistPreference(normalizeString(value));
  if (!normalized) return null;
  if (normalized === "any") return "any";

  const lower = normalizeLowerString(normalized);
  const serviceTerms = new Set<string>();
  for (const service of services) {
    const label = canonicalizeRequestedServiceLabel(normalizeString(service.label));
    if (label) serviceTerms.add(normalizeLowerString(label));
    for (const term of serviceTermsForLabel(label)) {
      if (term) serviceTerms.add(normalizeLowerString(term));
    }
  }

  if (serviceTerms.has(lower)) return null;
  if (
    /\b(highlight|highlights|partial|full|gloss|glaze|toner|roots?|gray coverage|haircut|trim|cut|blowout|blowdry|blow dry|face frame|treatment|color)\b/.test(lower)
  ) {
    return null;
  }
  return normalized;
}

function normalizeOptionalConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(1, Number(value.toFixed(2))));
}

function normalizeDecisionAnswer(value: unknown): DecisionAnswer | null {
  const record = safeObject(value);
  const questionKey = normalizeString(record.question_key) as ServiceDecisionQuestionKey;
  const answerKey = normalizeString(record.answer_key);
  if (!questionKey || !answerKey) return null;
  return {
    question_key: questionKey,
    answer_key: answerKey,
  };
}

function inferDecisionAnswerFromMessage(
  message: string,
  state: StructuredBookingState,
): DecisionAnswer | null {
  const questionKey = state.decision_question_key;
  if (!questionKey) return null;

  const lower = normalizeLowerString(message).replace(/[’]/g, "'");
  if (!lower) return null;

  switch (questionKey) {
    case "dimensional_placement":
      if (/\baround my face\b|\bface only\b|\bface framing\b|\bjust my face\b|\bjust the front\b|\bfront pieces?\b|\bmoney piece\b/.test(lower)) {
        return { question_key: questionKey, answer_key: "face_only" };
      }
      if (/\btop and face\b|\bthrough the top\b|\bon top\b|\bcrown\b|\bmostly on top\b|\btop half\b/.test(lower)) {
        return { question_key: questionKey, answer_key: "top_and_face" };
      }
      if (/\ball over\b|\bwhole head\b|\bthroughout\b|\ball the way through\b|\beverywhere\b|\bwhole thing\b|\bfull head\b/.test(lower)) {
        return { question_key: questionKey, answer_key: "whole_head" };
      }
      return null;
    case "gray_coverage_scope":
      if (/\broots? only\b|\bjust roots?\b|\broots?\b|\bgray\b|\bcover (my )?gray\b/.test(lower)) {
        return { question_key: questionKey, answer_key: "roots_or_gray" };
      }
      if (/\ball[- ]over\b|\ball over\b|\bfull color\b|\ball[- ]over refresh\b|\bbase refresh\b|\brefresh it all\b|\bricher\b|\bdarker\b/.test(lower)) {
        return { question_key: questionKey, answer_key: "all_over_refresh" };
      }
      return null;
    case "gloss_vs_brightness":
      if (/\bjust tone\b|\btone\b|\bgloss\b|\bglaze\b|\btoner\b|\brefresh the tone\b|\bjust a gloss\b|\bjust a toner\b/.test(lower)) {
        return { question_key: questionKey, answer_key: "tone_refresh" };
      }
      if (/\bbrightness\b|\bbrighter\b|\blighter\b|\bsoft brightness\b|\ba little brighter\b|\baround my face\b|\bthrough the top\b|\bmoney piece\b/.test(lower)) {
        return { question_key: questionKey, answer_key: "soft_brightness" };
      }
      return null;
    default:
      return null;
  }
}

function isNumericOnlyReply(message: string) {
  return /^\s*[1-5]\s*$/.test(normalizeString(message));
}

function canonicalizeRequestedServiceLabel(label: string) {
  const clean = normalizeString(label);
  const lower = normalizeLowerString(clean);
  if (!lower) return clean;
  for (const rule of CURATED_SERVICE_RULES) {
    if (rule.matches.some((term) => lower === normalizeLowerString(term))) {
      return rule.canonical_label;
    }
  }
  for (const rule of CURATED_SERVICE_RULES) {
    if (rule.matches.some((term) => {
      const normalizedTerm = normalizeLowerString(term);
      return lower === normalizedTerm || lower.includes(normalizedTerm);
    })) {
      return rule.canonical_label;
    }
  }
  return clean;
}

function normalizeServiceStack(stack: string[], services: RequestedService[]) {
  const filtered = uniqueStrings(stack);
  const serviceLabels = services.map((item) => normalizeLowerString(item.label));
  const hasDimensionalColor = serviceLabels.includes("dimensional color");
  const hasSpecificDimensionalPlacement = serviceLabels.some((label) =>
    ["face frame", "partial highlight", "full highlight"].includes(label)
  );
  const hasSpecificColor = serviceLabels.some((label) =>
    [
      "dimensional color",
      "face frame",
      "partial highlight",
      "full highlight",
      "root touch-up",
      "single process",
      "gloss",
      "glaze",
      "toner",
      "lowlights",
      "color correction",
    ].includes(label)
  );
  const hasExtensionsMaintenance = serviceLabels.includes("extensions maintenance");
  const normalized = filtered.filter((item) => {
    const lower = normalizeLowerString(item);
    if (lower === "color" && hasSpecificColor) return false;
    if (lower === "dimensional color" && hasSpecificDimensionalPlacement) return false;
    if (lower === "extensions" && hasExtensionsMaintenance) return false;
    return true;
  });
  return orderServiceStack(normalized);
}

function orderServiceStack(stack: string[]) {
  return uniqueStrings(stack).sort((a, b) => {
    const aIndex = SERVICE_STACK_ORDER.indexOf(canonicalizeRequestedServiceLabel(normalizeString(a)));
    const bIndex = SERVICE_STACK_ORDER.indexOf(canonicalizeRequestedServiceLabel(normalizeString(b)));
    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
  });
}

const SERVICE_PATTERNS: Array<{ family: string; label: string; patterns: RegExp[] }> = [
  {
    family: "haircut",
    label: "Haircut",
    patterns: [/\bhaircut\b/i, /\btrim\b/i, /\bcut\b/i, /\blayers\b/i, /\bbig chop\b/i, /\bdusting\b/i, /\breshape\b/i],
  },
  {
    family: "blowout",
    label: "Blowout",
    patterns: [/\bblowout\b/i, /\bblow dry\b/i, /\bblowdry\b/i, /\bstyle\b/i, /\bcurls\b/i, /\bwaves\b/i, /\bhot tool\b/i, /\bclassic blowout\b/i, /\bsignature blowout\b/i],
  },
  {
    family: "color",
    label: "Color",
    patterns: [/\broots?\b/i, /\broot touch[- ]?up\b/i, /\bgray coverage\b/i, /\bsingle process\b/i, /\bgloss\b/i, /\bglaze\b/i, /\btoner\b/i, /\bhighlights?\b/i, /\bpartial highlight\b/i, /\bfull highlight\b/i, /\bbalayage\b/i, /\bface frame\b/i, /\bmoney piece\b/i, /\blowlights?\b/i, /\bcolor correction\b/i, /\bblonder\b/i, /\bdarker\b/i, /\bdimension\b/i],
  },
  {
    family: "consultation",
    label: "Consultation",
    patterns: [/\bconsult\b/i, /\bconsultation\b/i],
  },
  {
    family: "extensions",
    label: "Extensions",
    patterns: [/\bextensions?\b/i, /\bmove[- ]?up\b/i, /\bextension maintenance\b/i],
  },
  {
    family: "treatment",
    label: "Treatment",
    patterns: [/\btreatment\b/i, /\bkeratin\b/i, /\bmask\b/i, /\bscalp treatment\b/i],
  },
];

const MODIFIER_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
  { label: "Glaze/Gloss", patterns: [/\bgloss\b/i, /\bglaze\b/i, /\btoner\b/i] },
  { label: "Long or thick hair", patterns: [/\blong\b/i, /\bthick\b/i] },
  { label: "Extensions", patterns: [/\bextensions?\b/i] },
  { label: "Corrective color", patterns: [/\bcorrective\b/i, /\bcorrection\b/i] },
  { label: "Extra time needed", patterns: [/\bextra time\b/i] },
  { label: "New client color", patterns: [/\bnew client\b/i] },
  { label: "Major change", patterns: [/\bbig change\b/i, /\bmajor change\b/i, /\bbig chop\b/i] },
  { label: "Gray coverage", patterns: [/\bgray coverage\b/i, /\bgrey coverage\b/i] },
  { label: "Going lighter", patterns: [/\bgo(?:ing)? lighter\b/i, /\bblonder\b/i] },
  { label: "Going darker", patterns: [/\bgo(?:ing)? darker\b/i, /\bdarker\b/i] },
  { label: "Adding dimension", patterns: [/\bdimension\b/i] },
  { label: "Maintaining current look", patterns: [/\bmaintain\b/i, /\brefresh\b/i] },
];

const DAY_PATTERNS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const TIME_PATTERNS = ["morning", "afternoon", "evening", "after work", "before work", "lunch", "open availability", "any time"];
const MONTH_NAME_TO_INDEX: Record<string, number> = {
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};
const DATE_RANGE_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /\basap\b|\bsoonest\b/, value: "asap" },
  { pattern: /\btoday\b/, value: "today" },
  { pattern: /\btomorrow\b/, value: "tomorrow" },
  { pattern: /\bthis week\b/, value: "this_week" },
  { pattern: /\bnext week\b/, value: "next_week" },
  { pattern: /\bthis weekend\b|\bweekend\b/, value: "weekend" },
  { pattern: /\bthis month\b/, value: "this_month" },
  { pattern: /\bnext month\b/, value: "next_month" },
];
let cachedCatalogServices: BoulevardCatalogService[] | null = null;
let cachedCatalogFetchedAt = 0;
let cachedBookingKnowledge: BookingKnowledgeEntry[] | null = null;
let cachedBookingKnowledgeFetchedAt = 0;
let cachedDerivedStaffDirectory: DerivedStaffDirectoryEntry[] | null = null;
let cachedDerivedStaffDirectoryFetchedAt = 0;
const CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
const CURATED_SERVICE_RULES: CuratedServiceRule[] = [
  {
    canonical_label: "Haircut",
    matches: ["haircut", "trim", "cut", "big chop", "layers", "reshape", "curtain bangs"],
    preferred_service_names: ["Women's Haircut", "Women's Haircut (Pixie/Short)", "Men's Haircut", "hs.CurlyCut"],
  },
  {
    canonical_label: "Blowout",
    matches: ["blowout", "blow dry", "blowdry", "style"],
    preferred_service_names: ["hs.Classic Blowdry", "hs.Signature Blowdry"],
  },
  {
    canonical_label: "Root touch-up",
    matches: ["root touch-up", "roots", "gray coverage"],
    preferred_service_names: ["Single Process Touchup"],
  },
  {
    canonical_label: "Single Process",
    matches: ["single process", "single process touchup", "all-over refresh", "all over refresh", "base refresh"],
    preferred_service_names: ["Single Process Touchup"],
  },
  {
    canonical_label: "Gloss",
    matches: ["gloss", "glaze", "toner"],
    preferred_service_names: ["Glaze/Gloss"],
  },
  {
    canonical_label: "Face Frame",
    matches: [
      "face frame",
      "money piece",
      "around my face",
      "brighten up the front",
      "brighten the front",
      "lighter in the front",
      "just the front",
      "front pieces",
      "brighter around my face",
      "face-framing",
    ],
    preferred_service_names: ["Face Frame Dimensional Color Service"],
  },
  {
    canonical_label: "Partial Highlight",
    matches: ["partial highlight", "partial highlights", "top + face", "top and face", "crown and face", "lighter on top"],
    preferred_service_names: ["Partial Dimensional Color Service"],
  },
  {
    canonical_label: "Full Highlight",
    matches: ["full highlight", "full highlights", "full head", "top + face + lengths", "through the lengths", "all over blonde", "all over bright", "lighter all over", "bright all over"],
    preferred_service_names: ["Full Head Dimensional Color Service"],
  },
  {
    canonical_label: "Dimensional color",
    matches: ["highlights", "highlight", "balayage", "blonder", "dimension", "dimensional", "lighter", "brightness"],
    preferred_service_names: [],
  },
  {
    canonical_label: "Consultation",
    matches: ["consultation", "consult"],
    preferred_service_names: ["Hair Color Consultation", "Haircut Consultation"],
  },
  {
    canonical_label: "Extensions maintenance",
    matches: ["extensions maintenance", "extension maintenance", "move up", "maintenance", "weft maintenance", "hand tied maintenance"],
    preferred_service_names: ["Hair Tied Weft Maintenance", "Hand Tied Quick Fix"],
  },
  {
    canonical_label: "Extensions consultation",
    matches: ["extensions consult", "extensions consultation"],
    preferred_service_names: ["Hair Extension Consultation"],
  },
  {
    canonical_label: "Color correction consultation",
    matches: ["color correction", "corrective color", "box dye"],
    preferred_service_names: ["Hair Color Consultation"],
  },
  {
    canonical_label: "Treatment",
    matches: ["treatment", "keratin", "smooth", "scalp treatment"],
    preferred_service_names: ["Wella SmoothFiller Treatment", "Keratin Smoothing Treatment", "Magic-Sleek Smoothing Treatment", "Scalp Recovery Treatment"],
  },
];

const GUIDED_BOOKING_MODIFIER_MAP: Record<string, string[]> = {
  "Root touch-up": ["Glaze/Gloss", "Extra Color", "Air-Dry Transition Time"],
  "Single Process": ["Glaze/Gloss", "Extra Color", "Air-Dry Transition Time"],
  "Face Frame": ["Glaze/Gloss", "Tipping", "Lowlights", "Pretone", "Root Shadow"],
  "Partial Highlight": ["Glaze/Gloss", "Tipping", "Lowlights", "Pretone", "Root Shadow", "My hair is extra long or thick"],
  "Full Highlight": ["Glaze/Gloss", "Tipping", "Lowlights", "Pretone", "Root Shadow", "My hair is extra long or thick"],
  "Haircut": ["My hair is long or thick", "I am looking for a big change"],
  "Blowout": ["Standard Length and Texture", "Blowdry for Long or Thick Hair", "Blowdry with Extensions"],
  "Extensions maintenance": ["1 Track", "2 Tracks", "3 Tracks"],
};

const GUIDED_BOOKING_MODIFIER_OPTION_IDS: Record<string, Record<string, string>> = {
  "Root touch-up": {
    "Glaze/Gloss": "9b2f3282-35bd-478f-b2c4-a7b2f703cd19",
    "Extra Color": "13ec4f0e-4998-4dd1-87ef-9e570fcd6497",
    "Air-Dry Transition Time": "47b5acb9-d8f3-4df6-8314-0f96ed4ce45f",
  },
  "Face Frame": {
    "Tipping": "be232134-f6f2-4c22-ad8a-1def7162e5e2",
    "Lowlights": "57f71ba7-db0f-4845-8ea8-a6eca05e7d03",
    "Pretone": "d701de74-fa06-4679-ad8a-a1d234087a12",
    "Root Shadow": "9015d91b-b2b6-44a6-aeee-dccfc9da97aa",
  },
  "Partial Highlight": {
    "Tipping": "b57d6fe2-11d3-4c57-b950-997bc60af1e0",
    "Pretone": "ca1f6c95-141c-4eaf-824c-9c75c291ee67",
    "Lowlights": "a05e09fb-f7e3-41ea-a6ee-2ac6e460e54a",
    "Root Shadow": "09f0fd7b-7bae-4de5-a016-0f62c8962998",
    "My hair is extra long or thick": "be353788-1d56-4001-879c-0a03def9794e",
  },
  "Full Highlight": {
    "Tipping": "d2ae2a54-08b8-42de-b202-52d9b8b6f3a8",
    "Lowlights": "239a9acc-025f-4c1c-ba19-39d1874bb4b5",
    "Pretone": "1c50379d-ffbb-4ab9-a1f7-5d7cc8c5c3da",
    "Root Shadow": "78a202fb-3407-4e1b-9b4c-f08f684db902",
    "My hair is extra long or thick": "10477f39-f395-4424-bbc7-c78302ffed7d",
  },
  "Haircut": {
    "My hair is long or thick": "e8defd3d-16b9-4295-8c00-bbb37c23b70b",
    "I am looking for a big change": "43956931-322c-4f2a-9f69-0bcdf5539b41",
  },
};

const SPECIFIC_SERVICE_LABELS = new Set([
  "face frame",
  "partial highlight",
  "full highlight",
  "root touch-up",
  "single process",
  "gloss",
  "glaze",
  "toner",
  "lowlights",
  "color correction",
  "haircut",
  "blowout",
  "consultation",
  "extensions",
  "treatment",
]);

const COLOR_PRIMARY_SERVICE_LABELS = new Set([
  "root touch-up",
  "single process",
  "dimensional color",
  "face frame",
  "partial highlight",
  "full highlight",
]);

function buildSuccessResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: CORS_HEADERS,
  });
}

function buildErrorResponse(error: string, status: number, extra: JsonRecord = {}) {
  return new Response(JSON.stringify({
    ok: false,
    error,
    ...extra,
  }), {
    status,
    headers: CORS_HEADERS,
  });
}

function createEmptyTimingPreference(): TimingPreference {
  return {
    raw_text: null,
    date_range: null,
    day_preferences: [],
    time_preferences: [],
    urgency: null,
  };
}

function normalizeMissingInfoSet(values: string[]) {
  const normalized = uniqueStrings(values.map((value) => normalizeMissingInfoLabel(normalizeString(value))));
  const lowerSet = new Set(normalized.map((value) => normalizeLowerString(value)));
  if (lowerSet.has("service_details") && lowerSet.has("service")) {
    return normalized.filter((value) => normalizeLowerString(value) !== "service");
  }
  return normalized;
}

function isOptionalSearchDetailLabel(value: string) {
  const lower = normalizeLowerString(value);
  return (
    lower === "haircut_scope" ||
    lower === "haircut_type_(trim_or_bigger_change)" ||
    lower === "blowout_finish" ||
    lower === "smooth_finish_vs_curls_or_waves" ||
    lower === "consultation_entry"
  );
}

function isAvailabilityMetaQuestion(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  return (
    /\bare those\b/.test(lower) ||
    /\bis that\b/.test(lower) ||
    /\bis this\b/.test(lower) ||
    /\bnext available\b/.test(lower) ||
    /\bnext appointments?\b/.test(lower) ||
    /\bsoonest you have\b/.test(lower)
  );
}

function isServiceChangeRequest(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  return (
    /\bchange that to\b/.test(lower) ||
    /\bchange it to\b/.test(lower) ||
    /\binstead\b/.test(lower) ||
    /\bmake that\b/.test(lower) ||
    /\bswitch that to\b/.test(lower)
  );
}

type ServiceChangeMode = "none" | "add" | "replace";

function isServiceCorrectionOverride(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  if (!detectServices(message).length) return false;
  return (
    /\bactually\b/.test(lower) ||
    /\bi said\b/.test(lower) ||
    /\bnot for\b/.test(lower) ||
    /\bnot a\b/.test(lower) ||
    /\bonly\b/.test(lower) ||
    /\bjust\b/.test(lower) ||
    /\bno\b/.test(lower) ||
    /\binstead\b/.test(lower) ||
    /\brather than\b/.test(lower)
  );
}

function detectServiceChangeMode(message: string): ServiceChangeMode {
  const lower = normalizeLowerString(message);
  if (!lower) return "none";
  if (isServiceCorrectionOverride(message)) {
    return "replace";
  }
  if (
    /\binstead\b/.test(lower) ||
    /\bchange that to\b/.test(lower) ||
    /\bchange it to\b/.test(lower) ||
    /\bmake that\b/.test(lower) ||
    /\bswitch that to\b/.test(lower) ||
    /\bactually just\b/.test(lower) ||
    /\brather than\b/.test(lower)
  ) {
    return "replace";
  }
  if (
    /\balso\b/.test(lower) ||
    /\bplus\b/.test(lower) ||
    /\btoo\b/.test(lower) ||
    /\bwhile i(?:'|’)m there\b/.test(lower) ||
    /\bcan i add\b/.test(lower)
  ) {
    return "add";
  }
  return "none";
}

function hasExplicitAllOverColorIntent(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  return (
    /\ball over color\b/.test(lower) ||
    /\ball[- ]over color\b/.test(lower) ||
    /\bfull color\b/.test(lower) ||
    /\brefresh all of it\b/.test(lower) ||
    /\ball over refresh\b/.test(lower) ||
    /\ball[- ]over refresh\b/.test(lower) ||
    /\bbase refresh\b/.test(lower) ||
    /\bsingle process\b/.test(lower) ||
    /\bdarker all over\b/.test(lower) ||
    /\bricher all over\b/.test(lower)
  );
}

function hasExplicitRootsOnlyIntent(message: string) {
  const lower = normalizeLowerString(message).replace(/[’]/g, "'");
  if (!lower) return false;
  return (
    /\broots? only\b/.test(lower) ||
    /\bjust roots?\b/.test(lower) ||
    /\bgray coverage\b/.test(lower) ||
    /\bcover (my )?gray\b/.test(lower) ||
    /\broot touch[- ]?up\b/.test(lower) ||
    /\broots?\b/.test(lower)
  );
}

function hasExplicitServiceMutationLanguage(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  if (!detectServices(message).length) return false;
  return detectServiceChangeMode(message) !== "none";
}

function isExplicitTimingPivotPhrase(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  return (
    /\bwhat about\b/.test(lower) ||
    /\bworks better\b/.test(lower) ||
    /\bcan we do\b/.test(lower) ||
    /\bafter work instead\b/.test(lower) ||
    /\bmorning instead\b/.test(lower) ||
    /\blater that day\b/.test(lower) ||
    /\bnext week\b/.test(lower) ||
    /\bnext tuesday\b/.test(lower) ||
    /\bnext thursday\b/.test(lower) ||
    /\bfriday instead\b/.test(lower) ||
    /\bthursday instead\b/.test(lower) ||
    /\binstead\b/.test(lower)
  );
}

function isPureTimingPivotMessage(message: string) {
  const timing = detectTimingPreference(message);
  const hasTiming = hasUsableTimingPreference(timing) || isTimingPivotReplacement(timing) || isExplicitTimingPivotPhrase(message);
  if (!hasTiming) return false;
  if (detectServices(message).length) return false;
  if (hasExplicitServiceMutationLanguage(message)) return false;
  return true;
}

function isGenericBookingOpenerWithoutService(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  if (detectAppointmentLookupIntent(message)) return false;
  if (detectServices(message).length) return false;
  return (
    /\bbook\b/.test(lower) &&
    /\b(appt|appointment)\b/.test(lower)
  );
}

function detectNegatedServiceLabels(message: string) {
  const clauses = normalizeString(message)
    .split(/\s*(?:,|;|\bbut\b)\s*/i)
    .map((part) => normalizeString(part))
    .filter(Boolean);
  const negated = new Set<string>();
  for (const clause of clauses) {
    const lower = normalizeLowerString(clause);
    const negationMatch = lower.match(/\b(?:no|not for|not a|without|skip|remove|drop)\b/);
    if (!negationMatch || negationMatch.index == null) continue;
    const negatedFragment = clause.slice(negationMatch.index + negationMatch[0].length).trim();
    const source = negatedFragment || clause;
    for (const service of detectServices(source)) {
      const label = canonicalizeRequestedServiceLabel(normalizeString(service.label));
      if (label) negated.add(normalizeLowerString(label));
    }
  }
  return negated;
}

function hasRemovalCue(message: string) {
  return /\b(?:no|not for|not a|without|skip|remove|cancel|drop)\b/i.test(normalizeString(message));
}

function isGenericFamilyServiceLabel(label: string) {
  const lower = normalizeLowerString(canonicalizeRequestedServiceLabel(normalizeString(label)));
  return lower === "color" || lower === "dimensional color" || lower === "service" || lower === "hair service";
}

function shouldStripGenericPositiveServiceFromRemovalTurn(
  service: RequestedService,
  negatedServiceLabels: Set<string>,
) {
  const label = canonicalizeRequestedServiceLabel(normalizeString(service.label));
  if (!label || !isGenericFamilyServiceLabel(label) || !negatedServiceLabels.size) return false;
  for (const removedLabel of negatedServiceLabels) {
    const family = familyKeyForRequestedLabel(removedLabel);
    if (family === "dimensional_color" || family === "gray_coverage" || family === "gloss") {
      return true;
    }
  }
  return false;
}

function buildRequestedServiceFromLabel(
  label: string,
  services: RequestedService[] = [],
): RequestedService | null {
  const canonicalLabel = canonicalizeRequestedServiceLabel(normalizeString(label));
  if (!canonicalLabel) return null;
  const existing = services.find((service) =>
    normalizeLowerString(canonicalizeRequestedServiceLabel(normalizeString(service.label))) ===
      normalizeLowerString(canonicalLabel)
  );
  if (existing) {
    return {
      ...existing,
      label: canonicalLabel,
    };
  }
  return {
    label: canonicalLabel,
    family: familyKeyForRequestedLabel(canonicalLabel),
    confidence: 0.8,
    notes: null,
  };
}

function collectResolvableServiceLabels(state: StructuredBookingState) {
  return uniqueStrings([
    ...state.service_stack.map((label) => canonicalizeRequestedServiceLabel(normalizeString(label))),
    ...state.requested_services.map((service) => canonicalizeRequestedServiceLabel(normalizeString(service.label))),
    canonicalizeRequestedServiceLabel(normalizeString(state.service_candidate)),
  ].filter(Boolean));
}

function scoreServiceLabelMention(message: string, label: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return -1;
  const canonicalLabel = canonicalizeRequestedServiceLabel(normalizeString(label));
  if (!canonicalLabel) return -1;
  const terms = uniqueStrings([canonicalLabel, ...serviceTermsForLabel(canonicalLabel)])
    .map((term) => normalizeLowerString(term))
    .filter(Boolean);
  let bestScore = -1;
  for (const term of terms) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "i");
    if (!pattern.test(lower)) continue;
    const specificityBonus = SPECIFIC_SERVICE_LABELS.has(normalizeLowerString(canonicalLabel)) ? 100 : 0;
    bestScore = Math.max(bestScore, specificityBonus + term.length);
  }
  return bestScore;
}

function resolveServiceMentionsAgainstCurrentStack(
  message: string,
  state: StructuredBookingState,
): RequestedService[] {
  const scored = collectResolvableServiceLabels(state)
    .map((label) => ({
      label,
      score: scoreServiceLabelMention(message, label),
    }))
    .filter((item) => item.score >= 0)
    .sort((a, b) => b.score - a.score);

  return scored
    .map((item) => buildRequestedServiceFromLabel(item.label, state.requested_services))
    .filter((service): service is RequestedService => !!service);
}

function resolveNegatedServiceLabelsAgainstCurrentStack(
  message: string,
  state: StructuredBookingState,
) {
  const clauses = normalizeString(message)
    .split(/\s*(?:,|;|\bbut\b)\s*/i)
    .map((part) => normalizeString(part))
    .filter(Boolean);
  const negated = new Set<string>();
  for (const clause of clauses) {
    const lower = normalizeLowerString(clause);
    if (!/\b(?:no|not for|not a|without|skip|remove)\b/.test(lower)) continue;
    const explicitlyNegated = detectNegatedServiceLabels(clause);
    if (explicitlyNegated.size) {
      for (const label of explicitlyNegated) {
        negated.add(normalizeLowerString(label));
      }
      continue;
    }
    const matched = resolveServiceMentionsAgainstCurrentStack(clause, state);
    if (matched.length) {
      for (const service of matched) {
        negated.add(normalizeLowerString(service.label));
      }
      continue;
    }
  }
  return negated;
}

function createEmptyState(phone: string | null): StructuredBookingState {
  return {
    intent: "unclear",
    client_name: null,
    phone,
    is_existing_client: null,
    requested_services: [],
    service_stack: [],
    service_family: null,
    service_family_confidence: null,
    service_candidate: null,
    service_candidate_confidence: null,
    needs_service_decision: false,
    decision_question_key: null,
    decision_answer: null,
    service_modifiers: [],
    stylist_preference: null,
    timing_preference: createEmptyTimingPreference(),
    known_constraints: [],
    missing_required_info: [],
    ready_to_search_availability: false,
    ready_to_book: false,
    confidence: 0,
    client_facing_reply: "",
  };
}

function extractStylistMention(message: string) {
  const match = normalizeString(message).match(
    /\b(?:with|w\/|see|seeing|book with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
  );
  return normalizeStylistPreference(match?.[1] || "") || null;
}

function detectIntent(message: string): SmsIntent {
  const lower = normalizeLowerString(message);
  if (!lower) return "unclear";
  if (/\b(cancel|cancellation|need to cancel)\b/.test(lower)) return "cancel";
  if (/\b(reschedule|move my appointment|change my appointment)\b/.test(lower)) return "reschedule";
  if (/\b(price|pricing|cost|how much)\b/.test(lower)) return "pricing_question";
  if (/\b(are those|is that|is this|next available|next appointment|next appointments|soonest you have)\b/.test(lower)) return "general_question";
  if (/\b(book|appointment|come in|need to get|want to get|looking to get)\b/.test(lower)) return "book";
  if (/\bhi\b|\bhello\b|\bhey\b|\bquestion\b/.test(lower)) return "general_question";
  return "unclear";
}

function detectServices(message: string) {
  const results: RequestedService[] = [];
  const clauses = normalizeString(message)
    .split(/\s+(?:and|\+|, then| then )\s+/i)
    .map((part) => normalizeString(part))
    .filter(Boolean);
  const sources = clauses.length ? clauses : [normalizeString(message)];

  for (const source of sources) {
    const clauseStylist = extractStylistMention(source);
    const curatedMatches = detectCuratedServices(source);
    for (const match of curatedMatches) {
      results.push({
        label: canonicalizeRequestedServiceLabel(match),
        family: familyKeyForRequestedLabel(match) || "color",
        confidence: SPECIFIC_SERVICE_LABELS.has(normalizeLowerString(match)) ? 0.88 : 0.72,
        notes: clauseStylist && clauseStylist !== "any" ? `with ${clauseStylist}` : null,
      });
    }
    for (const definition of SERVICE_PATTERNS) {
      if (definition.patterns.some((pattern) => pattern.test(source))) {
        results.push({
          label: canonicalizeRequestedServiceLabel(definition.label),
          family: definition.family,
          confidence: 0.7,
          notes: clauseStylist && clauseStylist !== "any" ? `with ${clauseStylist}` : null,
        });
      }
    }
  }
  return mergeRequestedServices([], results);
}

function detectCuratedServices(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return [];

  const matched = CURATED_SERVICE_RULES
    .filter((rule) =>
      rule.matches.some((phrase) => {
        const normalizedPhrase = normalizeLowerString(phrase);
        if (!normalizedPhrase) return false;
        if (normalizedPhrase.includes(" ")) return lower.includes(normalizedPhrase);
        return new RegExp(`\\b${escapeRegExp(normalizedPhrase)}\\b`, "i").test(lower);
      })
    )
    .map((rule) => rule.canonical_label);

  return uniqueStrings(matched);
}

function hasSpecificServiceDetails(services: RequestedService[], stack: string[]) {
  const labels = [
    ...services.map((service) => normalizeLowerString(service.label)),
    ...stack.map((item) => normalizeLowerString(item)),
  ];
  return labels.some((label) => SPECIFIC_SERVICE_LABELS.has(label));
}

function detectModifiers(message: string) {
  const results: string[] = [];
  for (const definition of MODIFIER_PATTERNS) {
    if (definition.patterns.some((pattern) => pattern.test(message))) {
      results.push(definition.label);
    }
  }
  return uniqueStrings(results);
}

function detectKnownConstraints(message: string) {
  const lower = normalizeLowerString(message);
  const asciiLower = lower.replace(/[’]/g, "'");
  const constraints: string[] = [];
  if (
    /\bsame as last time\b|\bwhat i got last time\b|\bwhat i had last time\b|\bsame thing as last time\b|\blast visit\b/.test(lower)
  ) {
    constraints.push("prior_visit_reference");
  }
  if (
    /\bwho did my color\b|\bwho did my hair\b|\bsame stylist\b|\bsame person\b|\bwhoever did my\b/.test(lower)
  ) {
    constraints.push("prior_stylist_reference");
  }
  if (/\bmy friend sees\b|\bmy friend goes to\b/.test(lower)) {
    constraints.push("friend_stylist_reference");
  }
  if (/\bwedding\b|\bvacation\b|\bevent\b|\bcamera ready\b/.test(lower)) {
    constraints.push("event_anchor");
  }
  if (
    /\bi don't know what i need\b|\bnot sure what i need\b|\bnot sure what to book\b|\bwhatever you think\b/.test(lower)
  ) {
    constraints.push("unsure_service");
    constraints.push("consult_candidate");
  }
  if (
    /\blow maintenance\b/.test(lower) ||
    /\blow-maintenance\b/.test(lower) ||
    /\blow maint\b/.test(lower) ||
    /\blow maintenence\b/.test(lower) ||
    /\blow-maintainance\b/.test(lower) ||
    /\blow-maintenence\b/.test(lower) ||
    /\blow maintanence\b/.test(lower)
  ) {
    constraints.push("low_maintenance_goal");
    constraints.push("consult_candidate");
  }
  if (
    /\bhealthiest\b|\bhealthy\b|\bbig change\b|\bmajor change\b|\bcolor correction\b|\bbox dye\b|\bextensions need help\b/.test(lower)
  ) {
    constraints.push("consult_candidate");
  }
  if (
    /\brefresh my blonde\b/.test(lower) ||
    /\bnot too blonde\b/.test(lower) ||
    /\bjust a little brighter\b/.test(lower) ||
    /\ba little brighter\b/.test(lower) ||
    /\btone it down\b/.test(lower) ||
    /\bsoft dimension\b/.test(lower) ||
    /\bstay pretty natural\b/.test(lower) ||
    /\bstay natural\b/.test(lower)
  ) {
    constraints.push("blonde_refresh_ambiguity");
  }
  if (
    (/\btouch ?up\b/.test(lower) || /\btouch-up\b/.test(lower)) &&
    !/\broots?\b|\broot touch[- ]?up\b|\bgray\b|\bgrey\b|\bsingle process\b/.test(lower)
  ) {
    constraints.push("touch_up_ambiguity");
  }
  if (/\bdoes\b.+\bdo\b|\bwho does\b|\bwho can do\b/.test(asciiLower)) {
    constraints.push("staff_service_question");
  }
  if (/\bwho(?:'s| is)\s+(?:best|good)\s+for\b|\bwho does\b|\bwho can do\b/.test(asciiLower)) {
    constraints.push("staff_recommendation_question");
  }
  return uniqueStrings(constraints);
}

function detectStylistPreference(message: string) {
  const lower = normalizeLowerString(message);
  if (
    /\b(no preference|no pref|anyone|anybody|whoever|open to anyone|open to anybody|whoever is available|any stylist|anyone on the team)\b/.test(lower)
  ) {
    return "any";
  }
  if (
    (/\b(anyone|anybody|whoever)\b/.test(lower) || /\bopen to\b/.test(lower)) &&
    (/\bif\b/.test(lower) || /\bexcept\b/.test(lower) || /\bbut not\b/.test(lower) || /\bother than\b/.test(lower))
  ) {
    return "any";
  }
  const detectedServices = detectServices(message);
  const clauses = normalizeString(message)
    .split(/\s+(?:and|\+|, then| then )\s+/i)
    .map((part) => normalizeString(part))
    .filter(Boolean);
  const clauseStylistMentions = clauses
    .map((clause) => extractStylistMention(clause))
    .filter((value): value is string => !!value && value !== "any");
  if (detectedServices.length > 1 && clauseStylistMentions.length > 0) {
    return null;
  }
  return extractStylistMention(message);
}

function isAvailabilityMetaQuestionWithoutTiming(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  return (
    /\bwhat times do you have\b/.test(lower) ||
    /\bwhat do you have\b/.test(lower) ||
    /\bwhat'?s available\b/.test(lower) ||
    /\bany openings\b/.test(lower) ||
    /\bwhat times are open\b/.test(lower) ||
    /\bwhat availability do you have\b/.test(lower)
  );
}

function hasExplicitTimingCueForAvailabilityQuestion(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  return (
    DAY_PATTERNS.some((day) => lower.includes(day)) ||
    /\btoday\b|\btomorrow\b|\bthis week\b|\bnext week\b|\bthis month\b|\bnext month\b|\bweekend\b|\bweekday\b/.test(lower) ||
    /\bmorning\b|\bafternoon\b|\bevening\b|\bafter\b|\bbefore\b|\blunch\b/.test(lower) ||
    /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/.test(lower) ||
    /\bsoonest available\b|\bfirst available\b|\banytime works\b|\bany time is fine\b|\bi'?m open anytime\b|\bwhenever is fine\b/.test(lower)
  );
}

function shouldForceAvailabilityMetaTimingClarification(message: string) {
  return isAvailabilityMetaQuestionWithoutTiming(message) && !hasExplicitTimingCueForAvailabilityQuestion(message);
}

function applyAvailabilityMetaTimingGuardrail(
  state: StructuredBookingState,
  bookingRequest: BookingRequestDraft,
  latestInboundText: string,
) {
  if (!shouldForceAvailabilityMetaTimingClarification(latestInboundText)) {
    return null;
  }
  if (!normalizeString(state.service_candidate) && !bookingRequest.resolved_services.length) {
    return null;
  }
  if (hasUsableTimingPreference(state.timing_preference) && (
    normalizeString(state.timing_preference.date_range) ||
    state.timing_preference.day_preferences.length ||
    state.timing_preference.time_preferences.some((value) => normalizeLowerString(value) !== "any") ||
    normalizeTimingUrgencyValue(state.timing_preference.urgency)
  )) {
    return null;
  }

  const nextState: StructuredBookingState = {
    ...state,
    timing_preference: createEmptyTimingPreference(),
    ready_to_search_availability: false,
    ready_to_book: false,
    missing_required_info: normalizeMissingInfoSet([...state.missing_required_info, "timing"]),
  };
  const nextBookingRequest: BookingRequestDraft = {
    ...bookingRequest,
    timing_preference: createEmptyTimingPreference(),
    ready_to_search_availability: false,
    ready_to_book: false,
  };
  return {
    state: nextState,
    bookingRequest: nextBookingRequest,
    reply: "I can check that — is there a day or general window you prefer, like mornings, afternoons, evenings, or soonest available?",
    nextAction: "ask_clarifying_question" as NextAction,
  };
}

function detectTimingPreference(message: string): TimingPreference {
  const lower = normalizeLowerString(message);
  const timing = createEmptyTimingPreference();
  if (!lower) return timing;
  if (isAvailabilityMetaQuestionWithoutTiming(message)) return timing;

  if (/\basap\b|\bsoonest\b/.test(lower)) timing.urgency = "asap";
  for (const definition of DATE_RANGE_PATTERNS) {
    if (definition.pattern.test(lower)) {
      if (definition.value === "asap") timing.urgency = "asap";
      else if (!timing.date_range) timing.date_range = definition.value;
    }
  }

  for (const day of DAY_PATTERNS) {
    if (lower.includes(day)) timing.day_preferences.push(day);
  }
  if (/\bweekend\b/.test(lower)) timing.day_preferences.push("weekend");
  if (/\bweekday\b|\bweekdays\b/.test(lower)) timing.day_preferences.push("weekday");
  for (const time of TIME_PATTERNS) {
    if (lower.includes(time)) timing.time_preferences.push(time);
  }
  const exactTimeMatch = normalizeString(message).match(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i);
  if (exactTimeMatch) timing.time_preferences.push(normalizeString(exactTimeMatch[0]).toLowerCase());
  const relativeTimeMatches = normalizeString(message).match(/\b(?:after|before)\s+\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/ig);
  if (relativeTimeMatches) {
    for (const match of relativeTimeMatches) timing.time_preferences.push(normalizeString(match).toLowerCase());
  }

  timing.day_preferences = uniqueStrings(timing.day_preferences);
  timing.time_preferences = uniqueStrings(timing.time_preferences);
  if (timing.urgency || timing.date_range || timing.day_preferences.length || timing.time_preferences.length) {
    timing.raw_text = normalizeString(message);
  }
  return timing;
}

function normalizeTimingUrgencyValue(value: string | null | undefined) {
  const lower = normalizeLowerString(value);
  if (!lower) return "";
  if (["asap", "soon", "as soon as possible", "soonest"].includes(lower)) return "asap";
  return "";
}

function hasUsableTimingPreference(timing: TimingPreference) {
  return !!(
    normalizeTimingUrgencyValue(timing.urgency) ||
    timing.date_range ||
    timing.day_preferences.length ||
    timing.time_preferences.length
  );
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return normalizeDecisionStateConsistency(assertedBookingState(next));
}

function toYmd(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseExplicitSearchDate(timing: TimingPreference) {
  const candidates = [
    normalizeString(timing.date_range),
    normalizeString(timing.raw_text),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return candidate;
    const match = normalizeLowerString(candidate).match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:,\s*(\d{4}))?\b/,
    );
    if (!match) continue;
    const monthIndex = MONTH_NAME_TO_INDEX[match[1]];
    const day = Number(match[2]);
    const year = Number(match[3]) || startOfToday().getFullYear();
    if (!Number.isFinite(monthIndex) || !Number.isFinite(day)) continue;
    const date = new Date(year, monthIndex, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === monthIndex &&
      date.getDate() === day
    ) {
      return toYmd(date);
    }
  }
  return "";
}

function parseExplicitMonthRangeKey(timing: TimingPreference) {
  const candidates = [
    normalizeString(timing.date_range),
    normalizeString(timing.raw_text),
  ].filter(Boolean);
  const today = startOfToday();
  for (const candidate of candidates) {
    const lower = normalizeLowerString(candidate);
    const match = lower.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/,
    );
    if (!match) continue;
    const monthIndex = MONTH_NAME_TO_INDEX[match[1]];
    const year = Number(match[2]) || today.getFullYear();
    if (!Number.isFinite(monthIndex)) continue;
    const monthOffset = (year - today.getFullYear()) * 12 + (monthIndex - today.getMonth());
    if (monthOffset === 0) return "this_month";
    if (monthOffset === 1) return "next_month";
    if (monthOffset === 2) return "month_after_next";
  }
  return "";
}

function hasRelativeWeekdayOnlyPreference(timing: TimingPreference) {
  const dayPrefs = timing.day_preferences.map((value) => normalizeLowerString(value)).filter(Boolean);
  if (!dayPrefs.length) return false;
  if (normalizeTimingUrgencyValue(timing.urgency)) return false;
  if (normalizeString(timing.date_range)) return false;
  if (parseExplicitSearchDate(timing)) return false;
  if (parseExplicitMonthRangeKey(timing)) return false;
  return dayPrefs.every((day) => DAY_PATTERNS.includes(day) || day === "weekday" || day === "weekend");
}

function availabilityWindowForTimingPreference(timing: TimingPreference) {
  const explicitDate = parseExplicitSearchDate(timing);
  if (explicitDate) {
    return { date: explicitDate, rangeKey: "" };
  }
  const explicitMonthRangeKey = parseExplicitMonthRangeKey(timing);
  if (explicitMonthRangeKey) {
    return { date: "", rangeKey: explicitMonthRangeKey };
  }
  if (hasRelativeWeekdayOnlyPreference(timing)) {
    return { date: "", rangeKey: "next_available_3_months" };
  }
  return {
    date: "",
    rangeKey: rangeKeyFromTimingPreference(timing),
  };
}

function guidedModifierServiceKeyForLabel(label: string) {
  const lower = normalizeLowerString(label);
  if (lower === "root touch-up") return "Root touch-up";
  if (lower === "single process") return "Single Process";
  if (lower === "face frame") return "Face Frame";
  if (lower === "partial highlight") return "Partial Highlight";
  if (lower === "full highlight") return "Full Highlight";
  if (lower === "haircut") return "Haircut";
  if (lower === "blowout") return "Blowout";
  if (lower === "extensions maintenance") return "Extensions maintenance";
  return null;
}

function normalizeGuidedModifierName(value: string) {
  const lower = normalizeLowerString(value);
  if (!lower) return "";
  if (["gloss", "glaze", "toner", "glaze/gloss", "gloss/glaze"].includes(lower)) return "Glaze/Gloss";
  if (lower.includes("extra color")) return "Extra Color";
  if (lower.includes("air-dry") || lower.includes("air dry")) return "Air-Dry Transition Time";
  if (lower.includes("tipping")) return "Tipping";
  if (lower.includes("lowlight")) return "Lowlights";
  if (lower.includes("pretone") || lower.includes("pre-tone")) return "Pretone";
  if (lower.includes("root shadow")) return "Root Shadow";
  if (lower.includes("big change")) return "I am looking for a big change";
  if (lower.includes("long or thick")) return "My hair is long or thick";
  if (lower.includes("extra long or thick")) return "My hair is extra long or thick";
  if (lower.includes("extensions")) return "Blowdry with Extensions";
  if (lower.includes("standard")) return "Standard Length and Texture";
  if (lower.includes("1 track")) return "1 Track";
  if (lower.includes("2 track")) return "2 Tracks";
  if (lower.includes("3 track")) return "3 Tracks";
  return normalizeString(value);
}

function allowedGuidedModifiersForState(state: StructuredBookingState) {
  const allowed = new Set<string>();
  for (const label of state.service_stack) {
    const key = guidedModifierServiceKeyForLabel(label);
    if (!key) continue;
    for (const modifier of GUIDED_BOOKING_MODIFIER_MAP[key] || []) {
      allowed.add(modifier);
    }
  }
  return allowed;
}

function optionIdsForResolvedService(service: ResolvedBoulevardService, modifiers: string[]) {
  const serviceKey = guidedModifierServiceKeyForLabel(service.requested_label);
  if (!serviceKey) return [];
  const optionMap = GUIDED_BOOKING_MODIFIER_OPTION_IDS[serviceKey] || {};
  return modifiers
    .map((modifier) => normalizeGuidedModifierName(modifier))
    .map((modifier) => normalizeString(optionMap[modifier]))
    .filter(Boolean);
}

function buildAvailabilityRequestedServices(bookingRequest: BookingRequestDraft) {
  return bookingRequest.resolved_services.map((service) => ({
    service_id: service.service_id,
    staff_id: "any",
    option_ids: optionIdsForResolvedService(service, bookingRequest.service_modifiers),
  }));
}

function extractStaffPreferenceFromServiceNotes(service: RequestedService) {
  const notes = normalizeString(service.notes);
  if (!notes) return "";
  const match = notes.match(
    /\bwith\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*)*)/,
  );
  return normalizeString(match?.[1] || "");
}

function buildBookingServicePreferences(bookingRequest: BookingRequestDraft): BookingServicePreference[] {
  const requestedByLabel = new Map<string, RequestedService>();
  for (const service of bookingRequest.requested_services) {
    const label = canonicalizeRequestedServiceLabel(normalizeString(service.label));
    if (label) requestedByLabel.set(label, service);
  }
  const globalStylistPreference = normalizeStylistPreference(bookingRequest.stylist_preference || "");
  return bookingRequest.resolved_services.map((resolved) => {
    const requestedLabel = canonicalizeRequestedServiceLabel(normalizeString(resolved.requested_label));
    const requestedService = requestedByLabel.get(requestedLabel);
    const serviceSpecificPreference = requestedService
      ? extractStaffPreferenceFromServiceNotes(requestedService)
      : "";
    return {
      requested_label: requestedLabel || normalizeString(resolved.requested_label),
      service_id: normalizeString(resolved.service_id) || null,
      service_name: normalizeString(resolved.service_name) || null,
      staff_preference: normalizeStylistPreference(serviceSpecificPreference) || globalStylistPreference || null,
    };
  });
}

function servicePreferenceByRequestedLabel(bookingRequest: BookingRequestDraft) {
  const map = new Map<string, BookingServicePreference>();
  for (const preference of bookingRequest.service_preferences) {
    const label = canonicalizeRequestedServiceLabel(normalizeString(preference.requested_label));
    if (label) {
      map.set(label, preference);
    }
  }
  return map;
}

async function fetchAvailabilityContextForBookingRequest(bookingRequest: BookingRequestDraft) {
  const response = await bookingProxyRequest({
    action: "availability-context",
    services: buildAvailabilityRequestedServices(bookingRequest),
  });
  return safeArray<JsonRecord>(response.services);
}

function normalizePersonName(value: string) {
  return normalizeLowerString(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function pickMatchingStaffVariantId(staffOptions: JsonRecord[], stylistPreference: string) {
  const needle = normalizePersonName(stylistPreference);
  if (!needle) return "";
  const candidates = staffOptions
    .map((option) => ({
      id: normalizeString(option.id),
      name: normalizeString(option.name),
      normalized: normalizePersonName(normalizeString(option.name)),
    }))
    .filter((option) => option.id && option.id !== "any");

  const exact = candidates.find((option) => option.normalized === needle);
  if (exact) return exact.id;

  const partial = candidates.find((option) =>
    option.normalized.includes(needle) || needle.includes(option.normalized),
  );
  return partial?.id || "";
}

async function buildAvailabilityRequestedServicesWithStaff(bookingRequest: BookingRequestDraft) {
  const requestedServices = buildAvailabilityRequestedServices(bookingRequest);
  const serviceSpecificPreferences = servicePreferenceByRequestedLabel(bookingRequest);
  if (!requestedServices.length) {
    return {
      requestedServices,
      unmatchedStaffPreferences: [] as string[],
    };
  }

  const contextServices = await fetchAvailabilityContextForBookingRequest(bookingRequest);
  const unmatchedStaffPreferences: string[] = [];
  const requestedServicesWithStaff = requestedServices.map((requested) => {
    const resolvedService = bookingRequest.resolved_services.find((service) =>
      normalizeString(service.service_id) === requested.service_id
    );
    const requestedLabel = canonicalizeRequestedServiceLabel(
      normalizeString(resolvedService?.requested_label),
    );
    const stylistPreference = normalizeString(
      serviceSpecificPreferences.get(requestedLabel)?.staff_preference,
    );
    if (!stylistPreference || normalizeLowerString(stylistPreference) === "any") {
      return requested;
    }
    const context = contextServices.find((service) => normalizeString(service.service_id) === requested.service_id);
    const staffOptions = safeArray<JsonRecord>(context?.staff);
    const matchedVariantId = pickMatchingStaffVariantId(staffOptions, stylistPreference);
    if (!matchedVariantId) {
      unmatchedStaffPreferences.push(
        `${stylistPreference} for ${normalizeString(resolvedService?.service_name || requestedLabel || requested.service_id)}`,
      );
      return requested;
    }
    return {
      ...requested,
      staff_id: matchedVariantId,
      preferred_staff_ids: [matchedVariantId],
    };
  });
  return {
    requestedServices: requestedServicesWithStaff,
    unmatchedStaffPreferences,
  };
}

function rangeKeyFromTimingPreference(timing: TimingPreference) {
  const dateRange = normalizeLowerString(timing.date_range);
  const urgency = normalizeLowerString(timing.urgency);
  if (urgency === "asap" || urgency === "soon" || urgency === "as soon as possible") {
    return "next_available_3_months";
  }
  if (dateRange === "today") return "today";
  if (dateRange === "this_week" || dateRange === "weekend" || dateRange === "tomorrow") return "this_week";
  if (dateRange === "next_week") return "next_week";
  if (dateRange === "this_month") return "this_month";
  if (dateRange === "next_month") return "next_month";
  if (timing.time_preferences.some((value) => normalizeLowerString(value).includes("morning"))) return "mornings_3_months";
  if (
    timing.time_preferences.some((value) => {
      const lower = normalizeLowerString(value);
      return lower.includes("evening") || lower.includes("after work") || lower.includes("after 5pm") || lower.includes("after 6pm");
    })
  ) return "evenings_3_months";
  return "this_month";
}

function displayWeekdayName(startAt: string) {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(date).toLowerCase();
}

function displayHour(startAt: string) {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = parts.find((item) => item.type === "hour");
  const hour = Number(part?.value || "");
  return Number.isFinite(hour) ? hour : null;
}

function displayMinutesOfDay(startAt: string) {
  const date = new Date(startAt);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((item) => item.type === "hour")?.value || "");
  const minute = Number(parts.find((item) => item.type === "minute")?.value || "");
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function parseClockPreferenceToMinutes(value: string) {
  const match = normalizeLowerString(value).match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const meridiem = match[3];
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour === 12) hour = 0;
  if (meridiem === "pm") hour += 12;
  return hour * 60 + minute;
}

function slotMatchesTimingPreference(slot: AvailabilitySlotSuggestion, timing: TimingPreference) {
  const dayPrefs = timing.day_preferences.map((value) => normalizeLowerString(value));
  const timePrefs = timing.time_preferences.map((value) => normalizeLowerString(value));
  const weekday = displayWeekdayName(slot.start_at);
  const hour = displayHour(slot.start_at);
  const minutesOfDay = displayMinutesOfDay(slot.start_at);

  const dayOk = !dayPrefs.length || dayPrefs.some((day) => {
    if (day === "weekend") return weekday === "saturday" || weekday === "sunday";
    if (day === "weekday") return ["monday", "tuesday", "wednesday", "thursday", "friday"].includes(weekday);
    return day === weekday;
  });

  const timeOk = !timePrefs.length || timePrefs.some((pref) => {
    if (!pref) return true;
    if (pref === "morning") return hour !== null && hour >= 6 && hour < 12;
    if (pref === "afternoon") return hour !== null && hour >= 12 && hour < 17;
    if (pref === "evening" || pref === "after work") return hour !== null && hour >= 17 && hour < 22;
    const exactMinutes = parseClockPreferenceToMinutes(pref);
    if (exactMinutes !== null) return minutesOfDay === exactMinutes;
    const afterMatch = pref.match(/^after\s+(.+)$/);
    if (afterMatch) {
      const afterMinutes = parseClockPreferenceToMinutes(afterMatch[1]);
      return afterMinutes !== null && minutesOfDay !== null && minutesOfDay >= afterMinutes;
    }
    const beforeMatch = pref.match(/^before\s+(.+)$/);
    if (beforeMatch) {
      const beforeMinutes = parseClockPreferenceToMinutes(beforeMatch[1]);
      return beforeMinutes !== null && minutesOfDay !== null && minutesOfDay <= beforeMinutes;
    }
    return slot.label.toLowerCase().includes(pref);
  });

  return dayOk && timeOk;
}

function summarizeRequestedServices(requestedServices: RequestedService[]) {
  const labels = uniqueStrings(
    requestedServices.map((item) => canonicalizeRequestedServiceLabel(normalizeString(item.label))),
  ).filter(Boolean);
  if (!labels.length) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function buildAvailabilityReply(slots: AvailabilitySlotSuggestion[], serviceSummary = "") {
  if (!slots.length) {
    return "I couldn't find a good match in that window yet. Want to try a different day, time, or stylist preference?";
  }
  const top = slots.slice(0, 3);
  const lines = top.map((slot, index) => `${index + 1}. ${slot.label}`);
  const intro = serviceSummary
    ? `I found a few options for ${serviceSummary}:`
    : "I found a few options:";
  return `${intro}\n${lines.join("\n")}\nReply with 1, 2, or 3, or send another day/time.`;
}

function describeRequestedServices(state: StructuredBookingState) {
  const labels = uniqueStrings(
    state.requested_services.map((item) => canonicalizeRequestedServiceLabel(normalizeString(item.label))),
  ).filter(Boolean);
  if (!labels.length) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function hasRequestedServiceLabel(state: StructuredBookingState, labels: string[]) {
  const normalizedLabels = new Set(labels.map((label) => normalizeLowerString(label)));
  return state.requested_services.some((item) => normalizedLabels.has(normalizeLowerString(item.label))) ||
    state.service_stack.some((item) => normalizedLabels.has(normalizeLowerString(item)));
}

function consultationContextType(state: StructuredBookingState) {
  const modifiers = new Set(state.service_modifiers.map((item) => normalizeLowerString(item)));
  const constraints = new Set(state.known_constraints.map((item) => normalizeLowerString(item)));
  if (modifiers.has("corrective color")) return "color_correction";
  if (hasRequestedServiceLabel(state, ["Extensions"])) return "extensions";
  if (constraints.has("low_maintenance_goal")) return "low_maintenance";
  if (constraints.has("unsure_service")) return "unsure";
  if (constraints.has("consult_candidate")) return "general";
  return "general";
}

function describeTimingPreference(timing: TimingPreference) {
  const parts: string[] = [];
  if (normalizeString(timing.date_range)) parts.push(normalizeString(timing.date_range));
  if (timing.day_preferences.length) parts.push(timing.day_preferences.join(" or "));
  if (timing.time_preferences.length) parts.push(timing.time_preferences.join(" and "));
  return parts.join(" ").trim();
}

function buildNoAvailabilityReply(state: StructuredBookingState) {
  const stylistPreference = normalizeStylistPreference(state.stylist_preference || "");
  const serviceSummary = describeRequestedServices(state);
  const timingSummary = describeTimingPreference(state.timing_preference);
  if (!stylistPreference || normalizeLowerString(stylistPreference) === "any") {
    if (serviceSummary && timingSummary) {
      return `I’m not seeing anything for ${serviceSummary} in ${timingSummary} right now. Want me to check a wider range, or would you rather send another day or time?`;
    }
    return "I’m not seeing anything in that window right now. Want me to check a wider range, or would you like to send another day or time?";
  }
  if (serviceSummary && timingSummary) {
  return `I’m not seeing anything for ${serviceSummary} with ${stylistPreference} in ${timingSummary}. Want me to widen the timing with ${stylistPreference}, keep the timing and check anyone on the team, or do both?`;
  }
  return `I’m not seeing anything with ${stylistPreference} in that window. Want me to check a wider range with ${stylistPreference}, look for the soonest with anyone on the team, or do both?`;
}

function assessBookingSearchReadiness(state: StructuredBookingState, bookingRequest: BookingRequestDraft): BookingSearchReadiness {
  const normalizedMissing = new Set(
    state.missing_required_info.map((item) => normalizeLowerString(item)),
  );
  const unresolvedLabels = bookingRequest.unresolved_service_labels.map((item) => normalizeLowerString(item));
  const knownRequestedLabels = uniqueStrings([
    ...state.requested_services.map((item) => normalizeLowerString(item.label)),
    ...state.service_stack.map((item) => normalizeLowerString(item)),
  ]).filter(Boolean);
  const hasServiceIntent = state.requested_services.length > 0 || state.service_stack.length > 0;
  const hasResolvedServices =
    bookingRequest.resolved_services.length > 0 &&
    bookingRequest.unresolved_service_labels.length === 0;
  const hasServiceDetailsResolved =
    !normalizedMissing.has("service_details") &&
    !unresolvedLabels.some((label) =>
      ["dimensional color", "color", "highlight", "highlights"].includes(label)
    );
  const hasUsableTiming = hasUsableTimingPreference(state.timing_preference);
  const hasStaffPreference = bookingRequest.service_preferences.some((service) =>
    !!normalizeString(service.staff_preference)
  ) || !!normalizeString(state.stylist_preference);
  const hasKnownServiceFamily =
    hasServiceIntent &&
    knownRequestedLabels.some((label) =>
      [
        "color",
        "dimensional color",
        "face frame",
        "partial highlight",
        "full highlight",
        "root touch-up",
        "single process",
        "gloss",
        "glaze",
        "toner",
        "haircut",
        "blowout",
        "consultation",
        "extensions",
        "treatment",
      ].includes(label)
    );

  const blockers: string[] = [];
  if (!hasServiceIntent) blockers.push("service");
  else if (!hasResolvedServices && !hasKnownServiceFamily) blockers.push("service");
  if (hasServiceIntent && !hasServiceDetailsResolved) blockers.push("service_details");
  if (!hasUsableTiming) blockers.push("timing");
  if (!hasStaffPreference) blockers.push("stylist_preference");

  return {
    hasServiceIntent,
    hasResolvedServices,
    hasServiceDetailsResolved,
    hasUsableTiming,
    hasStaffPreference,
    blockers: uniqueStrings(blockers),
  };
}

function isNoAvailabilityReply(message: string) {
  const lower = normalizeLowerString(message);
  return lower.startsWith("i’m not seeing anything") || lower.startsWith("i'm not seeing anything");
}

function createAsapTimingPreference(rawText = "next available"): TimingPreference {
  return {
    raw_text: rawText,
    date_range: null,
    day_preferences: [],
    time_preferences: [],
    urgency: "asap",
  };
}

function clearRestrictiveTimingPreference(timing: TimingPreference) {
  return createAsapTimingPreference(normalizeString(timing.raw_text) || "next available");
}

function normalizeBookingActionResult(value: unknown): BookingActionResult {
  const record = safeObject(value);
  const action = normalizeString(record.action) as BookingAction;
  const entities = safeObject(record.entities);
  return {
    action: action || "unknown",
    confidence: typeof record.confidence === "number" ? record.confidence : 0,
    entities: {
      service: normalizeString(entities.service) || null,
      remove_services: safeArray<string>(entities.remove_services).map((item) => normalizeString(item)).filter(Boolean),
      staff: normalizeString(entities.staff) || null,
      timing: normalizeString(entities.timing) || null,
      exclude_staff: safeArray<string>(entities.exclude_staff).map((item) => normalizeString(item)).filter(Boolean),
      selection: typeof entities.selection === "number" && Number.isFinite(entities.selection)
        ? entities.selection
        : null,
    },
  };
}

function fallbackBookingActionClassifier(input: {
  latestMessage: string;
  currentState: StructuredBookingState;
  bookingRequest: BookingRequestDraft;
  lastOutboundWasNoAvailability: boolean;
}): BookingActionResult {
  const lower = normalizeLowerString(input.latestMessage).replace(/[’]/g, "'");
  const currentStaff = normalizeString(input.currentState.stylist_preference);
  const staffFromMessage = currentStaff && new RegExp(`\\b${escapeRegExp(normalizeLowerString(currentStaff.split(/\s+/)[0] || ""))}\\b`, "i").test(lower)
    ? currentStaff
    : null;
  const appointmentSelection = extractSelectionIndex(input.latestMessage, 9);
  if (isConversationResetRequest(input.latestMessage)) {
    return { action: "reset", confidence: 1, entities: { service: null, staff: null, timing: null, exclude_staff: [], selection: null } };
  }
  if (/\b(?:upcoming appointments?|appointments? coming up|what appointments do i have|show my appointments?|view my appointments?|do i have any appts?(?: booked)?|do i have any appointments?(?: booked)?|any appointments? booked)\b/.test(lower)) {
    return { action: "view_appointments", confidence: 0.95, entities: { service: null, staff: null, timing: null, exclude_staff: [], selection: null } };
  }
  if (/\b(?:look up my appointments?|look up my appts?|check my appointments?|check my appts?)\b/.test(lower)) {
    return { action: "view_appointments", confidence: 0.95, entities: { service: null, staff: null, timing: null, exclude_staff: [], selection: null } };
  }
  if (/\b(?:cancel my appointment|cancel an appointment|i need to cancel|cancel it)\b/.test(lower)) {
    return { action: "cancel_appointment", confidence: 0.95, entities: { service: null, staff: null, timing: null, exclude_staff: [], selection: null } };
  }
  if (/\b(?:reschedule|move my appointment|change my appointment|move it)\b/.test(lower)) {
    return { action: "reschedule_appointment", confidence: 0.95, entities: { service: null, staff: null, timing: null, exclude_staff: [], selection: null } };
  }
  if (appointmentSelection > 0 && /\b(?:appointment|one|first|second|third|fourth|fifth|1|2|3|4|5)\b/.test(lower)) {
    return {
      action: "select_appointment",
      confidence: 0.85,
      entities: { service: null, remove_services: [], staff: null, timing: null, exclude_staff: [], selection: appointmentSelection },
    };
  }
  const negatedServices = resolveNegatedServiceLabelsAgainstCurrentStack(input.latestMessage, input.currentState);
  const detectedServices = detectServices(input.latestMessage).filter((service) => {
    const canonical = canonicalizeRequestedServiceLabel(normalizeString(service.label));
    if (negatedServices.has(normalizeLowerString(canonical))) return false;
    if (hasRemovalCue(input.latestMessage) && shouldStripGenericPositiveServiceFromRemovalTurn(service, negatedServices)) {
      return false;
    }
    return true;
  });
  const stackMatchedServices = resolveServiceMentionsAgainstCurrentStack(input.latestMessage, input.currentState);
  if (/\b(?:option\s*)?[1-5]\b/.test(lower) || (/\b(?:book|take|do|i(?:'|’)ll take|lets do|let'?s do|that works|first one|second one|third one|1 works|2 works|3 works)\b/.test(lower) && /\b(?:one|option|slot|works)\b/.test(lower))) {
    return { action: "confirm_slot", confidence: 0.8, entities: { service: null, remove_services: [], staff: null, timing: null, exclude_staff: [], selection: null } };
  }
  if (/\b(?:none of those|none of them|anything else|other options|something else|those don'?t work|those do not work)\b/.test(lower)) {
    return { action: "reject_slots", confidence: 0.9, entities: { service: null, remove_services: [], staff: null, timing: null, exclude_staff: [], selection: null } };
  }
  if (detectedServices.length > 0 && negatedServices.size > 0) {
    return {
      action: "change_service",
      confidence: 0.92,
      entities: {
        service: normalizeString(detectedServices[0]?.label) || null,
        remove_services: [...negatedServices].map((label) => canonicalizeRequestedServiceLabel(label)).filter(Boolean),
        staff: extractStylistMention(input.latestMessage),
        timing: null,
        exclude_staff: [],
        selection: null,
      },
    };
  }
  if (negatedServices.size > 0) {
    const specificRemoval = normalizeString(stackMatchedServices[0]?.label) ||
      canonicalizeRequestedServiceLabel([...negatedServices][0] || "");
    return {
      action: "remove_service",
      confidence: 0.9,
      entities: {
        service: specificRemoval || null,
        remove_services: [...negatedServices].map((label) => canonicalizeRequestedServiceLabel(label)).filter(Boolean),
        staff: null,
        timing: null,
        exclude_staff: [],
        selection: null,
      },
    };
  }
  if (detectedServices.length > 0) {
    const primaryService = normalizeString(detectedServices[0]?.label) || null;
    if (/\bskip\b|\bremove\b|\bwithout\b|\bnot the\b|\bno\b/.test(lower)) {
      const specificRemoval = normalizeString(stackMatchedServices[0]?.label) || primaryService;
      return {
        action: "remove_service",
        confidence: 0.85,
        entities: {
          service: specificRemoval,
          remove_services: specificRemoval ? [specificRemoval] : [],
          staff: null,
          timing: null,
          exclude_staff: [],
          selection: null,
        },
      };
    }
    const mode = detectServiceChangeMode(input.latestMessage);
    if (mode === "replace") {
      return { action: "change_service", confidence: 0.9, entities: { service: primaryService, remove_services: [], staff: extractStylistMention(input.latestMessage), timing: null, exclude_staff: [], selection: null } };
    }
    if (mode === "add") {
      return { action: "add_service", confidence: 0.9, entities: { service: primaryService, remove_services: [], staff: extractStylistMention(input.latestMessage), timing: null, exclude_staff: [], selection: null } };
    }
  }
  if (/\bdo both\b/.test(lower)) {
    return { action: "do_both", confidence: 0.95, entities: { service: null, remove_services: [], staff: staffFromMessage, timing: null, exclude_staff: [], selection: null } };
  }
  if (/\bcheck anyone\b/.test(lower) || normalizeStylistPreference(input.latestMessage) === "any") {
    return { action: "check_anyone", confidence: 0.9, entities: { service: null, remove_services: [], staff: null, timing: null, exclude_staff: [], selection: null } };
  }
  if (/\bwhat'?s\b.+\bnext available\b/.test(lower) || /\bwhen is\b.+\bnext open\b/.test(lower)) {
    return { action: "check_next_available", confidence: 0.9, entities: { service: null, remove_services: [], staff: staffFromMessage, timing: null, exclude_staff: [], selection: null } };
  }
  if (/\bwiden\b|\bopen it up\b|\banything later\b|\banything earlier\b|\bbroaden\b/.test(lower)) {
    return { action: "widen_timing", confidence: 0.85, entities: { service: null, remove_services: [], staff: staffFromMessage, timing: null, exclude_staff: [], selection: null } };
  }
  if (isAvailabilityMetaQuestionWithoutTiming(input.latestMessage) || /\bdo you have anything\b/.test(lower)) {
    return { action: "ask_availability", confidence: 0.85, entities: { service: null, remove_services: [], staff: null, timing: null, exclude_staff: [], selection: null } };
  }
  return { action: "unknown", confidence: 0, entities: { service: null, remove_services: [], staff: null, timing: null, exclude_staff: [], selection: null } };
}

async function classifyBookingAction(input: {
  latestMessage: string;
  previousOutboundMessage: string;
  currentState: StructuredBookingState;
  bookingRequest: BookingRequestDraft;
  lastOutboundWasNoAvailability: boolean;
}) {
  const fallback = fallbackBookingActionClassifier(input);
  try {
    const aiResult = normalizeBookingActionResult(await callOpenAIBookingActionClassifier(input));
    if (
      aiResult.confidence >= 0.75 &&
      aiResult.action !== "unknown"
    ) {
      return aiResult;
    }
    if (fallback.confidence > aiResult.confidence) {
      return fallback;
    }
    return aiResult;
  } catch (error) {
    console.error("Booking action classifier failed", error);
    return fallback;
  }
}

function parseNoAvailabilitySelection(message: string) {
  const match = normalizeLowerString(message).match(/\b([1-3])\b/);
  if (!match) return -1;
  const index = Number(match[1]);
  return Number.isFinite(index) ? index : -1;
}

function isMaxWideTimingPreference(timing: TimingPreference) {
  const urgency = normalizeLowerString(timing.urgency);
  return (
    (urgency === "asap" || urgency === "soon" || urgency === "as soon as possible") &&
    !normalizeString(timing.date_range) &&
    timing.day_preferences.length === 0 &&
    timing.time_preferences.length === 0
  );
}

function widenTimingPreferenceForSearch(timing: TimingPreference): TimingPreference {
  return {
    raw_text: timing.raw_text || "next available",
    date_range: null,
    day_preferences: timing.day_preferences.slice(),
    time_preferences: timing.time_preferences.slice(),
    urgency: "asap",
  };
}

function clearServiceSpecificStaffNotes(services: RequestedService[]) {
  return services.map((service) => {
    const notes = normalizeString(service.notes);
    const stripped = notes
      .replace(/\bwith\s+[A-Za-z][A-Za-z.'-]*(?:\s+[A-Za-z][A-Za-z.'-]*)*/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
    return {
      ...service,
      notes: stripped || null,
    };
  });
}

function availabilityBlockers(state: StructuredBookingState, bookingRequest: BookingRequestDraft) {
  return assessBookingSearchReadiness(state, bookingRequest).blockers;
}

function canSearchAvailability(state: StructuredBookingState, bookingRequest: BookingRequestDraft) {
  return availabilityBlockers(state, bookingRequest).length === 0;
}

function syncStrictAvailabilityReadiness(state: StructuredBookingState, bookingRequest: BookingRequestDraft) {
  const next: StructuredBookingState = {
    ...state,
    missing_required_info: state.missing_required_info.slice(),
  };
  const readiness = assessBookingSearchReadiness(next, bookingRequest);
  if (readiness.hasServiceIntent) {
    next.missing_required_info = next.missing_required_info.filter((item) => normalizeLowerString(item) !== "service");
  }
  if (readiness.hasUsableTiming) {
    next.missing_required_info = next.missing_required_info.filter((item) => normalizeLowerString(item) !== "timing");
  }
  if (readiness.hasResolvedServices) {
    next.missing_required_info = next.missing_required_info.filter((item) => {
      const lower = normalizeLowerString(item);
      return lower !== "service";
    });
  }
  if (readiness.hasServiceDetailsResolved) {
    next.missing_required_info = next.missing_required_info.filter((item) => {
      const lower = normalizeLowerString(item);
      return lower !== "service_details";
    });
  }
  next.missing_required_info = next.missing_required_info.filter((item) => {
    const lower = normalizeLowerString(item);
    return lower !== "stylist_preference";
  });
  next.missing_required_info = normalizeMissingInfoSet([
    ...next.missing_required_info,
    ...readiness.blockers,
  ]);
  if (readiness.hasServiceIntent) {
    next.missing_required_info = next.missing_required_info.filter((item) => normalizeLowerString(item) !== "service");
  }
  if (readiness.blockers.length === 0) {
    next.missing_required_info = next.missing_required_info.filter((item) => {
      const lower = normalizeLowerString(item);
      return lower !== "client_name" &&
        lower !== "existing_client_status" &&
        lower !== "is_existing_client" &&
        !isOptionalSearchDetailLabel(lower);
    });
  }
  next.ready_to_search_availability = readiness.blockers.length === 0;
  return assertedBookingState(next);
}

function normalizeAvailabilitySlotSuggestion(slot: JsonRecord, fallbackDate = ""): AvailabilitySlotSuggestion | null {
  const id = normalizeString(slot.id);
  const label = normalizeString(slot.label);
  const startAt = normalizeString(slot.start_at);
  const date = normalizeString(slot.date) || fallbackDate;
  if (!id || !label || !startAt) return null;
  return {
    id,
    label,
    start_at: startAt,
    date,
  };
}

function availabilitySlotSuggestionsFromResponse(response: JsonRecord) {
  const groupedSlots = safeArray<JsonRecord>(response.date_groups).flatMap((group) => {
    const fallbackDate = normalizeString(group?.date);
    return safeArray<JsonRecord>(group?.slots)
      .map((slot) => normalizeAvailabilitySlotSuggestion(slot, fallbackDate))
      .filter((slot): slot is AvailabilitySlotSuggestion => !!slot);
  });
  const fallbackSlots = safeArray<JsonRecord>(response.slots)
    .map((slot) => normalizeAvailabilitySlotSuggestion(slot))
    .filter((slot): slot is AvailabilitySlotSuggestion => !!slot);
  const slotSource = groupedSlots.length ? groupedSlots : fallbackSlots;
  const seen = new Set<string>();
  return slotSource.filter((slot) => {
    const key = `${slot.id}:${slot.start_at}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function searchAvailabilityForBookingRequest(bookingRequest: BookingRequestDraft) {
  const { requestedServices, unmatchedStaffPreferences } =
    await buildAvailabilityRequestedServicesWithStaff(bookingRequest);
  if (!requestedServices.length) {
    return [];
  }
  if (unmatchedStaffPreferences.length) {
    return [];
  }
  const searchWindow = availabilityWindowForTimingPreference(bookingRequest.timing_preference);

  const response = await bookingProxyRequest({
    action: "availability",
    ...(searchWindow.date ? { date: searchWindow.date } : {}),
    ...(searchWindow.rangeKey ? { range_key: searchWindow.rangeKey } : {}),
    include_slot_breakout: true,
    services: requestedServices,
  });

  const slots = availabilitySlotSuggestionsFromResponse(response);

  return slots.filter((slot) => slotMatchesTimingPreference(slot, bookingRequest.timing_preference)).slice(0, 5);
}

async function tryHandleNoAvailabilitySelection(input: {
  conversation: SmsConversationRecord;
  inbound: InboundSmsMessage;
  recentMessages: SmsMessageRecord[];
}) {
  const lastOutbound = [...input.recentMessages]
    .reverse()
    .find((message) => message.direction === "outbound" && isNoAvailabilityReply(message.body));
  if (!lastOutbound) return null;

  const selection = parseNoAvailabilitySelection(input.inbound.body);
  if (selection < 1) return null;

  const metadata = safeObject(input.conversation.metadata);
  const rawBookingRequest = safeObject(metadata.booking_request) as unknown as BookingRequestDraft;
  if (!Array.isArray(rawBookingRequest?.resolved_services) || !rawBookingRequest.resolved_services.length) {
    return null;
  }

  const currentState = mergeAppointmentState(
    createEmptyState(input.inbound.fromPhone),
    safeObject(input.conversation.state) as unknown as Partial<StructuredBookingState>,
  );

  if (selection === 1 && isMaxWideTimingPreference(currentState.timing_preference)) {
    const stylistPreference = normalizeString(currentState.stylist_preference);
    const reply = stylistPreference && normalizeLowerString(stylistPreference) !== "any"
      ? `I already checked the next 90 days with ${stylistPreference} and I’m still not seeing an opening. If you want, I can look for the soonest with anyone on the team, or you can send another stylist or timing.`
      : "I already checked the next 90 days and I’m still not seeing an opening. If you want, send another stylist, day, or time and I’ll keep narrowing it down.";
    await updateConversationMetadata(input.conversation.id, {
      next_action: "ask_clarifying_question",
      offered_slots: [],
      internal_notes: "No-availability option 1 selected after max-wide search; prompted for alternate stylist or timing.",
    });
    return {
      ok: true,
      reply,
      next_action: "ask_clarifying_question",
      offered_slots: [],
    };
  }

  const nextStateBase: StructuredBookingState = {
    ...currentState,
    requested_services: currentState.requested_services.map((item) => ({ ...item })),
    service_stack: currentState.service_stack.slice(),
    service_modifiers: currentState.service_modifiers.slice(),
    known_constraints: currentState.known_constraints.slice(),
    missing_required_info: currentState.missing_required_info.slice(),
    timing_preference: widenTimingPreferenceForSearch(currentState.timing_preference),
  };

  if (selection === 2 || selection === 3) {
    nextStateBase.stylist_preference = "any";
    nextStateBase.requested_services = clearServiceSpecificStaffNotes(nextStateBase.requested_services);
  }

  const nextState = syncStrictAvailabilityReadiness(
    finalizeAppointmentState(nextStateBase),
    {
      ...rawBookingRequest,
      stylist_preference: normalizeString(nextStateBase.stylist_preference) || null,
      requested_services: nextStateBase.requested_services,
      timing_preference: nextStateBase.timing_preference,
      ready_to_search_availability: true,
      resolved_services: rawBookingRequest.resolved_services,
      unresolved_service_labels: rawBookingRequest.unresolved_service_labels || [],
    },
  );

  const bookingRequestBase: BookingRequestDraft = {
    ...rawBookingRequest,
    intent: nextState.intent,
    phone: nextState.phone,
    client_name: nextState.client_name,
    stylist_preference: normalizeString(nextState.stylist_preference) || null,
    requested_services: nextState.requested_services,
    service_stack: nextState.service_stack,
    service_modifiers: nextState.service_modifiers,
    timing_preference: nextState.timing_preference,
    ready_to_search_availability: nextState.ready_to_search_availability,
    ready_to_book: nextState.ready_to_book,
    resolved_services: rawBookingRequest.resolved_services,
    service_preferences: [],
    unresolved_service_labels: rawBookingRequest.unresolved_service_labels || [],
  };
  const bookingRequest: BookingRequestDraft = {
    ...bookingRequestBase,
    service_preferences: buildBookingServicePreferences(bookingRequestBase),
  };

  const offeredSlots = canSearchAvailability(nextState, bookingRequest)
    ? await searchAvailabilityForBookingRequest(bookingRequest).catch((error) => {
      console.error("No-availability follow-up search failed", error);
      return [] as AvailabilitySlotSuggestion[];
    })
    : [];

  const reply = offeredSlots.length
    ? buildAvailabilityReply(offeredSlots, summarizeRequestedServices(nextState.requested_services))
    : buildNoAvailabilityReply(nextState);
  const nextAction: NextAction = offeredSlots.length ? "search_availability" : "ask_clarifying_question";

  await updateConversationMetadata(input.conversation.id, {
    booking_request: bookingRequest,
    next_action: nextAction,
    offered_slots: offeredSlots,
    internal_notes: offeredSlots.length
      ? `No-availability option ${selection} selected; reran search with updated strategy and found slots.`
      : `No-availability option ${selection} selected; reran search with updated strategy and still found no slots.`,
  });

  return {
    ok: true,
    reply,
    next_action: nextAction,
    offered_slots: offeredSlots,
  };
}

function cloneStructuredBookingState(state: StructuredBookingState): StructuredBookingState {
  return {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    service_modifiers: state.service_modifiers.slice(),
    known_constraints: state.known_constraints.slice(),
    missing_required_info: state.missing_required_info.slice(),
    timing_preference: {
      raw_text: state.timing_preference.raw_text,
      date_range: state.timing_preference.date_range,
      day_preferences: state.timing_preference.day_preferences.slice(),
      time_preferences: state.timing_preference.time_preferences.slice(),
      urgency: state.timing_preference.urgency,
    },
    decision_answer: state.decision_answer ? { ...state.decision_answer } : null,
  };
}

function clearBookingServiceInterpretation(state: StructuredBookingState) {
  state.service_family = null;
  state.service_family_confidence = null;
  state.service_candidate = null;
  state.service_candidate_confidence = null;
  state.needs_service_decision = false;
  state.decision_question_key = null;
  state.decision_answer = null;
  return state;
}

function bookingReducer(
  state: StructuredBookingState,
  actionResult: BookingActionResult,
  input: {
    detectedLatestServices: RequestedService[];
    negatedServiceLabels: Set<string>;
    latestExplicitStylist: string | null;
    parsedLatestTiming: TimingPreference;
    lastOutboundWasNoAvailability: boolean;
  },
) {
  const next = cloneStructuredBookingState(state);
  const detectedLabels = input.detectedLatestServices
    .map((service) => canonicalizeRequestedServiceLabel(normalizeString(service.label)))
    .filter(Boolean);

  const assignRequestedServices = (services: RequestedService[]) => {
    next.requested_services = mergeRequestedServices([], services);
    next.service_stack = normalizeServiceStack(
      next.requested_services.map((service) => canonicalizeRequestedServiceLabel(normalizeString(service.label))),
      next.requested_services,
    );
  };

  switch (actionResult.action) {
    case "set_service":
    case "answer_service_decision":
      if (!input.detectedLatestServices.length) return null;
      next.requested_services = mergeRequestedServices(next.requested_services, input.detectedLatestServices);
      next.service_stack = normalizeServiceStack(
        [...next.service_stack, ...detectedLabels],
        next.requested_services,
      );
      break;
    case "change_service":
      if (!input.detectedLatestServices.length) return null;
      assignRequestedServices(input.detectedLatestServices);
      clearBookingServiceInterpretation(next);
      next.service_modifiers = [];
      if (input.latestExplicitStylist) {
        next.stylist_preference = input.latestExplicitStylist;
      }
      break;
    case "add_service":
      if (!input.detectedLatestServices.length) return null;
      next.requested_services = mergeRequestedServices(next.requested_services, input.detectedLatestServices);
      next.service_stack = normalizeServiceStack(
        [...next.service_stack, ...detectedLabels],
        next.requested_services,
      );
      if (input.latestExplicitStylist) {
        next.stylist_preference = input.latestExplicitStylist;
      }
      break;
    case "remove_service": {
      if (!input.detectedLatestServices.length) return null;
      const labelsToRemove = new Set(detectedLabels.map((label) => normalizeLowerString(label)));
      next.requested_services = next.requested_services.filter((service) =>
        !labelsToRemove.has(normalizeLowerString(service.label))
      );
      next.service_stack = normalizeServiceStack(
        next.service_stack.filter((service) => !labelsToRemove.has(normalizeLowerString(service))),
        next.requested_services,
      );
      clearBookingServiceInterpretation(next);
      break;
    }
    case "set_stylist": {
      const stylist = normalizeString(actionResult.entities.staff) || input.latestExplicitStylist;
      if (!stylist) return null;
      next.stylist_preference = stylist;
      break;
    }
    case "set_timing":
      if (!hasUsableTimingPreference(input.parsedLatestTiming)) return null;
      next.timing_preference = mergeTimingPreference(state.timing_preference, input.parsedLatestTiming);
      break;
    case "ask_availability":
      break;
    case "widen_timing":
      if (!input.lastOutboundWasNoAvailability) return null;
      next.timing_preference = hasUsableTimingPreference(input.parsedLatestTiming)
        ? mergeTimingPreference(state.timing_preference, input.parsedLatestTiming)
        : clearRestrictiveTimingPreference(state.timing_preference);
      break;
    case "check_anyone":
      if (!input.lastOutboundWasNoAvailability && !next.service_stack.length && !next.service_candidate) return null;
      next.stylist_preference = "any";
      next.requested_services = clearServiceSpecificStaffNotes(next.requested_services);
      break;
    case "check_next_available":
      if (!next.service_stack.length && !next.service_candidate) return null;
      next.stylist_preference = normalizeString(actionResult.entities.staff) ||
        (normalizeLowerString(state.stylist_preference) !== "any" ? normalizeString(state.stylist_preference) : null);
      next.timing_preference = hasUsableTimingPreference(input.parsedLatestTiming)
        ? mergeTimingPreference(state.timing_preference, input.parsedLatestTiming)
        : createAsapTimingPreference("next available");
      break;
    case "do_both":
      if (!input.lastOutboundWasNoAvailability) return null;
      next.stylist_preference = "any";
      next.requested_services = clearServiceSpecificStaffNotes(next.requested_services);
      next.timing_preference = hasUsableTimingPreference(input.parsedLatestTiming)
        ? mergeTimingPreference(state.timing_preference, input.parsedLatestTiming)
        : createAsapTimingPreference("next available");
      break;
    case "reject_slots":
      next.timing_preference = createEmptyTimingPreference();
      next.missing_required_info = normalizeMissingInfoSet([...next.missing_required_info, "timing"]);
      next.ready_to_search_availability = false;
      next.ready_to_book = false;
      break;
    default:
      return null;
  }

  if (input.negatedServiceLabels.size) {
    next.requested_services = next.requested_services.filter((service) =>
      !input.negatedServiceLabels.has(normalizeLowerString(service.label))
    );
    next.service_stack = normalizeServiceStack(
      next.service_stack.filter((service) => !input.negatedServiceLabels.has(normalizeLowerString(service))),
      next.requested_services,
    );
  }

  return assertedBookingState(next);
}

function applyBookingActionInvariants(input: {
  state: StructuredBookingState;
  actionResult: BookingActionResult;
  negatedServiceLabels: Set<string>;
}) {
  const next = cloneStructuredBookingState(input.state);

  if (input.negatedServiceLabels.size) {
    next.requested_services = next.requested_services.filter((service) =>
      !input.negatedServiceLabels.has(normalizeLowerString(service.label))
    );
    next.service_stack = normalizeServiceStack(
      next.service_stack.filter((service) => !input.negatedServiceLabels.has(normalizeLowerString(service))),
      next.requested_services,
    );
  }

  const stackLabelSet = new Set(next.service_stack.map((label) => normalizeLowerString(label)));

  if (input.actionResult.action === "change_service" || input.actionResult.action === "remove_service") {
    next.requested_services = mergeRequestedServices(
      [],
      next.requested_services.filter((service) => stackLabelSet.has(normalizeLowerString(service.label))),
    );
    next.service_stack = normalizeServiceStack(next.service_stack, next.requested_services);
  }

  if (!next.service_stack.length) {
    next.requested_services = [];
    clearBookingServiceInterpretation(next);
  }

  next.stylist_preference = sanitizeStylistPreference(next.stylist_preference, next.requested_services);
  next.missing_required_info = normalizeMissingInfoSet(next.missing_required_info);
  return assertedBookingState(next);
}

function collectBookingStateInvariantErrors(input: {
  state: StructuredBookingState;
  bookingRequest?: BookingRequestDraft | null;
  actionResult?: BookingActionResult | null;
  negatedServiceLabels?: Set<string> | null;
}) {
  const errors: string[] = [];
  const state = input.state;
  const bookingRequest = input.bookingRequest || null;
  const negatedServiceLabels = input.negatedServiceLabels || new Set<string>();
  const serviceStack = state.service_stack
    .map((value) => canonicalizeRequestedServiceLabel(normalizeString(value)))
    .filter(Boolean);
  const uniqueServiceStack = uniqueStrings(serviceStack);
  const requestedLabels = state.requested_services
    .map((service) => canonicalizeRequestedServiceLabel(normalizeString(service.label)))
    .filter(Boolean);
  const missing = normalizeMissingInfoSet(state.missing_required_info);
  const candidateLabel = canonicalizeRequestedServiceLabel(normalizeString(state.service_candidate));
  const hasService = uniqueServiceStack.length > 0 || requestedLabels.length > 0 || !!candidateLabel;
  const hasTiming = hasUsableTimingPreference(state.timing_preference);

  if (serviceStack.length !== uniqueServiceStack.length) {
    errors.push("service_stack contains duplicate or non-canonical labels");
  }

  if (candidateLabel && !uniqueServiceStack.includes(candidateLabel)) {
    errors.push("service_candidate is not represented in service_stack");
  }

  if (!state.needs_service_decision && normalizeString(state.decision_question_key)) {
    errors.push("decision_question_key must be null when needs_service_decision is false");
  }

  if (!normalizeString(state.decision_question_key) && state.needs_service_decision) {
    errors.push("needs_service_decision must be false when decision_question_key is null");
  }

  if (
    hasResolvedGrayCoverageRootsAnswer(state) &&
    missing.some((item) => ["gray_coverage_vs_color_change", "root_only_vs_all_over"].includes(normalizeLowerString(item)))
  ) {
    errors.push("resolved gray coverage answer still has stale ambiguity blockers");
  }

  if (
    uniqueServiceStack.includes("Root touch-up") &&
    uniqueServiceStack.includes("Single Process") &&
    !state.known_constraints.some((item) => normalizeLowerString(item) === "all_over_refresh_confirmed")
  ) {
    errors.push("root touch-up confirmation cannot automatically coexist with single process");
  }

  if (missing.length !== uniqueStrings(missing).length) {
    errors.push("missing_required_info contains duplicate labels");
  }

  if (state.ready_to_search_availability) {
    if (!hasService) errors.push("ready_to_search_availability is true without a service");
    if (!hasTiming) errors.push("ready_to_search_availability is true without usable timing");
  }

  if (bookingRequest) {
    const resolvedLabels = bookingRequest.resolved_services
      .map((service) => canonicalizeRequestedServiceLabel(normalizeString(service.requested_label)))
      .filter(Boolean);
    const unresolvedResolvedLabels = resolvedLabels.filter((label) =>
      !uniqueServiceStack.includes(label) && !requestedLabels.includes(label)
    );
    if (unresolvedResolvedLabels.length) {
      errors.push(`resolved_services do not match service_stack/requested_services: ${unresolvedResolvedLabels.join(", ")}`);
    }
  }

  for (const removedLabel of negatedServiceLabels) {
    const canonicalRemoved = canonicalizeRequestedServiceLabel(removedLabel);
    if (canonicalRemoved && (uniqueServiceStack.includes(canonicalRemoved) || requestedLabels.includes(canonicalRemoved))) {
      errors.push(`negated service remained in state: ${canonicalRemoved}`);
    }
  }

  switch (input.actionResult?.action) {
    case "remove_service":
      for (const removedLabel of negatedServiceLabels) {
        const canonicalRemoved = canonicalizeRequestedServiceLabel(removedLabel);
        if (canonicalRemoved && uniqueServiceStack.includes(canonicalRemoved)) {
          errors.push(`remove_service left ${canonicalRemoved} in service_stack`);
        }
      }
      break;
    case "change_service":
      if (uniqueServiceStack.length !== 1) {
        errors.push("change_service must leave exactly one service in service_stack");
      }
      break;
    case "add_service":
      if (!uniqueServiceStack.length) {
        errors.push("add_service must leave at least one service in service_stack");
      }
      break;
    default:
      break;
  }

  return uniqueStrings(errors);
}

function assertBookingState(input: {
  state: StructuredBookingState;
  bookingRequest?: BookingRequestDraft | null;
  actionResult?: BookingActionResult | null;
  negatedServiceLabels?: Set<string> | null;
}) {
  const errors = collectBookingStateInvariantErrors(input);
  if (errors.length) {
    throw new Error(`Invalid booking state: ${errors.join("; ")}`);
  }
}

function assertedBookingState(
  state: StructuredBookingState,
  bookingRequest?: BookingRequestDraft | null,
) {
  const normalizedState: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    known_constraints: state.known_constraints.slice(),
    missing_required_info: state.missing_required_info.slice(),
    decision_answer: state.decision_answer ? { ...state.decision_answer } : null,
  };

  if (!normalizedState.needs_service_decision && normalizeString(normalizedState.decision_question_key)) {
    normalizedState.decision_question_key = null;
  }

  if (normalizedState.needs_service_decision && !normalizeString(normalizedState.decision_question_key)) {
    const inferredKey = decisionQuestionKeyForStateFamily(
      normalizedState,
      normalizeLowerString(normalizedState.service_family || "") || null,
    );
    if (inferredKey && !normalizeString(normalizedState.service_candidate)) {
      normalizedState.decision_question_key = inferredKey;
    } else {
      normalizedState.needs_service_decision = false;
      normalizedState.decision_question_key = null;
    }
  }

  assertBookingState({ state: normalizedState, bookingRequest });
  return normalizedState;
}

function normalizeBookingActionState(input: {
  previousState: StructuredBookingState;
  state: StructuredBookingState;
  latestInboundText: string;
}) {
  const finalized = finalizeAppointmentState(
    normalizeServiceModifiersForGuidedBooking(
      normalizeColorAddOnComposition(
        input.state,
        normalizeString(input.latestInboundText),
      ),
    ),
  );
  return applyPostNormalizationSemanticGuardrails(
    input.previousState,
    finalized,
    input.latestInboundText,
  );
}

async function tryHandleBookingAction(input: {
  conversation: SmsConversationRecord;
  inbound: InboundSmsMessage;
  recentMessages: SmsMessageRecord[];
}) {
  const lastOutbound = [...input.recentMessages].reverse().find((message) => message.direction === "outbound");
  if (!lastOutbound) return null;

  const metadata = safeObject(input.conversation.metadata);
  const currentState = mergeAppointmentState(
    createEmptyState(input.inbound.fromPhone),
    safeObject(input.conversation.state) as unknown as Partial<StructuredBookingState>,
  );
  const metadataOfferedSlots = safeArray<JsonRecord>(metadata.offered_slots).map((slot) => ({
    id: normalizeString(slot.id),
    label: normalizeString(slot.label),
    start_at: normalizeString(slot.start_at),
    date: normalizeString(slot.date),
  })).filter((slot) => slot.id && slot.label);
  const metadataBookingRequest = safeObject(metadata.booking_request) as unknown as Partial<BookingRequestDraft>;
  const bookingRequest = {
    ...buildBookingRequestDraft(currentState),
    ...metadataBookingRequest,
    resolved_services: Array.isArray(metadataBookingRequest?.resolved_services) ? metadataBookingRequest.resolved_services : [],
    service_preferences: Array.isArray(metadataBookingRequest?.service_preferences) ? metadataBookingRequest.service_preferences : [],
    unresolved_service_labels: Array.isArray(metadataBookingRequest?.unresolved_service_labels) ? metadataBookingRequest.unresolved_service_labels : [],
  } as BookingRequestDraft;
  const lastOutboundWasNoAvailability = isNoAvailabilityReply(lastOutbound.body);
  const inferredDecisionAnswer = currentState.needs_service_decision && normalizeString(currentState.decision_question_key)
    ? inferDecisionAnswerFromMessage(input.inbound.body, currentState)
    : null;
  const rawActionResult = await classifyBookingAction({
    latestMessage: input.inbound.body,
    previousOutboundMessage: normalizeString(lastOutbound.body),
    currentState,
    bookingRequest,
    lastOutboundWasNoAvailability,
  });
  if (rawActionResult.confidence < 0.75) return null;

  const stackMatchedServices = resolveServiceMentionsAgainstCurrentStack(input.inbound.body, currentState);
  const negatedServiceLabels = resolveNegatedServiceLabelsAgainstCurrentStack(input.inbound.body, currentState);
  const positiveDetectedServices = detectServices(input.inbound.body).filter((service) => {
    const canonical = canonicalizeRequestedServiceLabel(normalizeString(service.label));
    if (negatedServiceLabels.has(normalizeLowerString(canonical))) return false;
    if (hasRemovalCue(input.inbound.body) && shouldStripGenericPositiveServiceFromRemovalTurn(service, negatedServiceLabels)) {
      return false;
    }
    return true;
  });
  const removeServices = safeArray<string>(rawActionResult.entities.remove_services).map((item) =>
    canonicalizeRequestedServiceLabel(normalizeString(item))
  ).filter(Boolean);

  const actionResult: BookingActionResult = {
    ...(inferredDecisionAnswer
      ? {
        action: "answer_service_decision" as BookingAction,
        confidence: 1,
        entities: {
          service: null,
          remove_services: [],
          staff: null,
          timing: null,
          exclude_staff: [],
          selection: null,
        },
      }
      : rawActionResult),
    entities: {
      ...(inferredDecisionAnswer
        ? {
          service: null,
          remove_services: [],
          staff: null,
          timing: null,
          exclude_staff: [],
          selection: null,
        }
        : rawActionResult.entities),
      remove_services: inferredDecisionAnswer ? [] : removeServices,
    },
  };

  if (
    !inferredDecisionAnswer &&
    positiveDetectedServices.length > 0 &&
    negatedServiceLabels.size > 0
  ) {
    actionResult.action = "change_service";
  }

  if (
    actionResult.action === "view_appointments" ||
    actionResult.action === "cancel_appointment" ||
    actionResult.action === "reschedule_appointment"
  ) {
    return await tryHandleAppointmentLookup({
      conversation: input.conversation,
      inbound: input.inbound,
    });
  }

  if (actionResult.action === "select_appointment") {
    return await tryHandleAppointmentSelection({
      conversation: input.conversation,
      inbound: input.inbound,
    });
  }

  const hasResolvedService = !!normalizeString(currentState.service_candidate) || bookingRequest.resolved_services.length > 0;
  const askAvailabilityReply = "I can check that — is there a day or general window you prefer, like mornings, afternoons, evenings, or soonest available?";
  const askAlternateSlotsReply = "I can keep looking — what other day or general window should I check for you?";
  const buildActionInterpretation = (input: {
    state: StructuredBookingState;
    bookingRequest: BookingRequestDraft;
    reply: string;
    nextAction: NextAction;
    offeredSlots?: AvailabilitySlotSuggestion[];
    internalNotes: string;
  }) => ({
    updatedState: {
      ...input.state,
      client_facing_reply: input.reply,
    },
    clientFacingReply: input.reply,
    internalNotes: input.internalNotes,
    nextAction: input.nextAction,
    bookingRequest: input.bookingRequest,
    offeredSlots: input.offeredSlots || [],
  } satisfies InterpreterOutput);
  const rebuildBookingRequestForState = async (state: StructuredBookingState) => {
    const draft = buildBookingRequestDraft(state);
    const resolvedStack = await resolveBoulevardServiceStack(state).catch((error) => {
      console.error("Booking action service resolution failed", error);
      return {
        resolved: [] as ResolvedBoulevardService[],
        unresolved: uniqueStrings(state.service_stack.slice()),
      };
    });
    draft.resolved_services = resolvedStack.resolved;
    draft.unresolved_service_labels = resolvedStack.unresolved;
    draft.service_preferences = buildBookingServicePreferences(draft);
    assertBookingState({ state, bookingRequest: draft });
    return draft;
  };
  const detectedLatestServices = inferredDecisionAnswer
    ? []
    : actionResult.action === "remove_service"
    ? (
      removeServices.length
        ? removeServices.map((label) => buildRequestedServiceFromLabel(label, currentState.requested_services))
          .filter((service): service is RequestedService => !!service)
        : normalizeString(actionResult.entities.service)
        ? [buildRequestedServiceFromLabel(normalizeString(actionResult.entities.service), currentState.requested_services)]
          .filter((service): service is RequestedService => !!service)
        : stackMatchedServices.filter((service) =>
          negatedServiceLabels.has(
            normalizeLowerString(canonicalizeRequestedServiceLabel(normalizeString(service.label))),
          )
        )
          .filter((service): service is RequestedService => !!service)
    )
    : (
      positiveDetectedServices.length
        ? positiveDetectedServices.map((service) => ({
          ...service,
          label: canonicalizeRequestedServiceLabel(normalizeString(service.label)),
        })).filter((service) => normalizeString(service.label))
        : stackMatchedServices
    );
  const latestExplicitStylist = extractStylistMention(input.inbound.body);
  const parsedLatestTiming = detectTimingPreference(input.inbound.body);

  if (actionResult.action === "confirm_slot") {
    const selectedIndex = parseOfferedSlotSelection(input.inbound.body, metadataOfferedSlots);
    if (selectedIndex < 0) return null;
    const selectionResult = await tryHandleOfferedSlotSelection({
      conversation: input.conversation,
      inbound: input.inbound,
    });
    return selectionResult;
  }

  if (actionResult.action === "ask_availability") {
    if (!hasResolvedService) return null;
    if (!hasUsableTimingPreference(currentState.timing_preference)) {
      const nextState: StructuredBookingState = {
        ...currentState,
        timing_preference: createEmptyTimingPreference(),
        missing_required_info: normalizeMissingInfoSet([...currentState.missing_required_info, "timing"]),
        ready_to_search_availability: false,
        ready_to_book: false,
      };
      const nextBookingRequest: BookingRequestDraft = {
        ...bookingRequest,
        timing_preference: createEmptyTimingPreference(),
        ready_to_search_availability: false,
        ready_to_book: false,
      };
      await updateConversationInterpretation(input.conversation.id, buildActionInterpretation({
        state: nextState,
        bookingRequest: nextBookingRequest,
        reply: askAvailabilityReply,
        nextAction: "ask_clarifying_question",
        offeredSlots: [],
        internalNotes: "Booking action classifier routed an availability meta-question into a day/window clarification.",
      }));
      return {
        ok: true,
        reply: askAvailabilityReply,
        next_action: "ask_clarifying_question" as NextAction,
        offered_slots: [],
      };
    }
  }
  const reducedState = inferredDecisionAnswer
    ? normalizeDecisionStateConsistency(applyDecisionAnswer({
      ...currentState,
      decision_answer: inferredDecisionAnswer,
      needs_service_decision: true,
      decision_question_key: currentState.decision_question_key,
    }))
    : bookingReducer(currentState, actionResult, {
      detectedLatestServices,
      negatedServiceLabels,
      latestExplicitStylist,
      parsedLatestTiming,
      lastOutboundWasNoAvailability,
    });
  if (!reducedState) return null;

  let invariantState: StructuredBookingState;
  try {
    invariantState = applyBookingActionInvariants({
      state: reducedState,
      actionResult,
      negatedServiceLabels,
    });
    assertBookingState({
      state: invariantState,
      actionResult,
      negatedServiceLabels,
    });
  } catch (error) {
    console.error("Booking reducer invariant failure", error);
    return null;
  }

  let nextState = normalizeBookingActionState({
    previousState: currentState,
    state: invariantState,
    latestInboundText: input.inbound.body,
  });
  nextState = applyPureTimingPivotProtection(currentState, nextState, input.inbound.body);
  nextState = applyExplicitGrayCoverageConfirmation(nextState, input.inbound.body);
  nextState = normalizeDecisionStateConsistency(nextState);

  if (
    !nextState.requested_services.length &&
    !nextState.service_stack.length &&
    positiveDetectedServices.length > 0 &&
    negatedServiceLabels.size > 0
  ) {
    const rescuedServices = mergeRequestedServices(
      [],
      positiveDetectedServices.map((service) => ({
        ...service,
        label: canonicalizeRequestedServiceLabel(normalizeString(service.label)),
      })).filter((service) => normalizeString(service.label)),
    );
    if (rescuedServices.length) {
      nextState = finalizeAppointmentState({
        ...nextState,
        requested_services: rescuedServices,
        service_stack: normalizeServiceStack(
          rescuedServices.map((service) => canonicalizeRequestedServiceLabel(normalizeString(service.label))),
          rescuedServices,
        ),
        service_modifiers: [],
      });
    }
  }

  let nextBookingRequest = await rebuildBookingRequestForState(nextState);
  nextState = syncStrictAvailabilityReadiness(nextState, nextBookingRequest);
  nextState = normalizeDecisionStateConsistency(nextState);
  nextBookingRequest.ready_to_search_availability = nextState.ready_to_search_availability;
  nextBookingRequest.ready_to_book = nextState.ready_to_book;
  try {
    assertBookingState({
      state: nextState,
      bookingRequest: nextBookingRequest,
      actionResult,
      negatedServiceLabels,
    });
  } catch (error) {
    console.error("Booking action final state invariant failure", error);
    return null;
  }

  if (actionResult.action === "ask_availability" && !normalizeString(nextState.stylist_preference)) {
    await updateConversationInterpretation(input.conversation.id, buildActionInterpretation({
      state: {
        ...nextState,
        ready_to_search_availability: false,
      },
      bookingRequest: {
        ...nextBookingRequest,
        ready_to_search_availability: false,
      },
      reply: askAvailabilityReply,
      nextAction: "ask_clarifying_question",
      offeredSlots: [],
      internalNotes: "Booking action classifier routed a general availability question, but stylist preference still needs clarification.",
    }));
    return {
      ok: true,
      reply: askAvailabilityReply,
      next_action: "ask_clarifying_question" as NextAction,
      offered_slots: [],
    };
  }

  if (!nextState.requested_services.length && !nextState.service_stack.length) {
    const reply = "What service would you like to book instead?";
    await updateConversationInterpretation(input.conversation.id, buildActionInterpretation({
      state: {
        ...nextState,
        ready_to_search_availability: false,
        ready_to_book: false,
      },
      bookingRequest: {
        ...nextBookingRequest,
        ready_to_search_availability: false,
        ready_to_book: false,
      },
      reply,
      nextAction: "ask_clarifying_question",
      offeredSlots: [],
      internalNotes: `Booking action classifier chose ${actionResult.action}, which cleared the current service stack and now needs a replacement service.`,
    }));
    return {
      ok: true,
      reply,
      next_action: "ask_clarifying_question" as NextAction,
      offered_slots: [],
    };
  }

  if (actionResult.action === "reject_slots") {
    await updateConversationInterpretation(input.conversation.id, buildActionInterpretation({
      state: {
        ...nextState,
        ready_to_search_availability: false,
        ready_to_book: false,
      },
      bookingRequest: {
        ...nextBookingRequest,
        ready_to_search_availability: false,
        ready_to_book: false,
      },
      reply: askAlternateSlotsReply,
      nextAction: "ask_clarifying_question",
      offeredSlots: [],
      internalNotes: "Booking action reducer cleared the prior timing window after the client rejected the offered slots and asked for another option.",
    }));
    return {
      ok: true,
      reply: askAlternateSlotsReply,
      next_action: "ask_clarifying_question" as NextAction,
      offered_slots: [],
    };
  }

  if (!canSearchAvailability(nextState, nextBookingRequest)) {
    const reply = deriveReplyForState(
      nextState,
      nextBookingRequest,
      askAvailabilityReply,
      "ask_clarifying_question",
      undefined,
      normalizeString(input.inbound.body),
    );
    const nextAction = deriveNextActionForState(
      nextState,
      nextBookingRequest,
      reply,
      "ask_clarifying_question",
      undefined,
      normalizeString(input.inbound.body),
    );
    await updateConversationInterpretation(input.conversation.id, buildActionInterpretation({
      state: {
        ...nextState,
        ready_to_search_availability: false,
      },
      bookingRequest: {
        ...nextBookingRequest,
        ready_to_search_availability: false,
      },
      reply,
      nextAction,
      offeredSlots: [],
      internalNotes: `Booking action classifier chose ${actionResult.action}, but search still needs more information.`,
    }));
    return {
      ok: true,
      reply,
      next_action: nextAction,
      offered_slots: [],
    };
  }

  const offeredSlots = await searchAvailabilityForBookingRequest(nextBookingRequest).catch((error) => {
    console.error("Booking action follow-up search failed", error);
    return [] as AvailabilitySlotSuggestion[];
  });
  const reply = offeredSlots.length
    ? buildAvailabilityReply(offeredSlots, summarizeRequestedServices(nextState.requested_services))
    : buildNoAvailabilityReply(nextState);
  const nextAction: NextAction = offeredSlots.length ? "search_availability" : "ask_clarifying_question";
  await updateConversationInterpretation(input.conversation.id, buildActionInterpretation({
    state: {
      ...nextState,
      ready_to_search_availability: true,
    },
    bookingRequest: {
      ...nextBookingRequest,
      ready_to_search_availability: true,
    },
    reply,
    nextAction,
    offeredSlots,
    internalNotes: offeredSlots.length
      ? `Booking action classifier chose ${actionResult.action}; reran search and found slots.`
      : `Booking action classifier chose ${actionResult.action}; reran search and found no matching slots.`,
  }));
  return {
    ok: true,
    reply,
    next_action: nextAction,
    offered_slots: offeredSlots,
  };
}

function parseOfferedSlotSelection(message: string, offeredSlots: AvailabilitySlotSuggestion[]) {
  if (!offeredSlots.length) return -1;
  const lower = normalizeLowerString(message);
  if (!lower) return -1;
  const match = lower.match(/\b(?:option\s*)?([1-5])\b/);
  const ordinalMatch = lower.match(/\b(first|second|third|fourth|fifth)\b/);
  const index = match
    ? Number(match[1]) - 1
    : ordinalMatch
      ? ["first", "second", "third", "fourth", "fifth"].indexOf(ordinalMatch[1])
      : -1;
  if (!Number.isFinite(index) || index < 0 || index >= offeredSlots.length) return -1;
  return index;
}

function buildNumericClarificationReply(conversation: SmsConversationRecord) {
  const state = mergeAppointmentState(
    createEmptyState(normalizeString(conversation.customer_phone)),
    safeObject(conversation.state) as unknown as Partial<StructuredBookingState>,
  );
  if (state.missing_required_info.includes("stylist_preference")) {
    return "Send the stylist name you want, or say no preference if anyone on the team is fine.";
  }
  if (state.missing_required_info.includes("timing")) {
    return "Send the day or time you want in words, like Tuesday after 2 or any July morning.";
  }
  if (state.missing_required_info.includes("service") || state.missing_required_info.includes("service_details")) {
    return "Send the service you want in words so I can narrow it down for you.";
  }
  return "Send that in words for me, like a stylist name, a day/time, or no preference.";
}

function buildPaymentSessionUrl(token: string) {
  const base = normalizeString(SMS_FINISH_BOOKING_URL);
  if (!base) return "";
  const url = new URL(base);
  url.searchParams.set("b", token);
  return url.toString();
}

function buildServiceStackSummary(bookingRequest: BookingRequestDraft) {
  const serviceSpecificPreferences = servicePreferenceByRequestedLabel(bookingRequest);
  return bookingRequest.resolved_services.map((service) => ({
    name: service.service_name,
    service_id: service.service_id,
    stylist_name:
      normalizeString(
        serviceSpecificPreferences.get(
          canonicalizeRequestedServiceLabel(normalizeString(service.requested_label)),
        )?.staff_preference,
      ) ||
      "No preference",
  }));
}

async function createPaymentSessionFromSelection(input: {
  conversation: SmsConversationRecord;
  bookingRequest: BookingRequestDraft;
  selectedSlot: AvailabilitySlotSuggestion;
}) {
  const token = randomToken(28);
  const state = safeObject(input.conversation.state) as unknown as StructuredBookingState;
  const customerName = normalizeString(input.conversation.customer_name || state.client_name);
  const split = splitName(customerName);
  const { requestedServices: requestedServicesPayload } =
    await buildAvailabilityRequestedServicesWithStaff(input.bookingRequest);
  const primaryServicePreference = input.bookingRequest.service_preferences[0];
  const insert = await supabase
    .from("sms_booking_payment_sessions")
    .insert({
      token,
      conversation_id: normalizeString(input.conversation.id) || null,
      customer_phone: normalizeString(input.conversation.customer_phone) || null,
      business_phone: normalizeString(input.conversation.business_phone) || null,
      service_id: normalizeString(input.bookingRequest.resolved_services[0]?.service_id) || null,
      service_name: normalizeString(input.bookingRequest.resolved_services[0]?.service_name) || null,
      staff_id: normalizeString(requestedServicesPayload[0]?.staff_id) || null,
      staff_name: normalizeString(primaryServicePreference?.staff_preference) || null,
      slot_id: normalizeString(input.selectedSlot.id) || null,
      slot_label: normalizeString(input.selectedSlot.label) || null,
      slot_start_at: normalizeString(input.selectedSlot.start_at) || null,
      requested_date: normalizeString(input.selectedSlot.date) || null,
      requested_time_text: normalizeString(input.bookingRequest.timing_preference.raw_text) || null,
      customer_name: customerName || null,
      first_name: split.first || null,
      last_name: split.last || null,
      email: null,
      phone: normalizeString(input.conversation.customer_phone) || null,
      status: "pending",
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 6).toISOString(),
      metadata: {
        booking_request: input.bookingRequest,
        service_stack: buildServiceStackSummary(input.bookingRequest),
        requested_services_payload: requestedServicesPayload,
        selected_slot: input.selectedSlot,
      },
      booking_result: null,
    })
    .select("*")
    .single();

  if (insert.error) throw insert.error;
  return insert.data as PaymentSessionRecord;
}

function buildFallbackHeuristicStatePatch(message: string, phone: string) {
  const services = detectServices(message);
  const heuristicBase = {
    intent: detectIntent(message),
    phone,
    requested_services: services,
    service_stack: services.map((service) => canonicalizeRequestedServiceLabel(service.label)),
    service_modifiers: detectModifiers(message),
    stylist_preference: detectStylistPreference(message),
    timing_preference: detectTimingPreference(message),
    known_constraints: detectKnownConstraints(message),
  };
  const tierState = inferServiceConfidenceTier(mergeAppointmentState(createEmptyState(phone), heuristicBase));
  return {
    ...heuristicBase,
    ...tierState,
  };
}

function buildAiHeuristicStatePatch(message: string, phone: string) {
  return {
    intent: "unclear" as SmsIntent,
    phone,
    requested_services: [] as RequestedService[],
    service_stack: [] as string[],
    service_modifiers: [] as string[],
    stylist_preference: detectStylistPreference(message),
    timing_preference: detectTimingPreference(message),
    known_constraints: [] as string[],
    service_family: null,
    service_family_confidence: null,
    service_candidate: null,
    service_candidate_confidence: null,
    needs_service_decision: false,
    decision_question_key: null,
  };
}

function finalizeAiPrimaryState(
  previousState: StructuredBookingState,
  heuristicState: Partial<StructuredBookingState>,
  aiState: Partial<StructuredBookingState>,
  contextText = "",
  latestInboundText = "",
) {
  const mergedState = applyServiceChangeModeToState({
    previousState,
    mergedState: mergeAppointmentState(
      mergeAppointmentState(previousState, heuristicState),
      aiState,
    ),
    heuristicState,
    aiState,
    latestInboundText,
  });
  const protectedState = applyPureTimingPivotProtection(previousState, mergedState, latestInboundText);
  const clarifiedState = applyExplicitGrayCoverageConfirmation(protectedState, latestInboundText);
  const finalized = finalizeAppointmentState(
    normalizeServiceModifiersForGuidedBooking(
      syncDimensionalPlacementFromStack(
        enforceAiServiceDecisionGuardrails(
          clarifiedState,
          contextText,
        ),
      ),
    ),
  );
  return applyPostNormalizationSemanticGuardrails(previousState, finalized, latestInboundText);
}

function applyPureTimingPivotProtection(
  previousState: StructuredBookingState,
  candidateState: StructuredBookingState,
  latestInboundText: string,
) {
  if (!isPureTimingPivotMessage(latestInboundText)) {
    return candidateState;
  }

  const next: StructuredBookingState = {
    ...candidateState,
    intent:
      candidateState.intent === "unclear" && previousState.intent !== "unclear"
        ? previousState.intent
        : candidateState.intent,
    requested_services: previousState.requested_services.map((item) => ({ ...item })),
    service_stack: previousState.service_stack.slice(),
    service_family: previousState.service_family,
    service_family_confidence: previousState.service_family_confidence,
    service_candidate: previousState.service_candidate,
    service_candidate_confidence: previousState.service_candidate_confidence,
    needs_service_decision: previousState.needs_service_decision,
    decision_question_key: previousState.decision_question_key,
    decision_answer: previousState.decision_answer ? { ...previousState.decision_answer } : null,
    service_modifiers: previousState.service_modifiers.slice(),
    known_constraints: previousState.known_constraints.slice(),
  };

  if (hasUsableTimingPreference(next.timing_preference)) {
    next.missing_required_info = next.missing_required_info.filter((item) => normalizeLowerString(item) !== "timing");
  }

  return normalizeDecisionStateConsistency(assertedBookingState(next));
}

function applyExplicitGrayCoverageConfirmation(
  state: StructuredBookingState,
  latestInboundText: string,
) {
  const shouldConfirmRootsOnly =
    hasExplicitRootsOnlyIntent(latestInboundText) &&
    (
      state.decision_question_key === "gray_coverage_scope" ||
      state.known_constraints.some((item) => normalizeLowerString(item) === "touch_up_ambiguity") ||
      normalizeLowerString(state.service_family) === "gray_coverage" ||
      state.service_stack.some((item) => normalizeLowerString(item) === "root touch-up")
    );

  if (!shouldConfirmRootsOnly) {
    return state;
  }

  return normalizeDecisionStateConsistency(applyDecisionAnswer({
    ...state,
    decision_question_key: "gray_coverage_scope",
    needs_service_decision: true,
    decision_answer: {
      question_key: "gray_coverage_scope",
      answer_key: "roots_or_gray",
    },
  }));
}

function isTimingPivotReplacement(next: Partial<TimingPreference> | null | undefined) {
  const raw = normalizeLowerString(next?.raw_text).replace(/[?!.]+$/g, "");
  if (!raw) return false;
  return (
    /\banother day\b/.test(raw) ||
    /\bdifferent day\b/.test(raw) ||
    /\bsomething else\b/.test(raw) ||
    /\bother day\b/.test(raw) ||
    /\bwhat about\b/.test(raw) ||
    /\bhow about\b/.test(raw) ||
    /\banything later on\b/.test(raw) ||
    /\banything earlier on\b/.test(raw)
  );
}

function isBroadTimingResetRequest(next: Partial<TimingPreference> | null | undefined) {
  const raw = normalizeLowerString(next?.raw_text).replace(/[?!.]+$/g, "");
  if (!raw) return false;
  return (
    /\banytime works\b/.test(raw) ||
    /\bany time works\b/.test(raw) ||
    /\bopen availability\b/.test(raw) ||
    /\bno preference\b/.test(raw) ||
    /\bwhenever\b/.test(raw) ||
    /\bwhenever works\b/.test(raw) ||
    /\bwhatever works\b/.test(raw) ||
    /\bi'?m open anytime\b/.test(raw) ||
    /\bany day works\b/.test(raw)
  );
}

function mergeTimingPreference(previous: TimingPreference, next: Partial<TimingPreference> | null | undefined): TimingPreference {
  const normalizedUrgency = normalizeTimingUrgencyValue(normalizeString(next?.urgency));
  const replaceTiming = isTimingPivotReplacement(next);
  const broadReset = isBroadTimingResetRequest(next);
  const nextDayPreferences = Array.isArray(next?.day_preferences) ? next.day_preferences.map((value) => normalizeString(value)) : [];
  const nextTimePreferences = Array.isArray(next?.time_preferences) ? next.time_preferences.map((value) => normalizeString(value)) : [];
  const nextRawText = normalizeString(next?.raw_text);
  const hasIncomingDay = nextDayPreferences.length > 0;
  const hasIncomingTime = nextTimePreferences.length > 0;
  const hasIncomingDateRange = !!normalizeString(next?.date_range);
  const hasIncomingUrgency = !!normalizedUrgency;
  const isDayOnlyUpdate = hasIncomingDay && !hasIncomingTime && !hasIncomingDateRange && !hasIncomingUrgency;
  const isTimeOnlyUpdate = hasIncomingTime && !hasIncomingDay && !hasIncomingDateRange && !hasIncomingUrgency;
  const isCombinedDayTimeUpdate = hasIncomingDay && hasIncomingTime;
  const shouldReplaceAllTiming = broadReset;
  const mergedDateRange = shouldReplaceAllTiming
    ? normalizeString(next?.date_range) || null
    : hasIncomingDateRange
    ? normalizeString(next?.date_range)
    : isDayOnlyUpdate || isTimeOnlyUpdate || isCombinedDayTimeUpdate
    ? previous.date_range
    : normalizeString(next?.date_range) || previous.date_range;
  const mergedUrgency = shouldReplaceAllTiming
    ? (normalizedUrgency || null)
    : normalizedUrgency || previous.urgency;

  let mergedDayPreferences: string[] = [];
  let mergedTimePreferences: string[] = [];

  if (shouldReplaceAllTiming) {
    mergedDayPreferences = uniqueStrings(nextDayPreferences);
    mergedTimePreferences = uniqueStrings(nextTimePreferences);
  } else if (isCombinedDayTimeUpdate) {
    mergedDayPreferences = uniqueStrings(nextDayPreferences);
    mergedTimePreferences = uniqueStrings(nextTimePreferences);
  } else if (isDayOnlyUpdate) {
    mergedDayPreferences = uniqueStrings(nextDayPreferences);
    mergedTimePreferences = uniqueStrings(previous.time_preferences);
  } else if (isTimeOnlyUpdate) {
    mergedDayPreferences = uniqueStrings(previous.day_preferences);
    mergedTimePreferences = uniqueStrings(nextTimePreferences);
  } else if (replaceTiming) {
    mergedDayPreferences = uniqueStrings(nextDayPreferences.length ? nextDayPreferences : previous.day_preferences);
    mergedTimePreferences = uniqueStrings(nextTimePreferences.length ? nextTimePreferences : previous.time_preferences);
  } else {
    mergedDayPreferences = uniqueStrings([
      ...previous.day_preferences,
      ...nextDayPreferences,
    ]);
    mergedTimePreferences = uniqueStrings([
      ...previous.time_preferences,
      ...nextTimePreferences,
    ]);
  }

  return {
    raw_text: nextRawText || previous.raw_text,
    date_range: mergedDateRange,
    day_preferences: mergedDayPreferences,
    time_preferences: mergedTimePreferences,
    urgency: mergedUrgency,
  };
}

function mergeRequestedServices(previous: RequestedService[], next: RequestedService[]) {
  const merged = [...previous];
  for (const service of next) {
    const label = canonicalizeRequestedServiceLabel(normalizeString(service.label));
    if (!label) continue;
    const existingIndex = merged.findIndex((item) => normalizeLowerString(item.label) === label.toLowerCase());
    if (existingIndex >= 0) {
      merged[existingIndex] = { ...merged[existingIndex], ...service, label };
    } else {
      merged.push({
        label,
        family: normalizeString(service.family) || null,
        confidence: typeof service.confidence === "number" ? service.confidence : null,
        notes: normalizeString(service.notes) || null,
      });
    }
  }
  const labels = merged.map((item) => normalizeLowerString(item.label));
  const hasDimensionalColor = labels.includes("dimensional color");
  const hasSpecificDimensionalPlacement = labels.some((label) =>
    ["face frame", "partial highlight", "full highlight"].includes(label)
  );
  const hasSpecificColor = labels.some((label) =>
    [
      "dimensional color",
      "face frame",
      "partial highlight",
      "full highlight",
      "root touch-up",
      "single process",
      "gloss",
      "glaze",
      "toner",
      "lowlights",
      "color correction",
    ].includes(label)
  );
  const hasSpecificHaircut = labels.includes("haircut");
  const hasSpecificBlowout = labels.includes("blowout");
  const hasExtensionsMaintenance = labels.includes("extensions maintenance");
  const hasRootTouchUp = labels.includes("root touch-up");
  const hasExplicitSingleProcess =
    merged.some((item) =>
      normalizeLowerString(item.label) === "single process" &&
      normalizeLowerString(item.notes || "").includes("all_over_refresh")
    );

  return merged.filter((item) => {
    const label = normalizeLowerString(item.label);
    if (label === "color" && hasSpecificColor) return false;
    if (label === "dimensional color" && hasSpecificDimensionalPlacement) return false;
    if (label === "haircut" && hasSpecificHaircut && item.notes === null) return true;
    if (label === "blowout" && hasSpecificBlowout && item.notes === null) return true;
    if (label === "extensions" && hasExtensionsMaintenance) return false;
    if (label === "single process" && hasRootTouchUp && !hasExplicitSingleProcess) return false;
    return true;
  });
}

function collectCurrentTurnRequestedServices(
  heuristicState: Partial<StructuredBookingState>,
  aiState: Partial<StructuredBookingState>,
  latestInboundText: string,
) {
  const requested = mergeRequestedServices(
    [],
    [
      ...(Array.isArray(heuristicState.requested_services) ? heuristicState.requested_services : []),
      ...(Array.isArray(aiState.requested_services) ? aiState.requested_services : []),
    ],
  );
  const seen = new Set(requested.map((item) => normalizeLowerString(item.label)));
  const stackLabels = uniqueStrings([
    ...(Array.isArray(heuristicState.service_stack) ? heuristicState.service_stack : []),
    ...(Array.isArray(aiState.service_stack) ? aiState.service_stack : []),
    normalizeString(aiState.service_candidate),
    normalizeString(heuristicState.service_candidate),
  ].map((value) => canonicalizeRequestedServiceLabel(normalizeString(value))).filter(Boolean));

  for (const label of stackLabels) {
    if (seen.has(normalizeLowerString(label))) continue;
    requested.push({
      label,
      family: null,
      confidence: null,
      notes: null,
    });
    seen.add(normalizeLowerString(label));
  }

  if (!requested.length) {
    for (const service of detectServices(latestInboundText)) {
      const label = canonicalizeRequestedServiceLabel(normalizeString(service.label));
      if (!label || seen.has(normalizeLowerString(label))) continue;
      requested.push({
        ...service,
        label,
      });
      seen.add(normalizeLowerString(label));
    }
  }

  return requested;
}

function applyServiceChangeModeToState(input: {
  previousState: StructuredBookingState;
  mergedState: StructuredBookingState;
  heuristicState: Partial<StructuredBookingState>;
  aiState: Partial<StructuredBookingState>;
  latestInboundText: string;
}) {
  const mode = detectServiceChangeMode(input.latestInboundText);
  if (mode !== "replace" || input.previousState.service_stack.length === 0) {
    return input.mergedState;
  }

  const explicitlyDetectedServices = detectServices(input.latestInboundText).map((service) => ({
    ...service,
    label: canonicalizeRequestedServiceLabel(normalizeString(service.label)),
  })).filter((service) => normalizeString(service.label));

  const currentTurnServices = explicitlyDetectedServices.length
    ? mergeRequestedServices([], explicitlyDetectedServices)
    : collectCurrentTurnRequestedServices(
      input.heuristicState,
      input.aiState,
      input.latestInboundText,
    );

  if (!currentTurnServices.length) {
    return input.mergedState;
  }

  const serviceStack = normalizeServiceStack(
    currentTurnServices.map((item) => canonicalizeRequestedServiceLabel(normalizeString(item.label))),
    currentTurnServices,
  );

  return {
    ...input.mergedState,
    requested_services: currentTurnServices,
    service_stack: serviceStack,
    service_modifiers: Array.isArray(input.aiState.service_modifiers)
      ? uniqueStrings(input.aiState.service_modifiers.map((value) => normalizeString(value)))
      : [],
    service_family: null,
    service_family_confidence: null,
    service_candidate: null,
    service_candidate_confidence: null,
    needs_service_decision: false,
    decision_question_key: null,
    decision_answer: null,
  };
}

function mergeAppointmentState(previous: StructuredBookingState, next: Partial<StructuredBookingState>): StructuredBookingState {
  const hasOwn = (key: keyof StructuredBookingState) =>
    Object.prototype.hasOwnProperty.call(next, key);
  const requestedServices = mergeRequestedServices(
    previous.requested_services,
    Array.isArray(next.requested_services) ? next.requested_services : [],
  );
  const serviceStack = normalizeServiceStack([
    ...previous.service_stack,
    ...(Array.isArray(next.service_stack)
      ? next.service_stack.map((value) => canonicalizeRequestedServiceLabel(normalizeString(value)))
      : []),
  ], requestedServices);
  const mergedStylistPreference = sanitizeStylistPreference(
    normalizeStylistPreference(next.stylist_preference || "") || previous.stylist_preference,
    requestedServices,
  );

  return {
    ...previous,
    intent: (normalizeString(next.intent) as SmsIntent) || previous.intent,
    client_name: normalizeString(next.client_name) || previous.client_name,
    phone: normalizeString(next.phone) || previous.phone,
    is_existing_client: typeof next.is_existing_client === "boolean" ? next.is_existing_client : previous.is_existing_client,
    requested_services: requestedServices,
    service_stack: serviceStack,
    service_family: hasOwn("service_family")
      ? normalizeString(next.service_family) || null
      : previous.service_family,
    service_family_confidence: hasOwn("service_family_confidence")
      ? normalizeOptionalConfidence(next.service_family_confidence) ?? null
      : previous.service_family_confidence,
    service_candidate: hasOwn("service_candidate")
      ? normalizeString(next.service_candidate) || null
      : previous.service_candidate,
    service_candidate_confidence: hasOwn("service_candidate_confidence")
      ? normalizeOptionalConfidence(next.service_candidate_confidence) ?? null
      : previous.service_candidate_confidence,
    needs_service_decision: hasOwn("needs_service_decision")
      ? typeof next.needs_service_decision === "boolean"
        ? next.needs_service_decision
        : previous.needs_service_decision
      : previous.needs_service_decision,
    decision_question_key: hasOwn("decision_question_key")
      ? ((normalizeString(next.decision_question_key) as ServiceDecisionQuestionKey) || null)
      : previous.decision_question_key,
    decision_answer: hasOwn("decision_answer")
      ? normalizeDecisionAnswer(next.decision_answer)
      : previous.decision_answer,
    service_modifiers: uniqueStrings([
      ...previous.service_modifiers,
      ...(Array.isArray(next.service_modifiers) ? next.service_modifiers.map((value) => normalizeString(value)) : []),
    ]),
    stylist_preference: mergedStylistPreference,
    timing_preference: mergeTimingPreference(previous.timing_preference, next.timing_preference),
    known_constraints: uniqueStrings([
      ...previous.known_constraints,
      ...(Array.isArray(next.known_constraints) ? next.known_constraints.map((value) => normalizeString(value)) : []),
    ]),
    missing_required_info: normalizeMissingInfoSet(
      Array.isArray(next.missing_required_info)
        ? next.missing_required_info.map((value) => normalizeMissingInfoLabel(normalizeString(value)))
        : previous.missing_required_info.map((value) => normalizeMissingInfoLabel(normalizeString(value))),
    ),
    ready_to_search_availability: typeof next.ready_to_search_availability === "boolean" ? next.ready_to_search_availability : previous.ready_to_search_availability,
    ready_to_book: typeof next.ready_to_book === "boolean" ? next.ready_to_book : previous.ready_to_book,
    confidence: typeof next.confidence === "number" ? next.confidence : previous.confidence,
    client_facing_reply: normalizeString(next.client_facing_reply) || previous.client_facing_reply,
  };
}

function syncRequestedServicesFromServiceStack(state: StructuredBookingState) {
  if (state.requested_services.length > 0 || state.service_stack.length === 0) {
    return state;
  }

  const rebuilt = state.service_stack
    .map((label) => buildRequestedServiceFromLabel(label, state.requested_services))
    .filter((service): service is RequestedService => !!service);

  if (!rebuilt.length) {
    return state;
  }

  return {
    ...state,
    requested_services: mergeRequestedServices([], rebuilt),
  };
}

function finalizeAppointmentState(state: StructuredBookingState) {
  const normalizedState = syncRequestedServicesFromServiceStack({
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: normalizeServiceStack(
      uniqueStrings([
        ...state.service_stack,
        ...state.requested_services.map((item) => canonicalizeRequestedServiceLabel(normalizeString(item.label))),
      ]),
      state.requested_services,
    ),
    stylist_preference: sanitizeStylistPreference(state.stylist_preference, state.requested_services),
  });
  const next = cleanupResolvedAmbiguities(normalizeDecisionStateConsistency(applyDecisionAnswer(normalizedState)));
  const confidenceTier = inferServiceConfidenceTier(next);
  next.service_family = confidenceTier.service_family;
  next.service_family_confidence = confidenceTier.service_family_confidence;
  next.service_candidate = confidenceTier.service_candidate;
  next.service_candidate_confidence = confidenceTier.service_candidate_confidence;
  next.needs_service_decision = confidenceTier.needs_service_decision;
  next.decision_question_key = confidenceTier.decision_question_key;
  const missing: string[] = [];
  const constraints = new Set(next.known_constraints.map((item) => normalizeLowerString(item)));
  const hasService = next.requested_services.length > 0 || next.service_stack.length > 0;
  const hasSpecificService = hasSpecificServiceDetails(next.requested_services, next.service_stack);
  const hasTiming = hasUsableTimingPreference(next.timing_preference);
  const hasGenericServiceOnly = hasService && !hasSpecificService;
  const hasBlondeRefreshAmbiguity = constraints.has("blonde_refresh_ambiguity");

  if (next.intent === "book") {
    if (!hasService) missing.push("service");
    if (!hasTiming) missing.push("timing");
    if (hasGenericServiceOnly) missing.push("service_details");
    if (hasBlondeRefreshAmbiguity && hasService && !missing.some((item) => normalizeLowerString(item) === "service_details")) {
      missing.push("service_details");
    }
  }

  if (next.intent === "reschedule" || next.intent === "cancel") {
    next.ready_to_search_availability = false;
    next.ready_to_book = false;
    if (!next.phone) missing.push("phone");
  } else if (next.intent === "pricing_question" || next.intent === "general_question") {
    next.ready_to_search_availability = false;
    next.ready_to_book = false;
  } else {
    next.ready_to_search_availability = hasService && hasSpecificService && hasTiming;
    next.ready_to_book = false;
  }

  next.missing_required_info = normalizeMissingInfoSet(missing.length ? missing : next.missing_required_info);
  const cleanedNext = cleanupResolvedAmbiguities(next);
  next.missing_required_info = cleanedNext.missing_required_info.slice();
  next.known_constraints = cleanedNext.known_constraints.slice();
  next.needs_service_decision = cleanedNext.needs_service_decision;
  next.decision_question_key = cleanedNext.decision_question_key;
  next.decision_answer = cleanedNext.decision_answer ? { ...cleanedNext.decision_answer } : null;
  if (hasTiming) {
    next.missing_required_info = next.missing_required_info.filter((item) => normalizeLowerString(item) !== "timing");
  }
  if (next.missing_required_info.some((item) => ["timing", "date"].includes(normalizeLowerString(item)))) {
    next.ready_to_search_availability = false;
  }

  next.confidence = computeStateConfidence(next, {
    hasService,
    hasSpecificService,
    hasTiming,
  });

  return assertedBookingState(next);
}

function computeStateConfidence(
  state: StructuredBookingState,
  input: {
    hasService?: boolean;
    hasSpecificService?: boolean;
    hasTiming?: boolean;
  } = {},
) {
  const hasService = input.hasService ?? (state.requested_services.length > 0 || state.service_stack.length > 0);
  const hasSpecificService = input.hasSpecificService ?? hasSpecificServiceDetails(state.requested_services, state.service_stack);
  const hasTiming = input.hasTiming ?? hasUsableTimingPreference(state.timing_preference);
  const hasStylist = !!normalizeString(state.stylist_preference);
  const hasIntent = !!state.intent && state.intent !== "unclear";
  const modifiersCount = state.service_modifiers.length;
  const missing = new Set(state.missing_required_info.map((item) => normalizeLowerString(item)));

  let confidence = 0.05;

  if (hasIntent) confidence += 0.2;
  if (hasService) confidence += hasSpecificService ? 0.32 : 0.18;
  if (hasTiming) confidence += 0.22;
  if (hasStylist) confidence += 0.08;
  if (modifiersCount > 0) confidence += Math.min(0.08, modifiersCount * 0.03);

  if (state.service_candidate_confidence != null) {
    confidence = Math.max(confidence, 0.2 + state.service_candidate_confidence * 0.7);
  } else if (state.service_family_confidence != null) {
    confidence = Math.max(confidence, 0.15 + state.service_family_confidence * 0.55);
  }

  if (missing.has("service_details")) confidence -= 0.18;
  if (missing.has("service")) confidence -= 0.22;
  if (missing.has("timing") || missing.has("date")) confidence -= 0.2;
  if (state.needs_service_decision) confidence -= 0.12;

  if (state.intent === "pricing_question" || state.intent === "general_question") {
    confidence = Math.max(confidence, hasIntent ? 0.72 : 0.4);
  }
  if (state.intent === "cancel" || state.intent === "reschedule") {
    confidence = Math.max(confidence, hasIntent ? 0.78 : confidence);
  }

  return Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
}

function isLowMaintenanceColorFollowupMessage(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  const hasColorCue = /\bcolor\b|\bgloss\b|\btoner\b|\bglaze\b|\broot\b|\broots\b|\bgray\b|\bgrey\b|\bhighlights?\b|\bdimension\b|\bblonde\b/.test(lower);
  const hasHaircutCue = /\bhaircut\b|\btrim\b|\bcut\b|\blayers\b|\bbangs\b/.test(lower);
  return hasColorCue && !hasHaircutCue;
}

function applyPostNormalizationSemanticGuardrails(
  previousState: StructuredBookingState,
  state: StructuredBookingState,
  latestInboundText = "",
) {
  const next: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    known_constraints: state.known_constraints.slice(),
    missing_required_info: state.missing_required_info.slice(),
  };
  const latestLower = normalizeLowerString(latestInboundText);
  const hadLowMaintenanceGoal =
    previousState.known_constraints.some((item) => normalizeLowerString(item) === "low_maintenance_goal") ||
    next.known_constraints.some((item) => normalizeLowerString(item) === "low_maintenance_goal");

  if (next.decision_answer?.question_key === "dimensional_placement") {
    const mapped =
      next.decision_answer.answer_key === "face_only" ? "Face Frame"
      : next.decision_answer.answer_key === "top_and_face" ? "Partial Highlight"
      : next.decision_answer.answer_key === "whole_head" ? "Full Highlight"
      : null;
    if (mapped) {
      next.requested_services = mergeRequestedServices(
        next.requested_services.filter((item) =>
          !["dimensional color", "face frame", "partial highlight", "full highlight", "color"].includes(normalizeLowerString(item.label))
        ),
        [{
          label: mapped,
          family: "color",
          confidence: 0.95,
          notes: `Decision answer mapped from dimensional_placement:${next.decision_answer.answer_key}.`,
        }],
      );
      next.service_stack = normalizeServiceStack([mapped], next.requested_services);
      next.service_family = "dimensional_color";
      next.service_family_confidence = Math.max(next.service_family_confidence || 0, 0.95);
      next.service_candidate = mapped;
      next.service_candidate_confidence = 0.95;
      next.needs_service_decision = false;
      next.decision_question_key = null;
      next.decision_answer = null;
      next.known_constraints = next.known_constraints.filter((item) => normalizeLowerString(item) !== "blonde_refresh_ambiguity");
      next.missing_required_info = normalizeMissingInfoSet(
        next.missing_required_info.filter((item) => {
          const lower = normalizeLowerString(item);
          return lower !== "service_details";
        }),
      );
    }
  }

  if (hadLowMaintenanceGoal && isLowMaintenanceColorFollowupMessage(latestLower)) {
    next.known_constraints = uniqueStrings([...next.known_constraints, "low_maintenance_goal", "consult_candidate"]);
    next.requested_services = mergeRequestedServices(
      next.requested_services.filter((item) => normalizeLowerString(item.label) !== "haircut"),
      [{
        label: "Color",
        family: "color",
        confidence: 0.7,
        notes: "Low-maintenance color follow-up needs narrowing before the exact color service is chosen.",
      }],
    );
    next.service_stack = normalizeServiceStack(
      next.service_stack.filter((item) => normalizeLowerString(item) !== "haircut"),
      next.requested_services,
    );
    next.service_family = "color";
    next.service_family_confidence = Math.max(next.service_family_confidence || 0, 0.7);
    next.service_candidate = null;
    next.service_candidate_confidence = null;
    next.needs_service_decision = true;
    next.decision_question_key = "consultation_entry";
    next.missing_required_info = normalizeMissingInfoSet(
      next.missing_required_info.filter((item) => {
        const lower = normalizeLowerString(item);
        return lower !== "service" &&
          lower !== "haircut_scope" &&
          lower !== "haircut_type_(trim_or_bigger_change)" &&
          lower !== "consultation_entry";
      }).concat(["service_details"]),
    );
    next.ready_to_search_availability = false;
  }

  if (normalizeLowerString(sanitizeStylistPreference(next.stylist_preference, next.requested_services) || "") === "any") {
    next.stylist_preference = "any";
    next.known_constraints = uniqueStrings(
      next.known_constraints
        .filter((item) => !/^stylist preference:/i.test(normalizeString(item)))
        .concat(
          /\b(any|anyone|anybody|whoever)\b/.test(latestLower) &&
          (/\bexcept\b/.test(latestLower) || /\bbut not\b/.test(latestLower) || /\bother than\b/.test(latestLower) || /\bif\b/.test(latestLower))
            ? ["open_to_anyone_if_preferred_staff_unavailable"]
            : [],
        ),
    );
  }

  if (isGenericBookingOpenerWithoutService(latestInboundText)) {
    next.requested_services = [];
    next.service_stack = [];
    next.service_family = null;
    next.service_family_confidence = null;
    next.service_candidate = null;
    next.service_candidate_confidence = null;
    next.service_modifiers = [];
    next.needs_service_decision = false;
    next.decision_question_key = null;
    next.decision_answer = null;
    next.ready_to_search_availability = false;
    next.ready_to_book = false;
    next.missing_required_info = normalizeMissingInfoSet(["service"]);
    next.client_facing_reply = "What would you like to book?";
  }

  return assertedBookingState(next);
}

function isNaturalAvailabilityQuestion(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return false;
  return (
    /\bwhat times do you have\b/.test(lower) ||
    /\bwhat do you have\b/.test(lower) ||
    /\bany times\b/.test(lower) ||
    /\bwhat'?s available\b/.test(lower)
  );
}

function buildBookingRequestDraft(state: StructuredBookingState): BookingRequestDraft {
  return {
    intent: state.intent,
    phone: state.phone,
    client_name: state.client_name,
    stylist_preference: state.stylist_preference,
    requested_services: state.requested_services,
    service_stack: state.service_stack,
    service_family: state.service_family,
    service_candidate: state.service_candidate,
    needs_service_decision: state.needs_service_decision,
    decision_answer: state.decision_answer,
    service_modifiers: state.service_modifiers,
    timing_preference: state.timing_preference,
    ready_to_search_availability: state.ready_to_search_availability,
    ready_to_book: state.ready_to_book,
    resolved_services: [],
    service_preferences: [],
    unresolved_service_labels: [],
  };
}

async function bookingProxyRequest(body: JsonRecord) {
  if (!BOULEVARD_BOOKING_PROXY_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing BOULEVARD_BOOKING_PROXY_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const response = await fetch(BOULEVARD_BOOKING_PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  const parsed = safeObject(rawText ? JSON.parse(rawText) : {});
  if (!response.ok) {
    throw new Error(`Booking proxy request failed: status=${response.status}; body=${rawText}`);
  }
  return parsed;
}

async function fetchActiveBoulevardCatalogServices() {
  const now = Date.now();
  if (cachedCatalogServices && now - cachedCatalogFetchedAt < CATALOG_CACHE_TTL_MS) {
    return cachedCatalogServices;
  }

  const response = await bookingProxyRequest({
    action: "catalog",
    location_id: BOULEVARD_LOCATION_ID || undefined,
  });

  const services = safeArray<JsonRecord>(response.services)
    .map((item) => ({
      id: normalizeString(item.id),
      name: normalizeString(item.name),
      category: normalizeString(item.category) || null,
      note: normalizeString(item.note) || null,
    }))
    .filter((item) =>
      item.id &&
      item.name &&
      item.id.startsWith("urn:blvd:Service:") &&
      !["internal", "gift cards", "wellness", "lashes"].includes(normalizeLowerString(item.category))
    );

  cachedCatalogServices = services;
  cachedCatalogFetchedAt = now;
  return services;
}

async function fetchDerivedStaffDirectory() {
  const now = Date.now();
  if (cachedDerivedStaffDirectory && now - cachedDerivedStaffDirectoryFetchedAt < CATALOG_CACHE_TTL_MS) {
    return cachedDerivedStaffDirectory;
  }

  const response = await bookingProxyRequest({
    action: "staff-directory-derived",
    location_id: BOULEVARD_LOCATION_ID || undefined,
  });

  const staff = safeArray<JsonRecord>(response.staff)
    .map((item) => ({
      id: normalizeString(item.id),
      name: normalizeString(item.name),
      role: normalizeString(item.role) || null,
      services: safeArray<JsonRecord>(item.services).map((service) => ({
        id: normalizeString(service.id),
        name: normalizeString(service.name),
        category: normalizeString(service.category) || null,
        description: normalizeString(service.description) || null,
        price: typeof service.price === "number" ? service.price : null,
        duration_minutes: typeof service.duration_minutes === "number" ? service.duration_minutes : null,
      })).filter((service) => service.id && service.name),
    }))
    .filter((item) => item.id && item.name);

  cachedDerivedStaffDirectory = staff;
  cachedDerivedStaffDirectoryFetchedAt = now;
  return staff;
}

function buildServiceStaffMap(staffDirectory: DerivedStaffDirectoryEntry[]) {
  const byServiceId = new Map<string, string[]>();
  for (const staff of staffDirectory) {
    const staffName = normalizeString(staff.name);
    if (!staffName) continue;
    for (const service of staff.services || []) {
      const serviceId = normalizeString(service.id);
      if (!serviceId) continue;
      const existing = byServiceId.get(serviceId) || [];
      byServiceId.set(serviceId, uniqueStrings([...existing, staffName]));
    }
  }
  return byServiceId;
}

function inferKnowledgeFamily(service: BoulevardCatalogService) {
  const name = normalizeLowerString(service.name);
  const category = normalizeLowerString(service.category);
  if (name.includes("consult")) return "consultation";
  if (name.includes("extension") || category.includes("extension")) return "extensions";
  if (name.includes("haircut") || category.includes("cut")) return "haircut";
  if (name.includes("blow") || category.includes("blow") || category.includes("style")) return "blowout";
  if (name.includes("gloss") || name.includes("glaze") || name.includes("toner") || category.includes("gloss")) return "gloss";
  if (name.includes("single process") || name.includes("root touch") || name.includes("gray coverage")) return "gray_coverage";
  if (
    name.includes("face frame") ||
    name.includes("partial highlight") ||
    name.includes("full highlight") ||
    name.includes("balayage") ||
    name.includes("dimension") ||
    category.includes("highlight") ||
    category.includes("balayage")
  ) return "dimensional_color";
  if (name.includes("treatment") || category.includes("treatment")) return "treatment";
  if (category.includes("consult")) return "consultation";
  if (category.includes("color")) return "color";
  return null;
}

function inferCanonicalLabelForService(service: BoulevardCatalogService) {
  const name = normalizeLowerString(service.name);
  const rules = CURATED_SERVICE_RULES.find((rule) =>
    rule.preferred_service_names.some((serviceName) => normalizeLowerString(serviceName) === name)
  );
  if (rules) return rules.canonical_label;
  if (name.includes("face frame")) return "Face Frame";
  if (name.includes("partial highlight")) return "Partial Highlight";
  if (name.includes("full highlight")) return "Full Highlight";
  if (name.includes("single process")) return "Single Process";
  if (name.includes("root touch")) return "Root touch-up";
  if (name.includes("gloss") || name.includes("glaze") || name.includes("toner")) return "Gloss";
  if (name.includes("haircut")) return "Haircut";
  if (name.includes("blow")) return "Blowout";
  if (name.includes("consult")) return "Consultation";
  if (name.includes("extension")) return "Extensions";
  if (name.includes("treatment")) return "Treatment";
  return null;
}

function inferServiceMeaning(service: BoulevardCatalogService) {
  const name = normalizeLowerString(service.name);
  if (name.includes("single process")) return "Root color, gray coverage, base color maintenance, or a richer all-over base.";
  if (name.includes("root touch")) return "Root maintenance or gray coverage at the regrowth.";
  if (name.includes("face frame")) return "Brightness or dimension mainly around the face.";
  if (name.includes("partial highlight")) return "Brightness through the top, crown, and face without going fully through the lengths.";
  if (name.includes("full highlight")) return "Brightness or dimension through most or all of the head.";
  if (name.includes("balayage")) return "Lived-in painted lightness with a softer grow-out.";
  if (name.includes("gloss") || name.includes("glaze") || name.includes("toner")) return "Tone, shine, or refresh for existing color or highlights.";
  if (name.includes("haircut")) return "Cutting, shaping, layers, bangs, perimeter cleanup, or a length change.";
  if (name.includes("blow")) return "A polished blowout or finished style.";
  if (name.includes("extension")) return "Extension consultation, maintenance, or adjustment work.";
  if (name.includes("consult")) return "A consultation to decide the right service safely before booking.";
  return "Bookable salon service.";
}

function inferClientLanguage(service: BoulevardCatalogService) {
  const name = normalizeLowerString(service.name);
  if (name.includes("single process") || name.includes("root touch")) {
    return ["cover my gray", "root touch up", "roots", "base color", "all over color", "touch up"];
  }
  if (name.includes("face frame")) {
    return [
      "money piece",
      "brighter around my face",
      "face-framing highlights",
      "brighten up the front",
      "lighter in the front",
      "just the front",
      "front pieces",
    ];
  }
  if (name.includes("partial highlight")) return ["partial highlights", "lighter on top", "brighten me up", "dimension", "crown and face"];
  if (name.includes("full highlight")) return ["full highlights", "lighter all over", "go blonde", "brighter throughout", "full head lighter"];
  if (name.includes("balayage")) return ["balayage", "lived in blonde", "soft blonde", "painted highlights"];
  if (name.includes("gloss") || name.includes("glaze") || name.includes("toner")) return ["gloss", "glaze", "toner", "refresh my color", "shine"];
  if (name.includes("haircut")) return ["trim", "cut", "layers", "bangs", "shape", "big change"];
  if (name.includes("blow")) return ["blowout", "style", "curls", "waves", "event hair"];
  if (name.includes("extension")) return ["extensions", "move up my wefts", "extension maintenance", "my extensions need help"];
  if (name.includes("consult")) return ["not sure what I need", "consult", "help me figure it out"];
  return [];
}

function inferUseWhen(service: BoulevardCatalogService) {
  const name = normalizeLowerString(service.name);
  if (name.includes("single process") || name.includes("root touch")) {
    return [
      "Client wants gray coverage.",
      "Client wants root maintenance.",
      "Client wants the base darker, richer, or refreshed.",
    ];
  }
  if (name.includes("face frame")) return ["Client wants brightness mainly around the face.", "Client says money piece or face-framing brightness."];
  if (name.includes("partial highlight")) return ["Client wants brightness through the top and around the face.", "Client does not need brightness fully underneath or through all lengths."];
  if (name.includes("full highlight")) return ["Client wants brightness throughout the head.", "Client wants a bigger blonde or dimensional change."];
  if (name.includes("gloss") || name.includes("glaze") || name.includes("toner")) return ["Client wants to refresh tone.", "Client wants shine or a softer color refresh without a major change."];
  if (name.includes("haircut")) return ["Client wants a trim, reshape, bang change, or length change."];
  if (name.includes("blow")) return ["Client wants a polished finish, event styling, or a separate blowout visit."];
  if (name.includes("extension")) return ["Client needs extension maintenance, movement, or consultation before booking the right extension work."];
  if (name.includes("consult")) return ["The request is technically risky, unclear, corrective, or needs an in-person plan first."];
  return [];
}

function inferDoNotUseWhen(service: BoulevardCatalogService) {
  const name = normalizeLowerString(service.name);
  if (name.includes("single process") || name.includes("root touch")) {
    return ["Do not use for brightness or highlight placement when the guest mainly wants dimension or blonding."];
  }
  if (name.includes("gloss") || name.includes("glaze") || name.includes("toner")) {
    return ["Do not use alone when the client is clearly asking for root coverage or a larger blonding change."];
  }
  if (name.includes("blow")) {
    return ["Do not stack as a duplicate finish when the selected haircut or color service already includes a standard blowout unless the guest wants a more styled finish."];
  }
  if (name.includes("consult")) {
    return ["Do not skip the consultation when the request is corrective, technically unclear, or extension-related."];
  }
  return [];
}

function inferMissingInfo(service: BoulevardCatalogService) {
  const family = inferKnowledgeFamily(service);
  switch (family) {
    case "dimensional_color":
      return ["placement", "how much brighter", "maintenance expectations"];
    case "gray_coverage":
      return ["gray coverage vs color change", "root only vs all over"];
    case "gloss":
      return ["refresh only vs add-on", "tone goal"];
    case "haircut":
      return ["trim vs change"];
    case "blowout":
      return ["smooth finish vs curls or waves", "event timing if relevant"];
    case "extensions":
      return ["maintenance vs consultation", "what kind of extension help is needed"];
    default:
      return [];
  }
}

function inferBookingRules(service: BoulevardCatalogService) {
  const family = inferKnowledgeFamily(service);
  const rules: string[] = [];
  if (family === "dimensional_color") {
    rules.push("Confirm placement before searching when brightness location is unclear.");
    rules.push("Gloss may be paired as a tonal add-on rather than a standalone separate visit.");
  }
  if (family === "gray_coverage") {
    rules.push("Use for roots, gray coverage, or base-color maintenance rather than highlight-driven brightness.");
  }
  if (family === "gloss") {
    rules.push("Can be standalone or paired with color depending on the guest's goal.");
  }
  if (family === "consultation") {
    rules.push("Use when the request is unclear, corrective, extension-related, or high-risk.");
  }
  if (family === "extensions") {
    rules.push("Extension help usually starts with consultation or maintenance triage before timing search.");
  }
  return rules;
}

function inferCommonPairings(service: BoulevardCatalogService) {
  const family = inferKnowledgeFamily(service);
  if (family === "dimensional_color") return ["Gloss", "Haircut"];
  if (family === "gray_coverage") return ["Gloss", "Haircut", "Blowout"];
  if (family === "haircut") return ["Blowout", "Treatment"];
  if (family === "blowout") return ["Gloss", "Event finish"];
  return [];
}

function inferIntentKeywords(service: BoulevardCatalogService) {
  return uniqueStrings([
    normalizeLowerString(service.name),
    normalizeLowerString(service.category),
    ...inferClientLanguage(service).map((item) => normalizeLowerString(item)),
  ].filter(Boolean));
}

function inferServiceModifiers(service: BoulevardCatalogService) {
  const family = inferKnowledgeFamily(service);
  if (family === "dimensional_color") return ["Glaze/Gloss", "Lowlights", "Pretone", "Root Shadow", "Long/Thick Hair"];
  if (family === "gray_coverage") return ["Glaze/Gloss", "Extra Color", "Air-Dry Transition Time"];
  if (family === "haircut") return ["Long/Thick Hair", "Big Change"];
  return [];
}

function buildBookingKnowledgeEntry(
  service: BoulevardCatalogService,
  staffByServiceId: Map<string, string[]>,
): BookingKnowledgeEntry {
  return {
    service_id: service.id,
    name: service.name,
    category: service.category,
    boulevard_note: service.note || null,
    family: inferKnowledgeFamily(service),
    canonical_label: inferCanonicalLabelForService(service),
    ai_meaning: inferServiceMeaning(service),
    client_language: inferClientLanguage(service),
    use_when: inferUseWhen(service),
    do_not_use_when: inferDoNotUseWhen(service),
    missing_info_to_confirm: inferMissingInfo(service),
    booking_rules: inferBookingRules(service),
    common_pairings: inferCommonPairings(service),
    intent_keywords: inferIntentKeywords(service),
    modifiers: inferServiceModifiers(service),
    staff: (staffByServiceId.get(service.id) || []).slice().sort((a, b) => a.localeCompare(b)),
  };
}

async function fetchBookingKnowledgeBase() {
  const now = Date.now();
  if (cachedBookingKnowledge && now - cachedBookingKnowledgeFetchedAt < CATALOG_CACHE_TTL_MS) {
    return cachedBookingKnowledge;
  }
  const services = await fetchActiveBoulevardCatalogServices();
  const staffDirectory = await fetchDerivedStaffDirectory().catch(() => [] as DerivedStaffDirectoryEntry[]);
  const staffByServiceId = buildServiceStaffMap(staffDirectory);
  const knowledge = services.map((service) => buildBookingKnowledgeEntry(service, staffByServiceId));
  cachedBookingKnowledge = knowledge;
  cachedBookingKnowledgeFetchedAt = now;
  return knowledge;
}

function familyMeaningSummary(family: string) {
  switch (family) {
    case "dimensional_color":
      return "Brightness, highlights, balayage, money piece, or dimension where placement matters.";
    case "gray_coverage":
      return "Roots, gray coverage, base maintenance, or all-over base refresh.";
    case "gloss":
      return "Tone, shine, refresh, glaze, or toner-style color refinement.";
    case "haircut":
      return "Trim, reshape, layers, bangs, or length change.";
    case "blowout":
      return "Polished finish, style, curls, waves, or event-ready hair.";
    case "extensions":
      return "Extension consultation, maintenance, move-up, or extension troubleshooting.";
    case "consultation":
      return "Best fit when the request is unclear, corrective, risky, or needs a plan first.";
    default:
      return "Bookable salon service family.";
  }
}

function familyDecisionQuestion(family: string) {
  switch (family) {
    case "dimensional_color":
      return "Where would you like the brightness most: around your face, through the top and face, or all the way through the lengths?";
    case "gray_coverage":
      return "Are you looking for root coverage, gray coverage, or more of an all-over base refresh?";
    case "gloss":
      return "Are you mostly looking to refresh the tone and shine, or do you want a little more brightness too?";
    case "haircut":
      return "Is this more of a trim and shape-up, or are you thinking about a bigger change?";
    case "blowout":
      return "Do you want a smooth polished finish, or more styled curls or waves?";
    case "extensions":
      return "Are you looking for maintenance on your current extensions, or do you need help figuring out what extension service is right?";
    case "consultation":
      return "Do you want to narrow it down here first, or start with a consultation so we can match you with the right service?";
    default:
      return null;
  }
}

function buildFamilyObjects(entries: BookingKnowledgeEntry[]) {
  const families = uniqueStrings(entries.map((entry) => normalizeLowerString(entry.family)).filter(Boolean));
  return families.map((family) => {
    const familyEntries = entries.filter((entry) => normalizeLowerString(entry.family) === family);
    return {
      family,
      meaning: familyMeaningSummary(family),
      decision_question: familyDecisionQuestion(family),
      common_missing_info: uniqueStrings(familyEntries.flatMap((entry) => entry.missing_info_to_confirm)).slice(0, 6),
      child_services: familyEntries.map((entry) => ({
        service_id: entry.service_id,
        name: entry.name,
        canonical_label: entry.canonical_label,
        client_language: entry.client_language.slice(0, 6),
        staff: entry.staff.slice(0, 12),
      })),
    };
  });
}

function scoreBookingKnowledgeEntry(entry: BookingKnowledgeEntry, contextText: string, desiredLabels: string[]) {
  const haystack = normalizeLowerString(contextText);
  const desired = desiredLabels.map((item) => normalizeLowerString(item));
  let score = 0;

  if (desired.some((label) => label && normalizeLowerString(entry.name).includes(label))) score += 80;
  if (entry.canonical_label && desired.includes(normalizeLowerString(entry.canonical_label))) score += 95;
  if (entry.family && desired.includes(normalizeLowerString(entry.family))) score += 40;

  for (const keyword of entry.intent_keywords) {
    if (keyword && haystack.includes(keyword)) score += keyword.split(" ").length > 1 ? 20 : 10;
  }
  for (const phrase of entry.client_language) {
    if (haystack.includes(normalizeLowerString(phrase))) score += 16;
  }
  if (entry.family === "consultation" && /consult|not sure|don't know|color correction|extensions need help|healthy|low maintenance/.test(haystack)) {
    score += 35;
  }
  if (entry.family === "dimensional_color" && /highlight|lighter|brighter|blonde|dimension|balayage|money piece/.test(haystack)) {
    score += 30;
  }
  if (entry.family === "gray_coverage" && /gray|grey|roots|root touch|touch up|base color|single process/.test(haystack)) {
    score += 30;
  }
  if (entry.family === "gloss" && /gloss|glaze|toner|refresh|shine/.test(haystack)) {
    score += 30;
  }
  if (entry.family === "haircut" && /haircut|trim|cut|layers|bangs/.test(haystack)) {
    score += 25;
  }
  if (entry.family === "blowout" && /blowout|blow dry|blowdry|curls|waves|event hair/.test(haystack)) {
    score += 25;
  }
  if (entry.family === "extensions" && /extension|weft|move up/.test(haystack)) {
    score += 30;
  }

  return score;
}

async function buildBookingKnowledgeContext(input: {
  messageBody: string;
  previousState: StructuredBookingState;
  heuristicState: Partial<StructuredBookingState>;
}) {
  const knowledge = await fetchBookingKnowledgeBase();
  const desiredLabels = uniqueStrings([
    ...input.previousState.service_stack,
    ...input.previousState.requested_services.map((item) => normalizeString(item.label)),
    ...(Array.isArray(input.heuristicState.service_stack) ? input.heuristicState.service_stack.map((item) => normalizeString(item)) : []),
    ...(Array.isArray(input.heuristicState.requested_services)
      ? input.heuristicState.requested_services
          .map((item) => normalizeString(safeObject(item as unknown as JsonRecord).label))
      : []),
  ]).filter(Boolean);
  const scored = knowledge
    .map((entry) => ({
      entry,
      score: scoreBookingKnowledgeEntry(entry, input.messageBody, desiredLabels),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name));

  const candidateServices = uniqueStrings(scored.map((item) => item.entry.service_id))
    .slice(0, 12)
    .map((serviceId) => scored.find((item) => item.entry.service_id === serviceId)?.entry)
    .filter((item): item is BookingKnowledgeEntry => !!item);
  if (!candidateServices.length) {
    candidateServices.push(
      ...knowledge.filter((entry) =>
        ["Haircut", "Blowout", "Consultation", "Gloss", "Single Process", "Partial Highlight", "Full Highlight"].includes(normalizeString(entry.canonical_label))
      ).slice(0, 8),
    );
  }

  const familyHints = uniqueStrings(candidateServices.map((item) => normalizeLowerString(item.family)).filter(Boolean))
    .slice(0, 6)
    .map((family) => ({
      family,
      meaning: familyMeaningSummary(family),
      common_missing_info: uniqueStrings(
        candidateServices
          .filter((entry) => normalizeLowerString(entry.family) === family)
          .flatMap((entry) => entry.missing_info_to_confirm),
      ).slice(0, 5),
    }));
  const familyObjects = buildFamilyObjects(candidateServices);

  return {
    candidate_services: candidateServices,
    family_hints: familyHints,
    family_objects: familyObjects,
  } satisfies BookingKnowledgeContext;
}

function detectMentionedStaffName(message: string, staffNames: string[]) {
  const messageLower = normalizeLowerString(message);
  if (!messageLower) return null;

  staffNames = uniqueStrings(staffNames);
  if (!staffNames.length) return null;

  const firstNameCounts = new Map<string, number>();
  for (const name of staffNames) {
    const first = normalizeLowerString(name.split(/\s+/)[0] || "");
    if (!first) continue;
    firstNameCounts.set(first, (firstNameCounts.get(first) || 0) + 1);
  }

  const sorted = staffNames.slice().sort((a, b) => b.length - a.length || a.localeCompare(b));
  for (const name of sorted) {
    const full = normalizeLowerString(name);
    if (!full) continue;
    const fullPattern = new RegExp(`\\b${escapeRegExp(full)}\\b`, "i");
    if (fullPattern.test(messageLower)) return name;

    const first = normalizeLowerString(name.split(/\s+/)[0] || "");
    if (!first || (firstNameCounts.get(first) || 0) !== 1) continue;
    const firstPattern = new RegExp(`\\b${escapeRegExp(first)}\\b`, "i");
    if (firstPattern.test(messageLower)) return name;
  }

  return null;
}

function detectMentionedStaffFromKnowledge(message: string, bookingKnowledge: BookingKnowledgeContext) {
  return detectMentionedStaffName(message, [
    ...bookingKnowledge.candidate_services.flatMap((entry) => entry.staff),
    ...bookingKnowledge.family_objects.flatMap((family) => family.child_services.flatMap((service) => service.staff)),
  ]);
}

function familyKeyForRequestedLabel(label: string) {
  switch (normalizeLowerString(canonicalizeRequestedServiceLabel(label))) {
    case "dimensional color":
    case "face frame":
    case "partial highlight":
    case "full highlight":
      return "dimensional_color";
    case "root touch-up":
    case "single process":
      return "gray_coverage";
    case "gloss":
    case "glaze":
    case "toner":
      return "gloss";
    case "haircut":
      return "haircut";
    case "blowout":
      return "blowout";
    case "extensions":
    case "extensions maintenance":
    case "extensions consultation":
      return "extensions";
    case "consultation":
    case "color correction consultation":
      return "consultation";
    default:
      return null;
  }
}

function decisionQuestionKeyForStateFamily(state: StructuredBookingState, family: string | null): ServiceDecisionQuestionKey | null {
  const constraints = new Set(state.known_constraints.map((item) => normalizeLowerString(item)));
  if (constraints.has("blonde_refresh_ambiguity")) return "gloss_vs_brightness";
  if (constraints.has("touch_up_ambiguity")) return "gray_coverage_scope";
  switch (normalizeLowerString(family || "")) {
    case "color":
      return constraints.has("low_maintenance_goal") ? "consultation_entry" : null;
    case "dimensional_color":
      return "dimensional_placement";
    case "gray_coverage":
      return "gray_coverage_scope";
    case "gloss":
      return "gloss_vs_brightness";
    case "extensions":
      return "extensions_triage";
    case "haircut":
      return "haircut_scope";
    case "blowout":
      return "blowout_finish";
    case "consultation":
      return "consultation_entry";
    default:
      return null;
  }
}

function inferServiceConfidenceTier(state: StructuredBookingState) {
  const constraints = new Set(state.known_constraints.map((item) => normalizeLowerString(item)));
  const labels = uniqueStrings([
    ...state.requested_services.map((service) => canonicalizeRequestedServiceLabel(normalizeString(service.label))),
    ...state.service_stack.map((label) => canonicalizeRequestedServiceLabel(normalizeString(label))),
  ]).filter(Boolean);
  const requestedByLabel = new Map(
    state.requested_services.map((service) => [
      normalizeLowerString(canonicalizeRequestedServiceLabel(normalizeString(service.label))),
      service,
    ]),
  );

  const specificLabel = labels.find((label) => SPECIFIC_SERVICE_LABELS.has(normalizeLowerString(label))) || null;
  const familyFromSpecific = specificLabel ? familyKeyForRequestedLabel(specificLabel) : null;
  const genericFamilyLabel = labels.find((label) => {
    const lower = normalizeLowerString(label);
    return !!familyKeyForRequestedLabel(label) && !SPECIFIC_SERVICE_LABELS.has(lower);
  }) || null;
  const familyFromGeneric = genericFamilyLabel ? familyKeyForRequestedLabel(genericFamilyLabel) : null;

  const inferredFamily =
    (constraints.has("blonde_refresh_ambiguity") ? "dimensional_color" : null) ||
    (constraints.has("touch_up_ambiguity") ? "gray_coverage" : null) ||
    familyFromSpecific ||
    familyFromGeneric ||
    normalizeLowerString(state.requested_services[0]?.family || "") ||
    null;

  const candidateLabel = specificLabel ||
    (constraints.has("blonde_refresh_ambiguity") || constraints.has("touch_up_ambiguity")
      ? null
      : null);
  const familyService = genericFamilyLabel
    ? requestedByLabel.get(normalizeLowerString(genericFamilyLabel))
    : null;
  const candidateService = candidateLabel
    ? requestedByLabel.get(normalizeLowerString(candidateLabel))
    : null;

  const genericDefaults: Record<string, number> = {
    color: 0.55,
    dimensional_color: 0.45,
    gray_coverage: 0.5,
    gloss: 0.55,
    haircut: 0.7,
    blowout: 0.75,
    extensions: 0.5,
    consultation: 0.8,
  };
  const specificDefaults: Record<string, number> = {
    "face frame": 0.96,
    "partial highlight": 0.98,
    "full highlight": 0.98,
    "root touch-up": 0.97,
    "single process": 0.97,
    gloss: 0.95,
    haircut: 0.95,
    blowout: 0.95,
    consultation: 0.92,
    extensions: 0.88,
    treatment: 0.9,
  };

  const familyConfidence = inferredFamily
    ? normalizeOptionalConfidence(
      candidateService?.confidence ??
      familyService?.confidence ??
      (constraints.has("blonde_refresh_ambiguity") && inferredFamily === "dimensional_color" ? 0.72 : null) ??
      (constraints.has("touch_up_ambiguity") && inferredFamily === "gray_coverage" ? 0.68 : null) ??
      genericDefaults[inferredFamily] ??
      0.5,
    )
    : null;
  const candidateConfidence = candidateLabel
    ? normalizeOptionalConfidence(
      candidateService?.confidence ??
      specificDefaults[normalizeLowerString(candidateLabel)] ??
      0.95,
    )
    : null;
  const needsDecision =
    ((constraints.has("blonde_refresh_ambiguity") || constraints.has("touch_up_ambiguity")) && !candidateLabel) ||
    (!!inferredFamily && !candidateLabel);
  const decisionQuestionKey = needsDecision ? decisionQuestionKeyForStateFamily(state, inferredFamily) : null;

  return {
    service_family: inferredFamily || null,
    service_family_confidence: familyConfidence,
    service_candidate: candidateLabel,
    service_candidate_confidence: candidateConfidence,
    needs_service_decision: needsDecision,
    decision_question_key: decisionQuestionKey,
  };
}

function applyDecisionAnswer(state: StructuredBookingState) {
  const decision = state.decision_answer;
  if (!decision || decision.question_key !== state.decision_question_key) {
    return state;
  }

  const next: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    missing_required_info: state.missing_required_info.slice(),
  };

  const answer = normalizeLowerString(decision.answer_key);
  switch (decision.question_key) {
    case "dimensional_placement": {
      const mapped =
        answer === "face_only" ? "Face Frame"
        : answer === "top_and_face" ? "Partial Highlight"
        : answer === "whole_head" ? "Full Highlight"
        : null;
      if (!mapped) return assertedBookingState(next);
      next.requested_services = mergeRequestedServices(
        next.requested_services.filter((item) =>
          !["dimensional color", "face frame", "partial highlight", "full highlight", "color"].includes(normalizeLowerString(item.label))
        ),
        [{ label: mapped, family: "color", confidence: 0.98, notes: `Decision answer mapped from ${decision.question_key}:${decision.answer_key}.` }],
      );
      next.service_stack = normalizeServiceStack(
        next.service_stack
          .filter((item) => !["dimensional color", "face frame", "partial highlight", "full highlight", "color"].includes(normalizeLowerString(item)))
          .concat([mapped]),
        next.requested_services,
      );
      next.missing_required_info = next.missing_required_info.filter((item) => normalizeLowerString(item) !== "service_details");
      next.known_constraints = next.known_constraints.filter((item) => normalizeLowerString(item) !== "blonde_refresh_ambiguity");
      next.needs_service_decision = false;
      next.decision_question_key = null;
      break;
    }
    case "gray_coverage_scope": {
      const mapped =
        answer === "roots_or_gray" ? "Root touch-up"
        : answer === "all_over_refresh" ? "Single Process"
        : null;
      if (!mapped) return assertedBookingState(next);
      next.requested_services = [{
        label: mapped,
        family: "gray_coverage",
        confidence: 0.96,
        notes: `Decision answer mapped from ${decision.question_key}:${decision.answer_key}.`,
      }];
      next.service_stack = normalizeServiceStack([mapped], next.requested_services);
      next.service_family = "gray_coverage";
      next.service_family_confidence = Math.max(next.service_family_confidence || 0, 0.96);
      next.service_candidate = mapped;
      next.service_candidate_confidence = Math.max(next.service_candidate_confidence || 0, 0.96);
      next.needs_service_decision = false;
      next.decision_question_key = null;
      next.decision_answer = {
        question_key: decision.question_key,
        answer_key: decision.answer_key,
      };
      next.missing_required_info = next.missing_required_info.filter((item) => {
        const lower = normalizeLowerString(item);
        return lower !== "service_details" && lower !== "gray_coverage_scope";
      });
      next.known_constraints = next.known_constraints.filter((item) => {
        const lower = normalizeLowerString(item);
        if (lower === "touch_up_ambiguity") return false;
        if (lower === "all_over_refresh_confirmed" && answer === "roots_or_gray") return false;
        return true;
      });
      if (answer === "all_over_refresh") {
        next.known_constraints = uniqueStrings([...next.known_constraints, "all_over_refresh_confirmed"]);
      }
      break;
    }
    case "gloss_vs_brightness": {
      if (answer === "tone_refresh") {
        next.requested_services = mergeRequestedServices(
          next.requested_services.filter((item) =>
            !["dimensional color", "face frame", "partial highlight", "full highlight", "gloss", "glaze", "toner", "color"].includes(normalizeLowerString(item.label))
          ),
          [{ label: "Gloss", family: "gloss", confidence: 0.96, notes: `Decision answer mapped from ${decision.question_key}:${decision.answer_key}.` }],
        );
        next.service_stack = normalizeServiceStack(
          next.service_stack
            .filter((item) =>
              !["dimensional color", "face frame", "partial highlight", "full highlight", "gloss", "glaze", "toner", "color"].includes(normalizeLowerString(item))
            )
            .concat(["Gloss"]),
          next.requested_services,
        );
        next.missing_required_info = next.missing_required_info.filter((item) => normalizeLowerString(item) !== "service_details");
        next.known_constraints = next.known_constraints.filter((item) => normalizeLowerString(item) !== "blonde_refresh_ambiguity");
      } else if (answer === "soft_brightness") {
        next.requested_services = mergeRequestedServices(
          next.requested_services.filter((item) =>
            !["gloss", "glaze", "toner", "color"].includes(normalizeLowerString(item.label))
          ),
          [{ label: "Dimensional color", family: "color", confidence: 0.82, notes: `Decision answer mapped from ${decision.question_key}:${decision.answer_key}.` }],
        );
        next.service_stack = normalizeServiceStack(
          uniqueStrings([
            ...next.service_stack.filter((item) => !["gloss", "glaze", "toner", "color"].includes(normalizeLowerString(item))),
            "Dimensional color",
          ]),
          next.requested_services,
        );
        next.missing_required_info = normalizeMissingInfoSet([...next.missing_required_info, "service_details"]);
        next.known_constraints = next.known_constraints.filter((item) => normalizeLowerString(item) !== "blonde_refresh_ambiguity");
        next.service_family = "dimensional_color";
        next.service_family_confidence = 0.82;
        next.service_candidate = null;
        next.service_candidate_confidence = null;
        next.needs_service_decision = true;
        next.decision_question_key = "dimensional_placement";
        next.decision_answer = null;
      }
      break;
    }
    default:
      return assertedBookingState(next);
  }

  if (decision.question_key !== "gray_coverage_scope") {
    next.decision_answer = null;
  }
  return assertedBookingState(next);
}

function hasResolvedGrayCoverageRootsAnswer(state: StructuredBookingState) {
  const answer = state.decision_answer;
  if (!answer) return false;
  if (answer.question_key !== "gray_coverage_scope") return false;
  if (normalizeLowerString(answer.answer_key) !== "roots_or_gray") return false;
  if (state.needs_service_decision) return false;
  const stackLabels = state.service_stack.map((item) => normalizeLowerString(item));
  const requestedLabels = state.requested_services.map((item) => normalizeLowerString(item.label));
  return stackLabels.includes("root touch-up") || requestedLabels.includes("root touch-up");
}

function cleanupResolvedAmbiguities(state: StructuredBookingState) {
  const next: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    known_constraints: state.known_constraints.slice(),
    missing_required_info: state.missing_required_info.slice(),
    decision_answer: state.decision_answer ? { ...state.decision_answer } : null,
  };

  if (hasResolvedGrayCoverageRootsAnswer(next)) {
    next.missing_required_info = normalizeMissingInfoSet(
      next.missing_required_info.filter((item) => {
        const lower = normalizeLowerString(item);
        return lower !== "gray_coverage_scope" &&
          lower !== "gray_coverage_vs_color_change" &&
          lower !== "root_only_vs_all_over" &&
          lower !== "service_details";
      }),
    );
    next.known_constraints = next.known_constraints.filter((item) => normalizeLowerString(item) !== "touch_up_ambiguity");
    next.needs_service_decision = false;
    next.decision_question_key = null;
  }

  return assertedBookingState(next);
}

function normalizeDecisionStateConsistency(state: StructuredBookingState) {
  const next: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    known_constraints: state.known_constraints.slice(),
  };
  const constraints = new Set(next.known_constraints.map((item) => normalizeLowerString(item)));
  const lowerFamily = normalizeLowerString(next.service_family || "");
  const stackLabels = next.service_stack.map((item) => normalizeLowerString(item));
  const requestedLabels = next.requested_services.map((item) => normalizeLowerString(item.label));
  const hasRootTouchUp = stackLabels.includes("root touch-up") || requestedLabels.includes("root touch-up");
  const hasSingleProcess = stackLabels.includes("single process") || requestedLabels.includes("single process");
  const hasSpecificGrayCoverage =
    stackLabels.some((item) => ["root touch-up", "single process"].includes(item)) ||
    requestedLabels.some((item) => ["root touch-up", "single process"].includes(item));
  const hasGenericGrayCoverageColor =
    lowerFamily === "gray_coverage" &&
    (
      stackLabels.includes("color") ||
      requestedLabels.includes("color") ||
      normalizeLowerString(next.service_candidate) === "color"
    );

  if (constraints.has("touch_up_ambiguity")) {
    next.needs_service_decision = true;
    next.decision_question_key = "gray_coverage_scope";
    if (hasGenericGrayCoverageColor && !hasSpecificGrayCoverage) {
      next.requested_services = [{
        label: "Root touch-up",
        family: "gray_coverage",
        confidence: 0.7,
        notes: "Touch-up language needs clarification between roots/gray coverage and all-over refresh.",
      }];
      next.service_stack = normalizeServiceStack(["Root touch-up"], next.requested_services);
      next.service_candidate = null;
      next.service_candidate_confidence = null;
      next.service_family = "gray_coverage";
      next.service_family_confidence = Math.max(next.service_family_confidence || 0, 0.68);
    }
  }

  if (hasRootTouchUp && hasSingleProcess && !constraints.has("all_over_refresh_confirmed")) {
    next.requested_services = next.requested_services.filter((item) => normalizeLowerString(item.label) !== "single process");
    next.service_stack = normalizeServiceStack(
      next.service_stack.filter((item) => normalizeLowerString(item) !== "single process"),
      next.requested_services,
    );
    if (normalizeLowerString(next.service_candidate) === "single process") {
      next.service_candidate = "Root touch-up";
      next.service_candidate_confidence = next.service_candidate_confidence ?? 0.96;
    }
  }

  if (hasRootTouchUp && !constraints.has("all_over_refresh_confirmed")) {
    next.known_constraints = next.known_constraints.filter((item) => normalizeLowerString(item) !== "all_over_refresh_confirmed");
  }

  if (
    hasRootTouchUp &&
    !constraints.has("all_over_refresh_confirmed") &&
    next.decision_answer?.question_key === "gray_coverage_scope" &&
    normalizeLowerString(next.decision_answer.answer_key) === "roots_or_gray"
  ) {
    next.needs_service_decision = false;
    next.decision_question_key = null;
    next.missing_required_info = next.missing_required_info.filter((item) => {
      const lower = normalizeLowerString(item);
      return lower !== "service_details" && lower !== "gray_coverage_scope";
    });
    next.known_constraints = next.known_constraints.filter((item) => normalizeLowerString(item) !== "touch_up_ambiguity");
  }

  if (!next.needs_service_decision) {
    next.decision_question_key = null;
    if (!hasResolvedGrayCoverageRootsAnswer(next)) {
      next.decision_answer = null;
    }
  } else if (!normalizeString(next.decision_question_key)) {
    const inferredKey = decisionQuestionKeyForStateFamily(next, lowerFamily || null);
    if (inferredKey && !normalizeString(next.service_candidate)) {
      next.decision_question_key = inferredKey;
    } else {
      next.needs_service_decision = false;
      next.decision_question_key = null;
      next.decision_answer = null;
    }
  }

  return cleanupResolvedAmbiguities(assertedBookingState(next));
}

function staffTopicLabelForFamily(family: string) {
  switch (normalizeLowerString(family)) {
    case "dimensional_color":
      return "blonding and dimensional color";
    case "gray_coverage":
      return "gray coverage and base color";
    case "gloss":
      return "gloss and toner services";
    case "haircut":
      return "haircuts";
    case "blowout":
      return "blowouts";
    case "extensions":
      return "extensions";
    case "consultation":
      return "consultations";
    default:
      return "that service";
  }
}

function formatNaturalList(values: string[]) {
  const items = uniqueStrings(values);
  if (!items.length) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function resolveStaffKnowledgeTarget(
  state: StructuredBookingState,
  bookingRequest: BookingRequestDraft,
  bookingKnowledge: BookingKnowledgeContext | undefined,
  sourceText = "",
) {
  if (!bookingKnowledge) return null;

  const requestedLabels = uniqueStrings([
    ...bookingRequest.resolved_services.map((service) => normalizeString(service.requested_label)),
    ...state.requested_services.map((service) => normalizeString(service.label)),
    ...state.service_stack,
  ]).filter(Boolean);

  const exactEntries = bookingKnowledge.candidate_services.filter((entry) =>
    requestedLabels.some((label) => {
      const normalized = normalizeLowerString(canonicalizeRequestedServiceLabel(label));
      return (
        normalized === normalizeLowerString(entry.canonical_label || "") ||
        normalized === normalizeLowerString(entry.name)
      );
    })
  );
  if (exactEntries.length) {
    return {
      kind: "service" as const,
      label: describeRequestedServices(state) || exactEntries.map((entry) => entry.canonical_label || entry.name).join(" and "),
      staff: uniqueStrings(exactEntries.flatMap((entry) => entry.staff)),
    };
  }

  const requestedFamilies = uniqueStrings(requestedLabels.map((label) => familyKeyForRequestedLabel(label) || "").filter(Boolean));
  const sourceLower = normalizeLowerString(sourceText).replace(/[’]/g, "'");
  const messageFamily =
    /\bextension|extensions|weft|move up\b/.test(sourceLower)
      ? "extensions"
      : /\bblonding\b|\bhighlights?\b|\bblonde\b|\bbrighter\b|\bdimension\b|\bbalayage\b/.test(sourceLower)
      ? "dimensional_color"
      : /\bcolor\b|\broots?\b|\bgray\b|\bgrey\b|\bsingle process\b|\bbase color\b/.test(sourceLower)
      ? "gray_coverage"
      : /\bgloss\b|\bglaze\b|\btoner\b|\brefresh\b|\bshine\b/.test(sourceLower)
      ? "gloss"
      : /\bhaircut\b|\bcut\b|\btrim\b|\blayers\b|\bbangs\b/.test(sourceLower)
      ? "haircut"
      : /\bblowout\b|\bblow dry\b|\bblowdry\b|\bcurls\b|\bwaves\b/.test(sourceLower)
      ? "blowout"
      : null;
  const chosenFamily = requestedFamilies[0] || messageFamily || normalizeLowerString(bookingKnowledge.family_hints[0]?.family);
  if (chosenFamily) {
    const familyObject = bookingKnowledge.family_objects.find((family) => normalizeLowerString(family.family) === chosenFamily);
    if (familyObject) {
      return {
        kind: "family" as const,
        family: chosenFamily,
        label: staffTopicLabelForFamily(chosenFamily),
        staff: uniqueStrings(familyObject.child_services.flatMap((service) => service.staff)),
      };
    }
  }

  return null;
}

function assessNamedStaffCompatibility(
  state: StructuredBookingState,
  bookingRequest: BookingRequestDraft,
  bookingKnowledge: BookingKnowledgeContext | undefined,
  sourceText = "",
) {
  const stylistPreference = normalizeString(state.stylist_preference);
  if (!stylistPreference || normalizeLowerString(stylistPreference) === "any") return null;

  const target = resolveStaffKnowledgeTarget(state, bookingRequest, bookingKnowledge, sourceText);
  if (!target || !target.staff.length) return null;

  const needle = normalizePersonName(stylistPreference);
  const matchedName = target.staff.find((name) => {
    const normalized = normalizePersonName(name);
    return normalized === needle || normalized.includes(needle) || needle.includes(normalized);
  }) || null;

  return {
    stylistPreference,
    targetLabel: target.label,
    eligibleStaff: target.staff,
    status: matchedName ? "eligible" as const : "ineligible" as const,
    matchedName,
  };
}

function buildStaffCompatibilityReply(input: {
  state: StructuredBookingState;
  compatibility: NonNullable<ReturnType<typeof assessNamedStaffCompatibility>>;
  hasFamilyDecisionQuestion: boolean;
  explicitQuestion: boolean;
}) {
  const serviceSummary = describeRequestedServices(input.state);
  const serviceLabel = serviceSummary || input.compatibility.targetLabel;
  const stylistName = input.compatibility.matchedName || input.compatibility.stylistPreference;
  if (input.compatibility.status === "eligible") {
    if (input.explicitQuestion && input.hasFamilyDecisionQuestion) {
      return `Yes, ${stylistName} does ${serviceLabel} here. ${buildServiceDetailsReply(input.state)}`;
    }
    return input.explicitQuestion
      ? `Yes, ${stylistName} does ${serviceLabel} here. If you want, I can check timing with ${stylistName}.`
      : "";
  }

  const alternatives = formatNaturalList(
    input.compatibility.eligibleStaff
      .filter((name) => normalizePersonName(name) !== normalizePersonName(input.compatibility.stylistPreference))
      .slice(0, 4),
  );
  return alternatives
    ? `I’m not seeing ${input.compatibility.stylistPreference} on ${serviceLabel} here. I can check ${alternatives}, or anyone on the team if you want.`
    : `I’m not seeing ${input.compatibility.stylistPreference} on ${serviceLabel} here. If you want, I can check who on the team does that service.`;
}

function buildStaffRecommendationReply(
  state: StructuredBookingState,
  bookingRequest: BookingRequestDraft,
  bookingKnowledge: BookingKnowledgeContext | undefined,
  hasFamilyDecisionQuestion: boolean,
  sourceText = "",
) {
  const target = resolveStaffKnowledgeTarget(state, bookingRequest, bookingKnowledge, sourceText);
  if (!target || !target.staff.length) {
    return state.requested_services.length || state.service_stack.length
      ? "I can help with that. I just need to narrow the service a little more first so I point you to the right stylist."
      : "I can help with that. Are you thinking color, haircut, extensions, or something else?";
  }

  const names = formatNaturalList(target.staff.slice(0, 6));
  if (hasFamilyDecisionQuestion) {
    return `For ${target.label} here, the stylists on the team who perform it are ${names}. ${buildServiceDetailsReply(state)}`;
  }
  return `For ${target.label} here, the stylists on the team who perform it are ${names}. If you want, I can help you pick timing from there.`;
}

function serviceTermsForLabel(label: string) {
  const lower = normalizeLowerString(label);
  switch (lower) {
    case "dimensional color":
      return [];
    case "face frame":
      return ["face frame", "money piece", "dimensional", "color"];
    case "partial highlight":
      return ["partial highlight", "partial highlights", "top and face", "dimensional", "color"];
    case "full highlight":
      return ["full highlight", "full highlights", "full head", "lengths", "dimensional", "color"];
    case "root touch-up":
      return ["root touch-up", "touch up", "single process", "root", "gray coverage", "color"];
    case "single process":
      return ["single process", "root touch-up", "gray coverage", "color"];
    case "gloss":
      return ["gloss", "glaze", "toner", "color"];
    case "glaze":
      return ["glaze", "gloss", "toner", "color"];
    case "toner":
      return ["toner", "gloss", "glaze", "color"];
    case "haircut":
      return ["haircut", "cut", "trim"];
    case "blowout":
      return ["blowout", "blow dry", "blowdry"];
    case "consultation":
      return ["consultation", "consult"];
    case "extensions":
      return ["extension", "extensions"];
    case "extensions maintenance":
      return ["maintenance", "weft", "hand tied", "extension"];
    case "extensions consultation":
      return ["extension consultation", "extensions consultation"];
    case "color correction consultation":
      return ["color consultation", "consultation", "color correction"];
    case "treatment":
      return ["treatment", "keratin", "mask"];
    default:
      return [lower];
  }
}

function curatedRuleForLabel(label: string) {
  const canonical = canonicalizeRequestedServiceLabel(label);
  return CURATED_SERVICE_RULES.find((rule) => rule.canonical_label === canonical) || null;
}

function hasDimensionalColorIntent(state: StructuredBookingState, contextText: string) {
  const labels = [
    ...state.service_stack.map((item) => normalizeLowerString(item)),
    ...state.requested_services.map((item) => normalizeLowerString(item.label)),
  ];
  if (labels.some((label) => ["dimensional color", "face frame", "partial highlight", "full highlight"].includes(label))) {
    return true;
  }
  return /\bhighlight|highlights|balayage|money piece|face frame|dimensional|go lighter|blonder|brightness\b/i.test(contextText);
}

function inferDimensionalPlacementLabel(contextText: string) {
  const lower = normalizeLowerString(contextText);
  if (!lower) return null;
  if (/\bface frame\b|\bmoney piece\b|\baround my face\b|\bfront pieces?\b|\bbrighten(?:\s+up)?\s+the\s+front\b|\blighter\s+in\s+the\s+front\b|\bjust\s+the\s+front\b/.test(lower)) {
    return "Face Frame";
  }
  if (/\bpartial highlights?\b|\bpartial highlight\b|\btop\s*(?:\+|and)\s*face\b|\bcrown\b/.test(lower)) {
    return "Partial Highlight";
  }
  if (/\bfull highlights?\b|\bfull head\b|\btop\s*(?:\+|and)\s*face\s*(?:\+|and)\s*lengths\b|\bthrough(?:out)? the lengths\b|\ball over\b|\bends\b|\blived[- ]?in\b/.test(lower)) {
    return "Full Highlight";
  }
  return null;
}

function applyGuidedDimensionalColorRules(state: StructuredBookingState, contextText: string) {
  const next: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    missing_required_info: state.missing_required_info.slice(),
  };
  if (!hasDimensionalColorIntent(next, contextText)) {
    return assertedBookingState(next);
  }

  const placementLabel = inferDimensionalPlacementLabel(contextText);
  const normalizedRequested = next.requested_services.map((item) => normalizeLowerString(item.label));
  const hadDimensionalGeneric = normalizedRequested.includes("dimensional color");

  if (placementLabel) {
    next.requested_services = mergeRequestedServices(
      next.requested_services.filter((item) => !["dimensional color", "color", "face frame", "partial highlight", "full highlight"].includes(normalizeLowerString(item.label))),
      [{ label: placementLabel, family: "color", confidence: 0.9, notes: "Placement inferred from guided dimensional color language." }],
    );
    next.service_stack = normalizeServiceStack(
      next.service_stack
        .filter((item) => !["dimensional color", "color", "face frame", "partial highlight", "full highlight"].includes(normalizeLowerString(item)))
        .concat([placementLabel]),
      next.requested_services,
    );
    next.missing_required_info = next.missing_required_info.filter((item) => {
      const lower = normalizeLowerString(item);
      return lower !== "service_details" && lower !== "service";
    });
    return assertedBookingState(next);
  }

  if (!hadDimensionalGeneric) {
    next.requested_services = mergeRequestedServices(next.requested_services, [
      {
        label: "Dimensional color",
        family: "color",
        confidence: 0.8,
        notes: "Balayage/highlight language needs placement clarified before choosing the dimensional color service.",
      },
    ]);
  }
  next.service_stack = normalizeServiceStack(
    uniqueStrings([
      ...next.service_stack.filter((item) => !["color", "face frame", "partial highlight", "full highlight"].includes(normalizeLowerString(item))),
      "Dimensional color",
    ]),
    next.requested_services,
  );
  next.ready_to_search_availability = false;
  next.missing_required_info = normalizeMissingInfoSet([...next.missing_required_info, "service_details"]);
  return assertedBookingState(next);
}

function syncDimensionalPlacementFromStack(state: StructuredBookingState) {
  const next: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    missing_required_info: state.missing_required_info.slice(),
  };
  const stackLabels = next.service_stack.map((item) => normalizeLowerString(item));
  const placementLabel = stackLabels.includes("face frame")
    ? "Face Frame"
    : stackLabels.includes("partial highlight")
      ? "Partial Highlight"
      : stackLabels.includes("full highlight")
        ? "Full Highlight"
        : null;

  if (!placementLabel) {
    return assertedBookingState(next);
  }

  next.requested_services = mergeRequestedServices(
    next.requested_services.filter((item) => !["dimensional color", "color", "face frame", "partial highlight", "full highlight"].includes(normalizeLowerString(item.label))),
    [{
      label: placementLabel,
      family: "color",
      confidence: 0.95,
      notes: "Specific dimensional color placement synchronized from the resolved service stack.",
    }],
  );
  next.service_stack = normalizeServiceStack(
    next.service_stack.filter((item) => !["dimensional color", "color"].includes(normalizeLowerString(item))),
    next.requested_services,
  );
  next.missing_required_info = next.missing_required_info.filter((item) => {
    const lower = normalizeLowerString(item);
    return lower !== "service_details" && lower !== "service";
  });
  return assertedBookingState(next);
}

function normalizeUncertainHighlightIntent(state: StructuredBookingState, contextText = "") {
  const next: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    missing_required_info: state.missing_required_info.slice(),
  };
  const lower = normalizeLowerString(contextText);
  const explicitlyUncertainPlacement =
    /\bpartials?\s+or\s+full\b/.test(lower) ||
    /\bpartial\s+or\s+full\b/.test(lower) ||
    /\bnot sure if\s+partial\s+or\s+full\b/.test(lower) ||
    /\bmaybe\s+partials?\s+or\s+full\b/.test(lower);
  if (!explicitlyUncertainPlacement) {
    return assertedBookingState(next);
  }

  const hasHighlightIntent =
    next.requested_services.some((item) =>
      ["partial highlight", "full highlight", "dimensional color"].includes(normalizeLowerString(item.label))
    ) ||
    next.service_stack.some((item) =>
      ["partial highlight", "full highlight", "dimensional color"].includes(normalizeLowerString(item))
    );
  if (!hasHighlightIntent) {
    return assertedBookingState(next);
  }

  next.requested_services = mergeRequestedServices(
    next.requested_services.filter((item) =>
      !["partial highlight", "full highlight", "dimensional color", "color"].includes(normalizeLowerString(item.label))
    ),
    [{
      label: "Dimensional color",
      family: "color",
      confidence: 0.8,
      notes: "Client is deciding between partial and full highlights and needs placement clarified.",
    }],
  );
  next.service_stack = normalizeServiceStack(
    uniqueStrings([
      ...next.service_stack.filter((item) =>
        !["partial highlight", "full highlight", "dimensional color", "color"].includes(normalizeLowerString(item))
      ),
      "Dimensional color",
    ]),
    next.requested_services,
  );
  next.ready_to_search_availability = false;
  next.missing_required_info = normalizeMissingInfoSet([...next.missing_required_info, "service_details"]);
  return assertedBookingState(next);
}

function normalizeBlondeRefreshAmbiguity(state: StructuredBookingState, contextText = "") {
  const next: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    service_modifiers: state.service_modifiers.slice(),
    missing_required_info: state.missing_required_info.slice(),
  };
  const alreadyAdvancedToPlacement =
    next.decision_question_key === "dimensional_placement" ||
    next.requested_services.some((item) =>
      normalizeLowerString(item.label) === "dimensional color" &&
      normalizeLowerString(item.notes || "").includes("gloss_vs_brightness:soft_brightness")
    );
  if (alreadyAdvancedToPlacement) {
    return assertedBookingState(next);
  }
  const lower = normalizeLowerString(contextText);
  const hasBlondeRefreshCue =
    /\brefresh my blonde\b/.test(lower) ||
    /\bnot too blonde\b/.test(lower) ||
    /\bjust a little brighter\b/.test(lower) ||
    /\ba little brighter\b/.test(lower) ||
    /\btone it down\b/.test(lower) ||
    /\bsoft dimension\b/.test(lower) ||
    /\bstay pretty natural\b/.test(lower) ||
    /\bstay natural\b/.test(lower);
  if (!hasBlondeRefreshCue) {
    return assertedBookingState(next);
  }

  const hasColorRefreshIntent =
    /\brefresh my blonde\b|\bnot too blonde\b|\bjust a little brighter\b|\ba little brighter\b|\btone it down\b|\bsoft dimension\b|\bstay pretty natural\b|\bstay natural\b/.test(lower) ||
    next.requested_services.some((item) =>
      ["dimensional color", "face frame", "partial highlight", "full highlight", "gloss", "glaze", "toner"].includes(normalizeLowerString(item.label))
    ) ||
    next.service_stack.some((item) =>
      ["dimensional color", "face frame", "partial highlight", "full highlight", "gloss", "glaze", "toner"].includes(normalizeLowerString(item))
    );
  if (!hasColorRefreshIntent) {
    return assertedBookingState(next);
  }

  next.requested_services = mergeRequestedServices(
    next.requested_services.filter((item) =>
      !["partial highlight", "full highlight", "face frame", "dimensional color", "gloss", "glaze", "toner", "color"].includes(normalizeLowerString(item.label))
    ),
    [{
      label: "Dimensional color",
      family: "color",
      confidence: 0.75,
      notes: "Client wants a subtle blonde refresh and needs clarification between tone refresh and soft brightness.",
    }],
  );
  next.service_stack = normalizeServiceStack(
    uniqueStrings([
      ...next.service_stack.filter((item) =>
        !["partial highlight", "full highlight", "face frame", "dimensional color", "gloss", "glaze", "toner", "color"].includes(normalizeLowerString(item))
      ),
      "Dimensional color",
    ]),
    next.requested_services,
  );
  if (!next.service_modifiers.some((item) => normalizeLowerString(item) === "maintaining current look")) {
    next.service_modifiers.push("Maintaining current look");
  }
  next.ready_to_search_availability = false;
  next.missing_required_info = normalizeMissingInfoSet([...next.missing_required_info, "service_details"]);
  return assertedBookingState(next);
}

function enforceAiServiceDecisionGuardrails(state: StructuredBookingState, contextText = "") {
  const next: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    service_modifiers: state.service_modifiers.slice(),
    known_constraints: state.known_constraints.slice(),
    missing_required_info: state.missing_required_info.slice(),
  };
  const lower = normalizeLowerString(contextText);
  if (!lower) return assertedBookingState(next);

  const hasServicesAlready = next.requested_services.length > 0 || next.service_stack.length > 0;
  if (!hasServicesAlready) {
    if (/\bsame as last time\b|\bwhat i got last time\b|\bwhat i had last time\b|\bsame thing as last time\b|\blast visit\b/.test(lower)) {
      next.known_constraints = uniqueStrings([...next.known_constraints, "prior_visit_reference"]);
    }
    if (/\bmy friend sees\b|\bmy friend goes to\b/.test(lower)) {
      next.known_constraints = uniqueStrings([...next.known_constraints, "friend_stylist_reference"]);
    }
    if (
      /\blow maintenance\b|\blow-maintenance\b|\blow maint\b|\blow maintenence\b|\blow-maintainance\b|\blow-maintenence\b|\blow maintanence\b/.test(lower)
    ) {
      next.known_constraints = uniqueStrings([...next.known_constraints, "low_maintenance_goal", "consult_candidate"]);
    }
    if (
      /\bi don't know what i need\b|\bnot sure what i need\b|\bnot sure what to book\b|\bwhatever you think\b|\bhealthiest\b|\bhealthy\b|\bbig change\b|\bmajor change\b|\bcolor correction\b|\bbox dye\b/.test(lower)
    ) {
      next.known_constraints = uniqueStrings([...next.known_constraints, "consult_candidate"]);
    }
    if (/\bextensions need help\b|\bmy extensions need help\b/.test(lower)) {
      next.known_constraints = uniqueStrings([...next.known_constraints, "consult_candidate"]);
      next.requested_services = mergeRequestedServices(next.requested_services, [
        {
          label: "Extensions",
          family: "extensions",
          confidence: 0.8,
          notes: "Extensions-help language should start with a consultation or maintenance triage.",
        },
      ]);
      next.service_stack = normalizeServiceStack([...next.service_stack, "Extensions"], next.requested_services);
      next.service_family = "extensions";
      next.service_family_confidence = Math.max(next.service_family_confidence || 0, 0.8);
      next.service_candidate = null;
      next.service_candidate_confidence = null;
      next.needs_service_decision = false;
      next.decision_question_key = null;
      next.ready_to_search_availability = false;
    }
  }

  const hasSpecificService = hasSpecificServiceDetails(next.requested_services, next.service_stack) || !!normalizeString(next.service_candidate);
  const hasBlowoutCue = /\bblowout\b|\bblow dry\b|\bblowdry\b|\bclassic blowout\b|\bsignature blowout\b/.test(lower);
  const hasHaircutCue = /\bhaircut\b|\btrim\b|\bcut\b|\blayers\b|\breshape\b|\bdusting\b/.test(lower);
  const inferredDimensionalPlacement = inferDimensionalPlacementLabel(lower);
  const hasExplicitSpecificDimensionalCue =
    !!inferredDimensionalPlacement;
  const lowMaintenanceColorFollowup =
    next.known_constraints.some((item) => normalizeLowerString(item) === "low_maintenance_goal") &&
    /\bcolor\b/.test(lower) &&
    !hasHaircutCue;
  const hasBroadHighlightLanguage = /\bhighlight|highlights|balayage|money piece|face frame|dimensional|blonder|brightness\b/.test(lower);
  const hasBlondeRefreshCue =
    /\brefresh my blonde\b/.test(lower) ||
    /\ba little brighter\b/.test(lower) ||
    /\bjust a little brighter\b/.test(lower) ||
    /\bsoft dimension\b/.test(lower) ||
    /\bnot too blonde\b/.test(lower) ||
    /\btone it down\b/.test(lower) ||
    /\bstay natural\b/.test(lower);
  const hasTouchUpCue = /\btouch[ -]?up\b|\bretouch\b|\broot retouch\b/.test(lower);
  const hasExplicitGrayCoverageScope = /\broots?\b|\bgray\b|\bgrey\b|\bsingle process\b|\ball[- ]over refresh\b|\ball over refresh\b|\bbase refresh\b/.test(lower);

  if (hasBlondeRefreshCue) {
    next.requested_services = mergeRequestedServices(
      next.requested_services.filter((item) =>
        !["gloss", "dimensional color", "face frame", "partial highlight", "full highlight", "color"].includes(normalizeLowerString(item.label))
      ),
      [{
        label: "Dimensional color",
        family: "color",
        confidence: 0.8,
        notes: "Blonde refresh language needs clarification between tone refresh and added brightness.",
      }],
    );
    next.service_stack = normalizeServiceStack(["Dimensional color"], next.requested_services);
    next.service_family = "dimensional_color";
    next.service_family_confidence = Math.max(next.service_family_confidence || 0, 0.8);
    next.service_candidate = null;
    next.service_candidate_confidence = null;
    next.needs_service_decision = true;
    next.decision_question_key = "gloss_vs_brightness";
    next.known_constraints = uniqueStrings([...next.known_constraints.filter((item) => normalizeLowerString(item) !== "blonde_refresh_ambiguity"), "blonde_refresh_ambiguity"]);
    next.ready_to_search_availability = false;
    next.missing_required_info = normalizeMissingInfoSet([...next.missing_required_info, "service_details"]);
    return assertedBookingState(next);
  }

  if (hasTouchUpCue && !hasExplicitGrayCoverageScope) {
    next.requested_services = mergeRequestedServices(
      next.requested_services.filter((item) => !["root touch-up", "single process", "color"].includes(normalizeLowerString(item.label))),
      [{
        label: "Root touch-up",
        family: "gray_coverage",
        confidence: 0.7,
        notes: "Touch-up language needs clarification between roots/gray coverage and all-over refresh.",
      }],
    );
    next.service_stack = normalizeServiceStack(["Root touch-up"], next.requested_services);
    next.service_family = "gray_coverage";
    next.service_family_confidence = Math.max(next.service_family_confidence || 0, 0.68);
    next.service_candidate = null;
    next.service_candidate_confidence = null;
    next.needs_service_decision = true;
    next.decision_question_key = "gray_coverage_scope";
    next.known_constraints = uniqueStrings([...next.known_constraints.filter((item) => normalizeLowerString(item) !== "touch_up_ambiguity"), "touch_up_ambiguity"]);
    next.ready_to_search_availability = false;
    next.missing_required_info = normalizeMissingInfoSet([...next.missing_required_info, "service_details"]);
    return assertedBookingState(next);
  }

  if (lowMaintenanceColorFollowup) {
    next.requested_services = mergeRequestedServices(
      next.requested_services.filter((item) => normalizeLowerString(item.label) !== "haircut"),
      [{
        label: "Color",
        family: "color",
        confidence: 0.7,
        notes: "Low-maintenance advisory color request needs narrowing before choosing the exact color service.",
      }],
    );
    next.service_stack = normalizeServiceStack(
      next.service_stack.filter((item) => normalizeLowerString(item) !== "haircut").concat(["Color"]),
      next.requested_services,
    );
    next.service_family = "color";
    next.service_family_confidence = Math.max(next.service_family_confidence || 0, 0.7);
    next.service_candidate = null;
    next.service_candidate_confidence = null;
    next.needs_service_decision = true;
    next.decision_question_key = "consultation_entry";
    next.ready_to_search_availability = false;
    next.missing_required_info = normalizeMissingInfoSet(
      next.missing_required_info.filter((item) => {
        const normalized = normalizeLowerString(item);
        return normalized !== "service" && normalized !== "haircut_scope" && normalized !== "haircut_type_(trim_or_bigger_change)";
      }).concat(["service_details"]),
    );
    return assertedBookingState(next);
  }

  if (hasBlowoutCue && !hasSpecificService) {
    next.requested_services = mergeRequestedServices(
      next.requested_services.filter((item) => normalizeLowerString(item.label) !== "blowout"),
      [{
        label: "Blowout",
        family: "blowout",
        confidence: 0.9,
        notes: "Direct blowout language should stay anchored to Blowout.",
      }],
    );
    next.service_stack = normalizeServiceStack(uniqueStrings([...next.service_stack, "Blowout"]), next.requested_services);
    next.service_family = "blowout";
    next.service_family_confidence = Math.max(next.service_family_confidence || 0, 0.9);
    next.service_candidate = "Blowout";
    next.service_candidate_confidence = Math.max(next.service_candidate_confidence || 0, 0.9);
    next.needs_service_decision = false;
    next.decision_question_key = null;
    next.missing_required_info = normalizeMissingInfoSet(
      next.missing_required_info.filter((item) => {
        const normalized = normalizeLowerString(item);
        return normalized !== "service" && normalized !== "service_details";
      }),
    );
  }

  if (hasHaircutCue && !hasSpecificService && !hasBlowoutCue && !hasBroadHighlightLanguage && !hasTouchUpCue && !hasBlondeRefreshCue) {
    next.requested_services = mergeRequestedServices(
      next.requested_services.filter((item) => normalizeLowerString(item.label) !== "haircut"),
      [{
        label: "Haircut",
        family: "haircut",
        confidence: 0.85,
        notes: "Direct haircut language should stay anchored to Haircut.",
      }],
    );
    next.service_stack = normalizeServiceStack(uniqueStrings([...next.service_stack, "Haircut"]), next.requested_services);
    next.service_family = "haircut";
    next.service_family_confidence = Math.max(next.service_family_confidence || 0, 0.85);
    next.service_candidate = "Haircut";
    next.service_candidate_confidence = Math.max(next.service_candidate_confidence || 0, 0.85);
    next.needs_service_decision = false;
    next.decision_question_key = null;
    next.missing_required_info = normalizeMissingInfoSet(
      next.missing_required_info.filter((item) => {
        const normalized = normalizeLowerString(item);
        return normalized !== "service" && normalized !== "service_details";
      }),
    );
  }

  if (hasExplicitSpecificDimensionalCue) {
    const specificLabel = inferredDimensionalPlacement;
    if (specificLabel) {
      const confidence = /\bmaybe\b/.test(lower) ? 0.72 : 0.95;
      next.requested_services = mergeRequestedServices(
        next.requested_services.filter((item) =>
          !["dimensional color", "face frame", "partial highlight", "full highlight", "color"].includes(normalizeLowerString(item.label))
        ),
        [{
          label: specificLabel,
          family: "color",
          confidence,
          notes: /\bmaybe\b/.test(lower)
            ? "Client named a specific dimensional service but sounded slightly tentative."
            : "Client named a specific dimensional service.",
        }],
      );
      next.service_stack = normalizeServiceStack(
        next.service_stack
          .filter((item) => !["dimensional color", "face frame", "partial highlight", "full highlight", "color"].includes(normalizeLowerString(item)))
          .concat([specificLabel]),
        next.requested_services,
      );
      next.service_family = "dimensional_color";
      next.service_family_confidence = Math.max(next.service_family_confidence || 0, confidence);
      next.service_candidate = specificLabel;
      next.service_candidate_confidence = Math.max(next.service_candidate_confidence || 0, confidence);
      next.needs_service_decision = false;
      next.decision_question_key = null;
      next.missing_required_info = normalizeMissingInfoSet(
        next.missing_required_info.filter((item) => {
          const normalized = normalizeLowerString(item);
          return normalized !== "service" && normalized !== "service_details";
        }),
      );
      return assertedBookingState(next);
    }
  }

  if (hasBroadHighlightLanguage && !hasSpecificService) {
    next.requested_services = mergeRequestedServices(
      next.requested_services.filter((item) =>
        !["gloss", "color", "dimensional color", "face frame", "partial highlight", "full highlight"].includes(normalizeLowerString(item.label))
      ),
      [{
        label: "Dimensional color",
        family: "color",
        confidence: 0.8,
        notes: "Broad highlight language needs dimensional placement clarified before choosing the exact service.",
      }],
    );
    next.service_stack = normalizeServiceStack(["Dimensional color"], next.requested_services);
    next.service_family = "dimensional_color";
    next.service_family_confidence = Math.max(next.service_family_confidence || 0, 0.8);
    next.service_candidate = null;
    next.service_candidate_confidence = null;
    next.needs_service_decision = true;
    next.decision_question_key = "dimensional_placement";
    next.ready_to_search_availability = false;
    next.missing_required_info = normalizeMissingInfoSet([...next.missing_required_info, "service_details"]);
  }

  return assertedBookingState(next);
}

function normalizeStandaloneGlossIntent(state: StructuredBookingState, contextText = "") {
  const next: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
  };
  const lower = normalizeLowerString(contextText);
  const hasGlossSignal = /\bgloss\b|\bglaze\b|\btoner\b/.test(lower);
  const hasRootSignal = /\broots?\b|\broot touch[- ]?up\b|\bgray coverage\b|\bsingle process\b/.test(lower);
  if (!hasGlossSignal || hasRootSignal) {
    return assertedBookingState(next);
  }

  const hasRootTouchupInState =
    next.requested_services.some((item) => ["root touch-up", "single process"].includes(normalizeLowerString(item.label))) ||
    next.service_stack.some((item) => ["root touch-up", "single process"].includes(normalizeLowerString(item)));
  if (!hasRootTouchupInState) {
    return assertedBookingState(next);
  }

  next.requested_services = mergeRequestedServices(
    next.requested_services.filter((item) => !["root touch-up", "single process", "color"].includes(normalizeLowerString(item.label))),
    [{
      label: "Gloss",
      family: "color",
      confidence: 0.9,
      notes: "Gloss/glaze/toner requested without roots or gray coverage.",
    }],
  );
  next.service_stack = normalizeServiceStack(
    uniqueStrings([
      ...next.service_stack.filter((item) => !["root touch-up", "single process", "color"].includes(normalizeLowerString(item))),
      "Gloss",
    ]),
    next.requested_services,
  );
  return assertedBookingState(next);
}

function normalizeColorAddOnComposition(state: StructuredBookingState, contextText = "") {
  const next: StructuredBookingState = {
    ...state,
    requested_services: state.requested_services.map((item) => ({ ...item })),
    service_stack: state.service_stack.slice(),
    service_modifiers: state.service_modifiers.slice(),
  };

  const labels = next.requested_services.map((item) => normalizeLowerString(item.label));
  const stackLabels = next.service_stack.map((item) => normalizeLowerString(item));
  const contextLower = normalizeLowerString(contextText);
  const hasPrimaryColorService =
    labels.some((label) => COLOR_PRIMARY_SERVICE_LABELS.has(label)) ||
    stackLabels.some((label) => COLOR_PRIMARY_SERVICE_LABELS.has(label));
  const hasSingleProcessColorService =
    labels.some((label) => ["root touch-up", "single process"].includes(label)) ||
    stackLabels.some((label) => ["root touch-up", "single process"].includes(label));
  const hasDimensionalColorService =
    labels.some((label) => ["dimensional color", "face frame", "partial highlight", "full highlight"].includes(label)) ||
    stackLabels.some((label) => ["dimensional color", "face frame", "partial highlight", "full highlight"].includes(label));
  const hasStandaloneGlossSignal =
    labels.some((label) => ["gloss", "glaze", "toner"].includes(label)) ||
    stackLabels.some((label) => ["gloss", "glaze", "toner"].includes(label)) ||
    /\bgloss\b|\bglaze\b|\btoner\b/.test(contextLower);

  if (!hasPrimaryColorService || !hasStandaloneGlossSignal) {
    return assertedBookingState(next);
  }

  next.requested_services = next.requested_services.filter((item) => !["gloss", "glaze", "toner"].includes(normalizeLowerString(item.label)));
  next.service_stack = next.service_stack.filter((item) => !["gloss", "glaze", "toner"].includes(normalizeLowerString(item)));
  if (hasSingleProcessColorService) {
    next.service_modifiers = uniqueStrings([...next.service_modifiers, "Glaze/Gloss"]);
  } else if (
    hasDimensionalColorService &&
    (
      labels.some((label) => ["face frame", "partial highlight", "full highlight"].includes(label)) ||
      stackLabels.some((label) => ["face frame", "partial highlight", "full highlight"].includes(label))
    )
  ) {
    next.service_modifiers = uniqueStrings([...next.service_modifiers, "Glaze/Gloss"]);
  }
  return assertedBookingState(next);
}

function normalizeServiceModifiersForGuidedBooking(state: StructuredBookingState) {
  const next: StructuredBookingState = {
    ...state,
    service_modifiers: state.service_modifiers.slice(),
  };
  const allowed = allowedGuidedModifiersForState(next);
  if (!allowed.size) {
    next.service_modifiers = next.service_modifiers
      .map((value) => normalizeGuidedModifierName(value))
      .filter((value) => !["Glaze/Gloss"].includes(value));
    return assertedBookingState(next);
  }

  const normalizedModifiers = next.service_modifiers
    .map((value) => normalizeGuidedModifierName(value))
    .filter(Boolean);

  next.service_modifiers = uniqueStrings(
    normalizedModifiers.filter((value) => allowed.has(value) || value === "Glaze/Gloss"),
  ).filter((value) => allowed.has(value));
    return assertedBookingState(next);
}

function applyHardStateGuardrails(state: StructuredBookingState, unresolvedLabels: string[]) {
  const next: StructuredBookingState = {
    ...state,
    missing_required_info: state.missing_required_info.slice(),
  };
  const unresolved = unresolvedLabels.map((value) => normalizeLowerString(value));

  if (unresolved.length) {
    next.ready_to_search_availability = false;
  }
  if (unresolved.some((label) => ["dimensional color", "face frame", "partial highlight", "full highlight"].includes(label))) {
    next.missing_required_info = uniqueStrings([...next.missing_required_info, "service_details"]);
  }

  return assertedBookingState(next);
}

function buildDimensionalPlacementReply(state: StructuredBookingState) {
  const hasGrayCoverage = state.requested_services.some((item) => normalizeLowerString(item.label) === "root touch-up");
  if (state.intent === "pricing_question") {
    return "Pricing depends on how much brightness you want. Do you want it mostly around your face, through the top and face, or all the way through the lengths?";
  }
  if (hasGrayCoverage) {
    return "Got it. For the brightness part, do you want to see it mostly around your face, through the top and face, or all the way through the lengths?";
  }
  return "Got it. Where do you want to see the lightness most: around your face, through the top and face, or all the way through the lengths?";
}

function buildBlondeRefreshReply() {
  return "I can help with that. Are you mostly looking to refresh the tone with a gloss, or do you want a little brightness too, like around the face or through the top?";
}

function buildGrayCoverageDecisionReply() {
  return "I can help with that. Is this more about covering roots or gray, or are you looking for more of an all-over color refresh?";
}

function buildServiceDetailsReply(state: StructuredBookingState) {
  if (state.decision_question_key === "dimensional_placement") {
    return buildDimensionalPlacementReply(state);
  }
  if (state.decision_question_key === "gloss_vs_brightness") {
    return buildBlondeRefreshReply();
  }
  if (state.decision_question_key === "gray_coverage_scope") {
    return buildGrayCoverageDecisionReply();
  }
  if (
    state.decision_question_key === "consultation_entry" &&
    normalizeLowerString(state.service_family || "") === "color" &&
    state.known_constraints.some((item) => normalizeLowerString(item) === "low_maintenance_goal")
  ) {
    return "I can help with that. If low-maintenance color is the goal, are you thinking root coverage, a gloss refresh, or a little soft brightness?";
  }
  const constraints = new Set(state.known_constraints.map((item) => normalizeLowerString(item)));
  if (constraints.has("blonde_refresh_ambiguity")) {
    return buildBlondeRefreshReply();
  }
  if (constraints.has("touch_up_ambiguity")) {
    return buildGrayCoverageDecisionReply();
  }
  return buildDimensionalPlacementReply(state);
}

function hasOutstandingBlondeRefreshAmbiguity(
  state: StructuredBookingState,
  bookingRequest: BookingRequestDraft,
) {
  const constraints = new Set(state.known_constraints.map((item) => normalizeLowerString(item)));
  if (!constraints.has("blonde_refresh_ambiguity")) return false;
  if (hasRequestedServiceLabel(state, ["Face Frame", "Partial Highlight", "Full Highlight"])) {
    return false;
  }
  if (normalizeLowerString(state.service_family) === "dimensional_color" && state.needs_service_decision) {
    return true;
  }
  const hasDimensionalIntent =
    hasRequestedServiceLabel(state, ["Dimensional color", "Face Frame", "Partial Highlight", "Full Highlight", "Gloss"]) ||
    bookingRequest.unresolved_service_labels.some((label) =>
      ["dimensional color", "face frame", "partial highlight", "full highlight", "gloss"].includes(normalizeLowerString(label))
    );
  return hasDimensionalIntent;
}

function hasOutstandingFamilyDecisionQuestion(
  state: StructuredBookingState,
  bookingRequest: BookingRequestDraft,
) {
  if (hasOutstandingBlondeRefreshAmbiguity(state, bookingRequest)) {
    return true;
  }
  const constraints = new Set(state.known_constraints.map((item) => normalizeLowerString(item)));
  if (constraints.has("touch_up_ambiguity")) {
    if (normalizeLowerString(state.service_family) === "gray_coverage" && state.needs_service_decision) {
      return true;
    }
    const hasGrayCoverageIntent =
      hasRequestedServiceLabel(state, ["Root touch-up", "Single Process"]) ||
      bookingRequest.unresolved_service_labels.some((label) =>
        ["root touch-up", "single process"].includes(normalizeLowerString(label))
      );
    if (hasGrayCoverageIntent) return true;
  }
  const hasGenericDimensionalIntent =
    hasRequestedServiceLabel(state, ["Dimensional color"]) &&
    !hasRequestedServiceLabel(state, ["Face Frame", "Partial Highlight", "Full Highlight"]);
  if (hasGenericDimensionalIntent) {
    return true;
  }
  return false;
}

function rankCatalogMatch(label: string, service: BoulevardCatalogService) {
  const requested = normalizeLowerString(label);
  const name = normalizeLowerString(service.name);
  const category = normalizeLowerString(service.category);
  const terms = serviceTermsForLabel(label);
  const curatedRule = curatedRuleForLabel(label);
  const curatedIndex = curatedRule
    ? curatedRule.preferred_service_names.findIndex((serviceName) => normalizeLowerString(serviceName) === name)
    : -1;

  let score = 0;
  let reason = "";
  if (curatedIndex >= 0) {
    score = 120 - curatedIndex;
    reason = "curated_exact";
  } else if (curatedRule?.preferred_service_names.some((serviceName) => name.includes(normalizeLowerString(serviceName)))) {
    score = 112;
    reason = "curated_contains";
  } else if (name === requested) {
    score = 100;
    reason = "exact_name";
  } else if (terms.some((term) => name === term)) {
    score = 95;
    reason = "exact_synonym";
  } else if (terms.some((term) => name.includes(term))) {
    score = 88;
    reason = "name_contains_term";
  } else if (terms.some((term) => term.includes(name))) {
    score = 82;
    reason = "term_contains_name";
  }

  if (requested.includes("highlight") && category.includes("highlight")) {
    score += 4;
    reason = reason || "highlight_category";
  }
  if ((requested === "gloss" || requested === "glaze" || requested === "toner") && category.includes("gloss")) {
    score += 4;
    reason = reason || "gloss_category";
  }
  if (requested === "haircut" && category.includes("cut")) {
    score += 4;
    reason = reason || "cut_category";
  }
  if (requested === "blowout" && (category.includes("blow") || category.includes("style"))) {
    score += 4;
    reason = reason || "blowout_category";
  }
  if (requested === "balayage" && category.includes("balayage")) {
    score += 4;
    reason = reason || "balayage_category";
  }

  return { score, reason };
}

async function resolveBoulevardServiceStack(state: StructuredBookingState) {
  if (!BOULEVARD_BOOKING_PROXY_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return { resolved: [] as ResolvedBoulevardService[], unresolved: uniqueStrings(state.service_stack.slice()) };
  }

  const catalog = await fetchActiveBoulevardCatalogServices();
  const desiredLabels = uniqueStrings([
    ...state.service_stack,
    ...state.requested_services.map((item) => normalizeString(item.label)),
  ]).filter((label, _index, all) => {
    const lower = normalizeLowerString(label);
    const hasSpecificDimensionalPlacement = all.some((value) =>
      ["face frame", "partial highlight", "full highlight"].includes(normalizeLowerString(value))
    );
    if (lower === "color" && all.some((value) =>
      ["dimensional color", "face frame", "partial highlight", "full highlight", "root touch-up", "gloss"].includes(normalizeLowerString(value))
    )) {
      return false;
    }
    if (lower === "dimensional color" && hasSpecificDimensionalPlacement) {
      return false;
    }
    return true;
  });

  const resolved: ResolvedBoulevardService[] = [];
  const unresolved: string[] = [];
  const usedServiceIds = new Set<string>();

  for (const label of desiredLabels) {
    const canonicalLabel = canonicalizeRequestedServiceLabel(label);
    const ranked = catalog
      .map((service) => ({
        service,
        ...rankCatalogMatch(canonicalLabel, service),
      }))
      .filter((item) => item.score >= 80)
      .sort((a, b) => b.score - a.score || a.service.name.localeCompare(b.service.name));

    const match = ranked.find((item) => !usedServiceIds.has(item.service.id)) || ranked[0];
    if (!match) {
      unresolved.push(label);
      continue;
    }

    usedServiceIds.add(match.service.id);
    resolved.push({
      requested_label: canonicalLabel,
      service_id: match.service.id,
      service_name: match.service.name,
      category: match.service.category,
      match_reason: match.reason || "fuzzy_match",
    });
  }

  return { resolved, unresolved };
}

function buildFallbackReply(state: StructuredBookingState) {
  if (state.missing_required_info.includes("service_details") || state.service_stack.some((item) => normalizeLowerString(item) === "dimensional color")) {
    return buildServiceDetailsReply(state);
  }
  if (state.intent === "pricing_question") {
    if (state.requested_services.length) {
      return `Happy to help with that. I can get you pricing for ${state.requested_services.map((item) => item.label).join(", ")}. Do you want a quick estimate, or are you deciding between a couple services?`;
    }
    return "Happy to help with pricing. What service are you thinking about so I can point you the right way?";
  }
  if (state.intent === "cancel") {
    return "I can help with that. I’ll need to pull up the appointment tied to this number so we can get it canceled correctly.";
  }
  if (state.intent === "reschedule") {
    return "Absolutely. I can help move that appointment. Do you already know what day or time works better for you?";
  }
  if (state.intent === "book") {
    if (state.needs_service_decision || state.missing_required_info.includes("service_details")) return buildServiceDetailsReply(state);
    if (state.missing_required_info.includes("service")) return "Absolutely. What are you looking to book?";
    if (state.missing_required_info.includes("timing")) return "Perfect. What day or time works best for you?";
    if (state.missing_required_info.includes("stylist_preference")) {
      return "Do you have a stylist preference, or are you open to anyone on the team?";
    }
    return "Perfect. I have what I need to start looking at timing options for you.";
  }
  return "Happy to help. Tell me a little more about what you’re looking to book.";
}

function planNextReplyDecision(
  state: StructuredBookingState,
  bookingRequest: BookingRequestDraft,
  preferredReply: string,
  preferredNextAction: NextAction,
  bookingKnowledge?: BookingKnowledgeContext,
  sourceText = "",
): PlannedReplyDecision {
  const missing = new Set(state.missing_required_info.map((item) => normalizeLowerString(item)));
  const constraints = new Set(state.known_constraints.map((item) => normalizeLowerString(item)));
  const hasTiming = hasUsableTimingPreference(state.timing_preference);
  const hasStylist = !!normalizeString(state.stylist_preference);
  const hasServices = bookingRequest.resolved_services.length > 0 || state.requested_services.length > 0;
  const serviceSummary = describeRequestedServices(state);
  const hasColorService = hasRequestedServiceLabel(state, [
    "Root touch-up",
    "Single Process",
    "Gloss",
    "Dimensional color",
    "Face Frame",
    "Partial Highlight",
    "Full Highlight",
  ]);
  const hasBlowout = hasRequestedServiceLabel(state, ["Blowout"]);
  const hasConsultation = hasRequestedServiceLabel(state, ["Consultation"]);
  const consultType = consultationContextType(state);
  const hasFamilyDecisionQuestion = hasOutstandingFamilyDecisionQuestion(state, bookingRequest);
  const staffCompatibility = assessNamedStaffCompatibility(state, bookingRequest, bookingKnowledge, sourceText);

  if (constraints.has("staff_recommendation_question")) {
    return {
      nextAction: "answer_question",
      reply: buildStaffRecommendationReply(state, bookingRequest, bookingKnowledge, hasFamilyDecisionQuestion, sourceText),
    };
  }
  if (constraints.has("staff_service_question") && staffCompatibility) {
    return {
      nextAction: "answer_question",
      reply: buildStaffCompatibilityReply({
        state,
        compatibility: staffCompatibility,
        hasFamilyDecisionQuestion,
        explicitQuestion: true,
      }),
    };
  }
  if (state.intent === "pricing_question" || state.intent === "general_question") {
    return {
      nextAction: "answer_question",
      reply: normalizeString(preferredReply) || buildFallbackReply(state),
    };
  }
  if (state.intent === "cancel") {
    return {
      nextAction: "ask_clarifying_question",
      reply: "I can help with that. I’ll pull up the appointment on this number first so we cancel the right visit.",
    };
  }
  if (state.intent === "reschedule") {
    return {
      nextAction: "ask_clarifying_question",
      reply: hasTiming
        ? "I can help move that. Do you want to keep the same service and stylist, or are you open if that gets you in sooner?"
        : "Absolutely. I can help move that appointment. What day or time works better for you?",
    };
  }
  if (state.intent !== "book") {
    return {
      nextAction: preferredNextAction,
      reply: normalizeString(preferredReply) || buildFallbackReply(state),
    };
  }
  if (constraints.has("prior_visit_reference") && !hasServices) {
    return {
      nextAction: "ask_clarifying_question",
      reply: "I can help with that. Do you want to repeat the same service from your last visit, or are you looking for a change this time?",
    };
  }
  if (constraints.has("prior_stylist_reference") && !hasServices) {
    return {
      nextAction: "ask_clarifying_question",
      reply: "I can help track that down. Was it your color, your haircut, or both that you want to repeat?",
    };
  }
  if (constraints.has("friend_stylist_reference") && !hasServices) {
    return {
      nextAction: "ask_clarifying_question",
      reply: "Happy to help. What are you looking to book, and do you want the same stylist your friend sees if they’re available?",
    };
  }
  if (constraints.has("consult_candidate") && !hasServices) {
    return {
      nextAction: "ask_clarifying_question",
      reply: constraints.has("low_maintenance_goal")
        ? "I can help with that. If low-maintenance is the goal, I can narrow it down here or we can start with a consultation. Are you thinking color, haircut, or a bigger change?"
        : "I can help with that. If you’re not totally sure what you need yet, I can narrow it down here or we can start with a consultation. What kind of result are you after?",
    };
  }
  if (
    constraints.has("low_maintenance_goal") &&
    normalizeLowerString(state.service_family || "") === "color" &&
    !normalizeString(state.service_candidate)
  ) {
    return {
      nextAction: "ask_clarifying_question",
      reply: "I can help with that. If low-maintenance color is the goal, are you thinking root coverage, a gloss refresh, or a little soft brightness?",
    };
  }
  if (staffCompatibility?.status === "ineligible" && hasServices) {
    return {
      nextAction: "ask_clarifying_question",
      reply: buildStaffCompatibilityReply({
        state,
        compatibility: staffCompatibility,
        hasFamilyDecisionQuestion,
        explicitQuestion: false,
      }),
    };
  }
  if (missing.has("service_details") || hasFamilyDecisionQuestion) {
    return {
      nextAction: "ask_clarifying_question",
      reply: buildServiceDetailsReply(state),
    };
  }
  if (missing.has("service")) {
    return {
      nextAction: "ask_clarifying_question",
      reply: "Absolutely. What are you looking to book?",
    };
  }
  if (!hasTiming && hasServices) {
    if ((normalizeLowerString(state.stylist_preference) === "any" || !hasStylist) && isNaturalAvailabilityQuestion(sourceText)) {
      return {
        nextAction: "ask_clarifying_question",
        reply: "I can check that — is there a day or general window you prefer, like mornings, afternoons, evenings, or soonest available?",
      };
    }
    return {
      nextAction: "ask_clarifying_question",
      reply: consultType === "extensions"
        ? "I can help with that. Extensions usually go best if we start with a consultation so we can see what kind of maintenance or adjustment you need. What day or time works best for you?"
        : consultType === "color_correction"
          ? "I can help with that. Color correction usually starts with a consultation so we can talk through your current color and your goal before booking the right service. What day or time works best for you?"
        : consultType === "low_maintenance"
          ? "I can help with that. A consultation is probably the best place to start if low-maintenance is the goal, so we can match you with the right service. What day or time works best for you?"
        : consultType === "unsure"
          ? "I can help with that. A consultation is probably the best place to start so we can match you with the right service. What day or time works best for you?"
        : hasConsultation && constraints.has("consult_candidate")
          ? "I can help with that. A consultation is probably the best place to start so we can match you with the right service. What day or time works best for you?"
        : constraints.has("event_anchor")
        ? hasColorService && !hasBlowout
          ? `Got it. What day is the event, or what timing do you need to be ready by for ${serviceSummary || "that"}? If you want, I can also keep a blowout in mind so you’re fully event-ready.`
          : `Got it. What day is the event, or what timing do you need to be ready by for ${serviceSummary || "that"}?`
        : hasStylist
        ? `Perfect. For ${serviceSummary || "that"}, what day or time works best with ${state.stylist_preference}?`
        : `Perfect. For ${serviceSummary || "that"}, what day or time works best for you?`,
    };
  }
  if (!hasStylist && hasTiming && hasServices) {
    return {
      nextAction: "ask_clarifying_question",
      reply: serviceSummary
        ? `For ${serviceSummary}, do you have a stylist preference, or are you open to anyone on the team?`
        : "Do you have a stylist preference, or are you open to anyone on the team?",
    };
  }
  if (!hasStylist && !hasTiming && hasServices) {
    return {
      nextAction: "ask_clarifying_question",
      reply: serviceSummary
        ? `I can help with ${serviceSummary}. Do you want to start with timing, or do you already have a stylist preference?`
        : "I can help with that. What day or time works best, and do you have a stylist preference?",
    };
  }
  if (!state.ready_to_search_availability) {
    return {
      nextAction: "ask_clarifying_question",
      reply: buildFallbackReply(state),
    };
  }
  return {
    nextAction: preferredNextAction,
    reply: normalizeString(preferredReply) || buildFallbackReply(state),
  };
}

function deriveReplyForState(
  state: StructuredBookingState,
  bookingRequest: BookingRequestDraft,
  preferredReply: string,
  preferredNextAction: NextAction,
  bookingKnowledge?: BookingKnowledgeContext,
  sourceText = "",
) {
  return planNextReplyDecision(state, bookingRequest, preferredReply, preferredNextAction, bookingKnowledge, sourceText).reply;
}

function deriveNextActionForState(
  state: StructuredBookingState,
  bookingRequest: BookingRequestDraft,
  preferredReply: string,
  preferredNextAction: NextAction,
  bookingKnowledge?: BookingKnowledgeContext,
  sourceText = "",
): NextAction {
  return planNextReplyDecision(state, bookingRequest, preferredReply, preferredNextAction, bookingKnowledge, sourceText).nextAction;
}

function isTimingClarificationReply(reply: string) {
  const lower = normalizeLowerString(reply);
  if (!lower) return false;
  return (
    lower.includes("what day or time works best") ||
    lower.includes("day or general window") ||
    lower.includes("mornings, afternoons, evenings") ||
    lower.includes("what timing do you need")
  );
}

function normalizeAnswerQuestionState(state: StructuredBookingState) {
  return {
    ...state,
    missing_required_info: [],
    ready_to_search_availability: false,
    ready_to_book: false,
  };
}

function buildDeterministicInternalNotes(input: {
  state: StructuredBookingState;
  bookingRequest: BookingRequestDraft;
  searchEligible: boolean;
  offeredSlots: AvailabilitySlotSuggestion[];
  fallback?: boolean;
}) {
  const notes: string[] = [];
  if (input.fallback) {
    notes.push("Fallback heuristic interpretation used.");
  }

  if (input.bookingRequest.unresolved_service_labels.length) {
    notes.push(
      `Unresolved services: ${input.bookingRequest.unresolved_service_labels.join(", ")}.`,
    );
  } else if (input.bookingRequest.resolved_services.length) {
    notes.push(
      `Resolved services: ${input.bookingRequest.resolved_services.map((service) => service.service_name).join(", ")}.`,
    );
  }
  if (input.state.service_family) {
    notes.push(
      input.state.service_candidate
        ? `Service interpretation: family=${input.state.service_family}, candidate=${input.state.service_candidate}.`
        : `Service interpretation: family=${input.state.service_family}, needs decision=${input.state.needs_service_decision ? "yes" : "no"}.`,
    );
  }

  const missing = input.state.missing_required_info.map((item) => normalizeLowerString(item));
  if (missing.length) {
    notes.push(`Missing required info: ${missing.join(", ")}.`);
  }

  if (!input.searchEligible) {
    notes.push("Availability search was not run.");
  } else if (input.offeredSlots.length) {
    notes.push(`Availability search returned ${input.offeredSlots.length} slot option(s).`);
  } else {
    notes.push("Availability search ran and returned no matching slots.");
  }

  notes.push(
    `Final next action: ${input.state.ready_to_search_availability ? "search_availability" : "ask_clarifying_question"}.`,
  );
  return notes.join(" ");
}

function detectSimulationInconsistencies(input: {
  stateBefore: StructuredBookingState;
  stateAfter: StructuredBookingState;
  bookingRequestAfter: BookingRequestDraft;
  latestMessage?: string;
  reply?: string;
  nextAction?: string | null;
}) {
  const errors = collectBookingStateInvariantErrors({
    state: input.stateAfter,
    bookingRequest: input.bookingRequestAfter,
  });
  const timing = input.stateAfter.timing_preference;
  const serviceStack = input.stateAfter.service_stack.map((value) => canonicalizeRequestedServiceLabel(normalizeString(value))).filter(Boolean);
  const uniqueServiceStack = uniqueStrings(serviceStack);
  const missing = normalizeMissingInfoSet(input.stateAfter.missing_required_info);
  const requestedLabels = input.stateAfter.requested_services.map((service) =>
    canonicalizeRequestedServiceLabel(normalizeString(service.label))
  ).filter(Boolean);
  const hasService = uniqueServiceStack.length > 0 || requestedLabels.length > 0 || !!normalizeString(input.stateAfter.service_candidate);
  const hasTiming = hasUsableTimingPreference(timing);

  if (input.stateAfter.intent === "book" && !hasService && !missing.includes("service")) {
    errors.push("booking state has no service but missing_required_info does not include service");
  }

  if (normalizeString(input.stateAfter.stylist_preference) &&
    normalizeString(input.stateAfter.client_name) &&
    normalizeLowerString(input.stateAfter.stylist_preference) === normalizeLowerString(input.stateAfter.client_name) &&
    input.stateAfter.intent !== "book") {
    errors.push("stylist_preference appears to contain the client name");
  }

  if (
    normalizeString(timing.raw_text) &&
    isAvailabilityMetaQuestionWithoutTiming(timing.raw_text) &&
    !normalizeTimingUrgencyValue(timing.urgency) &&
    !timing.date_range &&
    timing.day_preferences.length === 0 &&
    timing.time_preferences.length === 0
  ) {
    errors.push("timing_preference.raw_text contains an availability meta-question without usable timing");
  }

  if (
    input.stateAfter.intent === "book" &&
    hasService &&
    !hasTiming &&
    input.stateAfter.ready_to_search_availability
  ) {
    errors.push("booking state is search-ready without timing");
  }

  if (isPureTimingPivotMessage(normalizeString(input.latestMessage))) {
    const beforeServices = uniqueStrings(
      input.stateBefore.service_stack.map((value) => canonicalizeRequestedServiceLabel(normalizeString(value))).filter(Boolean),
    );
    const afterServices = uniqueStrings(
      input.stateAfter.service_stack.map((value) => canonicalizeRequestedServiceLabel(normalizeString(value))).filter(Boolean),
    );
    if (beforeServices.join("|") !== afterServices.join("|")) {
      errors.push("pure timing pivot modified services");
    }

    const beforeTiming = input.stateBefore.timing_preference;
    const afterTiming = input.stateAfter.timing_preference;
    const incomingTiming = detectTimingPreference(normalizeString(input.latestMessage));
    const incomingHasDayOnly = incomingTiming.day_preferences.length > 0 && incomingTiming.time_preferences.length === 0;
    const beforeHasTime = beforeTiming.time_preferences.length > 0;
    const afterLostTime = afterTiming.time_preferences.length === 0;
    if (incomingHasDayOnly && beforeHasTime && afterLostTime) {
      errors.push("day-only timing pivot dropped an existing time preference");
    }
  }

  if (
    input.stateAfter.intent === "book" &&
    hasService &&
    hasTiming &&
    !missing.includes("service") &&
    !missing.includes("service_details") &&
    !missing.includes("timing") &&
    isTimingClarificationReply(normalizeString(input.reply))
  ) {
    errors.push("service and timing are resolved but the reply still asks for timing");
  }

  return errors;
}

function buildTranscript(messages: SmsMessageRecord[]) {
  return messages.map((message) => ({
    direction: message.direction,
    body: normalizeString(message.body),
    created_at: normalizeString(message.created_at),
  }));
}

function buildSystemPrompt() {
  return [
    `You are an expert salon booking receptionist and appointment interpreter for ${SALON_NAME}, a modern hair salon.`,
    `Your job is to understand incoming SMS messages, maintain memory across the conversation, identify booking intent, build the correct service stack, understand timing and stylist preferences, and determine what information is still missing before availability can be searched.`,
    `You will receive a booking_knowledge_base payload containing candidate Boulevard services and service-family guidance.`,
    `You may also receive heuristic_hints. Treat them as conservative guardrails, not the source of truth for service interpretation.`,
    `Use the provided booking_knowledge_base as the only grounded source of bookable services.`,
    `Do not invent services or service names that are not supported by the provided booking_knowledge_base.`,
    `Translate casual client language into the closest grounded Boulevard service labels or service families from that knowledge base.`,
    `Use family_objects to reason like a receptionist: when a guest is clearly inside a family but has not narrowed the child service yet, ask the family's decision_question before acting like the exact service is known.`,
    `Use service confidence tiers in updated_state. If you only know the family, set service_family, keep service_candidate null, set needs_service_decision true, and set decision_question_key to the next decision you need.`,
    `If the guest clearly names a specific child service, set both service_family and service_candidate with high confidence and set needs_service_decision false.`,
    `When the guest is answering a decision question, set decision_answer with the matching question_key and a normalized answer_key instead of relying on natural-language memory alone.`,
    `For dimensional_placement use answer_key values: face_only, top_and_face, whole_head.`,
    `For gray_coverage_scope use answer_key values: roots_or_gray, all_over_refresh.`,
    `For gloss_vs_brightness use answer_key values: tone_refresh, soft_brightness.`,
    `Use the staff lists inside candidate_services and family_objects as the grounded source of who can perform a service. Do not imply a stylist performs a service unless that stylist appears in the grounded staff list for that service or family.`,
    `You do not book the appointment directly unless all required data is available. You move the conversation forward naturally.`,
    `The tone should feel like texting a smart, warm, efficient human receptionist.`,
    `Do not sound robotic, corporate, or form-like.`,
    `Only ask the next most useful question.`,
    `Do not ask for every detail at once unless absolutely necessary.`,
    `Ask only one next-step question in most replies.`,
    `Infer carefully from salon language, but do not overcommit when service choice is ambiguous.`,
    `Use the raw message, transcript, and booking_knowledge_base as the primary semantic inputs. Do not let a missing heuristic hint stop you from understanding the client's intent.`,
    `Handle: new appointment requests, rescheduling, canceling, pricing questions, vague requests, out-of-order details, follow-up answers, and existing conversation state.`,
    `Recognize salon concepts including haircut, trim, layers, dusting, reshape, blowout, style, classic blowout, signature blowout, roots, root touch-up, gray coverage, single process, gloss, glaze, toner, highlights, partial highlight, full highlight, balayage, money piece, lowlights, color correction, consultation, extensions, and treatment.`,
    `Recognize stacking examples like single process + haircut + blowout, highlights + glaze + haircut, root touch-up + glaze, haircut + blowout, color + haircut, consultation only.`,
    `Recognize modifiers like long or thick hair, extensions, corrective color, extra time needed, new client color, major change, gray coverage, going lighter, going darker, adding dimension, and maintaining the current look.`,
    `When gloss, glaze, or toner is requested alongside single process or root touch-up, treat it as a color add-on modifier instead of a standalone service.`,
    `When gloss, glaze, or toner is requested with dimensional color services like balayage, face frame, partial highlight, or full highlight, treat it as a salon add-on that maps into the dimensional-color modifier path rather than changing the appointment stack.`,
    `Follow guided-booking modifier logic: single process can carry Glaze/Gloss, Extra Color, and Air-Dry Transition Time; dimensional color services can carry modifiers like Tipping, Lowlights, Pretone, Root Shadow, and long/thick-hair adjustments; haircut can carry long/thick and big-change modifiers.`,
    `Always return valid JSON with exactly these top-level keys: updated_state, client_facing_reply, internal_notes, next_action.`,
    `next_action must be one of: ask_clarifying_question, search_availability, ready_to_book, answer_question, handoff_to_human.`,
    `updated_state must preserve and improve the structured appointment memory, not wipe useful data that already exists.`,
    `client_facing_reply must be concise, human, salon-friendly, and ready to send as an SMS.`,
    `Never invent prices, service durations, policies, or availability.`,
    `If pricing is asked and you do not have grounded pricing data in the conversation context, say that pricing varies and ask the smallest clarifying question needed instead of making up numbers.`,
    `Do not mark ready_to_search_availability true unless the requested service is specific enough to search realistically and there is at least some usable timing information.`,
    `If the message is ambiguous, preserve that ambiguity in missing_required_info instead of guessing a specific service prematurely.`,
    `Prefer the most specific service labels. Avoid redundant combinations like Color plus root touch-up, or Color plus Gloss, when the specific service is already known.`,
    `If the client asks a pricing question and the exact service is unclear, reply naturally and ask the smallest follow-up needed.`,
    `If the client wants to cancel or reschedule, do not pretend the appointment is already found. Be honest about what is known.`,
    `For vague blonding requests, clarify the service before searching. Examples: highlights, balayage, face frame, or consultation.`,
    `For highlights, balayage, and lighter/brighter requests, treat them as dimensional color services.`,
    `Use guided placement logic for dimensional color: around the face = Face Frame, top plus face = Partial Highlight, top plus face plus lengths = Full Highlight.`,
    `If the guest has not told you where they want to see the lightness, ask that placement question before acting like the service is specific enough to search or price precisely.`,
    `For new-client color uncertainty, you may note it internally, but do not stack multiple questions into one SMS unless absolutely necessary.`,
  ].join("\n");
}

function buildJsonSchema() {
  return {
    name: "sms_concierge_interpretation",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        updated_state: {
          type: "object",
          additionalProperties: false,
          properties: {
            intent: { type: "string", enum: ["book", "reschedule", "cancel", "pricing_question", "general_question", "unclear"] },
            client_name: { type: ["string", "null"] },
            phone: { type: ["string", "null"] },
            is_existing_client: { type: ["boolean", "null"] },
            requested_services: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  label: { type: "string" },
                  family: { type: ["string", "null"] },
                  confidence: { type: ["number", "null"] },
                  notes: { type: ["string", "null"] },
                },
                required: ["label", "family", "confidence", "notes"],
              },
            },
            service_stack: { type: "array", items: { type: "string" } },
            service_family: { type: ["string", "null"] },
            service_family_confidence: { type: ["number", "null"] },
            service_candidate: { type: ["string", "null"] },
            service_candidate_confidence: { type: ["number", "null"] },
            needs_service_decision: { type: "boolean" },
            decision_question_key: { type: ["string", "null"], enum: ["dimensional_placement", "gray_coverage_scope", "gloss_vs_brightness", "extensions_triage", "haircut_scope", "blowout_finish", "consultation_entry", null] },
            decision_answer: {
              type: ["object", "null"],
              additionalProperties: false,
              properties: {
                question_key: { type: "string", enum: ["dimensional_placement", "gray_coverage_scope", "gloss_vs_brightness", "extensions_triage", "haircut_scope", "blowout_finish", "consultation_entry"] },
                answer_key: { type: "string" },
              },
              required: ["question_key", "answer_key"],
            },
            service_modifiers: { type: "array", items: { type: "string" } },
            stylist_preference: { type: ["string", "null"] },
            timing_preference: {
              type: "object",
              additionalProperties: false,
              properties: {
                raw_text: { type: ["string", "null"] },
                date_range: { type: ["string", "null"] },
                day_preferences: { type: "array", items: { type: "string" } },
                time_preferences: { type: "array", items: { type: "string" } },
                urgency: { type: ["string", "null"] },
              },
              required: ["raw_text", "date_range", "day_preferences", "time_preferences", "urgency"],
            },
            known_constraints: { type: "array", items: { type: "string" } },
            missing_required_info: { type: "array", items: { type: "string" } },
            ready_to_search_availability: { type: "boolean" },
            ready_to_book: { type: "boolean" },
            confidence: { type: "number" },
            client_facing_reply: { type: "string" },
          },
          required: ["intent", "client_name", "phone", "is_existing_client", "requested_services", "service_stack", "service_family", "service_family_confidence", "service_candidate", "service_candidate_confidence", "needs_service_decision", "decision_question_key", "decision_answer", "service_modifiers", "stylist_preference", "timing_preference", "known_constraints", "missing_required_info", "ready_to_search_availability", "ready_to_book", "confidence", "client_facing_reply"],
        },
        client_facing_reply: { type: "string" },
        internal_notes: { type: "string" },
        next_action: { type: "string", enum: ["ask_clarifying_question", "search_availability", "ready_to_book", "answer_question", "handoff_to_human"] },
      },
      required: ["updated_state", "client_facing_reply", "internal_notes", "next_action"],
    },
  };
}

function buildConsistencyReviewPrompt() {
  return [
    `You are the consistency reviewer for ${SALON_NAME}'s SMS booking concierge.`,
    `You are not reinterpreting the whole conversation from scratch.`,
    `Your job is only to make sure the proposed booking state, reply, and next action are internally consistent and honest.`,
    `Be conservative and practical.`,
    `If the reply is still asking for information, that information should still appear in missing_required_info.`,
    `If unresolved_service_labels is not empty, ready_to_search_availability must be false.`,
    `If dimensional color placement is still unresolved, missing_required_info should include service_details.`,
    `If timing is still too vague for the reply's ask, missing_required_info should include timing.`,
    `If stylist preference is optional and the concierge can search without it, do not force it to be missing unless the reply is explicitly asking for it as the next needed detail.`,
    `If the reply is asking for a name, missing_required_info should include client_name.`,
    `Do not add new services, modify resolved service mapping, or rewrite timing details.`,
    `Do not make up prices, availability, or policies.`,
    `Keep the reply concise, human, and salon-natural if you revise it.`,
    `Return valid JSON with exactly these top-level keys: updated_state, client_facing_reply, internal_notes, next_action.`,
  ].join("\n");
}

function buildConsistencyReviewSchema() {
  return {
    name: "sms_concierge_consistency_review",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        updated_state: {
          type: "object",
          additionalProperties: false,
          properties: {
            missing_required_info: { type: "array", items: { type: "string" } },
            ready_to_search_availability: { type: "boolean" },
            ready_to_book: { type: "boolean" },
          },
          required: ["missing_required_info", "ready_to_search_availability", "ready_to_book"],
        },
        client_facing_reply: { type: "string" },
        internal_notes: { type: "string" },
        next_action: { type: "string", enum: ["ask_clarifying_question", "search_availability", "ready_to_book", "answer_question", "handoff_to_human"] },
      },
      required: ["updated_state", "client_facing_reply", "internal_notes", "next_action"],
    },
  };
}

function buildBookingActionClassifierPrompt() {
  return [
    `You are a lightweight booking action classifier for ${SALON_NAME}'s SMS concierge.`,
    `Classify the user's latest message into exactly one controlled booking action.`,
    `You are not allowed to modify booking state. You only return the intended action and any lightweight entities.`,
    `Prefer these actions when appropriate: view_appointments, cancel_appointment, reschedule_appointment, select_appointment, change_service, add_service, remove_service, confirm_slot, reject_slots, widen_timing, check_anyone, check_next_available, do_both, ask_availability, reset.`,
    `If the last outbound was a no-availability fallback, interpret natural follow-ups like a receptionist would.`,
    `Examples:`,
    `"what appointments do I have coming up?" -> view_appointments`,
    `"I need to cancel my appointment" -> cancel_appointment`,
    `"can I move my appointment?" -> reschedule_appointment`,
    `"the second one" -> select_appointment with selection = 2`,
    `"actually make it a haircut instead" -> change_service with service`,
    `"can I also add a gloss?" -> add_service with service`,
    `"skip the haircut" -> remove_service with service`,
    `"1 works" -> confirm_slot`,
    `"none of those work" -> reject_slots`,
    `"widen the timing" -> widen_timing`,
    `"open it up" -> widen_timing`,
    `"anything later with Jamie?" -> widen_timing`,
    `"what's Jamie's next available?" -> check_next_available with staff`,
    `"when is Jamie next open?" -> check_next_available with staff`,
    `"check anyone" -> check_anyone`,
    `"anyone is fine" -> check_anyone`,
    `"do both" -> do_both`,
    `"what times do you have?" -> ask_availability`,
    `"start over" -> reset`,
    `If you are not confident, return unknown.`,
    `Return valid JSON only.`,
  ].join("\n");
}

function buildBookingActionClassifierSchema() {
  return {
    name: "sms_booking_action_classifier",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        action: {
          type: "string",
          enum: [
            "view_appointments",
            "cancel_appointment",
            "reschedule_appointment",
            "select_appointment",
            "set_service",
            "change_service",
            "add_service",
            "remove_service",
            "answer_service_decision",
            "set_stylist",
            "set_timing",
            "ask_availability",
            "widen_timing",
            "check_anyone",
            "check_next_available",
            "do_both",
            "confirm_slot",
            "reject_slots",
            "reset",
            "handoff",
            "unknown",
          ],
        },
        confidence: { type: "number" },
        entities: {
          type: "object",
          additionalProperties: false,
          properties: {
            service: { type: ["string", "null"] },
            staff: { type: ["string", "null"] },
            timing: { type: ["string", "null"] },
            selection: { type: ["number", "null"] },
            exclude_staff: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["service", "staff", "timing", "selection", "exclude_staff"],
        },
      },
      required: ["action", "confidence", "entities"],
    },
  };
}

async function callOpenAIBookingActionClassifier(input: {
  latestMessage: string;
  previousOutboundMessage: string;
  currentState: StructuredBookingState;
  bookingRequest: BookingRequestDraft;
  lastOutboundWasNoAvailability: boolean;
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: buildBookingActionClassifierSchema(),
      },
      messages: [
        { role: "system", content: buildBookingActionClassifierPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            latest_message: input.latestMessage,
            previous_outbound_message: input.previousOutboundMessage,
            current_state: input.currentState,
            booking_request: input.bookingRequest,
            last_outbound_was_no_availability: input.lastOutboundWasNoAvailability,
          }),
        },
      ],
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI booking action classifier failed: status=${response.status}; body=${rawText}`);
  }

  const parsed = safeObject(rawText ? JSON.parse(rawText) : {});
  const choices = safeArray<JsonRecord>(parsed.choices);
  const content = normalizeString(safeObject(choices[0]?.message).content);
  if (!content) {
    throw new Error("OpenAI booking action classifier did not contain message content");
  }

  return safeObject(JSON.parse(content)) as unknown as BookingActionResult;
}

async function callOpenAI(input: {
  previousState: StructuredBookingState;
  heuristicState: Partial<StructuredBookingState>;
  inbound: InboundSmsMessage;
  recentMessages: SmsMessageRecord[];
  bookingKnowledge: BookingKnowledgeContext;
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.3,
      response_format: {
        type: "json_schema",
        json_schema: buildJsonSchema(),
      },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            previous_state: input.previousState,
            heuristic_hints: input.heuristicState,
            booking_knowledge_base: input.bookingKnowledge,
            new_message: {
              from_phone: input.inbound.fromPhone,
              body: input.inbound.body,
              timestamp: input.inbound.timestamp,
            },
            recent_transcript: buildTranscript(input.recentMessages),
          }),
        },
      ],
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI request failed: status=${response.status}; body=${rawText}`);
  }

  const parsed = safeObject(rawText ? JSON.parse(rawText) : {});
  const choices = safeArray<JsonRecord>(parsed.choices);
  const content = normalizeString(safeObject(choices[0]?.message).content);
  if (!content) {
    throw new Error("OpenAI response did not contain message content");
  }

  return safeObject(JSON.parse(content)) as unknown as AiInterpreterResult;
}

async function callOpenAIConsistencyReview(input: {
  state: StructuredBookingState;
  bookingRequest: BookingRequestDraft;
  clientFacingReply: string;
  nextAction: NextAction;
  recentMessages: SmsMessageRecord[];
}) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: buildConsistencyReviewSchema(),
      },
      messages: [
        { role: "system", content: buildConsistencyReviewPrompt() },
        {
          role: "user",
          content: JSON.stringify({
            candidate_state: input.state,
            booking_request: input.bookingRequest,
            proposed_reply: input.clientFacingReply,
            proposed_next_action: input.nextAction,
            recent_transcript: buildTranscript(input.recentMessages),
          }),
        },
      ],
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI consistency review failed: status=${response.status}; body=${rawText}`);
  }

  const parsed = safeObject(rawText ? JSON.parse(rawText) : {});
  const choices = safeArray<JsonRecord>(parsed.choices);
  const content = normalizeString(safeObject(choices[0]?.message).content);
  if (!content) {
    throw new Error("OpenAI consistency review did not contain message content");
  }

  return safeObject(JSON.parse(content)) as unknown as AiConsistencyReviewResult;
}

function buildFallbackInterpretation(input: {
  previousState: StructuredBookingState;
  heuristicState: Partial<StructuredBookingState>;
  contextText?: string;
  bookingKnowledge?: BookingKnowledgeContext;
}) {
  const merged = finalizeAppointmentState(
    normalizeServiceModifiersForGuidedBooking(
      normalizeColorAddOnComposition(
        normalizeStandaloneGlossIntent(
          normalizeBlondeRefreshAmbiguity(
            normalizeUncertainHighlightIntent(
              syncDimensionalPlacementFromStack(
                applyGuidedDimensionalColorRules(
                  mergeAppointmentState(input.previousState, input.heuristicState),
                  normalizeString(input.contextText),
                ),
              ),
              normalizeString(input.contextText),
            ),
            normalizeString(input.contextText),
          ),
          normalizeString(input.contextText),
        ),
        normalizeString(input.contextText),
      ),
    ),
  );
  const guardedState = applyHardStateGuardrails(merged, []);
  const draft = buildBookingRequestDraft(guardedState);
  const planned = planNextReplyDecision(
    guardedState,
    draft,
    guardedState.missing_required_info.includes("service_details")
      ? buildServiceDetailsReply(guardedState)
      : (guardedState.client_facing_reply || buildFallbackReply(guardedState)),
    guardedState.ready_to_search_availability ? "search_availability" : "ask_clarifying_question",
    input.bookingKnowledge,
    normalizeString(input.contextText),
  );
  const normalizedState = planned.nextAction === "answer_question"
    ? normalizeAnswerQuestionState(guardedState)
    : guardedState;
  return {
    updatedState: { ...normalizedState, client_facing_reply: planned.reply },
    clientFacingReply: planned.reply,
    internalNotes: buildDeterministicInternalNotes({
      state: normalizedState,
      bookingRequest: draft,
      searchEligible: false,
      offeredSlots: [],
      fallback: true,
    }),
    nextAction: planned.nextAction,
    bookingRequest: draft,
    offeredSlots: [],
  } satisfies InterpreterOutput;
}

async function interpretIncomingMessage(input: {
  conversation: SmsConversationRecord;
  inbound: InboundSmsMessage;
  recentMessages: SmsMessageRecord[];
}) {
  const conversationMetadata = safeObject(input.conversation.metadata);
  const previousState = mergeAppointmentState(
    createEmptyState(input.inbound.fromPhone),
    safeObject(input.conversation.state) as unknown as Partial<StructuredBookingState>,
  );
  const heuristicState = buildAiHeuristicStatePatch(input.inbound.body, input.inbound.fromPhone);
  const fallbackHeuristicState = buildFallbackHeuristicStatePatch(input.inbound.body, input.inbound.fromPhone);
  const inferredDecisionAnswer = inferDecisionAnswerFromMessage(input.inbound.body, previousState);
  if (inferredDecisionAnswer) {
    heuristicState.decision_answer = inferredDecisionAnswer;
    heuristicState.decision_question_key = previousState.decision_question_key;
    heuristicState.needs_service_decision = previousState.needs_service_decision;
    heuristicState.service_family = previousState.service_family;
    heuristicState.service_family_confidence = previousState.service_family_confidence;
    fallbackHeuristicState.decision_answer = inferredDecisionAnswer;
    fallbackHeuristicState.decision_question_key = previousState.decision_question_key;
    fallbackHeuristicState.needs_service_decision = previousState.needs_service_decision;
    fallbackHeuristicState.service_family = previousState.service_family;
    fallbackHeuristicState.service_family_confidence = previousState.service_family_confidence;
  }
  const contextText = [
    ...input.recentMessages.map((message) => normalizeString(message.body)),
    normalizeString(input.inbound.body),
  ].filter(Boolean).join(" ");
  const bookingKnowledge = await buildBookingKnowledgeContext({
    messageBody: contextText,
    previousState,
    heuristicState: fallbackHeuristicState,
  });
  if (!normalizeString(heuristicState.stylist_preference)) {
    const staffDirectory = await fetchDerivedStaffDirectory().catch(() => [] as DerivedStaffDirectoryEntry[]);
    const detectedStaff =
      detectMentionedStaffName(
        normalizeString(input.inbound.body),
        staffDirectory.map((entry) => normalizeString(entry.name)).filter(Boolean),
      ) ||
      detectMentionedStaffFromKnowledge(normalizeString(input.inbound.body), bookingKnowledge);
    if (detectedStaff) {
      heuristicState.stylist_preference = detectedStaff;
    }
  }

  try {
    const aiResult = await callOpenAI({
      previousState,
      heuristicState,
      inbound: input.inbound,
      recentMessages: input.recentMessages,
      bookingKnowledge,
    });

    const mergedState = finalizeAiPrimaryState(
      previousState,
      heuristicState,
      safeObject(aiResult.updated_state) as Partial<StructuredBookingState>,
      contextText,
      normalizeString(input.inbound.body),
    );
    if (
      isServiceChangeRequest(input.inbound.body) &&
      safeObject(conversationMetadata.selected_slot).id &&
      heuristicState.timing_preference.time_preferences.length === 0
    ) {
      mergedState.timing_preference = {
        ...mergedState.timing_preference,
        time_preferences: [],
      };
    }

    const clientFacingReply = mergedState.missing_required_info.includes("service_details")
      ? buildServiceDetailsReply(mergedState)
      : (normalizeString(aiResult.client_facing_reply) || buildFallbackReply(mergedState));
    const bookingRequest = buildBookingRequestDraft(mergedState);
    const resolvedStack = await resolveBoulevardServiceStack(mergedState).catch((error) => {
      console.error("Failed to resolve Boulevard services", error);
      return { resolved: [] as ResolvedBoulevardService[], unresolved: uniqueStrings(mergedState.service_stack.slice()) };
    });
    bookingRequest.resolved_services = resolvedStack.resolved;
    bookingRequest.service_preferences = buildBookingServicePreferences(bookingRequest);
    bookingRequest.unresolved_service_labels = resolvedStack.unresolved;
    assertBookingState({ state: mergedState, bookingRequest });
    let reviewedState = applyHardStateGuardrails(mergedState, bookingRequest.unresolved_service_labels);
    let reviewedReply = clientFacingReply;
    let reviewedNextAction = aiResult.next_action;
    try {
      const review = await callOpenAIConsistencyReview({
        state: reviewedState,
        bookingRequest,
        clientFacingReply,
        nextAction: aiResult.next_action,
        recentMessages: input.recentMessages,
      });
      reviewedState = {
        ...reviewedState,
        missing_required_info: normalizeMissingInfoSet(
          safeArray<string>(review.updated_state?.missing_required_info).map((value) => normalizeMissingInfoLabel(normalizeString(value))),
        ),
        ready_to_search_availability: !!review.updated_state?.ready_to_search_availability,
        ready_to_book: !!review.updated_state?.ready_to_book,
      };
      reviewedReply = normalizeString(review.client_facing_reply) || reviewedReply;
      reviewedNextAction = review.next_action || reviewedNextAction;
    } catch (error) {
      console.error("SMS concierge consistency review failed", error);
    }
    reviewedState = applyHardStateGuardrails(reviewedState, bookingRequest.unresolved_service_labels);
    if (reviewedState.missing_required_info.some((item) => normalizeLowerString(item) === "timing")) {
      reviewedState.ready_to_search_availability = false;
    }
    const availabilityMetaTimingGuardrail = applyAvailabilityMetaTimingGuardrail(
      reviewedState,
      bookingRequest,
      normalizeString(input.inbound.body),
    );
    if (availabilityMetaTimingGuardrail) {
      reviewedState = availabilityMetaTimingGuardrail.state;
      bookingRequest.timing_preference = availabilityMetaTimingGuardrail.bookingRequest.timing_preference;
      bookingRequest.ready_to_search_availability = availabilityMetaTimingGuardrail.bookingRequest.ready_to_search_availability;
      bookingRequest.ready_to_book = availabilityMetaTimingGuardrail.bookingRequest.ready_to_book;
    }
    reviewedState = syncStrictAvailabilityReadiness(reviewedState, bookingRequest);
    reviewedReply = deriveReplyForState(reviewedState, bookingRequest, reviewedReply, reviewedNextAction, bookingKnowledge, normalizeString(input.inbound.body));
    reviewedNextAction = deriveNextActionForState(reviewedState, bookingRequest, reviewedReply, reviewedNextAction, bookingKnowledge, normalizeString(input.inbound.body));
    if (reviewedNextAction === "answer_question") {
      reviewedState = normalizeAnswerQuestionState(reviewedState);
    }
    const postDeriveAvailabilityMetaTimingGuardrail = applyAvailabilityMetaTimingGuardrail(
      reviewedState,
      bookingRequest,
      normalizeString(input.inbound.body),
    );
    if (postDeriveAvailabilityMetaTimingGuardrail) {
      reviewedState = postDeriveAvailabilityMetaTimingGuardrail.state;
      bookingRequest.timing_preference = postDeriveAvailabilityMetaTimingGuardrail.bookingRequest.timing_preference;
      bookingRequest.ready_to_search_availability = postDeriveAvailabilityMetaTimingGuardrail.bookingRequest.ready_to_search_availability;
      bookingRequest.ready_to_book = postDeriveAvailabilityMetaTimingGuardrail.bookingRequest.ready_to_book;
      reviewedReply = postDeriveAvailabilityMetaTimingGuardrail.reply;
      reviewedNextAction = postDeriveAvailabilityMetaTimingGuardrail.nextAction;
    }
    assertBookingState({ state: reviewedState, bookingRequest });
    const searchEligible = canSearchAvailability(reviewedState, bookingRequest);
    let offeredSlots: AvailabilitySlotSuggestion[] = [];
    if (searchEligible) {
      offeredSlots = await searchAvailabilityForBookingRequest({
        ...bookingRequest,
        ready_to_search_availability: reviewedState.ready_to_search_availability,
      }).catch((error) => {
        console.error("Availability search failed", error);
        return [];
      });
      if (offeredSlots.length) {
        reviewedReply = buildAvailabilityReply(
          offeredSlots,
          summarizeRequestedServices(bookingRequest.requested_services),
        );
        reviewedNextAction = "search_availability";
        reviewedState = syncStrictAvailabilityReadiness({
          ...reviewedState,
          missing_required_info: reviewedState.missing_required_info.filter((item) => {
            const lower = normalizeLowerString(item);
            return lower !== "client_name" && lower !== "existing_client_status" && lower !== "is_existing_client";
          }),
          ready_to_search_availability: true,
        }, bookingRequest);
      } else {
        reviewedReply = buildNoAvailabilityReply(reviewedState);
        reviewedNextAction = "ask_clarifying_question";
        reviewedState = syncStrictAvailabilityReadiness({
          ...reviewedState,
          ready_to_search_availability: true,
        }, bookingRequest);
      }
    } else {
      reviewedReply = deriveReplyForState(reviewedState, bookingRequest, reviewedReply, reviewedNextAction, bookingKnowledge, normalizeString(input.inbound.body));
      reviewedNextAction = deriveNextActionForState(reviewedState, bookingRequest, reviewedReply, reviewedNextAction, bookingKnowledge, normalizeString(input.inbound.body));
      if (reviewedNextAction === "answer_question") {
        reviewedState = normalizeAnswerQuestionState(reviewedState);
      }
    }
    bookingRequest.ready_to_search_availability = reviewedState.ready_to_search_availability;
    assertBookingState({ state: reviewedState, bookingRequest });
    const internalNotes = buildDeterministicInternalNotes({
      state: reviewedState,
      bookingRequest,
      searchEligible,
      offeredSlots,
    });
    return {
      updatedState: { ...reviewedState, client_facing_reply: reviewedReply },
      clientFacingReply: reviewedReply,
      internalNotes,
      nextAction: reviewedNextAction,
      bookingRequest,
      offeredSlots,
    } satisfies InterpreterOutput;
  } catch (error) {
    console.error("SMS concierge AI interpretation failed", error);
    const fallback = buildFallbackInterpretation({ previousState, heuristicState: fallbackHeuristicState, contextText, bookingKnowledge });
    const resolvedStack = await resolveBoulevardServiceStack(fallback.updatedState).catch(() => ({
      resolved: [] as ResolvedBoulevardService[],
      unresolved: uniqueStrings(fallback.updatedState.service_stack.slice()),
    }));
    fallback.bookingRequest.resolved_services = resolvedStack.resolved;
    fallback.bookingRequest.service_preferences = buildBookingServicePreferences(fallback.bookingRequest);
    fallback.bookingRequest.unresolved_service_labels = resolvedStack.unresolved;
    assertBookingState({ state: fallback.updatedState, bookingRequest: fallback.bookingRequest });
    fallback.updatedState = applyHardStateGuardrails(
      fallback.updatedState,
      fallback.bookingRequest.unresolved_service_labels,
    );
  if (fallback.updatedState.missing_required_info.some((item) => normalizeLowerString(item) === "timing")) {
    fallback.updatedState.ready_to_search_availability = false;
  }
  fallback.updatedState = syncStrictAvailabilityReadiness(
    fallback.updatedState,
    fallback.bookingRequest,
  );
  fallback.clientFacingReply = deriveReplyForState(
    fallback.updatedState,
    fallback.bookingRequest,
    fallback.clientFacingReply,
    fallback.nextAction,
    bookingKnowledge,
    normalizeString(input.inbound.body),
  );
  fallback.nextAction = deriveNextActionForState(
    fallback.updatedState,
    fallback.bookingRequest,
    fallback.clientFacingReply,
    fallback.nextAction,
    bookingKnowledge,
    normalizeString(input.inbound.body),
  );
  if (fallback.nextAction === "answer_question") {
    fallback.updatedState = normalizeAnswerQuestionState(fallback.updatedState);
  }
  fallback.updatedState.client_facing_reply = fallback.clientFacingReply;
  fallback.bookingRequest.ready_to_search_availability = fallback.updatedState.ready_to_search_availability;
  fallback.offeredSlots = [];
  return fallback;
  }
}

async function getOrCreateConversation(input: {
  channel: string;
  customerPhone: string;
  businessPhone: string;
  providerConversationId: string;
}) {
  async function closeOtherConversations(phone: string, keepId: string) {
    const rows = await supabase
      .from("sms_booking_conversations")
      .update({
        status: "closed",
        last_message_at: new Date().toISOString(),
      })
      .eq("customer_phone", normalizeString(phone))
      .neq("id", normalizeString(keepId))
      .in("status", ["active", "needs_handoff"]);
    if (rows.error) throw rows.error;
  }

  const existing = await supabase
    .from("sms_booking_conversations")
    .select("*")
    .eq("channel", normalizeString(input.channel) || "sms_webhook")
    .eq("customer_phone", normalizeString(input.customerPhone))
    .limit(1)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data) {
    await closeOtherConversations(normalizeString(input.customerPhone), normalizeString(existing.data.id));
    return existing.data as SmsConversationRecord;
  }

  const fallbackExisting = await supabase
    .from("sms_booking_conversations")
    .select("*")
    .eq("customer_phone", normalizeString(input.customerPhone))
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fallbackExisting.error) throw fallbackExisting.error;
  if (fallbackExisting.data) {
    const reused = await supabase
      .from("sms_booking_conversations")
      .update({
        channel: normalizeString(input.channel) || "sms_webhook",
        business_phone: normalizeString(input.businessPhone) || null,
        status: "active",
        last_message_at: new Date().toISOString(),
        metadata: {
          ...safeObject(fallbackExisting.data.metadata),
          provider_conversation_id: normalizeString(input.providerConversationId) || null,
        },
      })
      .eq("id", normalizeString(fallbackExisting.data.id))
      .select("*")
      .single();

    if (reused.error) throw reused.error;
    await closeOtherConversations(normalizeString(input.customerPhone), normalizeString(reused.data.id));
    return reused.data as SmsConversationRecord;
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
  await closeOtherConversations(normalizeString(input.customerPhone), normalizeString(insert.data.id));
  return insert.data as SmsConversationRecord;
}

async function listRecentMessages(conversationId: string, limit = 12) {
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

async function storeMessage(input: {
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

async function sendAndStoreOutboundReply(input: {
  conversationId: string;
  provider: string;
  fromPhone: string;
  toPhone: string;
  body: string;
  rawPayload: JsonRecord;
  ai?: JsonRecord;
  stateSnapshot?: StructuredBookingState | null;
  bookingRequest?: BookingRequestDraft | null;
  internalNotes?: string | null;
  offeredSlots?: AvailabilitySlotSuggestion[];
}) {
  let providerMessageId = "";
  let deliveryResult: unknown = null;

  if (isClickSendProvider(input.provider)) {
    deliveryResult = await sendClickSendSms(normalizePhone(input.toPhone), normalizeString(input.body));
    providerMessageId = extractClickSendProviderMessageId(deliveryResult);
  }

  await storeMessage({
    conversationId: input.conversationId,
    direction: "outbound",
    provider: input.provider,
    providerMessageId,
    fromPhone: input.fromPhone,
    toPhone: input.toPhone,
    body: input.body,
    rawPayload: {
      ...safeObject(input.rawPayload),
      ...(input.stateSnapshot ? { structured_state: input.stateSnapshot } : {}),
      ...(input.bookingRequest ? { booking_request: input.bookingRequest } : {}),
      ...(input.offeredSlots?.length ? { offered_slots: input.offeredSlots } : {}),
      ...(deliveryResult ? { delivery_result: safeObject(deliveryResult), sms_sent_via: "clicksend" } : {}),
    },
    ai: {
      ...safeObject(input.ai),
      ...(input.internalNotes ? { internal_notes: input.internalNotes } : {}),
      ...(input.stateSnapshot ? { structured_state: input.stateSnapshot } : {}),
      ...(input.bookingRequest ? { booking_request: input.bookingRequest } : {}),
    },
  });

  return {
    provider_message_id: providerMessageId || null,
    delivery_result: deliveryResult,
  };
}

async function updateConversationInterpretation(conversationId: string, interpretation: InterpreterOutput) {
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
        offered_slots: interpretation.offeredSlots || [],
      },
      status: interpretation.nextAction === "handoff_to_human" ? "needs_handoff" : "active",
      last_message_at: new Date().toISOString(),
    })
    .eq("id", normalizeString(conversationId));

  if (update.error) throw update.error;
}

async function updateConversationMetadata(conversationId: string, metadataPatch: JsonRecord, status?: string) {
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
      metadata: {
        ...existingMetadata,
        ...metadataPatch,
      },
      ...(status ? { status } : {}),
      last_message_at: new Date().toISOString(),
    })
    .eq("id", normalizeString(conversationId));

  if (update.error) throw update.error;
}

async function getPaymentSessionByToken(token: string) {
  const query = await supabase
    .from("sms_booking_payment_sessions")
    .select("*")
    .eq("token", normalizeString(token))
    .limit(1)
    .maybeSingle();

  if (query.error) throw query.error;
  return query.data ? query.data as PaymentSessionRecord : null;
}

async function updatePaymentSession(token: string, patch: JsonRecord) {
  const update = await supabase
    .from("sms_booking_payment_sessions")
    .update(patch)
    .eq("token", normalizeString(token))
    .select("*")
    .single();

  if (update.error) throw update.error;
  return update.data as PaymentSessionRecord;
}

async function getConversationByPhone(phone: string) {
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

async function listConversationsByPhone(phone: string, limit = 20) {
  const query = await supabase
    .from("sms_booking_conversations")
    .select("*")
    .eq("customer_phone", normalizeString(phone))
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (query.error) throw query.error;
  return (Array.isArray(query.data) ? query.data : []) as SmsConversationRecord[];
}

async function getConversationById(conversationId: string) {
  const conversationQuery = await supabase
    .from("sms_booking_conversations")
    .select("*")
    .eq("id", normalizeString(conversationId))
    .limit(1)
    .maybeSingle();

  if (conversationQuery.error) throw conversationQuery.error;
  if (!conversationQuery.data) return null;

  const conversation = conversationQuery.data as SmsConversationRecord;
  const messages = await listRecentMessages(conversation.id, 100);
  return { conversation, messages };
}

async function deleteConversationByChannelAndPhone(channel: string, phone: string) {
  const query = await supabase
    .from("sms_booking_conversations")
    .select("id")
    .eq("channel", normalizeString(channel))
    .eq("customer_phone", normalizeString(phone))
    .limit(1)
    .maybeSingle();

  if (query.error) throw query.error;
  const conversationId = normalizeString(query.data?.id);
  if (!conversationId) return;

  const remove = await supabase
    .from("sms_booking_conversations")
    .delete()
    .eq("id", conversationId);

  if (remove.error) throw remove.error;
}

async function deleteConversationsByPhone(phone: string) {
  const remove = await supabase
    .from("sms_booking_conversations")
    .delete()
    .eq("customer_phone", normalizeString(phone));

  if (remove.error) throw remove.error;
}

async function parseIncomingBody(req: Request) {
  const contentType = normalizeLowerString(req.headers.get("content-type"));
  if (contentType.includes("application/json")) {
    const body = safeObject(await req.json().catch(() => ({})));
    return { body, rawText: JSON.stringify(body) };
  }
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formText = await req.text();
    const params = new URLSearchParams(formText);
    const body: JsonRecord = {};
    for (const [key, value] of params.entries()) body[key] = value;
    return { body, rawText: formText };
  }
  const rawText = await req.text();
  try {
    return { body: safeObject(rawText ? JSON.parse(rawText) : {}), rawText };
  } catch {
    return { body: {}, rawText };
  }
}

async function tryHandleOfferedSlotSelection(input: {
  conversation: SmsConversationRecord;
  inbound: InboundSmsMessage;
}) {
  const metadata = safeObject(input.conversation.metadata);
  if (normalizeString(metadata.next_action) !== "search_availability") return null;
  const offeredSlots = safeArray<JsonRecord>(metadata.offered_slots).map((slot) => ({
    id: normalizeString(slot.id),
    label: normalizeString(slot.label),
    start_at: normalizeString(slot.start_at),
    date: normalizeString(slot.date),
  })).filter((slot) => slot.id && slot.label);
  const selectedIndex = parseOfferedSlotSelection(input.inbound.body, offeredSlots);
  if (selectedIndex < 0) return null;

  const bookingRequest = safeObject(metadata.booking_request) as unknown as BookingRequestDraft;
  if (!Array.isArray(bookingRequest?.resolved_services) || !bookingRequest.resolved_services.length) {
    return null;
  }

  const session = await createPaymentSessionFromSelection({
    conversation: input.conversation,
    bookingRequest,
    selectedSlot: offeredSlots[selectedIndex],
  });
  const link = buildPaymentSessionUrl(session.token);
  const serviceSummary = summarizeRequestedServices(bookingRequest.requested_services || []);
  const heldSummary = serviceSummary
    ? `${offeredSlots[selectedIndex].label} for ${serviceSummary}`
    : offeredSlots[selectedIndex].label;
  const reply = link
    ? `Perfect, I'm holding ${heldSummary} for you, but you must complete your booking here:\n${link}`
    : `Perfect, I'm holding ${heldSummary} for you. Use this code to complete your booking: ${session.token}`;

  await updateConversationMetadata(input.conversation.id, {
    selected_slot: offeredSlots[selectedIndex],
    payment_session_token: session.token,
    payment_session_status: session.status,
    payment_session_url: link || null,
    offered_slots: [],
    next_action: "ready_to_book",
  });

  return {
    ok: true,
    reply,
    next_action: "ready_to_book",
    payment_session: session,
    payment_session_url: link || null,
    selected_slot: offeredSlots[selectedIndex],
  };
}

async function tryHandleNumericClarificationReply(input: {
  conversation: SmsConversationRecord;
  inbound: InboundSmsMessage;
  recentMessages: SmsMessageRecord[];
}) {
  if (!isNumericOnlyReply(input.inbound.body)) return null;

  const metadata = safeObject(input.conversation.metadata);
  if (normalizeString(metadata.next_action) === "search_availability") return null;

  const lastOutbound = [...input.recentMessages]
    .reverse()
    .find((message) => message.direction === "outbound");
  if (!lastOutbound) return null;
  if (isNoAvailabilityReply(lastOutbound.body)) return null;
  if (/reply with\s+1,\s*2,\s*or\s*3/i.test(lastOutbound.body)) return null;

  const reply = buildNumericClarificationReply(input.conversation);
  await updateConversationMetadata(input.conversation.id, {
    next_action: "ask_clarifying_question",
    internal_notes: "Ignored numeric-only clarification reply because there was no active numbered choice to select.",
  });

  return {
    ok: true,
    reply,
    next_action: "ask_clarifying_question",
  };
}

async function tryHandleAppointmentSelection(input: {
  conversation: SmsConversationRecord;
  inbound: InboundSmsMessage;
}) {
  const metadata = safeObject(input.conversation.metadata);
  const lookup = safeObject(metadata.appointment_lookup);
  const appointments = safeArray<JsonRecord>(lookup.appointments)
    .map((row) => normalizeStoredUpcomingAppointmentItem(row))
    .filter((row): row is UpcomingAppointmentLookupItem => !!row);
  if (!appointments.length) return null;

  if (/\b(nevermind|never mind|ignore that|stop|forget it)\b/i.test(input.inbound.body)) {
    await updateConversationMetadata(input.conversation.id, {
      appointment_lookup: null,
      next_action: "answer_question",
    });
    return {
      ok: true,
      reply: "No problem. If you want to manage an appointment later, just text me here.",
      next_action: "answer_question" as NextAction,
    };
  }

  const selectedIndex = extractSelectionIndex(input.inbound.body, appointments.length);
  if (selectedIndex < 0 || !appointments[selectedIndex]) return null;

  const selected = appointments[selectedIndex];
  const requestedAction = normalizeLowerString(lookup.requested_action) as AppointmentLookupIntent | "";
  const actionPhrase = requestedAction === "cancel"
    ? "cancel that appointment"
    : requestedAction === "reschedule"
    ? "reschedule that appointment"
    : "manage that appointment";
  const manageUrl = buildAppointmentManageUrl(selected.public_token);
  const reply = manageUrl
    ? `Here’s the link to ${actionPhrase}: ${manageUrl}`
    : "I found the right appointment, but I couldn’t generate the manage link just yet.";

  await updateConversationMetadata(input.conversation.id, {
    appointment_lookup: null,
    selected_appointment: selected,
    next_action: "answer_question",
  });

  return {
    ok: true,
    reply,
    next_action: "answer_question" as NextAction,
    selected_appointment: selected,
    manage_url: manageUrl || null,
  };
}

async function tryHandleAppointmentLookup(input: {
  conversation: SmsConversationRecord;
  inbound: InboundSmsMessage;
}) {
  const intent = detectAppointmentLookupIntent(input.inbound.body);
  if (!intent) return null;
  const currentState = mergeAppointmentState(
    createEmptyState(input.inbound.fromPhone),
    safeObject(input.conversation.state) as unknown as Partial<StructuredBookingState>,
  );
  const nextIntent = intent === "cancel"
    ? "cancel"
    : intent === "reschedule"
    ? "reschedule"
    : "general_question";

  const appointments = await fetchUpcomingAppointmentsByPhone(input.inbound.fromPhone).catch((error) => {
    console.error("Failed to fetch upcoming appointments", error);
    return [] as UpcomingAppointmentLookupItem[];
  });

  if (!appointments.length) {
    const nextState: StructuredBookingState = {
      ...currentState,
      intent: nextIntent,
      client_facing_reply: "I’m not seeing any upcoming appointments tied to this number right now. If you used a different number for booking, send it here and I can check again.",
    };
    const nextBookingRequest = buildBookingRequestDraft(nextState);
    await updateConversationInterpretation(input.conversation.id, {
      updatedState: nextState,
      clientFacingReply: nextState.client_facing_reply,
      internalNotes: "Handled appointment lookup request with no upcoming appointments found for the phone number.",
      nextAction: "answer_question",
      bookingRequest: nextBookingRequest,
      offeredSlots: [],
    });
    await updateConversationMetadata(input.conversation.id, {
      appointment_lookup: null,
      next_action: "answer_question",
    });
    return {
      ok: true,
      reply: nextState.client_facing_reply,
      next_action: "answer_question" as NextAction,
    };
  }

  const lines = appointments.map((appointment, index) => `${index + 1}. ${appointment.label}`);
  const intro = intent === "cancel"
    ? "I found these upcoming appointments on this number. Reply with the number of the one you want to cancel, and I’ll send the manage link."
    : intent === "reschedule"
    ? "I found these upcoming appointments on this number. Reply with the number of the one you want to reschedule, and I’ll send the manage link."
    : "Here are the upcoming appointments I found on this number. Reply with the number of the one you want to manage, and I’ll send the link.";
  const reply = `${intro}\n\n${lines.join("\n")}`;
  const nextState: StructuredBookingState = {
    ...currentState,
    intent: nextIntent,
    client_facing_reply: reply,
  };
  const nextBookingRequest = buildBookingRequestDraft(nextState);

  await updateConversationInterpretation(input.conversation.id, {
    updatedState: nextState,
    clientFacingReply: nextState.client_facing_reply,
    internalNotes: "Handled appointment lookup request and returned a numbered list of matching appointments.",
    nextAction: "ask_clarifying_question",
    bookingRequest: nextBookingRequest,
    offeredSlots: [],
  });
  await updateConversationMetadata(input.conversation.id, {
    appointment_lookup: {
      requested_action: intent,
      appointments,
    },
    next_action: "ask_clarifying_question",
  });

  return {
    ok: true,
    reply,
    next_action: "ask_clarifying_question" as NextAction,
    appointments,
  };
}

async function tryHandleAppointmentLookupNameReply(input: {
  conversation: SmsConversationRecord;
  inbound: InboundSmsMessage;
  recentMessages: SmsMessageRecord[];
}) {
  const lastOutbound = [...input.recentMessages]
    .reverse()
    .find((message) => message.direction === "outbound");
  if (!lastOutbound || !isAppointmentLookupNamePrompt(lastOutbound.body)) return null;

  const appointments = await fetchUpcomingAppointmentsByPhone(input.inbound.fromPhone).catch((error) => {
    console.error("Failed to fetch upcoming appointments after name confirmation", error);
    return [] as UpcomingAppointmentLookupItem[];
  });

  const clientName = normalizeString(input.inbound.body);
  if (!appointments.length) {
    await updateConversationMetadata(input.conversation.id, {
      appointment_lookup: null,
      next_action: "answer_question",
    });
    return {
      ok: true,
      reply: "I’m not seeing any upcoming appointments tied to this number right now. If you used a different number for booking, send it here and I can check again.",
      next_action: "answer_question" as NextAction,
      client_name: clientName || null,
    };
  }

  const lines = appointments.map((appointment, index) => `${index + 1}. ${appointment.label}`);
  const reply = `${clientName ? `Thanks, ${splitName(clientName).first || clientName}! ` : ""}Here are the upcoming appointments I found on this number. Reply with the number of the one you want to manage, and I’ll send the link.\n\n${lines.join("\n")}`;

  await updateConversationMetadata(input.conversation.id, {
    appointment_lookup: {
      requested_action: "view",
      appointments,
    },
    next_action: "ask_clarifying_question",
  });

  return {
    ok: true,
    reply,
    next_action: "ask_clarifying_question" as NextAction,
    appointments,
    client_name: clientName || null,
  };
}

async function tryHandleAvailabilityMetaQuestion(input: {
  conversation: SmsConversationRecord;
  inbound: InboundSmsMessage;
}) {
  if (!isAvailabilityMetaQuestion(input.inbound.body)) return null;

  const metadata = safeObject(input.conversation.metadata);
  if (normalizeString(metadata.next_action) !== "search_availability") return null;

  const offeredSlots = safeArray<JsonRecord>(metadata.offered_slots).map((slot) => ({
    id: normalizeString(slot.id),
    label: normalizeString(slot.label),
    start_at: normalizeString(slot.start_at),
    date: normalizeString(slot.date),
  })).filter((slot) => slot.id && slot.label);
  if (!offeredSlots.length) return null;

  const bookingRequest = safeObject(metadata.booking_request) as unknown as BookingRequestDraft;
  const serviceSummary = summarizeRequestedServices(bookingRequest?.requested_services || []);
  const reply = serviceSummary
    ? `Yes, those are the next available openings I’m seeing for ${serviceSummary}. Reply with 1, 2, or 3, or send another day/time if you want me to keep looking.`
    : "Yes, those are the next available openings I’m seeing right now. Reply with 1, 2, or 3, or send another day/time if you want me to keep looking.";

  await updateConversationMetadata(input.conversation.id, {
    next_action: "answer_question",
    internal_notes: "Answered a meta availability question from the currently offered slots without rerunning the search.",
  });

  return {
    ok: true,
    reply,
    next_action: "answer_question" as NextAction,
    offered_slots: offeredSlots,
  };
}

function normalizeInboundPayload(body: JsonRecord) {
  const payload = safeObject(body.payload || body.message || body.sms || body.data);
  const merged = { ...body, ...payload };

  return {
    provider: inferSmsProvider(body, merged),
    providerMessageId: normalizeString(merged.provider_message_id || merged.message_id || merged.sms_id || merged.SmsMessageSid || merged.MessageSid || merged.id),
    providerConversationId: normalizeString(merged.conversation_id || merged.thread_id || merged.chat_id),
    fromPhone: normalizePhone(merged.from_phone || merged.from || merged.From || merged.phone || merged.sender),
    toPhone: normalizePhone(merged.to_phone || merged.to || merged.To || merged.recipient),
    body: normalizeString(merged.body || merged.message || merged.text || merged.Body || merged.sms || merged.content),
    timestamp: normalizeString(merged.timestamp || merged.created_at || merged.date || merged.sent_at) || new Date().toISOString(),
    rawPayload: body,
  } satisfies InboundSmsMessage;
}

type InboundLifecycleContext = {
  inbound: InboundSmsMessage;
  conversation: SmsConversationRecord;
  recentMessages: SmsMessageRecord[];
  resetRequested: boolean;
};

type InboundLifecycleReply = {
  reply: string;
  nextAction: string | null;
  generatedBy: string;
  responseBody?: JsonRecord;
  rawPayload?: JsonRecord;
  ai?: JsonRecord;
  internalNotes?: string | null;
  offeredSlots?: AvailabilitySlotSuggestion[];
  stateSnapshot?: StructuredBookingState | null;
  bookingRequest?: BookingRequestDraft | null;
};

type InboundLifecycleDecision =
  | { kind: "reset" }
  | { kind: "short_circuit_action" }
  | { kind: "interpretation" };

async function runInputPhase(body: JsonRecord) {
  const inbound = normalizeInboundPayload(body);
  if (!inbound.fromPhone || !inbound.body) {
    return { response: buildErrorResponse("Missing sender phone or message body", 400) };
  }

  const resetRequested = isConversationResetRequest(inbound.body);
  if (resetRequested) {
    await deleteConversationsByPhone(inbound.fromPhone);
  }

  const conversation = await getOrCreateConversation({
    channel: inbound.provider || "sms_webhook",
    customerPhone: inbound.fromPhone,
    businessPhone: inbound.toPhone,
    providerConversationId: inbound.providerConversationId,
  });

  if (normalizeString(inbound.providerMessageId)) {
    const existingInbound = await supabase
      .from("sms_booking_messages")
      .select("id")
      .eq("conversation_id", normalizeString(conversation.id))
      .eq("direction", "inbound")
      .eq("provider", normalizeString(inbound.provider) || "sms_webhook")
      .eq("provider_message_id", normalizeString(inbound.providerMessageId))
      .limit(1)
      .maybeSingle();
    if (existingInbound.error) throw existingInbound.error;
    if (existingInbound.data) {
      const recentMessages = await listRecentMessages(conversation.id, 12);
      const lastOutbound = [...recentMessages]
        .reverse()
        .find((message) => message.direction === "outbound");
      const metadata = safeObject(conversation.metadata);
      return {
        response: buildSuccessResponse({
          ok: true,
          duplicate: true,
          conversation_id: conversation.id,
          reply: normalizeString(lastOutbound?.body),
          next_action: normalizeString(metadata.next_action) || null,
        }),
      };
    }
  }

  await storeMessage({
    conversationId: conversation.id,
    direction: "inbound",
    provider: inbound.provider,
    providerMessageId: inbound.providerMessageId,
    fromPhone: inbound.fromPhone,
    toPhone: inbound.toPhone,
    body: inbound.body,
    rawPayload: {
      ...safeObject(inbound.rawPayload),
      normalized_inbound: {
        provider: inbound.provider,
        provider_message_id: inbound.providerMessageId,
        provider_conversation_id: inbound.providerConversationId,
        from_phone: inbound.fromPhone,
        to_phone: inbound.toPhone,
        body: inbound.body,
        timestamp: inbound.timestamp,
      },
    },
  });

  const recentMessages = await listRecentMessages(conversation.id, 12);

  return {
    context: {
      inbound,
      conversation,
      recentMessages,
      resetRequested,
    } satisfies InboundLifecycleContext,
  };
}

function buildResetLifecycleReply(): InboundLifecycleReply {
  return {
    reply: "Starting fresh. What would you like to book or manage today?",
    nextAction: "ask_clarifying_question",
    generatedBy: "sms_concierge_reset",
    ai: {
      next_action: "ask_clarifying_question",
    },
  };
}

function buildLifecycleReply(input: InboundLifecycleReply): InboundLifecycleReply {
  return input;
}

async function respondToInboundLifecycle(
  context: InboundLifecycleContext,
  reply: InboundLifecycleReply,
) {
  await sendAndStoreOutboundReply({
    conversationId: context.conversation.id,
    provider: context.inbound.provider,
    fromPhone: context.inbound.toPhone,
    toPhone: context.inbound.fromPhone,
    body: reply.reply,
    rawPayload: {
      generated_by: reply.generatedBy,
      next_action: reply.nextAction,
      ...safeObject(reply.rawPayload),
    },
    ai: {
      ...safeObject(reply.ai),
      ...(reply.nextAction ? { next_action: reply.nextAction } : {}),
    },
    stateSnapshot: reply.stateSnapshot || undefined,
    bookingRequest: reply.bookingRequest || undefined,
    internalNotes: reply.internalNotes || undefined,
    offeredSlots: reply.offeredSlots || [],
  });

  return buildSuccessResponse({
    ok: true,
    conversation_id: context.conversation.id,
    reply: reply.reply,
    next_action: reply.nextAction,
    ...(reply.responseBody || {}),
  });
}

function runDecisionPhase(context: InboundLifecycleContext): InboundLifecycleDecision {
  if (context.resetRequested) {
    return { kind: "reset" };
  }

  // Deterministic slot-selection, appointment-management, and follow-up flows get first pass
  // before we spend AI tokens or mutate booking state through the interpretation engine.
  return { kind: "short_circuit_action" };
}

async function runActionPhase(context: InboundLifecycleContext) {
  const appointmentLookupResult = await tryHandleAppointmentLookup({
    conversation: context.conversation,
    inbound: context.inbound,
  });
  if (appointmentLookupResult) {
    return buildLifecycleReply({
      reply: appointmentLookupResult.reply,
      nextAction: appointmentLookupResult.next_action,
      generatedBy: "sms_concierge_appointment_lookup",
      rawPayload: {
        appointments: appointmentLookupResult.appointments || [],
      },
      internalNotes: "Looked up upcoming appointments by phone number and sent a numbered appointment list.",
      responseBody: {
        appointments: appointmentLookupResult.appointments || [],
      },
    });
  }

  const selectionResult = await tryHandleOfferedSlotSelection({
    conversation: context.conversation,
    inbound: context.inbound,
  });
  if (selectionResult) {
    return buildLifecycleReply({
      reply: selectionResult.reply,
      nextAction: selectionResult.next_action,
      generatedBy: "sms_concierge_slot_selection",
      rawPayload: {
        selected_slot: selectionResult.selected_slot,
        payment_session_token: selectionResult.payment_session.token,
        payment_session_url: selectionResult.payment_session_url,
      },
      internalNotes: "Client selected an offered availability slot and was sent the booking completion link.",
      responseBody: {
        payment_session: selectionResult.payment_session,
        payment_session_url: selectionResult.payment_session_url,
        selected_slot: selectionResult.selected_slot,
      },
    });
  }

  const appointmentLookupNameReplyResult = await tryHandleAppointmentLookupNameReply({
    conversation: context.conversation,
    inbound: context.inbound,
    recentMessages: context.recentMessages,
  });
  if (appointmentLookupNameReplyResult) {
    if (appointmentLookupNameReplyResult.client_name) {
      const update = await supabase
        .from("sms_booking_conversations")
        .update({
          customer_name: appointmentLookupNameReplyResult.client_name,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", normalizeString(context.conversation.id));
      if (update.error) throw update.error;
    }
    return buildLifecycleReply({
      reply: appointmentLookupNameReplyResult.reply,
      nextAction: appointmentLookupNameReplyResult.next_action,
      generatedBy: "sms_concierge_appointment_lookup_name_reply",
      rawPayload: {
        appointments: appointmentLookupNameReplyResult.appointments || [],
      },
      internalNotes: "Recovered an appointment lookup after a name-confirmation prompt and returned the phone-matched appointment list.",
      responseBody: {
        appointments: appointmentLookupNameReplyResult.appointments || [],
      },
    });
  }

  const appointmentSelectionResult = await tryHandleAppointmentSelection({
    conversation: context.conversation,
    inbound: context.inbound,
  });
  if (appointmentSelectionResult) {
    return buildLifecycleReply({
      reply: appointmentSelectionResult.reply,
      nextAction: appointmentSelectionResult.next_action,
      generatedBy: "sms_concierge_appointment_selection",
      rawPayload: {
        selected_appointment: appointmentSelectionResult.selected_appointment || null,
        manage_url: appointmentSelectionResult.manage_url || null,
      },
      internalNotes: "Client selected an appointment from the lookup list and was sent the manage link.",
      responseBody: {
        selected_appointment: appointmentSelectionResult.selected_appointment || null,
        manage_url: appointmentSelectionResult.manage_url || null,
      },
    });
  }

  const numericClarificationResult = await tryHandleNumericClarificationReply({
    conversation: context.conversation,
    inbound: context.inbound,
    recentMessages: context.recentMessages,
  });
  if (numericClarificationResult) {
    return buildLifecycleReply({
      reply: numericClarificationResult.reply,
      nextAction: numericClarificationResult.next_action,
      generatedBy: "sms_concierge_numeric_clarification_guard",
      internalNotes: "Ignored numeric-only reply because there was no active numbered choice to select.",
    });
  }

  const noAvailabilitySelectionResult = await tryHandleNoAvailabilitySelection({
    conversation: context.conversation,
    inbound: context.inbound,
    recentMessages: context.recentMessages,
  });
  if (noAvailabilitySelectionResult) {
    return buildLifecycleReply({
      reply: noAvailabilitySelectionResult.reply,
      nextAction: noAvailabilitySelectionResult.next_action,
      generatedBy: "sms_concierge_no_availability_selection",
      rawPayload: {
        offered_slots: noAvailabilitySelectionResult.offered_slots || [],
      },
      internalNotes: "Handled a no-availability follow-up selection and returned the next fallback path.",
      offeredSlots: noAvailabilitySelectionResult.offered_slots || [],
      responseBody: {
        offered_slots: noAvailabilitySelectionResult.offered_slots || [],
      },
    });
  }

  const bookingActionResult = await tryHandleBookingAction({
    conversation: context.conversation,
    inbound: context.inbound,
    recentMessages: context.recentMessages,
  });
  if (bookingActionResult) {
    return buildLifecycleReply({
      reply: bookingActionResult.reply,
      nextAction: bookingActionResult.next_action,
      generatedBy: "sms_concierge_booking_action",
      rawPayload: {
        offered_slots: bookingActionResult.offered_slots || [],
      },
      internalNotes: "Handled a booking follow-up with the lightweight booking action classifier.",
      offeredSlots: bookingActionResult.offered_slots || [],
      responseBody: {
        offered_slots: bookingActionResult.offered_slots || [],
      },
    });
  }

  const availabilityMetaQuestionResult = await tryHandleAvailabilityMetaQuestion({
    conversation: context.conversation,
    inbound: context.inbound,
  });
  if (availabilityMetaQuestionResult) {
    return buildLifecycleReply({
      reply: availabilityMetaQuestionResult.reply,
      nextAction: availabilityMetaQuestionResult.next_action,
      generatedBy: "sms_concierge_availability_meta_question",
      rawPayload: {
        offered_slots: availabilityMetaQuestionResult.offered_slots || [],
      },
      internalNotes: "Answered a meta availability question from the currently offered slots.",
      offeredSlots: availabilityMetaQuestionResult.offered_slots || [],
      responseBody: {
        offered_slots: availabilityMetaQuestionResult.offered_slots || [],
      },
    });
  }

  return null;
}

async function runInterpretationPhase(context: InboundLifecycleContext) {
  return await interpretIncomingMessage({
    conversation: context.conversation,
    inbound: context.inbound,
    recentMessages: context.recentMessages,
  });
}

async function runStatePhase(context: InboundLifecycleContext, interpretation: InterpreterOutput) {
  await updateConversationInterpretation(context.conversation.id, interpretation);
}

async function runResponsePhase(
  context: InboundLifecycleContext,
  reply: InboundLifecycleReply,
) {
  return await respondToInboundLifecycle(context, reply);
}

function buildInterpretationLifecycleReply(interpretation: InterpreterOutput): InboundLifecycleReply {
  return buildLifecycleReply({
    reply: interpretation.clientFacingReply,
    nextAction: interpretation.nextAction,
    generatedBy: "sms_concierge_ai",
    rawPayload: {
      structured_state: interpretation.updatedState,
    },
    ai: {
      internal_notes: interpretation.internalNotes,
    },
    stateSnapshot: interpretation.updatedState,
    bookingRequest: interpretation.bookingRequest,
    internalNotes: interpretation.internalNotes,
    offeredSlots: interpretation.offeredSlots || [],
    responseBody: {
      updated_state: interpretation.updatedState,
      booking_request: interpretation.bookingRequest,
      offered_slots: interpretation.offeredSlots || [],
      internal_notes: interpretation.internalNotes,
    },
  });
}

async function handleInboundWebhook(body: JsonRecord) {
  const inputPhase = await runInputPhase(body);
  if (inputPhase.response) {
    return inputPhase.response;
  }

  const context = inputPhase.context!;
  const decision = runDecisionPhase(context);

  if (decision.kind === "reset") {
    return await runResponsePhase(context, buildResetLifecycleReply());
  }

  if (decision.kind === "short_circuit_action") {
    const actionPhaseReply = await runActionPhase(context);
    if (actionPhaseReply) {
      return await runResponsePhase(context, actionPhaseReply);
    }
  }

  const interpretation = await runInterpretationPhase(context);
  await runStatePhase(context, interpretation);
  return await runResponsePhase(context, buildInterpretationLifecycleReply(interpretation));
}

async function handleSimulateConversation(body: JsonRecord) {
  const rawMessages = safeArray(body.messages);
  const messages = rawMessages
    .map((item) => typeof item === "string" ? item : normalizeString(safeObject(item).body || safeObject(item).message || safeObject(item).text))
    .map((item) => normalizeString(item))
    .filter(Boolean);

  if (!messages.length) {
    return buildErrorResponse("Missing messages[]", 400);
  }

  const fromPhone = normalizePhone(body.from || body.from_phone || body.phone) || "+19999999999";
  const toPhone = normalizePhone(body.to || body.to_phone) || "+10000000000";
  const provider = normalizeString(body.provider) || "simulation";
  const reset = body.reset !== false;
  const includeDebugTrace = body.debug === true;

  if (reset) {
    await deleteConversationsByPhone(fromPhone);
  }

  const results: JsonRecord[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const beforeRecord = await getConversationByPhone(fromPhone);
    const stateBefore = mergeAppointmentState(
      createEmptyState(fromPhone),
      safeObject(beforeRecord?.conversation?.state) as unknown as Partial<StructuredBookingState>,
    );
    const metadataBefore = safeObject(beforeRecord?.conversation?.metadata);
    const bookingRequestBefore = {
      ...buildBookingRequestDraft(stateBefore),
      ...safeObject(metadataBefore.booking_request),
      resolved_services: Array.isArray(safeObject(metadataBefore.booking_request).resolved_services)
        ? safeObject(metadataBefore.booking_request).resolved_services
        : [],
      service_preferences: Array.isArray(safeObject(metadataBefore.booking_request).service_preferences)
        ? safeObject(metadataBefore.booking_request).service_preferences
        : [],
      unresolved_service_labels: Array.isArray(safeObject(metadataBefore.booking_request).unresolved_service_labels)
        ? safeObject(metadataBefore.booking_request).unresolved_service_labels
        : [],
    } as BookingRequestDraft;
    const recentMessagesBefore = beforeRecord?.messages || [];
    const lastOutboundBefore = [...recentMessagesBefore].reverse().find((message) => message.direction === "outbound");
    const detectedAction = includeDebugTrace
      ? await classifyBookingAction({
        latestMessage: messages[index],
        previousOutboundMessage: normalizeString(lastOutboundBefore?.body),
        currentState: stateBefore,
        bookingRequest: bookingRequestBefore,
        lastOutboundWasNoAvailability: isNoAvailabilityReply(normalizeString(lastOutboundBefore?.body)),
      }).catch(() => ({
        action: "unknown",
        confidence: 0,
        entities: { service: null, staff: null, timing: null, exclude_staff: [], selection: null },
      } satisfies BookingActionResult))
      : null;

    const response = await handleInboundWebhook({
      action: "test-inbound",
      provider,
      from: fromPhone,
      to: toPhone,
      body: messages[index],
      message_id: `${provider}-${Date.now()}-${index}`,
      timestamp: new Date().toISOString(),
      simulation_index: index,
    });

    const payload = safeObject(await response.json().catch(() => ({})));
    const afterRecord = await getConversationByPhone(fromPhone);
    const stateAfter = mergeAppointmentState(
      createEmptyState(fromPhone),
      safeObject(afterRecord?.conversation?.state) as unknown as Partial<StructuredBookingState>,
    );
    const metadataAfter = safeObject(afterRecord?.conversation?.metadata);
    const bookingRequestAfter = {
      ...buildBookingRequestDraft(stateAfter),
      ...safeObject(metadataAfter.booking_request),
      resolved_services: Array.isArray(safeObject(metadataAfter.booking_request).resolved_services)
        ? safeObject(metadataAfter.booking_request).resolved_services
        : [],
      service_preferences: Array.isArray(safeObject(metadataAfter.booking_request).service_preferences)
        ? safeObject(metadataAfter.booking_request).service_preferences
        : [],
      unresolved_service_labels: Array.isArray(safeObject(metadataAfter.booking_request).unresolved_service_labels)
        ? safeObject(metadataAfter.booking_request).unresolved_service_labels
        : [],
    } as BookingRequestDraft;
    const inconsistencyErrors = includeDebugTrace
      ? detectSimulationInconsistencies({
        stateBefore,
        stateAfter,
        bookingRequestAfter,
        latestMessage: messages[index],
        reply: normalizeString(payload.reply),
        nextAction: normalizeString(payload.next_action),
      })
      : [];
    const lifecycle = includeDebugTrace
      ? buildLifecycleTrace({
        message: messages[index],
        provider,
        fromPhone,
        toPhone,
        detectedAction,
        stateBefore,
        stateAfter,
        nextAction: payload.next_action,
        reply: normalizeString(payload.reply),
        internalNotes: normalizeString(payload.internal_notes),
      })
      : null;
    results.push({
      inbound: messages[index],
      detected_action: includeDebugTrace ? detectedAction : null,
      state_before: includeDebugTrace ? stateBefore : null,
      state_after: includeDebugTrace ? stateAfter : null,
      lifecycle,
      reply: normalizeString(payload.reply),
      expected_reply: normalizeString(payload.reply),
      next_action: payload.next_action,
      updated_state: safeObject(payload.updated_state),
      booking_request: safeObject(payload.booking_request),
      offered_slots: safeArray(payload.offered_slots),
      payment_session_url: normalizeString(payload.payment_session_url),
      internal_notes: normalizeString(payload.internal_notes),
      inconsistency_errors: includeDebugTrace ? inconsistencyErrors : [],
    });
  }

  const record = await getConversationByPhone(fromPhone);
  const failures = includeDebugTrace
    ? results.flatMap((result) => safeArray<string>(result.inconsistency_errors))
    : [];

  return buildSuccessResponse({
    ok: failures.length === 0,
    simulated: true,
    from_phone: fromPhone,
    to_phone: toPhone,
    provider,
    message_count: messages.length,
    results,
    conversation: record?.conversation || null,
    messages: record?.messages || [],
    final_state: safeObject(record?.conversation?.state),
    failures,
  });
}

async function handleGetConversation(body: JsonRecord) {
  const phone = normalizePhone(body.phone || body.customer_phone);
  if (!phone) return buildErrorResponse("Missing phone", 400);

  const record = await getConversationByPhone(phone);
  return buildSuccessResponse({
    ok: true,
    found: !!record,
    conversation: record?.conversation || null,
    messages: record?.messages || [],
  });
}

async function handleListConversationsByPhone(body: JsonRecord) {
  const phone = normalizePhone(body.phone || body.customer_phone);
  if (!phone) return buildErrorResponse("Missing phone", 400);

  const limit = Math.max(1, Math.min(50, Number(body.limit) || 20));
  const conversations = await listConversationsByPhone(phone, limit);
  return buildSuccessResponse({
    ok: true,
    phone,
    count: conversations.length,
    conversations: conversations.map((conversation) => ({
      id: conversation.id,
      channel: conversation.channel,
      status: conversation.status,
      latest_intent: conversation.latest_intent,
      customer_phone: conversation.customer_phone,
      business_phone: conversation.business_phone,
      last_message_at: conversation.last_message_at,
      created_at: conversation.created_at,
      updated_at: conversation.updated_at,
      state: safeObject(conversation.state),
      metadata: safeObject(conversation.metadata),
    })),
  });
}

async function handleGetConversationById(body: JsonRecord) {
  const conversationId = normalizeString(body.conversation_id || body.id);
  if (!conversationId) return buildErrorResponse("Missing conversation_id", 400);

  const record = await getConversationById(conversationId);
  return buildSuccessResponse({
    ok: true,
    found: !!record,
    conversation: record?.conversation || null,
    messages: record?.messages || [],
  });
}

async function handleGetPaymentSession(body: JsonRecord) {
  const token = normalizeString(body.token);
  if (!token) return buildErrorResponse("Missing token", 400);

  const session = await getPaymentSessionByToken(token);
  if (!session) {
    return buildSuccessResponse({
      ok: true,
      found: false,
      expired: false,
      session: null,
    });
  }

  const expired = !!(session.expires_at && new Date(session.expires_at).getTime() < Date.now());
  return buildSuccessResponse({
    ok: true,
    found: true,
    expired,
    session,
  });
}

async function handleCompletePaymentSession(body: JsonRecord) {
  const token = normalizeString(body.token);
  if (!token) return buildErrorResponse("Missing token", 400);

  const session = await getPaymentSessionByToken(token);
  if (!session) return buildErrorResponse("This payment session could not be found.", 404);
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
    return buildErrorResponse("This payment link has expired.", 410, {
      expired: true,
    });
  }
  if (normalizeLowerString(session.status) === "completed") {
    return buildSuccessResponse({
      ok: true,
      session,
      already_completed: true,
      booking_result: session.booking_result || null,
    });
  }

  const metadata = safeObject(session.metadata);
  const requestedServices = safeArray<JsonRecord>(metadata.requested_services_payload);
  if (!requestedServices.length) {
    return buildErrorResponse("This payment session is missing service details.", 400);
  }

  const slotId = normalizeString(session.slot_id);
  if (!slotId) {
    return buildErrorResponse("This payment session is missing a selected slot.", 400);
  }

  const firstName = normalizeString(body.first_name || session.first_name || splitName(normalizeString(session.customer_name)).first);
  const lastName = normalizeString(body.last_name || session.last_name || splitName(normalizeString(session.customer_name)).last);
  const email = normalizeString(body.email || session.email);
  const phone = normalizePhone(body.phone || session.phone || session.customer_phone);
  const cardToken = normalizeString(body.card_token);
  const savedCardId = normalizeString(body.saved_card_id);
  const clientToken = normalizeString(body.client_token);

  if (!firstName || !lastName || !email || !phone) {
    return buildErrorResponse("Missing required booking fields", 400);
  }

  const bookingResult = await bookingProxyRequest({
    action: "book",
    services: requestedServices,
    slot_id: slotId,
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    ...(cardToken ? { card_token: cardToken } : {}),
    ...(savedCardId ? { saved_card_id: savedCardId } : {}),
    ...(clientToken ? { client_token: clientToken } : {}),
  });

  const updatedSession = await updatePaymentSession(token, {
    status: "completed",
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    booking_result: bookingResult,
    metadata: {
      ...metadata,
      completed_at: new Date().toISOString(),
    },
  });

  if (normalizeString(updatedSession.conversation_id)) {
    await updateConversationMetadata(normalizeString(updatedSession.conversation_id), {
      payment_session_token: token,
      payment_session_status: "completed",
      booking_result: bookingResult,
      offered_slots: [],
      next_action: "ready_to_book",
    });
  }

  return buildSuccessResponse({
    ok: true,
    session: updatedSession,
    booking_result: bookingResult,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return buildErrorResponse("Method not allowed", 405);
  }

  try {
    const parsed = await parseIncomingBody(req);
    const body = safeObject(parsed.body);
    const action = normalizeLowerString(body.action || body.event || "inbound-webhook");

    switch (action) {
      case "inbound-webhook":
        return await handleInboundWebhook(body);
      case "test-inbound":
        return await handleInboundWebhook({
          ...body,
          provider: normalizeString(body.provider) || "test",
        });
      case "simulate-conversation":
        return await handleSimulateConversation(body);
      case "get-conversation":
        return await handleGetConversation(body);
      case "list-conversations-by-phone":
        return await handleListConversationsByPhone(body);
      case "get-conversation-by-id":
        return await handleGetConversationById(body);
      case "get-payment-session":
        return await handleGetPaymentSession(body);
      case "complete-payment-session":
        return await handleCompletePaymentSession(body);
      default:
        return buildErrorResponse("Unknown action", 400, {
          allowed_actions: [
            "inbound-webhook",
            "test-inbound",
            "simulate-conversation",
            "get-conversation",
            "list-conversations-by-phone",
            "get-conversation-by-id",
            "get-payment-session",
            "complete-payment-session",
          ],
        });
    }
  } catch (error) {
    return buildErrorResponse(error instanceof Error ? error.message : String(error), 500);
  }
});
