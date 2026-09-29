'use client'

// The on/off switch used for the page sections in the Master Demo and Bygg BOS
// builders. A real switch (role="switch" + aria-checked), not a styled checkbox.

export default function ToggleSwitch({
  on,
  onToggle,
  label,
  disabled = false,
}: {
  on: boolean
  onToggle: () => void
  /** What is being switched, e.g. "Samtal". The state is announced by aria-checked. */
  label: string
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      className="shrink-0"
      style={{
        width: 42, height: 24, borderRadius: 12, position: 'relative',
        background: on ? 'var(--brick)' : 'rgba(255,255,255,0.1)',
        border: `1px solid ${on ? 'rgba(168,85,247,0.5)' : 'rgba(255,255,255,0.15)'}`,
        cursor: disabled ? 'not-allowed' : 'pointer', transition: 'background 0.2s',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 20 : 2,
        width: 18, height: 18, borderRadius: '50%',
        background: 'white', transition: 'left 0.2s',
      }} />
    </button>
  )
}
