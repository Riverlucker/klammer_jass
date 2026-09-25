const PALETTES = [
  { background: '#315f55', skin: '#f0c5a0', hair: '#4b2d22' },
  { background: '#584b78', skin: '#d99b73', hair: '#241b1a' },
  { background: '#8a593c', skin: '#f3d0b1', hair: '#9b653d' },
  { background: '#315a78', skin: '#b97854', hair: '#1f1715' },
  { background: '#6b4a5f', skin: '#e7b58e', hair: '#5c3427' },
] as const;

export const AVATAR_OPTIONS = [
  'Mann mit braunem Haar', 'Mann mit schwarzem Haar', 'Mann mit rotem Haar', 'Mann mit dunklem Haar',
  'Mann mit braunem Haar und Bart', 'Mann mit braunem Haar und Brille', 'Mann mit schwarzem Haar und Brille', 'Mann mit rotem Haar und Brille',
  'Mann mit dunklem Haar und Bart', 'Mann mit braunem Haar und Brille', 'Mann mit braunem Haar und Bart', 'Mann mit schwarzem Haar und Bart',
  'Frau mit schwarzem Haar', 'Frau mit braunem Haar', 'Frau mit blondem Haar', 'Frau mit rotem Haar',
];

export default function Avatar({ name, selection, className }: { name: string; selection?: number | null; className?: string }) {
  let hash = 2166136261;
  for (const character of name.trim().toLocaleLowerCase('de-AT')) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  hash >>>= 0;
  const chosen = typeof selection === 'number' && Number.isInteger(selection) && selection >= 0 && selection < 16 ? selection : null;
  const female = chosen !== null && chosen >= 12;
  const palette = PALETTES[(chosen ?? hash) % PALETTES.length];
  const hair = female ? ['#211b23', '#66402d', '#e4bd64', '#b14d2e'][chosen! - 12] : palette.hair;
  const hairStyle = chosen === null ? (hash >>> 4) % 3 : chosen % 3;
  return <svg className={className} viewBox="0 0 100 100" role="img" aria-label={`Avatar von ${name || 'Spieler'}`}>
    <circle cx="50" cy="50" r="48" fill={palette.background} />
    {female && <path d="M16 80V40C16 3 84 3 84 40v43l-14 7-40-1Z" fill={hair} />}
    <circle cx="22" cy="55" r="7" fill={palette.skin} /><circle cx="78" cy="55" r="7" fill={palette.skin} />
    <ellipse cx="50" cy="54" rx="29" ry="34" fill={palette.skin} />
    {hairStyle === 0 && <path d="M22 48C21 23 34 13 51 13c18 0 29 12 28 34-9-4-13-12-16-19-9 10-23 16-41 20Z" fill={hair} />}
    {hairStyle === 1 && <path d="M22 43c2-22 15-31 29-31 17 0 27 11 28 32-7-6-11-13-13-19-11 8-26 13-44 18Z" fill={hair} />}
    {hairStyle === 2 && <path d="M21 46c0-21 12-34 30-34 17 0 28 12 28 34l-9-14-7 5-8-10-9 9-8-8-8 13-9 5Z" fill={hair} />}
    <circle cx="39" cy="54" r="2.8" fill="#231b18" /><circle cx="61" cy="54" r="2.8" fill="#231b18" />
    {chosen !== null && chosen >= 5 && chosen <= 9 && <g fill="none" stroke="#243e46" strokeWidth="2"><circle cx="39" cy="54" r="9" /><circle cx="61" cy="54" r="9" /><path d="M48 54h4" /></g>}
    {chosen !== null && [4,8,10,11].includes(chosen) && <path d="M26 64q24 42 48 0l-3 16q-21 20-42 0Z" fill={hair} />}
    {female && <g stroke="#38252c" strokeWidth="1.5"><path d="m35 50-3-3m29 3 4-3" /></g>}
    <path d="M47 64c2 2 4 2 6 0" fill="none" stroke="#9c604f" strokeWidth="2" strokeLinecap="round" />
    <path d="M40 73c6 5 14 5 20 0" fill="none" stroke={female ? '#a44959' : '#713f39'} strokeWidth="2.4" strokeLinecap="round" />
  </svg>;
}
