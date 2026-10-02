import { cn } from "@/lib/utils";
import { Eyebrow } from "./eyebrow";
import { Badge } from "./badge";

/** Long-form typography wrapper for legal / explanatory pages. */
export function Prose({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-[68ch] text-[15.5px] leading-[1.7] text-ink-2",
        "[&_h2]:font-display [&_h2]:mt-14 [&_h2]:mb-4 [&_h2]:text-3xl [&_h2]:leading-tight [&_h2]:text-ink",
        "[&_h3]:mt-8 [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-medium [&_h3]:text-ink",
        "[&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1.5",
        "[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-ink",
        "[&_strong]:font-medium [&_strong]:text-ink",
        "[&_table]:my-6 [&_table]:w-full [&_table]:text-[14px] [&_th]:text-left [&_th]:font-medium [&_th]:py-2 [&_th]:border-b [&_th]:border-border [&_td]:py-2 [&_td]:border-b [&_td]:border-hairline [&_td]:align-top",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Clearly marked placeholder where jurisdiction-specific language is required. */
export function LegalPlaceholder({ children }: { children?: React.ReactNode }) {
  return (
    <div className="my-6 rounded-xl border border-dashed border-amber/70 bg-amber/5 px-4 py-3 text-[13.5px] text-ink-2">
      <span className="mr-2 font-medium uppercase tracking-[0.1em] text-amber-700 dark:text-amber">[Legal counsel review required]</span>
      {children ?? "Jurisdiction-specific language to be supplied by counsel before launch."}
    </div>
  );
}

export function LegalPage({
  eyebrow,
  title,
  lede,
  updated,
  sections,
  children,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  updated?: string;
  sections?: Array<{ id: string; label: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="max-w-3xl">
        <Eyebrow className="mb-4 block">{eyebrow}</Eyebrow>
        <h1 className="font-display text-display-lg text-balance">{title}</h1>
        {lede && <p className="mt-5 max-w-xl text-base text-muted md:text-lg">{lede}</p>}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Badge tone="outline">Draft</Badge>
          {updated && <span className="text-[12.5px] text-muted">Last updated {updated}</span>}
        </div>
      </div>
      <div className="mt-14 grid gap-12 lg:grid-cols-[220px_1fr] lg:gap-20">
        <nav className="hidden lg:block" aria-label="On this page">
          <div className="sticky top-28">
            <div className="eyebrow mb-3">Contents</div>
            <ol className="space-y-2 text-[13.5px]">
              {sections?.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="text-muted transition-colors hover:text-ink">
                    {s.label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <Prose>{children}</Prose>
      </div>
    </div>
  );
}
