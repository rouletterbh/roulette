import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <picture><source srcSet="/art/generated/empty-table-light.webp" type="image/webp" /><img src="/art/generated/empty-table-light.png" alt="A single chip resting on an empty surface" className="mb-8 h-44 w-44 rounded-2xl object-cover" /></picture>
      <h1 className="font-display text-display-md">Nothing on this number.</h1>
      <p className="mt-4 max-w-sm text-muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <div className="mt-8 flex gap-3"><Button href="/">Home</Button><Button href="/play" variant="outline">Play</Button></div>
    </div>
  );
}
