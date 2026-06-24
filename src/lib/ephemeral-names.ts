// OpenSend v0.2.3 — Ephemeral device name generator
// Generates human-friendly names like "Blue Falcon" or "Quiet River"
// No account or device identity required.

const ADJECTIVES = [
  "Blue", "Quiet", "Silver", "Golden", "Red", "Green", "Bold", "Calm",
  "Swift", "Brave", "Cool", "Dark", "Bright", "Gentle", "Happy", "Kind",
  "Lucky", "Neat", "Proud", "Royal", "Sharp", "Shy", "Silly", "Smart",
  "Solar", "Lunar", "Wild", "Young", "Ancient", "Cosmic", "Daring", "Eager",
  "Fancy", "Grand", "Hidden", "Icy", "Jolly", "Keen", "Lively", "Mellow",
];

const NOUNS = [
  "Falcon", "River", "Pine", "Wolf", "Bear", "Eagle", "Otter", "Fox",
  "Lion", "Tiger", "Whale", "Dolphin", "Raven", "Hawk", "Owl", "Deer",
  "Salmon", "Trout", "Crane", "Swan", "Finch", "Wren", "Lynx", "Elk",
  "Bison", "Coral", "Maple", "Oak", "Birch", "Willow", "Stone", "Cloud",
  "Storm", "Creek", "Meadow", "Valley", "Ridge", "Peak", "Dune", "Glen",
];

export function generateEphemeralName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj} ${noun}`;
}

export function generatePairCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
