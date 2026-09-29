// public_share_id for an agent's client page (/master/[shareId]).
//
// Since Bygg BOS that link is not only the key to reading a client's calls but
// also to changing their status and notes, so it is drawn from the platform
// CSPRNG. The older generators elsewhere in the app use Math.random(), which is
// fast and fine for read-only demo links but not a security primitive.
//
// 12 characters from [0-9a-z], the same shape as every existing share id, so old
// and new links look alike: ~62 bits, far past guessing over HTTP. Rejection
// sampling (bytes >= 252 are skipped; 252 = 7 × 36) keeps every character
// equally likely.

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
const LENGTH = 12

export function newShareId(): string {
  let id = ''
  while (id.length < LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(LENGTH * 2))) {
      if (byte < 252 && id.length < LENGTH) id += ALPHABET[byte % ALPHABET.length]
    }
  }
  return id
}
