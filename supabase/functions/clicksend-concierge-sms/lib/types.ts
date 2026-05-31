export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonRecord
  | JsonValue[];

export type JsonRecord = Record<string, JsonValue>;

export type SmsIntent =
  | "book"
  | "reschedule"
  | "cancel"
  | "pricing_question"
  | "general_question"
  | "unclear";

export type NextAction =
  | "ask_clarifying_question"
  | "search_availability"
  | "ready_to_book"
  | "answer_question"
  | "handoff_to_human";

export type TimingPreference = {
  raw_text: string | null;
  date_range: string | null;
  day_preferences: string[];
  time_preferences: string[];
  urgency: string | null;
};

export type RequestedService = {
  label: string;
  family: string | null;
  confidence: number | null;
  notes: string | null;
};

export type StructuredBookingState = {
  intent: SmsIntent;
  client_name: string | null;
  phone: string | null;
  is_existing_client: boolean | null;
  requested_services: RequestedService[];
  service_stack: string[];
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

export type BookingRequestDraft = {
  intent: SmsIntent;
  phone: string | null;
  client_name: string | null;
  stylist_preference: string | null;
  requested_services: RequestedService[];
  service_stack: string[];
  service_modifiers: string[];
  timing_preference: TimingPreference;
  ready_to_search_availability: boolean;
  ready_to_book: boolean;
};

export type InterpreterOutput = {
  updatedState: StructuredBookingState;
  clientFacingReply: string;
  internalNotes: string;
  nextAction: NextAction;
  bookingRequest: BookingRequestDraft;
};

export type InboundSmsMessage = {
  provider: string;
  providerMessageId: string;
  providerConversationId: string;
  fromPhone: string;
  toPhone: string;
  body: string;
  timestamp: string;
  rawPayload: JsonRecord;
};

export type SmsConversationRecord = {
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

export type SmsMessageRecord = {
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

export type AiInterpreterResult = {
  updated_state: Partial<StructuredBookingState>;
  client_facing_reply: string;
  internal_notes: string;
  next_action: NextAction;
};
