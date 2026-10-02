import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/eyebrow";

export function ClosingCta() {
  return (
    <section className="container-edge pb-24 md:pb-32">
      <div className="grain relative overflow-hidden rounded-[28px] bg-ink px-6 py-20 text-center text-canvas md:py-28">
        <picture className="pointer-events-none absolute inset-0 opacity-70">
          <source srcSet="/art/generated/hero-dark.webp" type="image/webp" />
          <img src="/art/generated/hero-dark.png" alt="" className="h-full w-full object-cover" loading="lazy" />
        </picture>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#070907_85%)]" />
        <div className="relative z-10">
          <Eyebrow className="mb-5 block !text-canvas/70">Practice is free</Eyebrow>
          <h2 className="font-display mx-auto max-w-3xl text-display-lg text-balance">Learn the table before you bring chips.</h2>
          <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-canvas/70">
            Practice chips have no monetary value and never touch the chain. Same wheel, same fairness proof, zero risk.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/play/practice" size="lg" variant="accent">Start practice</Button>
            <Button href="/fairness" size="lg" variant="outline" className="border-canvas/30 text-canvas hover:border-canvas hover:bg-canvas/10">How fairness works</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
