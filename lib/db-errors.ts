// The code in this app is deployed ahead of its migrations, so a route asking
// for a column that a migration has not added yet must tell that apart from a
// real failure and fall back. PostgREST reports the missing column two ways —
// verified against the live database on 2026-09-29:
//
//   select / filter on it   42703     "column call_logs.public_ref does not exist"
//   update that sets it     PGRST204  "Could not find the 'client_status' column
//                                      of 'call_logs' in the schema cache"

export function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
}
