import type { JsonRecord } from "./types.ts";

export function buildSuccessResponse(data: unknown, headers: HeadersInit) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers,
  });
}

export function buildErrorResponse(
  error: string,
  status: number,
  headers: HeadersInit,
  extra: JsonRecord = {},
) {
  return new Response(JSON.stringify({
    ok: false,
    error,
    ...extra,
  }), {
    status,
    headers,
  });
}
