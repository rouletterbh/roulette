/**
 * Project identity. The product name is intentionally configurable:
 * set NEXT_PUBLIC_PROJECT_NAME to rename everywhere at once.
 */
export const siteConfig = {
  name: process.env.NEXT_PUBLIC_PROJECT_NAME ?? "Roblette",
  tagline: "A social roulette club where chips live onchain.",
  description:
    "A social roulette club on Robinhood Chain. Chips live onchain as ERC-1155 assets and rewards can settle in crypto and supported Stock Tokens.",
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
  chainEnv: (process.env.NEXT_PUBLIC_CHAIN_ENV ?? "testnet") as "testnet" | "mainnet",
  /** Public site address, used for link previews and canonical URLs. */
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.roblette.fun",
  /** Official social accounts. */
  socials: {
    x: { label: "X", handle: "@robletterbh", href: "https://x.com/robletterbh" },
  },
  /**
   * The Roblette token (RBL) on Robinhood Chain. Shown as a plain contract address wherever the
   * project is described. It is not needed to play and is not a reward asset; the site makes no
   * claims about it beyond its address.
   */
  token: {
    name: "Roblette",
    symbol: "RBL",
    address: "0x041f48E1C2855be1287B94363f4f3D8585ceCCdc",
    chainId: 4663,
    decimals: 18,
  },
  nav: [
    { label: "Play", href: "/play" },
    { label: "Tables", href: "/tables" },
    { label: "Agents", href: "/agents" },
    { label: "Collect", href: "/me/collection" },
    { label: "Treasury", href: "/treasury" },
  ],
  footer: [
    {
      title: "Play",
      links: [
        { label: "Play", href: "/play" },
        { label: "Tables", href: "/tables" },
        { label: "Practice", href: "/play/practice" },
      ],
    },
    {
      title: "Discover",
      links: [
        { label: "Rewards", href: "/rewards" },
        { label: "Leaderboard", href: "/leaderboard" },
        { label: "Explore", href: "/explore" },
        { label: "Treasury", href: "/treasury" },
      ],
    },
    {
      title: "Protocol",
      links: [
        { label: "Fairness", href: "/fairness" },
        { label: "Security", href: "/security" },
        { label: "Technology", href: "/technology" },
        { label: "Developers", href: "/developers" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "How it works", href: "/how-it-works" },
        { label: "FAQ", href: "/faq" },
        { label: "X (Twitter)", href: "https://x.com/robletterbh", external: true },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Terms", href: "/terms" },
        { label: "Privacy", href: "/privacy" },
        { label: "Responsible Play", href: "/responsible-play" },
        { label: "Risk Disclosure", href: "/risk-disclosure" },
        { label: "Restricted Jurisdictions", href: "/restricted-jurisdictions" },
      ],
    },
  ],
} as const;
