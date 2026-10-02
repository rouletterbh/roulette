import type { SVGProps } from "react";

/**
 * Achievement registry. Badges are collectible but NOT yet mintable: the NFT
 * path is reserved for a later release, so every entry is `mintable: false`.
 *
 * Icons are thin-line, monochrome via currentColor. A single acid-green dot is
 * the only permitted accent, and only for earned badges (the badge passes the
 * `earned` flag through `data-earned`; the dot reads `--accent` only then).
 */
export type AchievementRarity = "common" | "uncommon" | "rare" | "legendary";

export type AchievementId =
  | "first-spin"
  | "black-jack"
  | "zero-club"
  | "hot-table"
  | "night-owl"
  | "table-host"
  | "100-rounds"
  | "straight-shot"
  | "even-keel"
  | "walk-away"
  | "regular"
  | "founding-member";

export interface Achievement {
  id: AchievementId;
  name: string;
  description: string;
  rarity: AchievementRarity;
  icon: (props: IconProps) => React.JSX.Element;
  /** NFT minting lands later. Nothing is mintable today. */
  mintable: false;
}

export type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 24) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.25,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

/** The optional accent dot. Visible only when an ancestor sets data-earned="true". */
function Dot({ cx, cy }: { cx: number; cy: number }) {
  return <circle cx={cx} cy={cy} r="1.6" className="fill-current [[data-earned=true]_&]:fill-[var(--accent)]" stroke="none" />;
}

function FirstSpin({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" />
      <Dot cx={12} cy={6.6} />
    </svg>
  );
}
function BlackJack({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="5" y="3.5" width="14" height="17" rx="2" />
      <path d="M12 8.5c-1.6 0-2.6 1.1-2.6 2.3 0 1.3 1.1 2.1 2.6 3.6 1.5-1.5 2.6-2.3 2.6-3.6 0-1.2-1-2.3-2.6-2.3z" fill="currentColor" stroke="none" />
      <path d="M12 14.4v2.4" />
      <Dot cx={16.2} cy={6.4} />
    </svg>
  );
}
function ZeroClub({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <ellipse cx="12" cy="12" rx="5" ry="8.5" />
      <path d="M8.6 17.2 15.4 6.8" />
      <Dot cx={12} cy={3.5} />
    </svg>
  );
}
function HotTable({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M4 10.5h16M6 10.5v8M18 10.5v8M3.5 18.5h17" />
      <path d="M9.5 10.5V7.5l2.5-3 2.5 3v3" />
      <Dot cx={12} cy={14.5} />
    </svg>
  );
}
function NightOwl({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7z" />
      <Dot cx={17.5} cy={6} />
    </svg>
  );
}
function TableHost({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M4.5 9.5h15l-1.2 9.5H5.7z" />
      <path d="M8 9.5V7a4 4 0 0 1 8 0v2.5" />
      <path d="M9 13.5h6" />
      <Dot cx={12} cy={16.3} />
    </svg>
  );
}
function HundredRounds({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8 9.5v5M11.4 9.5h2a1.3 1.3 0 0 1 1.3 1.3v2.4a1.3 1.3 0 0 1-1.3 1.3h-2zM7 9.5h1" />
      <Dot cx={12} cy={3.5} />
    </svg>
  );
}
function StraightShot({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5" />
      <path d="M12 3.5 12 12 18.5 7" />
      <Dot cx={12} cy={12} />
    </svg>
  );
}
function EvenKeel({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M3.5 12c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6 0" />
      <path d="M3.5 16c2-1.8 4-1.8 6 0s4 1.8 6 0 4-1.8 6 0" opacity="0.5" />
      <path d="M12 4v5" />
      <Dot cx={12} cy={4} />
    </svg>
  );
}
function WalkAway({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M4 20h7.5M11.5 20v-6.5l3-3.5" />
      <path d="M11.5 20l3.5-4.5 3.5 4.5" />
      <path d="M9 11.5 11.5 9l3 1" />
      <circle cx="13.5" cy="5.5" r="1.6" />
      <Dot cx={19} cy={6} />
    </svg>
  );
}
function Regular({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
      <path d="M7.5 13h2M11 13h2M14.5 13h2M7.5 16.5h2M11 16.5h2" />
      <Dot cx={15.5} cy={16.5} />
    </svg>
  );
}
function FoundingMember({ size, ...p }: IconProps) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M12 3.5 14.4 9l6 .5-4.6 3.9 1.5 5.9L12 16.2l-5.3 3.1 1.5-5.9L3.6 9.5l6-.5z" />
      <Dot cx={12} cy={12.5} />
    </svg>
  );
}

export const achievements: readonly Achievement[] = [
  { id: "first-spin", name: "First Spin", description: "Settle your first round at any table.", rarity: "common", icon: FirstSpin, mintable: false },
  { id: "black-jack", name: "Black Jack", description: "Win a bet on Black five times.", rarity: "common", icon: BlackJack, mintable: false },
  { id: "zero-club", name: "Zero Club", description: "Be at the table when the ball lands on 0.", rarity: "uncommon", icon: ZeroClub, mintable: false },
  { id: "hot-table", name: "Hot Table", description: "Win three consecutive rounds. Every spin is still independent.", rarity: "uncommon", icon: HotTable, mintable: false },
  { id: "night-owl", name: "Night Owl", description: "Play ten rounds between midnight and five in the morning (UTC).", rarity: "uncommon", icon: NightOwl, mintable: false },
  { id: "table-host", name: "Table Host", description: "Open a private table and host at least one settled round.", rarity: "rare", icon: TableHost, mintable: false },
  { id: "100-rounds", name: "100 Rounds", description: "Settle one hundred rounds.", rarity: "uncommon", icon: HundredRounds, mintable: false },
  { id: "straight-shot", name: "Straight Shot", description: "Win a straight-up bet on a single number.", rarity: "rare", icon: StraightShot, mintable: false },
  { id: "even-keel", name: "Even Keel", description: "Play twenty rounds in a row without raising your stake above 10 chips.", rarity: "uncommon", icon: EvenKeel, mintable: false },
  { id: "walk-away", name: "Walk Away", description: "Close a session while ahead. The house respects it.", rarity: "rare", icon: WalkAway, mintable: false },
  { id: "regular", name: "Regular", description: "Play on seven different days.", rarity: "common", icon: Regular, mintable: false },
  { id: "founding-member", name: "Founding Member", description: "Joined during the first season.", rarity: "legendary", icon: FoundingMember, mintable: false },
];

export const achievementById: Record<AchievementId, Achievement> = Object.fromEntries(achievements.map((a) => [a.id, a])) as Record<AchievementId, Achievement>;

export const rarityLabel: Record<AchievementRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  legendary: "Legendary",
};
