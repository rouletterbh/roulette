import type { Metadata } from "next";
import { Suspense } from "react";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlayerProfileView } from "@/components/player/player-profile";
import { getHistory, getPlayer } from "@/lib/demo/players";
import { shortAddress } from "@/lib/utils";

type Props = { params: Promise<{ wallet: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { wallet } = await params;
  const p = getPlayer(wallet);
  return { title: p ? `${p.displayName} — Player` : "Player not found", robots: p ? undefined : { index: false } };
}

export default async function PlayerPage({ params }: Props) {
  const { wallet } = await params;
  const profile = getPlayer(wallet);
  if (!profile) return <UnknownPlayer wallet={wallet} />;
  const history = getHistory(wallet);
  return (
    <Suspense fallback={<div className="container-edge py-16 md:py-24"><Skeleton className="h-[60vh] w-full rounded-2xl" /></div>}>
      <PlayerProfileView profile={profile} history={history} />
    </Suspense>
  );
}

function UnknownPlayer({ wallet }: { wallet: string }) {
  const looksLikeAddress = /^0x[0-9a-fA-F]{40}$/.test(wallet);
  return (
    <div className="container-edge py-16 md:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div className="max-w-xl">
          <Eyebrow className="mb-4 block">Player</Eyebrow>
          <h1 className="font-display text-display-lg text-balance">No seat at this table yet.</h1>
          <p className="mt-5 max-w-lg text-base text-muted md:text-lg">
            {looksLikeAddress ? (
              <>
                <span className="font-mono tnum">{shortAddress(wallet, 6)}</span> has not settled a round here. Profiles appear after the first spin.
              </>
            ) : (
              "That does not look like a wallet address. Profiles live at /player/0x…"
            )}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button href="/leaderboard" variant="primary">
              See the leaderboard
            </Button>
            <Button href="/play" variant="outline">
              Play a round
            </Button>
          </div>
        </div>
        <picture className="vignette block overflow-hidden rounded-2xl">
          <source srcSet="/art/generated/empty-table-light.webp" type="image/webp" />
          <img
            src="/art/generated/empty-table-light.png"
            alt="An empty roulette table in a bright studio, the wheel still and no chips on the felt."
            className="h-full w-full object-cover"
            width={1536}
            height={1024}
            loading="lazy"
          />
        </picture>
      </div>
    </div>
  );
}
