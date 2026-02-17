function cap(name: string) {
  const s = name.trim();
  if (!s) return s;
  return s[0].toUpperCase() + s.slice(1).toLowerCase();
}

function onlyLetters(s: string) {
  return s.replace(/[^a-zA-ZäöüÄÖÜß]/g, "");
}

const firstEndings = ["rio","lan","nox","mir","vyn","len","dar","tari","niel","sai","ron","sil","vin","mar"];
const lastEndings = ["mar","sen","lund","stone","berg","wald","mann","croft","dahl","mond","hart","win","ford","heim"];

function pick<T>(arr: T[]) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── Fantasy last names for Nickname mode ──

export const FANTASY_LAST_NAMES = [
  "Stormwind",
  "Silvermoon",
  "Ironwood",
  "Ashford",
  "Dawnbreak",
  "Frostpeak",
  "Nighthollow",
  "Stonehelm",
  "Wildmere",
  "Shadowvale",
  "Thornwall",
  "Brightforge",
  "Ravenscroft",
  "Duskwater",
  "Emberveil",
  "Starfell",
  "Greymist",
  "Oakshield",
  "Windcrest",
  "Deeprun",
] as const;

export function pickFantasyLastName(): string {
  return pick(FANTASY_LAST_NAMES as unknown as string[]);
}

export function generateFantasyOptions(
  firstPrefixRaw: string,
  lastPrefixRaw: string,
  count = 5
): Array<{ displayName: string; seed: string }> {
  const a = onlyLetters(firstPrefixRaw).slice(0, 3).toLowerCase();
  const b = onlyLetters(lastPrefixRaw).slice(0, 3).toLowerCase();

  if (a.length < 2 || b.length < 2) return [];

  const options: Array<{ displayName: string; seed: string }> = [];
  const seen = new Set<string>();

  for (let i = 0; i < count * 3 && options.length < count; i++) {
    // swap order to reduce reverse-engineering
    const swap = Math.random() < 0.5;
    const pFirst = swap ? b : a;
    const pLast = swap ? a : b;

    const first = cap(pFirst + pick(firstEndings));
    const last = cap(pLast + pick(lastEndings));

    let name = `${first} ${last}`;
    let suffix = 1;
    while (seen.has(name)) {
      suffix++;
      name = `${first} ${last}${suffix}`;
    }
    seen.add(name);

    const seed = name.replace(/\s+/g, "-").toLowerCase();
    options.push({ displayName: name, seed });
  }

  return options;
}
