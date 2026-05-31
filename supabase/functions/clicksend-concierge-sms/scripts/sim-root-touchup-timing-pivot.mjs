import { ensureEndpointIsReachable, runSimulation } from "./local-sim-lib.mjs";

const TEST_NAME = "root_touchup_timing_pivot_preserves_state";
const MESSAGES = [
  "i need a touch up before vacation",
  "roots only",
  "after work",
  "actually what about Friday instead",
];

function fail(message, details = null) {
  console.error(`FAIL ${TEST_NAME}: ${message}`);
  if (details != null) {
    console.error(JSON.stringify(details, null, 2));
  }
}

function pass(message) {
  console.log(`PASS ${TEST_NAME}: ${message}`);
}

function assert(condition, message, details = null, errors = []) {
  if (!condition) {
    fail(message, details);
    errors.push(message);
    return false;
  }
  return true;
}

function normalizeList(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function normalizeLowerList(value) {
  return normalizeList(value).map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

function hasStylistPrompt(reply) {
  const lower = String(reply || "").toLowerCase();
  return lower.includes("stylist preference") ||
    lower.includes("open to anyone on the team") ||
    lower.includes("like to see") && lower.includes("open to anyone");
}

function asksTiming(reply) {
  const lower = String(reply || "").toLowerCase();
  return lower.includes("what day or time works best") ||
    lower.includes("what day works best") ||
    lower.includes("what time works best") ||
    lower.includes("day or general window") ||
    lower.includes("mornings, afternoons, evenings");
}

function asksGrayCoverageQuestion(reply) {
  const lower = String(reply || "").toLowerCase();
  return lower.includes("covering roots or gray") ||
    lower.includes("all-over color refresh") ||
    lower.includes("roots/gray coverage only");
}

function equalsJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

const reachability = await ensureEndpointIsReachable();
if (!reachability.ok) {
  console.error(`Endpoint not reachable.\n${reachability.error}\n${reachability.hint}`);
  process.exit(1);
}

const result = await runSimulation({ messages: MESSAGES });
const payload = result.json || {};
const turns = Array.isArray(payload.results) ? payload.results : [];
const finalState = payload.final_state || payload.conversation?.state || {};
const errors = [];

assert(result.response.ok, "simulation request did not return HTTP 200", {
  http_status: result.response.status,
  payload,
}, errors);
assert(payload.ok === true, "simulation payload did not report ok=true", payload, errors);
assert(turns.length === 4, "simulation did not return 4 turns", { turn_count: turns.length, payload }, errors);

const turn1 = turns[0] || {};
const turn2 = turns[1] || {};
const turn3 = turns[2] || {};
const turn4 = turns[3] || {};

const turn1After = turn1.state_after || {};
assert(
  turn1After.service_candidate === "Root touch-up",
  "turn 1 did not resolve Root touch-up as the service candidate",
  turn1After,
  errors,
);
assert(
  asksGrayCoverageQuestion(turn1.reply),
  "turn 1 reply did not ask the gray coverage clarification question",
  { reply: turn1.reply, state_after: turn1After },
  errors,
);

const turn2After = turn2.state_after || {};
assert(
  equalsJson(turn2After.service_stack, ["Root touch-up"]),
  "turn 2 service_stack is not exactly ['Root touch-up']",
  turn2After,
  errors,
);
assert(
  turn2After.needs_service_decision === false,
  "turn 2 left needs_service_decision true",
  turn2After,
  errors,
);
assert(
  turn2After.decision_question_key == null,
  "turn 2 did not clear decision_question_key",
  turn2After,
  errors,
);
assert(
  turn2After.decision_answer?.question_key === "gray_coverage_scope" &&
    turn2After.decision_answer?.answer_key === "roots_or_gray",
  "turn 2 did not preserve the resolved gray coverage decision answer",
  turn2After,
  errors,
);
assert(
  !normalizeLowerList(turn2After.service_stack).includes("single process"),
  "turn 2 introduced Single Process into service_stack",
  turn2After,
  errors,
);
assert(
  !normalizeLowerList(turn2After.missing_required_info).some((item) =>
    ["gray_coverage_scope", "gray_coverage_vs_color_change", "root_only_vs_all_over"].includes(item)
  ),
  "turn 2 still contains stale gray coverage ambiguity blockers",
  turn2After,
  errors,
);

const turn3After = turn3.state_after || {};
assert(
  equalsJson(turn3After.timing_preference?.time_preferences, ["after work"]),
  "turn 3 did not capture 'after work' timing correctly",
  turn3After,
  errors,
);
assert(
  equalsJson(turn3After.service_stack, ["Root touch-up"]),
  "turn 3 mutated the service stack",
  turn3After,
  errors,
);
assert(
  !asksGrayCoverageQuestion(turn3.reply),
  "turn 3 reopened the gray coverage question",
  { reply: turn3.reply, state_after: turn3After },
  errors,
);

const turn4After = turn4.state_after || {};
assert(
  equalsJson(turn4After.timing_preference?.day_preferences, ["friday"]),
  "turn 4 did not replace the day preference with Friday",
  turn4After,
  errors,
);
assert(
  equalsJson(turn4After.timing_preference?.time_preferences, ["after work"]),
  "turn 4 dropped the prior 'after work' time preference",
  turn4After,
  errors,
);
assert(
  equalsJson(turn4After.service_stack, ["Root touch-up"]),
  "turn 4 mutated the service stack",
  turn4After,
  errors,
);
assert(
  !normalizeLowerList(turn4After.service_stack).includes("single process"),
  "turn 4 introduced Single Process into service_stack",
  turn4After,
  errors,
);
assert(
  !asksGrayCoverageQuestion(turn4.reply),
  "turn 4 reopened the gray coverage question",
  { reply: turn4.reply, state_after: turn4After },
  errors,
);
assert(
  !asksTiming(turn4.reply),
  "turn 4 reply still asked for timing",
  { reply: turn4.reply, state_after: turn4After },
  errors,
);
assert(
  hasStylistPrompt(turn4.reply),
  "turn 4 reply did not advance to a stylist-preference prompt",
  { reply: turn4.reply, state_after: turn4After },
  errors,
);

assert(
  equalsJson(finalState.service_stack, ["Root touch-up"]),
  "final service_stack is not exactly ['Root touch-up']",
  finalState,
  errors,
);
assert(
  finalState.needs_service_decision === false,
  "final state left needs_service_decision true",
  finalState,
  errors,
);
assert(
  finalState.decision_question_key == null,
  "final state did not clear decision_question_key",
  finalState,
  errors,
);
assert(
  finalState.decision_answer?.question_key === "gray_coverage_scope" &&
    finalState.decision_answer?.answer_key === "roots_or_gray",
  "final state did not retain the resolved gray coverage decision answer",
  finalState,
  errors,
);
assert(
  equalsJson(finalState.timing_preference?.day_preferences, ["friday"]) &&
    equalsJson(finalState.timing_preference?.time_preferences, ["after work"]),
  "final timing_preference did not preserve Friday + after work",
  finalState,
  errors,
);
assert(
  equalsJson(finalState.missing_required_info, ["stylist_preference"]),
  "final missing_required_info is not limited to stylist_preference",
  finalState,
  errors,
);
assert(
  !normalizeLowerList(finalState.missing_required_info).some((item) =>
    ["gray_coverage_scope", "gray_coverage_vs_color_change", "root_only_vs_all_over"].includes(item)
  ),
  "final state still contains gray coverage ambiguity blockers",
  finalState,
  errors,
);

if (finalState.needs_service_decision === false && finalState.decision_question_key != null) {
  errors.push("final decision integrity invariant failed");
  fail("final decision integrity invariant failed", finalState);
}

if (errors.length) {
  console.error("");
  console.error(`${TEST_NAME} failed with ${errors.length} assertion(s).`);
  process.exit(1);
}

pass("all lifecycle and final-state assertions passed");
console.log(JSON.stringify({
  test_name: TEST_NAME,
  final_state: finalState,
  final_reply: turn4.reply,
}, null, 2));
