import fs from "node:fs";
import path from "node:path";

const ROOT_DIR = "/Users/chaseognibene/Documents/Playground";
const DEFAULT_ENDPOINT = "http://127.0.0.1:54321/functions/v1/clicksend-concierge-sms";
const DEFAULT_FROM = "+16318348150";

export function loadEnvFile(filePath = path.join(ROOT_DIR, ".env.local")) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  const env = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) continue;

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

export function mergedEnv() {
  return {
    ...loadEnvFile(),
    ...process.env,
  };
}

export function localEndpoint() {
  return mergedEnv().LOCAL_SIM_ENDPOINT || DEFAULT_ENDPOINT;
}

export async function ensureEndpointIsReachable(endpoint = localEndpoint()) {
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "get-conversation",
        phone: DEFAULT_FROM,
      }),
      signal: AbortSignal.timeout(15000),
    });

    return { ok: true, status: response.status };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      hint: [
        "Start the local Supabase stack and serve the edge function locally.",
        "Recommended command:",
        "supabase functions serve clicksend-concierge-sms --env-file .env.local --no-verify-jwt",
      ].join("\n"),
    };
  }
}

export async function runSimulation({ messages, from = DEFAULT_FROM, endpoint = localEndpoint(), extraPayload = {} }) {
  const payload = {
    action: "simulate-conversation",
    provider: "simulation",
    from,
    messages,
    debug: true,
    ...extraPayload,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  });

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  return { response, json, payload };
}

export async function simulateConversation({ messages, from = DEFAULT_FROM, endpoint = localEndpoint(), extraPayload = {} }) {
  const result = await runSimulation({ messages, from, endpoint, extraPayload });
  const rawTurns = Array.isArray(result?.json?.results) ? result.json.results : [];
  const turns = rawTurns.map((turn) => ({
    input: turn?.inbound ?? null,
    interpretation: turn?.lifecycle?.interpretation ?? {
      detectedAction: turn?.detected_action ?? null,
      internalNotes: turn?.internal_notes ?? null,
    },
    oldState: turn?.state_before ?? null,
    newState: turn?.state_after ?? null,
    decision: turn?.lifecycle?.decision ?? {
      nextAction: turn?.next_action ?? null,
      blockers: [],
      readyToSearchAvailability: turn?.state_after?.ready_to_search_availability ?? false,
      readyToBook: turn?.state_after?.ready_to_book ?? false,
      needsServiceDecision: turn?.state_after?.needs_service_decision ?? false,
      decisionQuestionKey: turn?.state_after?.decision_question_key ?? null,
    },
    reply: turn?.reply ?? null,
    raw: turn,
  }));

  return {
    response: result.response,
    payload: result.payload,
    raw: result.json,
    turns,
    finalState: result?.json?.final_state ?? result?.json?.conversation?.state ?? result?.json?.updated_state ?? null,
  };
}

function formatList(value) {
  if (!Array.isArray(value) || value.length === 0) return "[]";
  return JSON.stringify(value);
}

export function printTurnTrace(result) {
  const turns = Array.isArray(result?.json?.turns)
    ? result.json.turns
    : Array.isArray(result?.json?.results)
    ? result.json.results
    : [];
  const httpStatus = result?.response?.status ?? "n/a";
  const okValue = result?.json?.ok ?? false;
  const errorValue = result?.json?.error ?? null;

  console.log(`HTTP status: ${httpStatus}`);
  console.log(`ok/error: ${okValue ? "ok" : errorValue || "unknown error"}`);

  if (!turns.length) {
    console.log("No turn trace returned.");
    if (result?.json) {
      console.log(JSON.stringify(result.json, null, 2));
    }
    return;
  }

  for (const [index, turn] of turns.entries()) {
    const detectedAction = turn?.detected_action?.action ?? turn?.action_result?.action ?? "unknown";
    const before = turn?.state_before ?? {};
    const after = turn?.state_after ?? {};
    const reply =
      after?.client_facing_reply ??
      turn?.expected_reply ??
      turn?.reply ??
      result?.json?.reply ??
      null;

    console.log("");
    console.log(`Turn ${index + 1}`);
    console.log(`user message: ${turn?.user_message ?? turn?.message ?? "n/a"}`);
    console.log(`detected action: ${detectedAction}`);
    console.log(`state before: service_stack=${formatList(before?.service_stack)} requested_services=${formatList(before?.requested_services)} needs_service_decision=${before?.needs_service_decision ?? null} decision_question_key=${before?.decision_question_key ?? null}`);
    console.log(`state after: service_stack=${formatList(after?.service_stack)} requested_services=${formatList(after?.requested_services)} needs_service_decision=${after?.needs_service_decision ?? null} decision_question_key=${after?.decision_question_key ?? null}`);
    console.log(`client_facing_reply: ${reply ?? "n/a"}`);
  }
}

export function summarizeState(state) {
  return {
    service_stack: state?.service_stack ?? [],
    requested_services: state?.requested_services ?? [],
    service_candidate: state?.service_candidate ?? null,
    needs_service_decision: state?.needs_service_decision ?? null,
    decision_question_key: state?.decision_question_key ?? null,
    stylist_preference: state?.stylist_preference ?? null,
    timing_preference: state?.timing_preference ?? null,
  };
}
