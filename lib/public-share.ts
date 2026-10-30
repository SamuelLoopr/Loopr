// Gemensamt för de publika delningslänkarna (/audit, /forslag, /demo).
//
// Sidorna läste förut tabellerna direkt från webbläsaren med den publika
// nyckeln, vilket krävde anon-regler som gav vem som helst full åtkomst till
// audits, proposals och review_clients (läsa, ändra, ta bort). Nu läser
// servern en enda rad per share_id på service-rollen och skickar bara de fält
// sidan visar. Inga interna id:n lämnar servern.

/** Ett share_id ser ut så här; allt annat avvisas innan databasen frågas. */
export function validShareId(raw: string | undefined): string | null {
  const id = (raw ?? '').trim()
  return /^[A-Za-z0-9_-]{6,64}$/.test(id) ? id : null
}

export const NO_STORE = { 'cache-control': 'no-store' } as const
