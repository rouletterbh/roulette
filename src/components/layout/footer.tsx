import Link from "next/link";
import { siteConfig } from "@/config/site";
import { LogoMark } from "./logo";
import { RobinhoodChainLogo } from "./brand-logo";
import { TokenAddress } from "./token-address";
import { XLogo } from "./x-logo";

export function Footer() {
  return (
    <footer className="mt-auto border-t border-hairline">
      <div className="container-edge grid gap-12 py-16 md:grid-cols-[1.4fr_repeat(5,1fr)] md:py-24">
        <div className="max-w-xs">
          <div className="flex items-center gap-2.5 text-ink">
            <LogoMark />
            <span className="font-display text-2xl">{siteConfig.name}</span>
          </div>
          <p className="mt-5 text-sm leading-relaxed text-muted">
            A social roulette club on Robinhood Chain. Chips are onchain gaming assets. Every wager is limited by available collateral before it is accepted.
          </p>
          <div className="mt-6 flex items-center gap-2 text-[12px] text-muted">
            <span className="live-dot" aria-hidden />
            <span>Built on</span>
            <RobinhoodChainLogo height={14} />
          </div>
          <a
            href={siteConfig.socials.x.href}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-[12px] text-ink-2 transition-colors hover:text-ink"
            aria-label={`${siteConfig.name} on X`}
          >
            <XLogo height={12} />
            <span>{siteConfig.socials.x.handle}</span>
          </a>
          <TokenAddress compact className="mt-4" />
        </div>
        {siteConfig.footer.map((col) => (
          <div key={col.title}>
            <h3 className="eyebrow mb-4">{col.title}</h3>
            <ul className="space-y-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  {"external" in l && l.external ? (
                    <a href={l.href} target="_blank" rel="noreferrer" className="text-sm text-ink-2 transition-colors hover:text-ink dark:text-ink-2">
                      {l.label} ↗
                    </a>
                  ) : (
                    <Link href={l.href} className="text-sm text-ink-2 transition-colors hover:text-ink dark:text-ink-2">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="container-edge border-t border-hairline py-8">
        <p className="max-w-3xl text-[12px] leading-relaxed text-muted">
          {siteConfig.name} is an independent product built on Robinhood Chain. It is not operated, endorsed, sponsored or owned by Robinhood Markets, Inc. or its affiliates. &ldquo;Robinhood Chain&rdquo; and &ldquo;Stock Tokens&rdquo; are referenced only to describe the network and asset types involved. Stock Tokens are blockchain-based instruments whose availability depends on your jurisdiction; see the{" "}
          <Link href="/stock-token-disclosure" className="underline underline-offset-2">Stock Token disclosure</Link>. Play responsibly.
          {" "}18+ only where permitted. [LEGAL COUNSEL REVIEW REQUIRED]
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-[12px] text-muted">
          <span>© {new Date().getFullYear()} {siteConfig.name}. Independent product. No Robinhood endorsement implied.</span>
          <div className="flex gap-5">
            <a href={siteConfig.socials.x.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-ink" aria-label={`${siteConfig.name} on X`}>
              <XLogo height={11} /> X
            </a>
            <Link href="/cookies" className="hover:text-ink">Cookies</Link>
            <Link href="/legal" className="hover:text-ink">Legal</Link>
            <Link href="/aml" className="hover:text-ink">AML</Link>
          </div>
        </div>
      </div>

      <div className="container-edge overflow-hidden pb-4 pt-6 md:pt-10" aria-hidden>
        <div className="font-display select-none whitespace-nowrap text-[18vw] leading-[0.8] tracking-[-0.04em] text-ink/[0.06] dark:text-ink/[0.05]">
          {siteConfig.name}
        </div>
      </div>
    </footer>
  );
}
