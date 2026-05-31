import type {
  BookingRequestDraft,
  RequestedService,
  StructuredBookingState,
  TimingPreference,
} from "./types.ts";

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLowerString(value: unknown) {
  return normalizeString(value).toLowerCase();
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

const SERVICE_PATTERNS: Array<{ family: string; label: string; patterns: RegExp[] }> = [
  {
    family: "haircut",
    label: "Haircut",
    patterns: [
      /\bhaircut\b/i,
      /\btrim\b/i,
      /\bcut\b/i,
      /\blayers\b/i,
      /\bbig chop\b/i,
      /\bdusting\b/i,
      /\breshape\b/i,
    ],
  },
  {
    family: "blowout",
    label: "Blowout",
    patterns: [
      /\bblowout\b/i,
      /\bblow dry\b/i,
      /\bblowdry\b/i,
      /\bstyle\b/i,
      /\bcurls\b/i,
      /\bwaves\b/i,
      /\bhot tool\b/i,
      /\bclassic blowout\b/i,
      /\bsignature blowout\b/i,
    ],
  },
  {
    family: "color",
    label: "Color",
    patterns: [
      /\broots?\b/i,
      /\broot touch[- ]?up\b/i,
      /\bgray coverage\b/i,
      /\bsingle process\b/i,
      /\bgloss\b/i,
      /\bglaze\b/i,
      /\btoner\b/i,
      /\bhighlights?\b/i,
      /\bpartial highlight\b/i,
      /\bfull highlight\b/i,
      /\bbalayage\b/i,
      /\bface frame\b/i,
      /\bmoney piece\b/i,
      /\blowlights?\b/i,
      /\bcolor correction\b/i,
      /\bblonder\b/i,
      /\bdarker\b/i,
      /\bdimension\b/i,
    ],
  },
  {
    family: "consultation",
    label: "Consultation",
    patterns: [
      /\bconsult\b/i,
      /\bconsultation\b/i,
    ],
  },
  {
    family: "extensions",
    label: "Extensions",
    patterns: [
      /\bextensions?\b/i,
      /\bmove[- ]?up\b/i,
      /\bextension maintenance\b/i,
    ],
  },
  {
    family: "treatment",
    label: "Treatment",
    patterns: [
      /\btreatment\b/i,
      /\bkeratin\b/i,
      /\bmask\b/i,
      /\bscalp treatment\b/i,
    ],
  },
];

const MODIFIER_PATTERNS: Array<{ label: string; patterns: RegExp[] }> = [
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

const DAY_PATTERNS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const TIME_PATTERNS = [
  "morning",
  "afternoon",
  "evening",
  "after work",
  "lunch",
  "open availability",
];

export function createEmptyTimingPreference(): TimingPreference {
  return {
    raw_text: null,
    date_range: null,
    day_preferences: [],
    time_preferences: [],
    urgency: null,
  };
}

export function createEmptyState(phone: string | null): StructuredBookingState {
  return {
    intent: "unclear",
    client_name: null,
    phone,
    is_existing_client: null,
    requested_services: [],
    service_stack: [],
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

function detectIntent(message: string) {
  const lower = normalizeLowerString(message);
  if (!lower) return "unclear" as const;
  if (/\b(cancel|cancellation|need to cancel)\b/.test(lower)) return "cancel" as const;
  if (/\b(reschedule|move my appointment|change my appointment)\b/.test(lower)) return "reschedule" as const;
  if (/\b(price|pricing|cost|how much)\b/.test(lower)) return "pricing_question" as const;
  if (/\b(book|appointment|come in|need to get|want to get|looking to get)\b/.test(lower)) return "book" as const;
  if (/\bhi\b|\bhello\b|\bhey\b|\bquestion\b/.test(lower)) return "general_question" as const;
  return "unclear" as const;
}

function detectServices(message: string) {
  const results: RequestedService[] = [];
  for (const definition of SERVICE_PATTERNS) {
    if (definition.patterns.some((pattern) => pattern.test(message))) {
      results.push({
        label: definition.label,
        family: definition.family,
        confidence: 0.7,
        notes: null,
      });
    }
  }
  return results;
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

function detectStylistPreference(message: string) {
  const match = normalizeString(message).match(
    /\b(?:with|w\/|see|seeing|book with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/,
  );
  return normalizeString(match?.[1] || "") || null;
}

function detectTimingPreference(message: string): TimingPreference {
  const lower = normalizeLowerString(message);
  const timing = createEmptyTimingPreference();

  if (!lower) return timing;

  timing.raw_text = normalizeString(message);

  if (lower.includes("asap") || lower.includes("soonest")) {
    timing.urgency = "asap";
  } else if (lower.includes("next week")) {
    timing.date_range = "next_week";
  } else if (lower.includes("this week")) {
    timing.date_range = "this_week";
  } else if (lower.includes("tomorrow")) {
    timing.date_range = "tomorrow";
  } else if (lower.includes("today")) {
    timing.date_range = "today";
  }

  for (const day of DAY_PATTERNS) {
    if (lower.includes(day)) timing.day_preferences.push(day);
  }
  for (const time of TIME_PATTERNS) {
    if (lower.includes(time)) timing.time_preferences.push(time);
  }
  const exactTimeMatch = normalizeString(message).match(/\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/i);
  if (exactTimeMatch) timing.time_preferences.push(normalizeString(exactTimeMatch[0]).toLowerCase());

  timing.day_preferences = uniqueStrings(timing.day_preferences);
  timing.time_preferences = uniqueStrings(timing.time_preferences);
  return timing;
}

export function buildHeuristicStatePatch(message: string, phone: string) {
  return {
    intent: detectIntent(message),
    phone,
    requested_services: detectServices(message),
    service_stack: detectServices(message).map((service) => service.label),
    service_modifiers: detectModifiers(message),
    stylist_preference: detectStylistPreference(message),
    timing_preference: detectTimingPreference(message),
  };
}

function mergeTimingPreference(previous: TimingPreference, next: Partial<TimingPreference> | null | undefined) {
  return {
    raw_text: normalizeString(next?.raw_text) || previous.raw_text,
    date_range: normalizeString(next?.date_range) || previous.date_range,
    day_preferences: uniqueStrings([
      ...previous.day_preferences,
      ...(Array.isArray(next?.day_preferences) ? next?.day_preferences.map((value) => normalizeString(value)) : []),
    ]),
    time_preferences: uniqueStrings([
      ...previous.time_preferences,
      ...(Array.isArray(next?.time_preferences) ? next?.time_preferences.map((value) => normalizeString(value)) : []),
    ]),
    urgency: normalizeString(next?.urgency) || previous.urgency,
  };
}

function mergeRequestedServices(previous: RequestedService[], next: RequestedService[]) {
  const merged = [...previous];
  for (const service of next) {
    const label = normalizeString(service.label);
    if (!label) continue;
    const existingIndex = merged.findIndex((item) => normalizeLowerString(item.label) === label.toLowerCase());
    if (existingIndex >= 0) {
      merged[existingIndex] = {
        ...merged[existingIndex],
        ...service,
        label,
      };
      continue;
    }
    merged.push({
      label,
      family: normalizeString(service.family) || null,
      confidence: typeof service.confidence === "number" ? service.confidence : null,
      notes: normalizeString(service.notes) || null,
    });
  }
  return merged;
}

export function mergeAppointmentState(
  previous: StructuredBookingState,
  next: Partial<StructuredBookingState>,
): StructuredBookingState {
  return {
    ...previous,
    intent: (normalizeString(next.intent) as StructuredBookingState["intent"]) || previous.intent,
    client_name: normalizeString(next.client_name) || previous.client_name,
    phone: normalizeString(next.phone) || previous.phone,
    is_existing_client: typeof next.is_existing_client === "boolean"
      ? next.is_existing_client
      : previous.is_existing_client,
    requested_services: mergeRequestedServices(
      previous.requested_services,
      Array.isArray(next.requested_services) ? next.requested_services : [],
    ),
    service_stack: uniqueStrings([
      ...previous.service_stack,
      ...(Array.isArray(next.service_stack) ? next.service_stack.map((value) => normalizeString(value)) : []),
    ]),
    service_modifiers: uniqueStrings([
      ...previous.service_modifiers,
      ...(Array.isArray(next.service_modifiers)
        ? next.service_modifiers.map((value) => normalizeString(value))
        : []),
    ]),
    stylist_preference: normalizeString(next.stylist_preference) || previous.stylist_preference,
    timing_preference: mergeTimingPreference(previous.timing_preference, next.timing_preference),
    known_constraints: uniqueStrings([
      ...previous.known_constraints,
      ...(Array.isArray(next.known_constraints)
        ? next.known_constraints.map((value) => normalizeString(value))
        : []),
    ]),
    missing_required_info: uniqueStrings([
      ...(Array.isArray(next.missing_required_info)
        ? next.missing_required_info.map((value) => normalizeString(value))
        : previous.missing_required_info),
    ]),
    ready_to_search_availability: typeof next.ready_to_search_availability === "boolean"
      ? next.ready_to_search_availability
      : previous.ready_to_search_availability,
    ready_to_book: typeof next.ready_to_book === "boolean"
      ? next.ready_to_book
      : previous.ready_to_book,
    confidence: typeof next.confidence === "number" ? next.confidence : previous.confidence,
    client_facing_reply: normalizeString(next.client_facing_reply) || previous.client_facing_reply,
  };
}

export function finalizeAppointmentState(state: StructuredBookingState) {
  const next = { ...state };
  const missing: string[] = [];
  const hasService = next.requested_services.length > 0 || next.service_stack.length > 0;
  const hasTiming = !!(
    next.timing_preference.raw_text ||
    next.timing_preference.date_range ||
    next.timing_preference.day_preferences.length ||
    next.timing_preference.time_preferences.length
  );

  if (next.intent === "book") {
    if (!hasService) missing.push("service");
    if (!hasTiming) missing.push("timing");
  }

  if (next.intent === "reschedule" || next.intent === "cancel") {
    next.ready_to_search_availability = false;
    next.ready_to_book = false;
    if (!next.phone) missing.push("phone");
  } else if (next.intent === "pricing_question" || next.intent === "general_question") {
    next.ready_to_search_availability = false;
    next.ready_to_book = false;
  } else {
    next.ready_to_search_availability = hasService && hasTiming;
    next.ready_to_book = false;
  }

  next.missing_required_info = uniqueStrings(missing.length ? missing : next.missing_required_info);

  let confidence = next.confidence || 0;
  if (hasService) confidence += 0.25;
  if (hasTiming) confidence += 0.25;
  if (next.stylist_preference) confidence += 0.15;
  if (next.intent && next.intent !== "unclear") confidence += 0.25;
  if (next.service_modifiers.length) confidence += 0.1;
  next.confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(2))));

  return next;
}

export function buildBookingRequestDraft(state: StructuredBookingState): BookingRequestDraft {
  return {
    intent: state.intent,
    phone: state.phone,
    client_name: state.client_name,
    stylist_preference: state.stylist_preference,
    requested_services: state.requested_services,
    service_stack: state.service_stack,
    service_modifiers: state.service_modifiers,
    timing_preference: state.timing_preference,
    ready_to_search_availability: state.ready_to_search_availability,
    ready_to_book: state.ready_to_book,
  };
}

export function buildFallbackReply(state: StructuredBookingState) {
  if (state.intent === "pricing_question") {
    if (state.requested_services.length) {
      return `Happy to help with that. I can get you pricing for ${state.requested_services.map((item) => item.label).join(", ")}. Do you want a quick estimate, or are you deciding between a couple services?`;
    }
    return `Happy to help with pricing. What service are you thinking about so I can point you the right way?`;
  }

  if (state.intent === "cancel") {
    return `I can help with that. I’ll need to pull up the appointment tied to this number so we can get it canceled correctly.`;
  }

  if (state.intent === "reschedule") {
    return `Absolutely. I can help move that appointment. Do you already know what day or time works better for you?`;
  }

  if (state.intent === "book") {
    if (state.missing_required_info.includes("service")) {
      return `Absolutely. What are you looking to book?`;
    }
    if (state.missing_required_info.includes("timing")) {
      return `Perfect. What day or time works best for you?`;
    }
    return `Perfect. I have what I need to start looking at timing options for you.`;
  }

  return `Happy to help. Tell me a little more about what you’re looking to book.`;
}
