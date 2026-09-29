// The code in this app is deployed ahead of its migrations, so a route asking
// for a column or table that a migration has not added yet must tell that apart
// from a real failure and fall back. PostgREST reports each case its own way —
// verified against the live database on 2026-09-29:
//
//   select / filter on a missing column   42703     "column call_logs.public_ref does not exist"
//   update that sets a missing column     PGRST204  "Could not find the 'client_status' column
//                                                    of 'call_logs' in the schema cache"
//   any query on a missing table          PGRST205  "Could not find the table
//                                                    'public.bos_bookings' in the schema cache"

export function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

export function isMissingTable(error: { code?: string } | null | undefined): boolean {
  return error?.code === 'PGRST205' || error?.code === '42P01'
}
