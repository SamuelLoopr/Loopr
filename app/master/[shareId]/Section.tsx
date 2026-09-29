// A titled block on the public page — shared by the sales demo (page.tsx) and
// the client's BOS view (ClientView.tsx).

export default function Section({
  eyebrow, title, blurb, children, id,
}: {
  eyebrow: string
  title: string
  blurb?: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} style={{ marginTop: 64, scrollMarginTop: 24 }}>
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
        color: 'var(--brick)', marginBottom: 8, textAlign: 'center',
      }}>
        {eyebrow}
      </p>
      <h2 style={{
        fontSize: 24, fontWeight: 700, textAlign: 'center', margin: 0,
        fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.25, color: '#f6f3ee',
      }}>
        {title}
      </h2>
      {blurb && (
        <p style={{
          textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14,
          lineHeight: 1.6, marginTop: 10, maxWidth: 520, marginLeft: 'auto', marginRight: 'auto',
        }}>
          {blurb}
        </p>
      )}
      <div style={{ marginTop: 24 }}>{children}</div>
    </section>
  )
}
