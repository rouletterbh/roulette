// Asset manifest for OpenAI-generated ORIGINAL artwork.
// Each entry is generated once, stored under public/art/generated, and never regenerated
// unless the file is deleted or --force is passed. No logos, no text, no brand marks.

const BASE_LIGHT =
  "Premium surreal editorial 3D artwork for a next-generation digital roulette platform. Minimal financial design language, sculptural roulette objects, translucent casino chips, polished black ceramic, brushed metal, subtle acid-green luminous details, soft off-white studio environment, high-fashion product photography composition, sophisticated grain, dramatic but restrained lighting, contemporary fintech campaign aesthetic, original visual language, no logos, no text, no brand marks, no letters, no numbers.";

const BASE_DARK =
  "Premium surreal roulette artwork inside a near-black sculptural environment, subtle acid-green illumination, chrome and translucent objects, cinematic casino atmosphere, luxury editorial campaign photography, controlled red and cobalt accents, minimal composition, original visual language, no logos, no text, no brand marks, no letters, no numbers.";

export const assets = [
  {
    id: "hero-light",
    file: "hero-light.png",
    category: "hero",
    size: "1536x1024",
    quality: "high",
    alt: "A black ceramic roulette wheel floating in a bright off-white studio, surrounded by translucent casino chips, dice and glossy geometric market shapes with acid-green highlights.",
    prompt:
      BASE_LIGHT +
      " Centered composition: a single futuristic physical roulette wheel in polished black ceramic and soft chrome, floating slightly above a warm off-white paper-textured floor, viewed from a slightly elevated three-quarter angle. Around it, a sparse constellation of floating objects: translucent glass casino chips in acid green, black and white, two small white dice, a few glossy abstract geometric shapes suggesting stock-market geometry (thin rising lines, a tilted cube, a chrome sphere), small bursts of casino red, violet and cobalt reflected in the glass. Massive negative space at the top of the frame for a headline. Soft directional studio light from the upper left, long gentle shadows, fine film grain.",
  },
  {
    id: "hero-dark",
    file: "hero-dark.png",
    category: "hero",
    size: "1536x1024",
    quality: "high",
    alt: "A chrome and black roulette wheel glowing with soft acid-green light inside a near-black atmosphere, with translucent chips and dice drifting around it.",
    prompt:
      BASE_DARK +
      " Centered composition: a single futuristic physical roulette wheel in black ceramic and chrome, floating in a near-black void with a faint volumetric acid-green glow rising from beneath it. Around it drift translucent glass casino chips in acid green, smoked black and frosted white, two small dice, and a few chrome geometric shapes suggesting market geometry. Controlled red and cobalt rim lighting on the chrome. Massive dark negative space at the top of the frame for a headline. Fine film grain, soft vignette.",
  },
  {
    id: "chips-set-light",
    file: "chips-set-light.png",
    category: "chips",
    size: "1536x1024",
    quality: "high",
    alt: "Six sculptural casino chips in different materials arranged on a bright off-white surface.",
    prompt:
      BASE_LIGHT +
      " Product photography of six distinct sculptural casino chips arranged in a loose row on a warm off-white seamless background, each a different material: matte black ceramic, frosted white glass, translucent acid-green glass, brushed chrome, deep casino red lacquer, and violet-tinted glass. Each chip has a thin engraved concentric ring and a subtle edge notch pattern, no numbers, no text. Slight stacking, soft shadows, top-down three-quarter angle.",
  },
  {
    id: "rewards-light",
    file: "rewards-light.png",
    category: "editorial",
    size: "1536x1024",
    quality: "medium",
    alt: "Abstract chrome and glass coins and ticket shapes floating above a white surface with acid-green light.",
    prompt:
      BASE_LIGHT +
      " A still life of abstract reward objects: a few blank chrome coins, a translucent acid-green glass bar, a folded white paper ticket shape and a small black ceramic sphere, floating in a loose cluster above an off-white surface. Nothing printed on any object. Wide negative space on the left.",
  },
  {
    id: "empty-table-light",
    file: "empty-table-light.png",
    category: "empty-state",
    size: "1024x1024",
    quality: "medium",
    alt: "A single translucent chip resting on a bright empty surface.",
    prompt:
      BASE_LIGHT +
      " A single translucent acid-green glass casino chip resting alone on a wide, empty warm off-white surface, soft shadow, extreme minimalism, centered, lots of negative space.",
  },
  {
    id: "agent-light",
    file: "agent-light.png",
    category: "agent",
    size: "1024x1024",
    quality: "high",
    alt: "An abstract mechanical intelligence: concentric precision rings in polished black metal and glass with a small acid-green signal light, in a bright architectural studio.",
    prompt:
      "Luxury editorial product photography of an autonomous casino agent represented as an abstract mechanical intelligence, concentric precision rings, small orbiting nodes, polished black metal, translucent glass, acid-green signal light, off-white architectural studio background, roulette geometry subtly embedded, sophisticated financial campaign photography, ultra-clean composition, tactile materials, no humanoid robot, no text, no logos, no letters, no numbers.",
  },
  {
    id: "agent-network-light",
    file: "agent-network-light.png",
    category: "agent",
    size: "1536x1024",
    quality: "high",
    alt: "Minimal circular mechanical glyphs arranged around a black roulette wheel, linked by thin traces with acid-green signals, on an off-white background.",
    prompt:
      "Abstract network of autonomous machine agents surrounding a physical roulette table, each agent represented by minimal circular mechanical glyphs and precision instruments, thin communication traces, polished black roulette hardware, off-white background, acid green telemetry signals, luxury fintech editorial art direction, quiet futuristic atmosphere, no humanoids, no text, no logos, no letters, no numbers.",
  },
  {
    id: "leash-light",
    file: "leash-light.png",
    category: "agent",
    size: "1024x1024",
    quality: "high",
    alt: "An industrial precision control instrument with four concentric mechanical rings in polished metal, black ceramic and glass with acid-green indicators, on a warm off-white background.",
    prompt:
      "Industrial precision control instrument representing limits on an autonomous agent, four concentric mechanical rings for time, loss, rounds and allowance, polished metal, black ceramic, translucent glass and acid green indicators, premium financial editorial photography, isolated on warm off-white background, no text, no logos, no letters, no numbers.",
  },
];
