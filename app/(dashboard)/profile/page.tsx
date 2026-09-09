import Panel from '../../components/Panel'

export default function ProfilePage() {
  return (
    <div>
      <Panel className="mb-6 inline-block" padding="px-5 py-3" enableTilt={false}>
        <p className="text-xs tracking-widest" style={{ color: 'var(--brick)' }}>KONTO</p>
        <h1 className="text-3xl font-bold mt-1" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
          👤 Profil
        </h1>
      </Panel>
      <Panel enableTilt={false}>
        <p style={{ color: 'var(--slate)' }}>Hantera ditt konto, display-namn och affärsinformation.</p>
        <p className="mt-2 text-sm" style={{ color: 'var(--slate)', opacity: 0.6 }}>Innehåll byggs ut i nästa steg.</p>
      </Panel>
    </div>
  )
}
