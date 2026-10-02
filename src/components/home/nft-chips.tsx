import { Section } from "@/components/ui/section";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Chip } from "@/components/ui/chip";
import { chipTokenIds, chipDenominations } from "@/config/tokens";
import { Button } from "@/components/ui/button";

export function NftChips() {
  return (
    <Section className="!pt-0">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div className="relative order-2 lg:order-1">
          <div className="vignette overflow-hidden rounded-2xl">
            <picture>
              <source srcSet="/art/generated/chips-set-light.webp" type="image/webp" />
              <img
                src="/art/generated/chips-set-light.png"
                alt="Six sculptural casino chips in black ceramic, frosted glass, acid-green glass, brushed chrome, red lacquer and violet glass on an off-white surface."
                className="aspect-[3/2] w-full object-cover"
                loading="lazy"
                width={1536}
                height={1024}
              />
            </picture>
          </div>
          <p className="mt-3 text-[11.5px] text-muted">Original artwork. Series 01 chip materials, concept render.</p>
        </div>

        <div className="order-1 lg:order-2">
          <Eyebrow className="mb-4 block">Chips</Eyebrow>
          <h2 className="font-display text-display-md text-balance">Chips you actually hold.</h2>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted md:text-lg">
            Every chip is an ERC-1155 gaming asset on Robinhood Chain: batchable, semi-fungible, and yours. Deposit once, play at any table, and reconcile when you leave. No transaction per spin.
          </p>

          <ul className="mt-9 grid grid-cols-3 gap-3 sm:grid-cols-6" aria-label="Chip denominations">
            {chipDenominations.map((d) => (
              <li key={d} className="flex flex-col items-center gap-2.5">
                <Chip value={d} size={56} />
                <span className="text-[11px] tnum text-muted">#{chipTokenIds[d].toString()}</span>
              </li>
            ))}
          </ul>

          <dl className="mt-9 grid grid-cols-2 gap-6 border-t border-hairline pt-6 text-[13.5px] sm:grid-cols-4">
            <div><dt className="eyebrow mb-1 text-[10px]">Standard</dt><dd className="font-medium">ERC-1155</dd></div>
            <div><dt className="eyebrow mb-1 text-[10px]">Series</dt><dd className="font-medium">01</dd></div>
            <div><dt className="eyebrow mb-1 text-[10px]">Season</dt><dd className="font-medium">Genesis</dd></div>
            <div><dt className="eyebrow mb-1 text-[10px]">Redemption</dt><dd className="font-medium">Burn to withdraw</dd></div>
          </dl>

          <div className="mt-8">
            <Button href="/cashier" variant="outline">Open the cashier</Button>
          </div>
        </div>
      </div>
    </Section>
  );
}
