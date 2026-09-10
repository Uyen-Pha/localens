import type { Locale } from "@/lib/i18n/config";

export function LocaleFlag({ locale, label }: { locale: Locale; label: string }) {
  return <svg width="30" height="20" viewBox="0 0 60 40" role="img" aria-label={label} style={{ display: "block", borderRadius: 3 }}>
    {locale === "vi" ? <>
      <path fill="#da251d" d="M0 0h60v40H0z" />
      <path fill="#ff0" d="m30 8 2.82 8.3h8.73l-7.06 5.13 2.7 8.3L30 24.6l-7.19 5.13 2.7-8.3-7.06-5.13h8.73Z" />
    </> : <>
      <path fill="#fff" d="M0 0h60v40H0z" />
      {Array.from({ length: 7 }, (_, i) => <rect key={i} y={i * 80 / 13} width="60" height={40 / 13} fill="#b22234" />)}
      <path fill="#3c3b6e" d="M0 0h25v21.54H0z" />
      {Array.from({ length: 9 }, (_, row) => Array.from({ length: row % 2 ? 5 : 6 }, (_, col) =>
        <path key={`${row}-${col}`} fill="white" transform={`translate(${(col + (row % 2 ? 1 : .5)) * 25 / 6} ${(row + .5) * 21.54 / 9})`} d="m0-1 .224.691H.951L.363.118l.225.691L0 .382l-.588.427.225-.691L-.951-.309h.727Z" />))}
    </>}
  </svg>;
}
