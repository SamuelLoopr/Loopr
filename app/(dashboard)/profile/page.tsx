'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Panel from '../../components/Panel'
import { supabase } from '@/lib/supabase'

// The profile record is the same row the Förslag module's "Edit About Me"
// writes — one row per user, keyed on user_id. This page is the central place
// to edit it; the proposal editor still works and now writes user_id too, so
// both go through the owner-only policies in 021_profile_fields.sql.

const BIO_MAX = 300
const AVATAR_MAX_BYTES = 2 * 1024 * 1024
const SUPPORT_EMAIL = 'support@tryloopr.se'

interface Profile {
  id: string
  user_id: string | null
  display_name: string | null
  bio: string | null
  phone: string | null
  avatar_url: string | null
  business_name: string | null
  tagline: string | null
}

const inputStyle: React.CSSProperties = {
  backgroundColor: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: 'var(--cream)',
  borderRadius: '8px',
  padding: '8px 12px',
  width: '100%',
  fontSize: '14px',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  letterSpacing: '0.04em',
  color: 'var(--slate)',
  marginBottom: 5,
}

function SaveButton({ onClick, busy, label, busyLabel }: {
  onClick: () => void
  busy: boolean
  label: string
  busyLabel: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="text-sm font-semibold px-4 py-2 rounded-lg transition-all"
      style={{
        backgroundColor: 'rgba(168,85,247,0.2)',
        color: 'var(--brick)',
        border: '1px solid rgba(168,85,247,0.35)',
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.55 : 1,
      }}
    >
      {busy ? busyLabel : label}
    </button>
  )
}

