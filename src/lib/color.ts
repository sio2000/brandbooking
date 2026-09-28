/** Brand colour helpers: pick a readable text colour for a custom brand colour. */
function channel(c: number) {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}
export function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
}
export function contrast(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (l1 + 0.05) / (l2 + 0.05)
}
export function readableOn(hex: string) {
  return contrast(hex, '#ffffff') >= 4.5 ? '#ffffff' : '#141210'
}
/** CSS variables that re-theme a subtree with the business's brand colour. */
export function brandStyle(hex: string): React.CSSProperties {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : '#0f766e'
  return { ['--brand' as string]: safe, ['--brand-fg' as string]: readableOn(safe) }
}
