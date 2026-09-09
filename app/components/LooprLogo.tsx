import Image from 'next/image'

interface LooprLogoProps {
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// Real asset dimensions (public/logo.png, cropped tight to the mark) —
// used to derive width from height so the image always scales proportionally
// and is never stretched.
const ASPECT_RATIO = 5284 / 1952

const HEIGHTS = {
  sm: 18,
  md: 32,
  lg: 56,
}

export default function LooprLogo({ size = 'md', className = '' }: LooprLogoProps) {
  const height = HEIGHTS[size]
  const width = Math.round(height * ASPECT_RATIO)

  return (
    <Image
      src="/logo.png"
      alt="Loopr"
      width={width}
      height={height}
      priority={size === 'lg'}
      className={className}
      style={{ width, height, objectFit: 'contain' }}
    />
  )
}
