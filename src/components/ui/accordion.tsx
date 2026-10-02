"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export interface AccordionItem {
  id: string;
  question: React.ReactNode;
  answer: React.ReactNode;
}

/**
 * Accessible disclosure list. One item open at a time by default; headers are
 * buttons with aria-expanded/aria-controls, and Arrow/Home/End keys move focus
 * between headers.
 */
export function Accordion({
  items,
  allowMultiple = false,
  defaultOpen,
  className,
}: {
  items: AccordionItem[];
  allowMultiple?: boolean;
  defaultOpen?: string[];
  className?: string;
}) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultOpen ?? []));
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const base = useId();
  const reduceMotion = useReducedMotion();

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(allowMultiple ? prev : []);
      if (prev.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const n = items.length;
    let target: number | null = null;
    if (e.key === "ArrowDown") target = (index + 1) % n;
    else if (e.key === "ArrowUp") target = (index - 1 + n) % n;
    else if (e.key === "Home") target = 0;
    else if (e.key === "End") target = n - 1;
    if (target !== null) {
      e.preventDefault();
      buttons.current[target]?.focus();
    }
  };

  return (
    <ul className={cn("divide-y divide-hairline hairline-t hairline-b", className)}>
      {items.map((item, i) => {
        const expanded = open.has(item.id);
        const headerId = `${base}-${item.id}-h`;
        const panelId = `${base}-${item.id}-p`;
        return (
          <li key={item.id}>
            <h3 className="m-0">
              <button
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                id={headerId}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                className="group flex w-full items-start justify-between gap-6 py-5 text-left transition-colors hover:text-ink"
              >
                <span className={cn("text-[16px] leading-snug md:text-[17px]", expanded ? "text-ink" : "text-ink-2 group-hover:text-ink")}>
                  {item.question}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "mt-1 flex h-5 w-5 shrink-0 items-center justify-center text-muted transition-transform duration-300 ease-[var(--ease-out-expo)]",
                    expanded && "rotate-45",
                  )}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M6 1v10M1 6h10" />
                  </svg>
                </span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  key="panel"
                  id={panelId}
                  role="region"
                  aria-labelledby={headerId}
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="overflow-hidden"
                >
                  <div className="max-w-[62ch] pb-6 text-[14.5px] leading-[1.7] text-muted [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_p+p]:mt-3">
                    {item.answer}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ul>
  );
}
