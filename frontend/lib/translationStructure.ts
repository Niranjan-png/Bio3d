import type { MolecularVisualState } from "./processLab.ts";

export const RIBOSOME_STRUCTURE = {
  id: "4V9D",
  url: "https://files.rcsb.org/download/4V9D-assembly1.cif",
  entryUrl: "https://www.rcsb.org/structure/4V9D",
  citationUrl: "https://doi.org/10.1126/science.1202692",
  citation: "Dunkle et al., Science 332, 981–984 (2011)",
  resolution: "3.0 Å X-ray diffraction",
  smallSubunitRrnaAuthChain: "AA",
  largeSubunitRrnaAuthChains: ["CA", "CB"],
  trnaAuthChain: "AV",
  mrnaAuthChain: "AX",
  smallSubunitProteinAuthChains: [
    "AB", "AC", "AD", "AE", "AF", "AG", "AH", "AI", "AJ", "AK",
    "AL", "AM", "AN", "AO", "AP", "AQ", "AR", "AS", "AT", "AU",
  ],
  largeSubunitProteinAuthChains: [
    "CC", "CD", "CE", "CF", "CG", "CH", "CI", "CJ", "CK", "CL",
    "CM", "CN", "CO", "CP", "CQ", "CR", "CS", "CT", "CU", "CV",
    "CW", "CX", "CY", "CZ", "C0", "C1", "C2", "C3", "C4",
  ],
} as const;

export interface TranslationStructureReadout {
  readonly progress: number;
  readonly codonNumber: number | null;
  readonly codon: string | null;
  readonly peptide: string;
}

export function getTranslationStructureReadout(
  visual: Pick<
    MolecularVisualState,
    "progress" | "frame" | "activeCodonStart" | "codons" | "productSequence"
  >,
): TranslationStructureReadout {
  const codonIndex = Math.floor((visual.activeCodonStart - visual.frame) / 3);
  const codon = visual.codons[codonIndex] ?? null;

  return {
    progress: visual.progress,
    codonNumber: codon === null ? null : codonIndex + 1,
    codon,
    peptide: visual.productSequence,
  };
}