export default function ProfilePage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string>('')
  const [profileId, setProfileId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Account
  const [signingOut, setSigningOut] = useState(false)

  // Display name
  const [displayName, setDisplayName] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameMsg, setNameMsg] = useState('')
  const [nameErr, setNameErr] = useState('')

  // Company profile
  const [bio, setBio] = useState('')
  const [phone, setPhone] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [tagline, setTagline] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState('')
  const [profileErr, setProfileErr] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadErr, setUploadErr] = useState('')

  // ── Load session + profile ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: userData, error: userErr } = await supabase.auth.getUser()
      if (cancelled) return

      if (userErr || !userData.user) {
        setLoadError('Kunde inte läsa sessionen. Logga in igen.')
        setLoading(false)
        return
      }

      setUserId(userData.user.id)
      setEmail(userData.user.email ?? '')

      // Owner-only RLS means this can only ever return this user's row.
      const { data, error } = await supabase
        .from('profile')
        .select('*')
        .eq('user_id', userData.user.id)
        .maybeSingle()
      if (cancelled) return

      if (error) {
        setLoadError(`Kunde inte hämta profilen: ${error.message}`)
      } else if (data) {
        const p = data as Profile
        setProfileId(p.id)
        setDisplayName(p.display_name ?? '')
        setBio(p.bio ?? '')
        setPhone(p.phone ?? '')
        setBusinessName(p.business_name ?? '')
        setTagline(p.tagline ?? '')
        setAvatarUrl(p.avatar_url ?? '')
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [])

  /**
   * One row per user, upserted on user_id. user_id is always sent: the insert
   * policy checks it, so a payload without it is rejected outright.
   */
  async function saveFields(payload: Partial<Profile>): Promise<string | null> {
    if (!userId) return 'Ingen session.'
    const { data, error } = await supabase
      .from('profile')
      .upsert({ user_id: userId, ...payload }, { onConflict: 'user_id' })
      .select()
      .single()
    if (error || !data) return error?.message ?? 'Okänt fel vid sparning.'
    setProfileId((data as Profile).id)
    return null
  }

  async function saveName() {
    setSavingName(true); setNameMsg(''); setNameErr('')
    const err = await saveFields({ display_name: displayName.trim() || null })
    setSavingName(false)
    if (err) { setNameErr(err); return }
    setNameMsg('Namnet sparat.')
    setTimeout(() => setNameMsg(''), 3000)
  }

  async function saveProfile() {
    if (bio.length > BIO_MAX) { setProfileErr(`Bion får vara högst ${BIO_MAX} tecken.`); return }
    setSavingProfile(true); setProfileMsg(''); setProfileErr('')
    const err = await saveFields({
      bio: bio.trim() || null,
      phone: phone.trim() || null,
      business_name: businessName.trim() || null,
      tagline: tagline.trim() || null,
      avatar_url: avatarUrl.trim() || null,
    })
    setSavingProfile(false)
    if (err) { setProfileErr(err); return }
    setProfileMsg('Profilen sparad.')
    setTimeout(() => setProfileMsg(''), 3000)
  }

  // ── Avatar upload ───────────────────────────────────────────────────────
  // Stored as <user_id>/<timestamp>.<ext>; the storage policies key on that
  // first path segment, so a user can only write inside their own folder.
  async function handleAvatarFile(file: File) {
    if (!userId) return
    setUploadErr('')

    if (!file.type.startsWith('image/')) {
      setUploadErr('Filen måste vara en bild (PNG, JPEG, WebP eller GIF).')
      return
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setUploadErr(`Bilden är ${(file.size / 1024 / 1024).toFixed(1)} MB — max är 2 MB.`)
      return
    }

    setUploading(true)
    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const path = `${userId}/${Date.now()}.${ext}`

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (upErr) {
      setUploading(false)
      setUploadErr(`Uppladdningen misslyckades: ${upErr.message}`)
      return
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
    const publicUrl = pub.publicUrl
    setAvatarUrl(publicUrl)

    // Persist immediately — an uploaded image the user then forgets to save
    // would leave an orphan file and no visible change.
    const err = await saveFields({ avatar_url: publicUrl })
    setUploading(false)
    if (err) setUploadErr(`Bilden laddades upp men kunde inte sparas: ${err}`)
  }

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--slate)' }}>
        <span className="animate-spin">⟳</span> Laddar profil…
      </div>
    )
  }

  const bioOver = bio.length > BIO_MAX

  return (
    <div className="space-y-5 pb-8">

      {/* ── Rubrik ────────────────────────────────────────────────────────── */}
      <Panel className="inline-block" padding="px-5 py-3" enableTilt={false}>
        <p className="text-xs tracking-widest" style={{ color: 'var(--brick)' }}>KONTO</p>
        <h1 className="text-3xl font-bold mt-1" style={{ fontFamily: 'Arial, Helvetica, sans-serif', color: 'var(--cream)' }}>
          👤 Profil
        </h1>
      </Panel>

      {loadError && (
        <Panel padding="p-4" magic={false}>
          <p className="text-sm" style={{ color: '#ef4444' }}>⚠️ {loadError}</p>
        </Panel>
      )}

      {/* ── 1. Kontoinformation ───────────────────────────────────────────── */}
      <Panel padding="p-5" tiltMaxAngle={4}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <p className="text-[10px] tracking-widest uppercase mb-2" style={{ color: 'var(--slate)' }}>
              Kontoinformation
            </p>
            <p className="text-lg font-semibold truncate" style={{ color: 'var(--cream)' }}>
              {displayName || 'Namn saknas'}
            </p>
            <p className="text-sm mt-0.5 truncate" style={{ color: 'var(--slate)' }}>{email}</p>
          </div>

          <span
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-full"
            style={{
              background: 'linear-gradient(135deg, #A855F7 0%, #7C3AED 100%)',
              color: '#fff',
            }}
            title="Platshållare — prenumerationshantering är inte byggd än"
          >
            ★ Pro
          </span>
        </div>

        <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
          Pro-märket är en platshållare — ingen prenumerationshantering är kopplad ännu.
        </p>

        <div className="flex items-center gap-4 mt-5 pt-4 flex-wrap" style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-sm font-semibold px-4 py-2 rounded-lg transition-all"
            style={{
              backgroundColor: 'rgba(255,255,255,0.05)',
              color: 'var(--cream)',
              border: '1px solid rgba(255,255,255,0.14)',
              cursor: signingOut ? 'default' : 'pointer',
              opacity: signingOut ? 0.55 : 1,
            }}
          >
            {signingOut ? 'Loggar ut…' : '⏻ Logga ut'}
          </button>

          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Begäran om kontoradering')}&body=${encodeURIComponent(`Jag vill radera mitt Loopr-konto (${email}).`)}`}
            className="text-xs underline"
            style={{ color: 'var(--slate)' }}
          >
            Vill du radera ditt konto?
          </a>
        </div>
      </Panel>

      {/* ── 2. Visningsnamn ───────────────────────────────────────────────── */}
      <Panel padding="p-5" tiltMaxAngle={4}>
        <p className="text-[10px] tracking-widest uppercase mb-3" style={{ color: 'var(--slate)' }}>
          Visningsnamn
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <div className="flex-1">
            <label htmlFor="displayName" style={labelStyle}>NAMN</label>
            <input
              id="displayName"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setNameMsg(''); setNameErr('') }}
              placeholder="Ditt namn"
              style={inputStyle}
            />
          </div>
          <SaveButton onClick={saveName} busy={savingName} label="Spara namn" busyLabel="Sparar…" />
        </div>
        {nameErr && <p className="text-xs mt-2" style={{ color: '#ef4444' }}>⚠️ {nameErr}</p>}
        {nameMsg && <p className="text-xs mt-2" style={{ color: '#4ade80' }}>✓ {nameMsg}</p>}
      </Panel>

      {/* ── 3. Företagsprofil ─────────────────────────────────────────────── */}
      <Panel padding="p-5" tiltMaxAngle={4}>
        <p className="text-[10px] tracking-widest uppercase mb-1" style={{ color: 'var(--slate)' }}>
          Företagsprofil
        </p>
        <p className="text-xs mb-5" style={{ color: 'rgba(255,255,255,0.35)' }}>
          Det här är samma uppgifter som visas på dina delade förslag. De kan även redigeras
          från Förslag-fliken — ändringar här och där skriver till samma rad.
        </p>

        {/* Profilbild */}
        <div className="flex items-center gap-4 mb-5">
          <div
            className="shrink-0 rounded-full overflow-hidden flex items-center justify-center"
            style={{
              width: 72, height: 72,
              backgroundColor: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)',
            }}
          >
            {avatarUrl
              /* eslint-disable-next-line @next/next/no-img-element */
              ? <img src={avatarUrl} alt="Profilbild" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span style={{ fontSize: 26 }}>👤</span>}
          </div>

          <div className="min-w-0">
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleAvatarFile(f)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
              style={{
                backgroundColor: 'rgba(255,255,255,0.05)',
                color: 'var(--cream)',
                border: '1px solid rgba(255,255,255,0.14)',
                cursor: uploading ? 'default' : 'pointer',
                opacity: uploading ? 0.55 : 1,
              }}
            >
              {uploading ? 'Laddar upp…' : avatarUrl ? 'Byt bild' : 'Ladda upp bild'}
            </button>
            <p className="text-[10px] mt-1.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              PNG, JPEG, WebP eller GIF. Max 2 MB.
            </p>
            {uploadErr && <p className="text-[11px] mt-1" style={{ color: '#ef4444' }}>⚠️ {uploadErr}</p>}
          </div>
        </div>

        {/* Bio */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between">
            <label htmlFor="bio" style={labelStyle}>KORT BIO</label>
            <span className="text-[10px]" style={{ color: bioOver ? '#ef4444' : 'rgba(255,255,255,0.3)' }}>
              {bio.length} / {BIO_MAX}
            </span>
          </div>
          <textarea
            id="bio"
            value={bio}
            onChange={e => { setBio(e.target.value); setProfileMsg(''); setProfileErr('') }}
            rows={3}
            placeholder="Ett par meningar om dig och vad ni gör."
            style={{
              ...inputStyle,
              resize: 'vertical',
              borderColor: bioOver ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)',
            }}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="phone" style={labelStyle}>TELEFONNUMMER</label>
            <input id="phone" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+46 70 123 45 67" style={inputStyle} />
          </div>
          <div>
            <label htmlFor="businessName" style={labelStyle}>FÖRETAGSNAMN</label>
            <input id="businessName" value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="Ditt företag AB" style={inputStyle} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="tagline" style={labelStyle}>TAGLINE</label>
            <input id="tagline" value={tagline} onChange={e => setTagline(e.target.value)} placeholder="En rad som sammanfattar vad ni gör" style={inputStyle} />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <SaveButton onClick={saveProfile} busy={savingProfile} label="Spara profil" busyLabel="Sparar…" />
          {profileErr && <p className="text-xs" style={{ color: '#ef4444' }}>⚠️ {profileErr}</p>}
          {profileMsg && <p className="text-xs" style={{ color: '#4ade80' }}>✓ {profileMsg}</p>}
        </div>
      </Panel>

      {/* ── 4. Snabblänkar ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link href="/utbildning" className="block">
          <Panel padding="p-5" tiltMaxAngle={4} className="h-full">
            <span className="text-2xl">🎓</span>
            <p className="font-semibold mt-2" style={{ color: 'var(--cream)' }}>Gratis utbildning</p>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
              Kurser och material för att sälja och leverera Loopr.
            </p>
            <p className="text-xs mt-3" style={{ color: 'var(--brick)' }}>Öppna utbildningen →</p>
          </Panel>
        </Link>

        <Link href="/marknadsfor" className="block">
          <Panel padding="p-5" tiltMaxAngle={4} className="h-full">
            <span className="text-2xl">📣</span>
            <p className="font-semibold mt-2" style={{ color: 'var(--cream)' }}>Marknadsför Loopr</p>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
              Affiliate-programmet — tjäna på att rekommendera plattformen.
            </p>
            <p className="text-xs mt-3" style={{ color: 'var(--brick)' }}>Se programmet →</p>
          </Panel>
        </Link>
      </div>
    </div>
  )
}
