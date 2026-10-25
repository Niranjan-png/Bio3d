import type { MolecularVisualState } from "./processLab.ts";

export interface ProcessAnimationState {
  readonly process: MolecularVisualState["process"];
  readonly progress: number;
  readonly actionLabel: string;
  readonly sequence: string;
  readonly template: string;
  readonly product: string;
  readonly forkPosition: number;
  readonly synthesizedBases: number;
  readonly transcriptBases: number;
  readonly activeCodonIndex: number;
  readonly activeCodon: string;
  readonly peptide: string;
}

export function getProcessAnimationState(
  visual: MolecularVisualState,
): ProcessAnimationState {
  const progress = Math.max(0, Math.min(1, visual.progress));
  const eventType = visual.event.type;

  if (visual.process === "replication") {
    const synthesizedBases = Math.floor(
      Math.max(0, Math.min(visual.primarySequence.length, visual.actorPosition)),
    );
    return {
      process: visual.process,
      progress,
      actionLabel: progress >= 1 ? "Replication complete" : "DNA unwinding",
      sequence: visual.primarySequence,
      template: visual.secondarySequence,
      product: visual.secondarySequence.slice(0, synthesizedBases),
      forkPosition: progress,
      synthesizedBases,
      transcriptBases: 0,
      activeCodonIndex: 0,
      activeCodon: "",
      peptide: "",
    };
  }

  if (visual.process === "transcription") {
    const transcriptBases = Math.floor(
      Math.max(0, Math.min(visual.productSequence.length, visual.actorPosition)),
    );
    return {
      process: visual.process,
      progress,
      actionLabel: progress >= 1 ? "RNA transcript complete" : "RNA elongation",
      sequence: visual.primarySequence,
      template: visual.secondarySequence,
      product: visual.productSequence.slice(0, transcriptBases),
      forkPosition: progress,
      synthesizedBases: 0,
      transcriptBases,
      activeCodonIndex: 0,
      activeCodon: "",
      peptide: "",
    };
  }

  const complete = eventType === "translation_complete";
  const codonIndex = complete
    ? Math.max(0, visual.codons.length - 1)
    : Math.max(0, Math.floor((visual.activeCodonStart - visual.frame) / 3));
  const activeCodon = complete
    ? visual.codons[codonIndex] ?? ""
    : visual.primarySequence.slice(visual.activeCodonStart, visual.activeCodonStart + 3);
  return {
    process: visual.process,
    progress,
    actionLabel: complete
      ? "Translation complete"
      : `Codon ${codonIndex + 1} — peptide elongation`,
    sequence: visual.primarySequence,
    template: "",
    product: visual.productSequence,
    forkPosition: progress,
    synthesizedBases: 0,
    transcriptBases: 0,
    activeCodonIndex: codonIndex,
    activeCodon,
    peptide: visual.productSequence,
  };
}
