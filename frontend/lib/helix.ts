export const MAX_SEQUENCE_LENGTH = 10000;
export const DEFAULT_VISUAL_WINDOW = 180;
export type Polymer = "DNA" | "RNA";
export type SequenceRecord = { sequence: string; title: string; invalid: string[]; ambiguous: number[] };
const IUPAC = new Set("ACGTURYSWKMBDHVN".split(""));

export function parseSequence(input: string, polymer: Polymer): SequenceRecord {
  const lines = input.trim().split(/\r?\n/);
  const headers = lines.filter((line) => line.trim().startsWith(">")).map((line) => line.trim().slice(1));
  const raw = lines.filter((line) => !line.trim().startsWith(">")).join("").replace(/\s+/g, "").toUpperCase();
  const invalid = [...new Set([...raw].filter((base) => !IUPAC.has(base)))];
  const expectedOther = polymer === "DNA" ? "U" : "T";
  if (raw.includes(expectedOther)) invalid.push(`${expectedOther} is not valid for ${polymer}`);
  const sequence = raw.replace(/[^ACGTURYSWKMBDHVN]/g, "").replace(new RegExp(expectedOther, "g"), "");
  return { sequence, title: headers[0] || "Untitled sequence", invalid, ambiguous: [...sequence].flatMap((base, index) => "ACGTU".includes(base) ? [] : [index]) };
}
export function complementBase(base: string, polymer: Polymer) {
  const pairs: Record<string, string> = polymer === "DNA" ? { A: "T", T: "A", C: "G", G: "C" } : { A: "U", U: "A", C: "G", G: "C" };
  return pairs[base] || "?";
}
export function complement(sequence: string, polymer: Polymer) { return [...sequence].map((base) => complementBase(base, polymer)).join(""); }
export function helixPoint(index: number, strand: 0 | 1, scale = 1, density = 10) {
  const angle = index * ((Math.PI * 2) / density) + (strand ? Math.PI : 0), radius = 4.4 * scale;
  return { x: Math.cos(angle) * radius, y: (index - .5) * 1.45 * scale, z: Math.sin(angle) * radius };
}
