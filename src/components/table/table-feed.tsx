"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { PlayerAvatar } from "@/components/player/player-avatar";
import type { FeedItem } from "@/store/live-table";
import { cn } from "@/lib/utils";

const EMOTES = ["🔥", "🎯", "👏", "😮", "🍀", "💚"];

export function TableFeed({ items, muted, onChat, onReact, selfAddress, className }: { items: FeedItem[]; muted: Set<string>; onChat: (t: string) => void; onReact: (e: string) => void; selfAddress: string; className?: string }) {
  const [text, setText] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const visible = items.filter((i) => !(i.player && muted.has(i.player.wallet)));

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [visible.length]);

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <h2 className="eyebrow mb-3">Table</h2>
      <ol ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1 text-[12.5px]" aria-live="polite" aria-label="Table activity">
        <AnimatePresence initial={false}>
          {visible.slice(-40).map((i) => (
            <motion.li key={i.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className={cn("flex items-start gap-2", i.kind === "system" && "text-muted")}>
              {i.player ? <PlayerAvatar address={i.player.wallet} size={18} className="mt-0.5" /> : i.self ? <PlayerAvatar address={selfAddress} size={18} className="mt-0.5" /> : <span className="mt-0.5 inline-block h-[18px] w-[18px]" />}
              <span className="min-w-0 flex-1 leading-snug">
                {i.kind === "reaction" ? (
                  <span className="text-base leading-none">{i.text}</span>
                ) : (
                  <>
                    {(i.player || i.self) && <span className="font-medium">{i.self ? "You" : i.player!.name} </span>}
                    <span className={cn(i.kind === "win" && "text-ink", i.kind === "bet" && "text-muted", i.kind === "chat" && "text-ink-2")}>{i.text}</span>
                  </>
                )}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      <div className="mt-3 flex items-center gap-1 border-t border-hairline pt-3">
        {EMOTES.map((e) => (
          <button key={e} type="button" onClick={() => onReact(e)} aria-label={`React ${e}`} className="h-8 w-8 rounded-full text-base transition-transform hover:scale-110 hover:bg-sunken dark:hover:bg-elevated">
            {e}
          </button>
        ))}
      </div>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onChat(text);
          setText("");
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={140} placeholder="Say something…" aria-label="Chat message" className="h-9 min-w-0 flex-1 rounded-full border border-border bg-transparent px-3.5 text-[13px] outline-none placeholder:text-faint focus:border-ink" />
        <button type="submit" className="h-9 rounded-full bg-ink px-3.5 text-[12px] font-medium text-canvas disabled:opacity-40" disabled={!text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
