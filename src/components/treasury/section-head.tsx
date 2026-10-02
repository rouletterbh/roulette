/** Numbered section heading for the treasury page (serif title, corner index, optional note). */
export function SectionHead({ n, title, note, children }: { n: string; title: string; note?: string; children?: React.ReactNode }) {
  return (
    <div className="border-t border-border pt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 className="font-display text-2xl md:text-3xl">{title}</h2>
        <span className="microlabel">{n}</span>
      </div>
      {note && <p className="mt-2 max-w-2xl text-[13px] text-muted">{note}</p>}
      {children}
    </div>
  );
}
