import { ensureEndpointIsReachable, simulateConversation } from "./local-sim-lib.mjs";

function asList(value) {
  return Array.isArray(value) ? value.slice() : [];
}

function asLowerList(value) {
  return asList(value).map((item) => String(item).trim().toLowerCase()).filter(Boolean);
}

function includesOnly(actual, expected) {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

function hasReplyText(reply, patterns) {
  const lower = String(reply || "").toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

function detectTimingFeatures(message) {
  const lower = String(message || "").toLowerCase();
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    .filter((day) => lower.includes(day));
  const times = [
    "after work",
    "morning",
    "afternoon",
    "evening",
    "before work",
    "before 3pm",
    "soonest available",
    "anytime works",
  ].filter((time) => lower.includes(time));
  return { hasDay: days.length > 0, hasTime: times.length > 0 };
}

function assert(condition, message, context, errors) {
  if (condition) return;
  errors.push({ message, context });
}

function assertDecisionIntegrity(state, errors, label) {
  assert(
    !(state?.needs_service_decision === false && state?.decision_question_key != null),
    `${label}: needs_service_decision is false but decision_question_key is still set`,
    state,
    errors,
  );
}

function assertServiceIntegrity(state, errors, label) {
  const serviceStack = asLowerList(state?.service_stack);
  const constraints = asLowerList(state?.known_constraints);
  assert(
    !(serviceStack.includes("root touch-up") && serviceStack.includes("single process") && !constraints.includes("all_over_refresh_confirmed")),
    `${label}: Root touch-up and Single Process coexist without explicit all-over confirmation`,
    state,
    errors,
  );
}

function assertAmbiguityCleanup(state, errors, label) {
  const missing = asLowerList(state?.missing_required_info);
  const answer = state?.decision_answer;
  if (
    answer?.question_key === "gray_coverage_scope" &&
    String(answer?.answer_key || "").toLowerCase() === "roots_or_gray"
  ) {
    assert(
      !missing.some((item) => ["gray_coverage_scope", "gray_coverage_vs_color_change", "root_only_vs_all_over"].includes(item)),
      `${label}: stale gray coverage ambiguity blockers remain after roots-only confirmation`,
      state,
      errors,
    );
  }
}

function assertTimingMergeIntegrity(turns, errors, label) {
  for (const turn of turns) {
    const input = String(turn.input || "");
    const beforeTiming = turn.oldState?.timing_preference || {};
    const afterTiming = turn.newState?.timing_preference || {};
    const features = detectTimingFeatures(input);

    if (features.hasDay && !features.hasTime && asList(beforeTiming.time_preferences).length > 0) {
      assert(
        asList(afterTiming.time_preferences).length > 0,
        `${label}: day change removed an existing time preference`,
        { input, beforeTiming, afterTiming },
        errors,
      );
    }

    if (!features.hasDay && features.hasTime && asList(beforeTiming.day_preferences).length > 0) {
      assert(
        asList(afterTiming.day_preferences).length > 0,
        `${label}: time change removed an existing day preference`,
        { input, beforeTiming, afterTiming },
        errors,
      );
    }
  }
}

function assertGlobalInvariants(simulation, errors, label) {
  for (const [index, turn] of simulation.turns.entries()) {
    assertDecisionIntegrity(turn.newState || {}, errors, `${label} turn ${index + 1}`);
    assertServiceIntegrity(turn.newState || {}, errors, `${label} turn ${index + 1}`);
    assertAmbiguityCleanup(turn.newState || {}, errors, `${label} turn ${index + 1}`);
  }
  assertDecisionIntegrity(simulation.finalState || {}, errors, `${label} final`);
  assertServiceIntegrity(simulation.finalState || {}, errors, `${label} final`);
  assertAmbiguityCleanup(simulation.finalState || {}, errors, `${label} final`);
  assertTimingMergeIntegrity(simulation.turns, errors, label);
}

function buildAssertions() {
  return [
    {
      name: "root_touchup_timing_pivot_preserves_state",
      messages: [
        "i need a touch up before vacation",
        "roots only",
        "after work",
        "actually what about Friday instead",
      ],
      assert(simulation, errors) {
        const turns = simulation.turns;
        const finalState = simulation.finalState || {};
        const turn1 = turns[0] || {};
        const turn2 = turns[1] || {};
        const turn3 = turns[2] || {};
        const turn4 = turns[3] || {};

        assert(
          turn1.newState?.service_candidate === "Root touch-up",
          "turn 1 should identify Root touch-up as the candidate service",
          turn1,
          errors,
        );
        assert(
          hasReplyText(turn1.reply, ["covering roots or gray", "all-over color refresh"]),
          "turn 1 should ask the gray coverage clarification question",
          turn1,
          errors,
        );

        assert(
          includesOnly(turn2.newState?.service_stack || [], ["Root touch-up"]),
          "turn 2 service_stack should be ['Root touch-up']",
          turn2,
          errors,
        );
        assert(
          turn2.newState?.needs_service_decision === false,
          "turn 2 should close the service decision",
          turn2,
          errors,
        );
        assert(
          turn2.newState?.decision_question_key == null,
          "turn 2 should clear decision_question_key",
          turn2,
          errors,
        );
        assert(
          turn2.newState?.decision_answer?.answer_key === "roots_or_gray",
          "turn 2 should persist the roots_or_gray decision answer",
          turn2,
          errors,
        );
        assert(
          !asLowerList(turn2.newState?.service_stack).includes("single process"),
          "turn 2 must not introduce Single Process",
          turn2,
          errors,
        );

        assert(
          includesOnly(asList(turn3.newState?.timing_preference?.time_preferences), ["after work"]),
          "turn 3 should capture after work in time_preferences",
          turn3,
          errors,
        );
        assert(
          !hasReplyText(turn3.reply, ["roots or gray", "all-over color refresh", "what day works best", "what time works best"]),
          "turn 3 must not reopen gray coverage or timing clarification",
          turn3,
          errors,
        );

        assert(
          includesOnly(asList(turn4.newState?.timing_preference?.day_preferences), ["friday"]),
          "turn 4 should replace the day preference with Friday",
          turn4,
          errors,
        );
        assert(
          includesOnly(asList(turn4.newState?.timing_preference?.time_preferences), ["after work"]),
          "turn 4 should preserve after work when the day changes",
          turn4,
          errors,
        );
        assert(
          includesOnly(asList(finalState.service_stack), ["Root touch-up"]),
          "final service_stack should be ['Root touch-up']",
          finalState,
          errors,
        );
        assert(
          finalState.needs_service_decision === false &&
            finalState.decision_question_key == null &&
            finalState.decision_answer?.answer_key === "roots_or_gray",
          "final decision state should remain resolved as roots_or_gray",
          finalState,
          errors,
        );
        assert(
          includesOnly(asList(finalState.timing_preference?.day_preferences), ["friday"]) &&
            includesOnly(asList(finalState.timing_preference?.time_preferences), ["after work"]),
          "final timing should be Friday + after work",
          finalState,
          errors,
        );
        assert(
          includesOnly(asList(finalState.missing_required_info), ["stylist_preference"]),
          "final missing_required_info should only contain stylist_preference",
          finalState,
          errors,
        );
        assert(
          hasReplyText(turn4.reply, ["stylist preference", "open to anyone on the team"]),
          "final reply should ask for stylist preference",
          turn4,
          errors,
        );
      },
    },
    {
      name: "remove_highlight_from_combo",
      messages: ["haircut and full highlight", "skip the full highlight"],
      assert(simulation, errors) {
        const finalState = simulation.finalState || {};
        assert(includesOnly(asList(finalState.service_stack), ["Haircut"]), "final service_stack should only contain Haircut", finalState, errors);
        assert(!asLowerList(finalState.service_stack).includes("full highlight"), "final service_stack should not contain Full Highlight", finalState, errors);
      },
    },
    {
      name: "remove_blowout_from_combo",
      messages: ["haircut and blowout", "just a haircut no blowout"],
      assert(simulation, errors) {
        const finalState = simulation.finalState || {};
        assert(includesOnly(asList(finalState.service_stack), ["Haircut"]), "final service_stack should only contain Haircut", finalState, errors);
        assert(!asLowerList(finalState.service_stack).includes("blowout"), "final service_stack should not contain Blowout", finalState, errors);
      },
    },
    {
      name: "replace_gloss_with_haircut",
      messages: ["gloss", "actually make it a haircut"],
      assert(simulation, errors) {
        const finalState = simulation.finalState || {};
        assert(includesOnly(asList(finalState.service_stack), ["Haircut"]), "final service_stack should only contain Haircut", finalState, errors);
        assert(!asLowerList(finalState.service_stack).includes("gloss"), "final service_stack should not contain Gloss", finalState, errors);
      },
    },
    {
      name: "dimensional_color_face_frame_resolution",
      messages: ["i want highlights", "just around my face"],
      assert(simulation, errors) {
        const finalState = simulation.finalState || {};
        const turn2 = simulation.turns[1] || {};
        assert(includesOnly(asList(finalState.service_stack), ["Face Frame"]), "final service_stack should resolve to Face Frame", finalState, errors);
        assert(!asLowerList(finalState.service_stack).includes("dimensional color"), "final service_stack should not remain generic Dimensional color", finalState, errors);
        assert(!hasReplyText(turn2.reply, ["around my face", "through the top", "whole head", "placement"]), "turn 2 reply should not ask another placement question", turn2, errors);
      },
    },
    {
      name: "preserve_time_when_day_changes",
      messages: ["after work", "Thursday instead"],
      assert(simulation, errors) {
        const finalState = simulation.finalState || {};
        assert(includesOnly(asList(finalState.timing_preference?.day_preferences), ["thursday"]), "day preference should resolve to Thursday", finalState, errors);
        assert(includesOnly(asList(finalState.timing_preference?.time_preferences), ["after work"]), "time preference should preserve after work", finalState, errors);
      },
    },
    {
      name: "preserve_day_when_time_changes",
      messages: ["Friday", "after work"],
      assert(simulation, errors) {
        const finalState = simulation.finalState || {};
        assert(includesOnly(asList(finalState.timing_preference?.day_preferences), ["friday"]), "day preference should preserve Friday", finalState, errors);
        assert(includesOnly(asList(finalState.timing_preference?.time_preferences), ["after work"]), "time preference should update to after work", finalState, errors);
      },
    },
    {
      name: "stylist_anyone_resolution",
      messages: ["root touch up", "Friday after work", "anyone is fine"],
      assert(simulation, errors) {
        const finalState = simulation.finalState || {};
        assert(finalState.stylist_preference === "any", "stylist_preference should resolve to 'any'", finalState, errors);
        assert(finalState.ready_to_search_availability === true, "state should become ready_to_search_availability", finalState, errors);
      },
    },
    {
      name: "appointment_lookup",
      messages: ["what appointments do i have coming up"],
      assert(simulation, errors) {
        const turn1 = simulation.turns[0] || {};
        assert(turn1.interpretation?.detectedAction?.action === "view_appointments", "turn 1 should classify as view_appointments", turn1, errors);
        assert((simulation.finalState?.intent || "unclear") !== "book", "appointment lookup should not enter booking intent flow", simulation.finalState, errors);
      },
    },
    {
      name: "cancel_flow",
      messages: ["i need to cancel my appointment"],
      assert(simulation, errors) {
        const finalState = simulation.finalState || {};
        assert(finalState.intent === "cancel", "final intent should be cancel", finalState, errors);
        assert(asList(finalState.service_stack).length === 0, "cancel flow should not populate booking services", finalState, errors);
      },
    },
  ];
}

const reachability = await ensureEndpointIsReachable();
if (!reachability.ok) {
  console.error(`Booking regression endpoint not reachable.\n${reachability.error}\n${reachability.hint}`);
  process.exit(1);
}

const scenarios = buildAssertions();
const failures = [];

for (const [index, scenario] of scenarios.entries()) {
  const from = `+16318349${String(100 + index).padStart(3, "0")}`;
  const simulation = await simulateConversation({
    messages: scenario.messages,
    from,
  });
  const errors = [];

  assert(simulation.response.ok, `${scenario.name}: simulation HTTP request failed`, {
    status: simulation.response.status,
    raw: simulation.raw,
  }, errors);
  assert(simulation.raw?.ok === true, `${scenario.name}: simulation payload did not report ok=true`, simulation.raw, errors);
  assertGlobalInvariants(simulation, errors, scenario.name);
  scenario.assert(simulation, errors);

  if (errors.length) {
    failures.push({
      scenario: scenario.name,
      messages: scenario.messages,
      errors,
      finalState: simulation.finalState,
      turns: simulation.turns,
    });
    console.log(`FAIL ${scenario.name}`);
  } else {
    console.log(`PASS ${scenario.name}`);
  }
}

if (failures.length) {
  console.error("");
  console.error(`Booking regression suite failed: ${failures.length} scenario(s) failed.`);
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log("");
console.log(`Booking regression suite passed: ${scenarios.length} scenario(s).`);
