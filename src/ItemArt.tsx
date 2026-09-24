type ItemKind = 'sword' | 'shield' | 'potion' | 'scroll' | 'misc'

export function ItemArt({ kind }: { kind: ItemKind }) {
  if (kind === 'sword') return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path d="M57 8 31 49l-7 7 5 5 7-7L64 15l-7-7Z" fill="#D9E3E3" stroke="#687983" strokeWidth="2" />
      <path d="m56 8 8 7-8 8-6-6 6-9Z" fill="#F4F5E8" />
      <path d="m22 46 15 15M18 54l9 9M27 63l-7 8" stroke="#CDA55C" strokeWidth="6" strokeLinecap="round" />
      <circle cx="19" cy="72" r="4" fill="#E5C37B" />
    </svg>
  )
  if (kind === 'shield') return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path d="M40 7 67 17v21c0 18-11 28-27 35C24 66 13 56 13 38V17L40 7Z" fill="#B8894D" stroke="#E7C78B" strokeWidth="3" />
      <path d="M40 14 60 22v17c0 13-8 21-20 27-12-6-20-14-20-27V22l20-8Z" fill="#344A48" stroke="#23342F" strokeWidth="2" />
      <path d="M40 18v44M23 40h34" stroke="#D8B77C" strokeWidth="5" />
      <circle cx="40" cy="40" r="7" fill="#CFA462" stroke="#F7DD9A" strokeWidth="2" />
    </svg>
  )
  if (kind === 'potion') return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path d="M31 8h18v8H31z" fill="#B39466" stroke="#E2C894" strokeWidth="2" />
      <path d="M34 16v11L20 49a15 15 0 0 0 13 23h14a15 15 0 0 0 13-23L46 27V16" fill="#A9C6BD" fillOpacity=".28" stroke="#C9DED1" strokeWidth="3" />
      <path d="M24 50h32l3 7a14 14 0 0 1-12 15H33a14 14 0 0 1-12-15l3-7Z" fill="#B74E59" />
      <path d="m40 39 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z" fill="#FFD99C" />
    </svg>
  )
  if (kind === 'scroll') return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path d="M19 14h44v51H19z" fill="#B89A6A" stroke="#E7D2A3" strokeWidth="3" />
      <path d="M25 10h7v60h-7a7 7 0 0 1-7-7V17a7 7 0 0 1 7-7ZM63 10h-7v60h7a7 7 0 0 0 7-7V17a7 7 0 0 0-7-7Z" fill="#D4B781" stroke="#F1D6A1" strokeWidth="2" />
      <path d="m44 23 5 9 10 1-7 7 2 10-10-5-10 5 2-10-7-7 10-1 5-9Z" fill="#587B77" stroke="#345653" strokeWidth="2" />
      <path d="M35 57h18" stroke="#6C5438" strokeWidth="2" />
    </svg>
  )
  return (
    <svg viewBox="0 0 80 80" fill="none" aria-hidden="true">
      <path d="m40 8 27 23-9 35H22L13 31 40 8Z" fill="#73998C" stroke="#D7BD7A" strokeWidth="3" />
      <path d="m40 15 19 17-6 27H27l-6-27 19-17Z" fill="#2D5153" />
      <path d="m40 15-5 17 5 27 5-27-5-17ZM21 32h38M27 59l8-27m18 27-8-27" stroke="#9BC7B5" strokeWidth="2" />
      <circle cx="40" cy="38" r="6" fill="#E6C477" />
    </svg>
  )
}
