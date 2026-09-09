'use client'

import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'
import LooprLogo from '@/app/components/LooprLogo'

interface Proposal {
  id: string
  title: string
  tagline: string | null
  avg_job_value: number | null
  is_public: boolean
  status: string
  share_id: string
  view_count: number | null
  created_at: string
}

interface Profile {
  display_name: string | null
  business_name: string | null
  tagline: string | null
  bio: string | null
  phone: string | null
  avatar_url: string | null
}

export default function PublicProposalPage({ params }: { params: Promise<{ shareId: string }> }) {
  const { shareId } = use(params)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('proposals')
        .select('*')
        .eq('share_id', shareId)
        .single()

      if (error || !data) { setNotFound(true); return }
      setProposal(data)

      // Advance status to 'viewed'
      const newStatus = data.status === 'sent' ? 'viewed' : data.status
      await supabase.from('proposals').update({ status: newStatus }).eq('id', data.id)

      // Load sender profile
      const { data: p } = await supabase
        .from('profile')
        .select('display_name, business_name, tagline, bio, phone, avatar_url')
        .limit(1)
        .maybeSingle()
      if (p) setProfile(p)
    }
    load()
  }, [shareId])

  const card: React.CSSProperties = {
    backgroundColor: 'rgba(21,19,19,0.85)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 16,
    backdropFilter: 'blur(8px)',
    padding: '24px 28px',
    marginBottom: 16,
  }

  if (notFound) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ textAlign: 'center', color: '#888' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
          <p>Förslaget hittades inte.</p>
        </div>
      </div>
    )
  }

  if (!proposal) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f0f0f', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
        <p style={{ color: '#555' }}>Laddar förslag...</p>
      </div>
    )
  }

  const initial = (profile?.display_name ?? profile?.business_name ?? '?').charAt(0).toUpperCase()

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1023 100%)',
      padding: '32px 16px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#f6f3ee',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>

        {/* Loopr brand */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, marginBottom: 28 }}>
          <LooprLogo size="sm" />
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Skapat med Loopr</p>
        </div>

        {/* Proposal hero */}
        <div style={card}>
          <span style={{
            display: 'inline-block', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: 'var(--brick)', background: 'rgba(168,85,247,0.12)',
            border: '1px solid rgba(168,85,247,0.28)', borderRadius: 20, padding: '4px 12px', marginBottom: 14,
          }}>
            Förslag
          </span>

          <h1 style={{ fontSize: 30, fontWeight: 700, marginBottom: 10, fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.25 }}>
            {proposal.title}
          </h1>
          {proposal.tagline && (
            <p style={{ color: 'rgba(255,255,255,0.62)', fontSize: 16, lineHeight: 1.6, marginBottom: 20 }}>
              {proposal.tagline}
            </p>
          )}

          {proposal.avg_job_value != null && (
            <div style={{
              marginTop: 4,
              padding: '18px 20px',
              borderRadius: 14,
              background: 'rgba(201,162,75,0.08)',
              border: '1px solid rgba(201,162,75,0.25)',
            }}>
              <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Uppskattat värde
              </p>
              <p style={{ fontSize: 36, fontWeight: 700, color: '#C9A24B', margin: 0, fontFamily: 'Arial, Helvetica, sans-serif', lineHeight: 1.1 }}>
                {Number(proposal.avg_job_value).toLocaleString('sv-SE')} kr
              </p>
            </div>
          )}

          <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 11, marginTop: 18 }}>
            Skapad {new Date(proposal.created_at).toLocaleDateString('sv-SE')}
          </p>
        </div>

        {/* Profile */}
        {profile && (
          <div style={card}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name ?? ''}
                  style={{ width: 60, height: 60, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid rgba(255,255,255,0.1)' }}
                />
              ) : (
                <div style={{
                  width: 60, height: 60, borderRadius: '50%', flexShrink: 0,
                  background: 'rgba(168,85,247,0.2)', border: '2px solid rgba(168,85,247,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, fontWeight: 700, color: 'var(--brick)',
                }}>
                  {initial}
                </div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                {profile.display_name && (
                  <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 2 }}>{profile.display_name}</p>
                )}
                {profile.business_name && (
                  <p style={{ color: '#C9A24B', fontSize: 13, marginBottom: profile.tagline ? 4 : 8 }}>{profile.business_name}</p>
                )}
                {profile.tagline && (
                  <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginBottom: 8 }}>{profile.tagline}</p>
                )}
                {profile.bio && (
                  <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 14, lineHeight: 1.6, marginBottom: 10 }}>{profile.bio}</p>
                )}
                {profile.phone && (
                  <a
                    href={`tel:${profile.phone.replace(/\s/g, '')}`}
                    style={{ color: '#C9A24B', fontSize: 14, textDecoration: 'none' }}
                  >
                    📞 {profile.phone}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        <div style={{ ...card, background: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.3)', textAlign: 'center' }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Redo att komma igång?</h2>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: 20, lineHeight: 1.6 }}>
            Hör av dig så bokar vi en kostnadsfri genomgång och svarar på alla dina frågor.
          </p>
          {profile?.phone ? (
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <a
                href={`tel:${profile.phone.replace(/\s/g, '')}`}
                style={{ display: 'inline-block', background: 'var(--brick)', color: 'white', borderRadius: 10, padding: '13px 28px', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
              >
                📞 Ring oss →
              </a>
              <a
                href={`mailto:?subject=${encodeURIComponent('Fråga om förslag')}`}
                style={{ display: 'inline-block', background: 'rgba(255,255,255,0.08)', color: '#f6f3ee', borderRadius: 10, padding: '13px 28px', fontSize: 15, fontWeight: 600, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                Maila oss
              </a>
            </div>
          ) : (
            <a
              href="mailto:?subject=Förfrågan om förslag"
              style={{ display: 'inline-block', background: 'var(--brick)', color: 'white', borderRadius: 10, padding: '13px 28px', fontSize: 15, fontWeight: 600, textDecoration: 'none' }}
            >
              Kontakta oss →
            </a>
          )}
          <p style={{ color: 'rgba(255,255,255,0.22)', fontSize: 11, marginTop: 16 }}>
            Ingen bindningstid • Svar inom 24h
          </p>
        </div>

        <p style={{ textAlign: 'center', color: '#2a2a2a', fontSize: 11, marginTop: 16 }}>
          Skapat med Loopr — AI-drivet säljverktyg för lokala företag
        </p>
      </div>
    </div>
  )
}
