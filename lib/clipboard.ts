// The async Clipboard API is denied outright in some contexts (embedded
// browsers, older Safari, a denied permission prompt) and its promise rejects.
// Callers that only await navigator.clipboard.writeText() therefore fail
// silently and the user sees nothing happen — so every copy button in the app
// goes through this instead.
//
// Returns true only when the text actually made it to the clipboard.
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.top = '0'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }
}
