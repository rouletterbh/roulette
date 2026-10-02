import { cn } from "@/lib/utils";

/** Code block with hairline border and corner labels (title top-left, language top-right, line count bottom-right). */
export function CodeBlock({ children, label, lang, className }: { children: string; label?: string; lang?: string; className?: string }) {
  const lines = children.split("\n").length;
  return (
    <figure className={cn("relative mt-3 border border-hairline bg-surface dark:bg-elevated", className)}>
      {label && <figcaption className="microlabel absolute -top-[7px] left-3 max-w-[70%] truncate bg-canvas px-2 !text-ink">{label}</figcaption>}
      {lang && (
        <span className="microlabel absolute -top-[7px] right-3 bg-canvas px-2" aria-hidden>
          {lang}
        </span>
      )}
      <pre className="overflow-x-auto p-5 pb-7 font-mono text-[12.5px] leading-relaxed text-ink">{children}</pre>
      <span className="microlabel absolute bottom-2 right-3 tnum" aria-hidden>
        {lines} {lines === 1 ? "line" : "lines"}
      </span>
    </figure>
  );
}
