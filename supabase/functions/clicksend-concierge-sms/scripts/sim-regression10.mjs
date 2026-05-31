import { ensureEndpointIsReachable, runSimulation, summarizeState } from "./local-sim-lib.mjs";

const cases = [
  ["can i book a haircut", "next Tuesday afternoon", "anyone is fine"],
  ["i want highlights", "through the top and face", "anyone", "next Tuesday afternoon"],
  ["i want to refresh my blonde", "a little brighter", "around my face", "no preference", "any July afternoon"],
  ["i need a touch up before vacation", "roots only", "after work", "actually what about Friday instead"],
  ["i need a touch up", "all over refresh"],
  ["my friend sees Jamie and I kinda want that vibe but for color", "partial highlight maybe", "anyone is okay if Jamie does not do color", "what times do you have?", "next Tuesday afternoon"],
  ["can i book a full highlight with jamie", "im flexible before 3pm", "widen the timing"],
  ["do i have any appts booked?"],
  ["cancel my appointment"],
  ["can i move my appointment?"],
];

const reachability = await ensureEndpointIsReachable();
if (!reachability.ok) {
  console.error(`Local endpoint not reachable.\n${reachability.error}\n${reachability.hint}`);
  process.exit(1);
}

const summaries = [];

for (const [index, messages] of cases.entries()) {
  const from = `+16318348${String(300 + index).padStart(3, "0")}`;
  const result = await runSimulation({ messages, from });
  const finalState = result.json?.final_state ?? result.json?.updated_state ?? null;

  summaries.push({
    index: index + 1,
    http_status: result.response.status,
    ok: result.json?.ok ?? false,
    error: result.json?.error ?? null,
    messages,
    final_state: summarizeState(finalState),
  });

  console.log("");
  console.log(`Case ${index + 1}: ${messages.join(" -> ")}`);
  console.log(`HTTP ${result.response.status} | ${result.json?.ok ? "ok" : result.json?.error || "error"}`);
  console.log(JSON.stringify(summarizeState(finalState), null, 2));
}

console.log("");
console.log("Regression10 summary:");
console.log(JSON.stringify(summaries, null, 2));

const failed = summaries.some((entry) => !entry.ok);
process.exit(failed ? 1 : 0);
