# SMS Concierge Interpreter

This edge function is a practical first version of an AI receptionist for a salon SMS booking line.

It does four main things:

1. Accepts inbound SMS webhook requests
2. Loads prior conversation memory from Supabase
3. Sends the current state plus the new message to an AI interpreter
4. Saves the updated state and returns a ready-to-send SMS reply plus structured booking JSON

## Files

- [index.ts](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/index.ts)
- [lib/types.ts](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/lib/types.ts)
- [lib/serviceLogic.ts](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/lib/serviceLogic.ts)
- [lib/conversationState.ts](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/lib/conversationState.ts)
- [lib/aiInterpreter.ts](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/lib/aiInterpreter.ts)
- [lib/smsResponse.ts](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/lib/smsResponse.ts)
- [DATABASE_SUGGESTIONS.sql](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/DATABASE_SUGGESTIONS.sql)

## Environment variables

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Optional:

- `OPENAI_MODEL`
  Default: `gpt-4.1-mini`
- `OPENAI_URL`
  Default: `https://api.openai.com/v1/chat/completions`
- `SMS_CONCIERGE_BRAND_NAME`
  Default: `Hairstories`

## GitHub Actions deployment

This repo includes a GitHub Actions workflow at:

- [.github/workflows/deploy-clicksend-concierge-sms.yml](/Users/chaseognibene/Documents/Playground/.github/workflows/deploy-clicksend-concierge-sms.yml)

It deploys `clicksend-concierge-sms` automatically on every push to `main` using the official `supabase/setup-cli` action.

Required GitHub repository secrets:

- `SUPABASE_ACCESS_TOKEN`
  Create a personal access token in Supabase, then add it in GitHub under `Settings -> Secrets and variables -> Actions -> New repository secret`.
- `SUPABASE_PROJECT_ID`
  Add your Supabase project reference as a repository secret in the same GitHub Actions secrets screen.
- `SUPABASE_URL`
  The Supabase project URL used by the local regression harness in GitHub Actions.
- `SUPABASE_SERVICE_ROLE_KEY`
  The service role key used by the local regression harness and booking proxy calls in GitHub Actions.
- `OPENAI_API_KEY`
  Required so the local regression harness can exercise the real booking interpreter before deployment.

Optional GitHub repository secrets for the regression harness:

- `OPENAI_MODEL`
- `OPENAI_URL`
- `BOULEVARD_BOOKING_PROXY_URL`
- `BOULEVARD_LOCATION_ID`

Do not commit tokens, project refs, or any other credentials into this repository.

## Fast local regression loop

This repo now includes a zero-dependency local simulator loop that targets:

`http://127.0.0.1:54321/functions/v1/clicksend-concierge-sms`

Files:

- [package.json](/Users/chaseognibene/Documents/Playground/package.json)
- [.env.local](/Users/chaseognibene/Documents/Playground/.env.local)
- [local-sim-lib.mjs](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/scripts/local-sim-lib.mjs)
- [sim-one.mjs](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/scripts/sim-one.mjs)
- [test-booking.mjs](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/scripts/test-booking.mjs)
- [sim-touchup.mjs](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/scripts/sim-touchup.mjs)
- [sim-regression10.mjs](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/scripts/sim-regression10.mjs)

Suggested local serve command:

```bash
supabase functions serve clicksend-concierge-sms --env-file .env.local --no-verify-jwt
```

Then run:

```bash
npm run sim:one
npm run test:booking
npm run sim:touchup
npm run sim:regression10
```

`test:booking` is the first locked booking regression suite. It exercises service interpretation, service removal, timing pivots, ambiguity cleanup, stylist preference resolution, and appointment-management classification. The GitHub Actions deploy workflow now runs this suite before deploying `clicksend-concierge-sms`, and any regression failure blocks deployment.

`sim:touchup` posts this exact payload:

```json
{
  "action": "simulate-conversation",
  "provider": "simulation",
  "from": "+16318348150",
  "messages": [
    "i need a touch up before vacation",
    "roots only",
    "after work",
    "actually what about Friday instead"
  ],
  "debug": true
}
```

The scripts print:

- HTTP status
- ok/error
- each turn's user message
- detected action
- service_stack
- requested_services
- needs_service_decision
- decision_question_key
- client_facing_reply

## Suggested request payload

This version accepts flexible JSON and common SMS-provider field names.

```json
{
  "action": "inbound-webhook",
  "provider": "twilio",
  "from": "+16315551234",
  "to": "+16315550000",
  "body": "Hi I need my roots done next week with Jamie"
}
```

It also supports test mode:

```json
{
  "action": "test-inbound",
  "from": "+16315551234",
  "to": "+16315550000",
  "body": "I want highlights and a haircut next Thursday afternoon"
}
```

## Example response payload

