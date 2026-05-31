import {
  buildBookingRequestDraft,
  buildFallbackReply,
  buildHeuristicStatePatch,
  createEmptyState,
  finalizeAppointmentState,
  mergeAppointmentState,
} from "./serviceLogic.ts";
import type {
  AiInterpreterResult,
  InboundSmsMessage,
  InterpreterOutput,
  JsonRecord,
  SmsConversationRecord,
  SmsMessageRecord,
  StructuredBookingState,
} from "./types.ts";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";
const OPENAI_URL = Deno.env.get("OPENAI_URL") || "https://api.openai.com/v1/chat/completions";
const SALON_NAME = Deno.env.get("SMS_CONCIERGE_BRAND_NAME") || "Hairstories";

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function safeObject(value: unknown): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as JsonRecord;
}

function safeArray<T = unknown>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
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
    `You do not book the appointment directly unless all required data is available. You move the conversation forward naturally.`,
    `The tone should feel like texting a smart, warm, efficient human receptionist.`,
    `Do not sound robotic, corporate, or form-like.`,
    `Only ask the next most useful question.`,
    `Do not ask for every detail at once unless absolutely necessary.`,
    `Infer carefully from salon language, but do not overcommit when service choice is ambiguous.`,
    `Handle: new appointment requests, rescheduling, canceling, pricing questions, vague requests, out-of-order details, follow-up answers, and existing conversation state.`,
    `Recognize salon concepts including haircut, trim, layers, dusting, reshape, blowout, style, classic blowout, signature blowout, roots, root touch-up, gray coverage, single process, gloss, glaze, toner, highlights, partial highlight, full highlight, balayage, money piece, lowlights, color correction, consultation, extensions, and treatment.`,
    `Recognize stacking examples like single process + haircut + blowout, highlights + glaze + haircut, root touch-up + glaze, haircut + blowout, color + haircut, consultation only.`,
    `Recognize modifiers like long or thick hair, extensions, corrective color, extra time needed, new client color, major change, gray coverage, going lighter, going darker, adding dimension, and maintaining the current look.`,
    `Always return valid JSON with exactly these top-level keys: updated_state, client_facing_reply, internal_notes, next_action.`,
    `next_action must be one of: ask_clarifying_question, search_availability, ready_to_book, answer_question, handoff_to_human.`,
    `updated_state must preserve and improve the structured appointment memory, not wipe useful data that already exists.`,
    `client_facing_reply must be concise, human, salon-friendly, and ready to send as an SMS.`,
    `If the client asks a pricing question and the exact service is unclear, reply naturally and ask the smallest follow-up needed.`,
    `If the client wants to cancel or reschedule, do not pretend the appointment is already found. Be honest about what is known.`,
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
            intent: {
              type: "string",
              enum: [
                "book",
                "reschedule",
                "cancel",
                "pricing_question",
                "general_question",
                "unclear",
              ],
            },
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
            service_stack: {
              type: "array",
              items: { type: "string" },
            },
            service_modifiers: {
              type: "array",
              items: { type: "string" },
            },
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
              required: [
                "raw_text",
                "date_range",
                "day_preferences",
                "time_preferences",
                "urgency",
              ],
            },
            known_constraints: { type: "array", items: { type: "string" } },
            missing_required_info: { type: "array", items: { type: "string" } },
            ready_to_search_availability: { type: "boolean" },
            ready_to_book: { type: "boolean" },
            confidence: { type: "number" },
            client_facing_reply: { type: "string" },
          },
          required: [
            "intent",
            "client_name",
            "phone",
            "is_existing_client",
            "requested_services",
            "service_stack",
            "service_modifiers",
            "stylist_preference",
            "timing_preference",
            "known_constraints",
            "missing_required_info",
            "ready_to_search_availability",
            "ready_to_book",
            "confidence",
            "client_facing_reply",
          ],
        },
        client_facing_reply: { type: "string" },
        internal_notes: { type: "string" },
        next_action: {
          type: "string",
          enum: [
            "ask_clarifying_question",
            "search_availability",
            "ready_to_book",
            "answer_question",
            "handoff_to_human",
          ],
        },
      },
      required: [
        "updated_state",
        "client_facing_reply",
        "internal_notes",
        "next_action",
      ],
    },
  };
}

async function callOpenAI(input: {
  previousState: StructuredBookingState;
  heuristicState: Partial<StructuredBookingState>;
  inbound: InboundSmsMessage;
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
      temperature: 0.3,
      response_format: {
        type: "json_schema",
        json_schema: buildJsonSchema(),
      },
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(),
        },
        {
          role: "user",
          content: JSON.stringify({
            previous_state: input.previousState,
            heuristic_hints: input.heuristicState,
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

function buildFallbackInterpretation(input: {
  previousState: StructuredBookingState;
  heuristicState: Partial<StructuredBookingState>;
}) {
  const merged = finalizeAppointmentState(
    mergeAppointmentState(input.previousState, input.heuristicState),
  );

  let nextAction: InterpreterOutput["nextAction"] = "ask_clarifying_question";
  if (merged.intent === "pricing_question" || merged.intent === "general_question") {
    nextAction = "answer_question";
  } else if (merged.ready_to_search_availability) {
    nextAction = "search_availability";
  }

  const reply = merged.client_facing_reply || buildFallbackReply(merged);

  return {
    updatedState: {
      ...merged,
      client_facing_reply: reply,
    },
    clientFacingReply: reply,
    internalNotes: "Fallback heuristic interpretation used.",
    nextAction,
    bookingRequest: buildBookingRequestDraft(merged),
  } satisfies InterpreterOutput;
}

export async function interpretIncomingMessage(input: {
  conversation: SmsConversationRecord;
  inbound: InboundSmsMessage;
  recentMessages: SmsMessageRecord[];
}) {
  const previousState = mergeAppointmentState(
    createEmptyState(input.inbound.fromPhone),
    safeObject(input.conversation.state) as unknown as Partial<StructuredBookingState>,
  );
  const heuristicState = buildHeuristicStatePatch(input.inbound.body, input.inbound.fromPhone);

  try {
    const aiResult = await callOpenAI({
      previousState,
      heuristicState,
      inbound: input.inbound,
      recentMessages: input.recentMessages,
    });

    const mergedState = finalizeAppointmentState(
      mergeAppointmentState(
        mergeAppointmentState(previousState, heuristicState),
        safeObject(aiResult.updated_state) as Partial<StructuredBookingState>,
      ),
    );

    const clientFacingReply = normalizeString(aiResult.client_facing_reply) || buildFallbackReply(mergedState);

    const output: InterpreterOutput = {
      updatedState: {
        ...mergedState,
        client_facing_reply: clientFacingReply,
      },
      clientFacingReply,
      internalNotes: normalizeString(aiResult.internal_notes),
      nextAction: aiResult.next_action,
      bookingRequest: buildBookingRequestDraft(mergedState),
    };

    return output;
  } catch (error) {
    console.error("SMS concierge AI interpretation failed", error);
    return buildFallbackInterpretation({
      previousState,
      heuristicState,
    });
  }
}
