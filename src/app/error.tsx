"use client";

import { Button } from "@/components/ui/button";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="container-edge flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
      <h1 className="font-display text-display-md">Something slipped off the wheel.</h1>
      <p className="mt-4 max-w-sm text-muted">The page hit an error. Your chips and any committed round are unaffected.</p>
      <div className="mt-8 flex gap-3"><Button onClick={reset}>Try again</Button><Button href="/" variant="outline">Home</Button></div>
    </div>
  );
}
