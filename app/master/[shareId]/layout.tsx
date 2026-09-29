import type { Metadata } from 'next'

// page.tsx is a client component, so the page's metadata lives here.
//
// The page shows a client's real calls — summaries and transcripts — to anyone
// holding the link. Keep it out of search engines in case a link ever ends up
// somewhere public, and never send the share URL (which is the only key to that
// data) to another site in a Referer header.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: 'same-origin',
}

export default function MasterShareLayout({ children }: { children: React.ReactNode }) {
  return children
}