```json
{
  "ok": true,
  "conversation_id": "3d3d8c54-c401-4a80-b6d3-4c16b5b09e23",
  "reply": "Absolutely. I can help with that. Are you looking for just your roots, or roots plus a glaze, haircut, or blowout?",
  "next_action": "ask_clarifying_question",
  "updated_state": {
    "intent": "book",
    "client_name": null,
    "phone": "+16315551234",
    "is_existing_client": null,
    "requested_services": [
      {
        "label": "Color",
        "family": "color",
        "confidence": 0.7,
        "notes": null
      }
    ],
    "service_stack": [
      "Color"
    ],
    "service_modifiers": [],
    "stylist_preference": "Jamie",
    "timing_preference": {
      "raw_text": "Hi I need my roots done next week with Jamie",
      "date_range": "next_week",
      "day_preferences": [],
      "time_preferences": [],
      "urgency": null
    },
    "known_constraints": [],
    "missing_required_info": [
      "service"
    ],
    "ready_to_search_availability": false,
    "ready_to_book": false,
    "confidence": 0.9,
    "client_facing_reply": "Absolutely. I can help with that. Are you looking for just your roots, or roots plus a glaze, haircut, or blowout?"
  },
  "booking_request": {
    "intent": "book",
    "phone": "+16315551234",
    "client_name": null,
    "stylist_preference": "Jamie",
    "requested_services": [
      {
        "label": "Color",
        "family": "color",
        "confidence": 0.7,
        "notes": null
      }
    ],
    "service_stack": [
      "Color"
    ],
    "service_modifiers": [],
    "timing_preference": {
      "raw_text": "Hi I need my roots done next week with Jamie",
      "date_range": "next_week",
      "day_preferences": [],
      "time_preferences": [],
      "urgency": null
    },
    "ready_to_search_availability": false,
    "ready_to_book": false
  },
  "internal_notes": "Likely root touch-up request. Need to clarify service stack before searching."
}
```

## Database table suggestions

See [DATABASE_SUGGESTIONS.sql](/Users/chaseognibene/Documents/Playground/supabase/functions/clicksend-concierge-sms/DATABASE_SUGGESTIONS.sql).

The main idea:

- `sms_booking_conversations`
  Stores one row per active SMS thread plus structured state JSON
- `sms_booking_messages`
  Stores inbound and outbound message history

## Test conversation examples

### 1. Straightforward color request

Client:

```text
Hi I need my roots done next week with Jamie
```

Expected behavior:

- intent: `book`
- likely family: `color`
- stylist preference: `Jamie`
- timing: `next_week`
- ask next: clarify whether it is roots only, or roots plus glaze, haircut, or blowout

### 2. Out-of-order follow-up

Client:

```text
Thursday afternoon works
```

If prior memory already knows this is for highlights with Carly, expected behavior:

- preserve service
- preserve stylist
- update timing preference
- if enough detail exists, move to `search_availability`

### 3. Vague blonding request

Client:

```text
I want to go blonder
```

Expected behavior:

- intent: `book`
- likely family: `color`
- modifier: `Going lighter`
- ask a clarifying question about highlights, balayage, or consultation

### 4. Reschedule request

Client:

```text
Can I move my appointment to Friday evening?
```

Expected behavior:

- intent: `reschedule`
- timing preference: `Friday evening`
- reply honestly and naturally
- likely next action: `ask_clarifying_question` or hand into your appointment lookup flow later

### 5. Pricing question

Client:

```text
How much is a haircut and blowout?
```

Expected behavior:

- intent: `pricing_question`
- service stack: haircut + blowout
- next action: `answer_question`

### 6. Cancel request

Client:

```text
I need to cancel my appointment tomorrow
```

Expected behavior:

- intent: `cancel`
- timing preference captured
- respond in a human way without pretending the appointment has already been located

## How to connect Twilio later

Twilio can POST webhook data directly to this function.

Twilio fields commonly used:

- `From`
- `To`
- `Body`
- `MessageSid`

This function already checks for those names in the inbound parser.

Typical bridge flow:

1. Twilio receives the inbound SMS
2. Twilio POSTs to this edge function
3. This function returns JSON with `reply`
4. Your server or webhook bridge sends that reply back through Twilio's outbound API

If you want the edge function to send SMS directly later, the easiest next step is:

1. add a provider module like `lib/providers/twilio.ts`
2. store provider credentials in env vars
3. after generating `reply`, call Twilio outbound API
4. save the outbound provider message id to `sms_booking_messages`

## How to connect ClickSend later

Same idea:

1. normalize inbound ClickSend payload into the shared `InboundSmsMessage` shape
2. call this interpreter
3. use the returned `reply` with ClickSend outbound API
4. save the outbound provider id

## Good next expansions

- connect service interpretation to your real Boulevard service catalog
- add availability search as a downstream action when `ready_to_search_availability = true`
- add appointment lookup for reschedule and cancel
- add structured pricing lookup
- add explicit human handoff rules
- add analytics on common booking intents and dropoff points
