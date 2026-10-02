/**
 * Project identity. The product name is intentionally configurable:
 * set NEXT_PUBLIC_PROJECT_NAME to rename everywhere at once.
 */
export const siteConfig = {
  name: process.env.NEXT_PUBLIC_PROJECT_NAME ?? "[PROJECT_NAME]",
  tagline: "A social roulette club where chips live onchain.",
  description:
    "A social roulette club on Robinhood Chain. Chips live onchain as ERC-1155 assets and rewards can settle in crypto and supported Stock Tokens.",
  demoMode: process.env.NEXT_PUBLIC_DEMO_MODE === "true",
  chainEnv: (process.env.NEXT_PUBLIC_CHAIN_ENV ?? "testnet") as "testnet" | "mainnet",
  nav: [
    { label: "Play", href: "/play" },
    { label: "Tables", href: "/tables" },
    { label: "Agents", href: "/agents" },
    { label: "Rewards", href: "/rewards" },
    { label: "Leaderboard", href: "/leaderboard" },
    { label: "Explore", href: "/explore" },
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
