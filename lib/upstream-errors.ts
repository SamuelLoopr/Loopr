// Human-readable text for a failed Anthropic API call.
//
// The routes used to pass the raw response body straight to the browser
// (`Claude API-fel: {"type":"error","error":{...}}`), so the single most common
// real-world failure — the account being out of credits — reached the user as a
// wall of JSON with an unexplained 400 next to it. Verified against the live
// key: an exhausted balance answers 400 with
//   {"type":"error","error":{"type":"invalid_request_error",
//    "message":"Your credit balance is too low to access the Anthropic API..."}}
export function describeAnthropicError(status: number, body: string): string {
  let message = ''
  let type = ''
  try {
    const parsed = JSON.parse(body)
    message = parsed?.error?.message ?? ''
    type = parsed?.error?.type ?? ''
  } catch {
    message = body.slice(0, 300)
  }

  if (/credit balance is too low/i.test(message)) {
    return 'Anthropic-kontots krediter är slut — fyll på saldot under Plans & Billing i Anthropic Console för att kunna generera text igen.'
  }
  if (status === 401 || type === 'authentication_error') {
    return 'Anthropic avvisade API-nyckeln. Kontrollera ANTHROPIC_API_KEY i servermiljön.'
  }
  if (status === 429 || type === 'rate_limit_error') {
    return 'För många anrop mot Anthropic just nu. Vänta en stund och försök igen.'
  }
  if (/model/i.test(message) && /not.*(found|exist)|invalid/i.test(message)) {
    return `Anthropic känner inte igen den begärda modellen: ${message}`
  }
  if (status >= 500) {
    return 'Anthropic svarar inte just nu. Försök igen om en stund.'
  }
  return message ? `Anthropic-fel: ${message}` : `Anthropic-fel (${status}).`
}
