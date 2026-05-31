import { ensureEndpointIsReachable, printTurnTrace, runSimulation, summarizeState } from "./local-sim-lib.mjs";

const reachability = await ensureEndpointIsReachable();
if (!reachability.ok) {
  console.error(`Local endpoint not reachable.\n${reachability.error}\n${reachability.hint}`);
  process.exit(1);
}

const result = await runSimulation({
  messages: [
    "i need a touch up before vacation",
    "roots only",
    "after work",
    "actually what about Friday instead",
  ],
});

printTurnTrace(result);

if (result.json?.final_state) {
  console.log("");
  console.log("Final state summary:");
  console.log(JSON.stringify(summarizeState(result.json.final_state), null, 2));
}

process.exit(result.response.ok ? 0 : 1);
