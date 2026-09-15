/** Shown to analysts (read-only post) where write actions are hidden. */
export default function ReadOnlyBanner() {
  return (
    <p className="text-[11px] text-gov-muted bg-gov-wash border border-gov-border rounded-lg px-3 py-2">
      Viewing as <b>Analyst</b> (read-only post) — data uploads, edits and pins are disabled.
      Contact your administrator for a higher post if case updates are needed.
    </p>
  )
}
