import { ensureEndpointIsReachable, printTurnTrace, runSimulation, summarizeState } from "./local-sim-lib.mjs";

const rawMessages = process.env.SIM_MESSAGES_JSON;
const messages = rawMessages
  ? JSON.parse(rawMessages)
  : ["can i book a haircut", "next Tuesday afternoon", "anyone is fine"];

const from = process.env.SIM_FROM || "+16318348150";

const reachability = await ensureEndpointIsReachable();
if (!reachability.ok) {
  console.error(`Local endpoint not reachable.\n${reachability.error}\n${reachability.hint}`);
  process.exit(1);
}

const result = await runSimulation({ messages, from });

printTurnTrace(result);

if (result.json?.final_state) {
  console.log("");
  console.log("Final state summary:");
  console.log(JSON.stringify(summarizeState(result.json.final_state), null, 2));
}

process.exit(result.response.ok ? 0 : 1);
