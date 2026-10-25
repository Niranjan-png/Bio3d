"use strict";

/**
 * Educational DNA replication, transcription, and translation process lab.
 * Deterministic typed event timeline with index, reconstruction state, explanations,
 * play/pause/resume/reset, forward/backward step and speed using requestAnimationFrame with cleanup.
 * Avoids React per-frame heavy updates.
 * 
 * Explicitly labeled as educational simplified mechanistic illustrations, NOT atomistic physical simulations/MD.
 * Documents simplifications and conventions.
 */

import { type Polymer, complement } from "./helix.ts";

/** Standard genetic code mapping codon -> amino acid (single letter) */
export const GENETIC_CODE: Record<string, string> = {
  // U
  UUU: "F", UUC: "F", UUA: "L", UUG: "L",
  CUU: "L", CUC: "L", CUA: "L", CUG: "L",
  AUU: "I", AUC: "I", AUA: "I", AUG: "M",
  GUU: "V", GUC: "V", GUA: "V", GUG: "V",
  // C
  UCU: "S", UCC: "S", UCA: "S", UCG: "S",
  CCU: "P", CCC: "P", CCA: "P", CCG: "P",
  ACU: "T", ACC: "T", ACA: "T", ACG: "T",
  GCU: "A", GCC: "A", GCA: "A", GCG: "A",
  // A
  UAU: "Y", UAC: "Y", UAA: "*", UAG: "*",
  CAU: "H", CAC: "H", CAA: "Q", CAG: "Q",
  AAU: "N", AAC: "N", AAA: "K", AAG: "K",
  GAU: "D", GAC: "D", GAA: "E", GAG: "E",
  // G
  UGU: "C", UGC: "C", UGA: "*", UGG: "W",
  CGU: "R", CGC: "R", CGA: "R", CGG: "R",
  AGU: "S", AGC: "S", AGA: "R", AGG: "R",
  GGU: "G", GGC: "G", GGA: "G", GGG: "G",
};

/** RNA to DNA complement mapping (template strand convention) */
export const RNA_TO_DNA: Record<string, string> = { A: "T", U: "A", C: "G", G: "C" };

/** DNA to RNA transcription mapping (template strand -> RNA) */
export const DNA_TO_RNA: Record<string, string> = { T: "A", A: "U", C: "G", G: "C" };

/** Amino acid properties for educational display */
export const AA_PROPERTIES: Record<string, { name: string; hydrophobic: boolean; polar: boolean }> = {
  A: { name: "Alanine", hydrophobic: true, polar: false },
  R: { name: "Arginine", hydrophobic: false, polar: true },
  N: { name: "Asparagine", hydrophobic: false, polar: true },
  D: { name: "Aspartic acid", hydrophobic: false, polar: true },
  C: { name: "Cysteine", hydrophobic: true, polar: true },
  E: { name: "Glutamic acid", hydrophobic: false, polar: true },
  Q: { name: "Glutamine", hydrophobic: false, polar: true },
  G: { name: "Glycine", hydrophobic: false, polar: false },
  H: { name: "Histidine", hydrophobic: false, polar: true },
  I: { name: "Isoleucine", hydrophobic: true, polar: false },
  L: { name: "Leucine", hydrophobic: true, polar: false },
  K: { name: "Lysine", hydrophobic: false, polar: true },
  M: { name: "Methionine", hydrophobic: true, polar: false },
  F: { name: "Phenylalanine", hydrophobic: true, polar: false },
  P: { name: "Proline", hydrophobic: false, polar: false },
  S: { name: "Serine", hydrophobic: false, polar: true },
  T: { name: "Threonine", hydrophobic: false, polar: true },
  W: { name: "Tryptophan", hydrophobic: true, polar: false },
  Y: { name: "Tyrosine", hydrophobic: true, polar: true },
  V: { name: "Valine", hydrophobic: true, polar: false },
  "*": { name: "Stop", hydrophobic: false, polar: false },
};

/** Event types for the deterministic timeline */
export type EventType = 
  | "replication_start"
  | "replication_progress"
  | "replication_complete"
  | "transcription_start"
  | "transcription_progress"
  | "transcription_complete"
  | "translation_start"
  | "translation_progress"
  | "translation_complete"
  | "step";

export type ProcessLabMode = "replication" | "transcription" | "translation" | "combined";

/** Event in the deterministic timeline */
export interface TimelineEvent {
  readonly index: number;
  readonly type: EventType;
  readonly timestamp: number;
  readonly state: {
    readonly replication?: {
      readonly parental: string;
      readonly new: string;
      readonly progress: number; // 0-1
    };
    readonly transcription?: {
      readonly template: string;
      readonly rna: string;
      readonly progress: number; // 0-1
    };
    readonly translation?: {
      readonly mrna: string;
      readonly codons: readonly string[];
      readonly peptides: readonly string[];
      readonly ribosomePosition: number;
      readonly progress: number; // 0-1
    };
  };
  readonly explanation: string;
}

/** Configuration for the process lab */
export interface ProcessLabConfig {
  readonly sequence: string;
  readonly polymer: Polymer;
  readonly frame?: number; // reading frame for translation (0, 1, 2)
  readonly speed: number; // animation speed multiplier
  readonly autoPlay: boolean;
}

/** State of the process lab */
export interface ProcessLabState {
  readonly currentEventIndex: number;
  readonly events: readonly TimelineEvent[];
  readonly isPlaying: boolean;
  readonly isPaused: boolean;
  readonly speed: number;
  readonly currentTime: number;
  readonly selectedFrame: number;
}

const safeRequestAnimationFrame = (callback: () => void): number => {
  if (typeof requestAnimationFrame !== "undefined") {
    return requestAnimationFrame(callback);
  }
  return setTimeout(callback, 16) as unknown as number;
};

const safeCancelAnimationFrame = (id: number): void => {
  if (typeof cancelAnimationFrame !== "undefined") {
    cancelAnimationFrame(id);
  } else {
    clearTimeout(id as unknown as NodeJS.Timeout);
  }
};

export type TimelineListener = (state: ProcessLabState) => void;

/** Deterministic event generator for DNA processes */
export class DeterministicProcessTimeline {
  private config: ProcessLabConfig;
  private state: ProcessLabState;
  private animationId: number | null = null;
  private startTime: number = 0;
  private lastUpdateTime: number = 0;
  private readonly eventDuration: number = 2000; // ms per event
  private readonly stepDuration: number = 500; // ms per manual step
  private listeners: Set<TimelineListener> = new Set();

  constructor(config: ProcessLabConfig) {
    this.config = config;
    this.state = this.initializeState();
  }

  public subscribe(listener: TimelineListener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  private initializeState(): ProcessLabState {
    const events = this.generateEvents();
    return {
      currentEventIndex: 0,
      events,
      isPlaying: false,
      isPaused: false,
      speed: this.config.speed,
      currentTime: 0,
      selectedFrame: this.config.frame ?? 0,
    };
  }

  private generateEvents(): TimelineEvent[] {
    const { sequence, polymer } = this.config;
    if (!ProcessLabUtils.validateSequence(sequence, polymer, this.config.frame ?? 0).valid) return [];
    const events: TimelineEvent[] = [];
    let timestamp = 0;
    let rnaSequence = sequence;
    const frame = this.config.frame ?? 0;

    if (polymer === "DNA") {
    // Replication events
    events.push({
      index: events.length,
      type: "replication_start",
      timestamp,
      state: {
        replication: {
          parental: sequence,
          new: "",
          progress: 0,
        },
      },
      explanation: `Initiating DNA replication of ${sequence.length}-base ${polymer} strand. Parental strand serves as template for new complementary strand synthesis.`,
    });

    const parental = sequence;
    const newStrand = complement(parental, polymer);
    const replicationSteps = Math.ceil(parental.length / 3); // 3 bases per replication step

    for (let i = 0; i < replicationSteps; i++) {
      timestamp += this.eventDuration;
      const progress = (i + 1) / replicationSteps;
      const start = i * 3;
      const end = Math.min(start + 3, parental.length);
      const parentalSegment = parental.slice(start, end);
      const newSegment = newStrand.slice(start, end);

      events.push({
        index: events.length,
        type: "replication_progress",
        timestamp,
        state: {
          replication: {
            parental: parentalSegment,
            new: newSegment,
            progress,
          },
        },
        explanation: `Synthesizing new complementary strand. Adding bases: ${parentalSegment} → ${newSegment}. Progress: ${Math.round(progress * 100)}%.`,
      });
    }

    timestamp += this.eventDuration;
    events.push({
      index: events.length,
      type: "replication_complete",
      timestamp,
      state: {
        replication: {
          parental,
          new: newStrand,
          progress: 1,
        },
      },
      explanation: `DNA replication complete. Double helix formed with parental strand (${parental.length} bases) and new complementary strand (${newStrand.length} bases). Both strands antiparallel and complementary.`,
    });

    // Transcription events
    timestamp += this.eventDuration;
    events.push({
      index: events.length,
      type: "transcription_start",
      timestamp,
      state: {
        transcription: {
          template: newStrand,
          rna: "",
          progress: 0,
        },
      },
      explanation: `Initiating transcription from DNA template strand. RNA polymerase binds to promoter and begins synthesizing RNA complementary to the template strand (T→A, A→U, C→G, G→C).`,
    });

    rnaSequence = newStrand.split("").map(base => DNA_TO_RNA[base]).join("");
    const transcriptionSteps = Math.ceil(newStrand.length / 3);

    for (let i = 0; i < transcriptionSteps; i++) {
      timestamp += this.eventDuration;
      const progress = (i + 1) / transcriptionSteps;
      const start = i * 3;
      const end = Math.min(start + 3, newStrand.length);
      const templateSegment = newStrand.slice(start, end);
      const rnaSegment = rnaSequence.slice(start, end);

      events.push({
        index: events.length,
        type: "transcription_progress",
        timestamp,
        state: {
          transcription: {
            template: templateSegment,
            rna: rnaSegment,
            progress,
          },
        },
        explanation: `RNA synthesis progressing. Template: ${templateSegment} → RNA: ${rnaSegment}. RNA strand grows 5'→3' antiparallel to DNA template.`,
      });
    }

    timestamp += this.eventDuration;
    events.push({
      index: events.length,
      type: "transcription_complete",
      timestamp,
      state: {
        transcription: {
          template: newStrand,
          rna: rnaSequence,
          progress: 1,
        },
      },
      explanation: `Transcription complete. mRNA produced: ${rnaSequence}. mRNA contains ${rnaSequence.length} bases with 5' cap and 3' poly-A tail in biological systems (simplified here).`,
    });
    }

    // Translation events
    if (polymer === "RNA") timestamp = -this.eventDuration;
    timestamp += this.eventDuration;
    const translationStart = Math.min(frame, rnaSequence.length);
    events.push({
      index: events.length,
      type: "translation_start",
      timestamp,
      state: {
        translation: {
          mrna: rnaSequence,
          codons: [],
          peptides: [],
          ribosomePosition: translationStart,
          progress: 0,
        },
      },
      explanation: `Initiating translation at reading-frame offset ${frame}. Codons are read in triplets 5'→3'; start-codon recognition is not modeled.`,
    });

    const codons: string[] = [];
    const peptides: string[] = [];
    let hitStopCodon = false;

    for (let i = frame; i <= rnaSequence.length - 3; i += 3) {
      timestamp += this.eventDuration;
      const codon = rnaSequence.slice(i, i + 3);
      codons.push(codon);
      const aminoAcid = GENETIC_CODE[codon] || "X";
      const progress = codons.length / Math.max(1, Math.floor((rnaSequence.length - frame) / 3));

      if (aminoAcid !== "*") peptides.push(aminoAcid);
      events.push({
        index: events.length,
        type: "translation_progress",
        timestamp,
        state: {
          translation: {
            mrna: rnaSequence,
            codons: [...codons],
            peptides: [...peptides],
            ribosomePosition: i,
            progress,
          },
        },
        explanation: `Ribosome at position ${i}. Reading codon ${codon} → ${aminoAcid} (${AA_PROPERTIES[aminoAcid]?.name || "Unknown"}). Hydrophobic: ${AA_PROPERTIES[aminoAcid]?.hydrophobic ?? false}, Polar: ${AA_PROPERTIES[aminoAcid]?.polar ?? false}.`,
      });

      if (aminoAcid === "*") {
        hitStopCodon = true;
        timestamp += this.eventDuration;
        events.push({
          index: events.length,
          type: "translation_complete",
          timestamp,
          state: {
            translation: {
              mrna: rnaSequence,
              codons: [...codons],
              peptides: [...peptides],
              ribosomePosition: i + 3,
              progress: 1,
            },
          },
          explanation: `Translation terminated at stop codon. Final peptide: ${peptides.join("")}. Protein synthesis complete. mRNA degraded, ribosome released.`,
        });
        break;
      }
    }

    if (!hitStopCodon) {
      timestamp += this.eventDuration;
      events.push({
        index: events.length,
        type: "translation_complete",
        timestamp,
        state: {
          translation: {
            mrna: rnaSequence,
            codons: [...codons],
            peptides: [...peptides],
            ribosomePosition: Math.min(frame + codons.length * 3, rnaSequence.length),
            progress: 1,
          },
        },
        explanation: `Translation complete (no stop codon encountered). Final peptide: ${peptides.join("")}. Protein length: ${peptides.length} amino acids.`,
      });
    }

    return events;
  }

  public getState(): ProcessLabState {
    return this.state;
  }

  public getCurrentEvent(): TimelineEvent | null {
    if (this.state.currentEventIndex >= this.state.events.length) return null;
    return this.state.events[this.state.currentEventIndex];
  }

  public play(): void {
    if (this.state.isPlaying || !this.state.events.length) return;
    if (this.state.currentEventIndex >= this.state.events.length - 1) {
      this.state = {
        ...this.state,
        currentEventIndex: 0,
        currentTime: 0,
      };
    }
    this.state = { ...this.state, isPlaying: true, isPaused: false };
    this.startTime = performance.now();
    this.lastUpdateTime = this.startTime;
    this.notifyListeners();
    this.animate();
  }

  public pause(): void {
    if (this.animationId !== null) {
      safeCancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.state = { ...this.state, isPlaying: false, isPaused: true };
    this.notifyListeners();
  }

  public resume(): void {
    if (this.state.isPlaying || !this.state.events.length) return;
    if (this.state.currentEventIndex >= this.state.events.length - 1) {
      this.state = {
        ...this.state,
        currentEventIndex: 0,
        currentTime: 0,
      };
    }
    this.state = { ...this.state, isPlaying: true, isPaused: false };
    this.startTime = performance.now();
    this.lastUpdateTime = this.startTime;
    this.notifyListeners();
    this.animate();
  }

  public reset(): void {
    if (this.animationId !== null) {
      safeCancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.state = {
      ...this.state,
      currentEventIndex: 0,
      isPlaying: false,
      isPaused: false,
      currentTime: 0,
    };
    this.notifyListeners();
  }

  public stepForward(): void {
    if (this.state.currentEventIndex < this.state.events.length - 1) {
      if (this.animationId !== null) {
        safeCancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      const nextIndex = this.state.currentEventIndex + 1;
      this.state = {
        ...this.state,
        isPlaying: false,
        isPaused: false,
        currentEventIndex: nextIndex,
        currentTime: this.state.events[nextIndex].timestamp,
      };
      this.notifyListeners();
    }
  }

  public stepBackward(): void {
    if (this.state.currentEventIndex > 0) {
      if (this.animationId !== null) {
        safeCancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      const prevIndex = this.state.currentEventIndex - 1;
      this.state = {
        ...this.state,
        isPlaying: false,
        isPaused: false,
        currentEventIndex: prevIndex,
        currentTime: this.state.events[prevIndex].timestamp,
      };
      this.notifyListeners();
    }
  }

  public goToEvent(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.state.events.length) return;
    if (this.animationId !== null) {
      safeCancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.state = {
      ...this.state,
      currentEventIndex: index,
      currentTime: this.state.events[index].timestamp,
      isPlaying: false,
      isPaused: false,
    };
    this.notifyListeners();
  }

  public setSpeed(speed: number): void {
    this.state = { ...this.state, speed: Math.max(0.1, Math.min(5, speed)) };
    this.notifyListeners();
  }

  public setFrame(frame: number): void {
    if (this.animationId !== null) {
      safeCancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.config = { ...this.config, frame };
    this.state = {
      ...this.state,
      selectedFrame: frame,
      events: this.generateEvents(),
      currentEventIndex: 0,
      currentTime: 0,
      isPlaying: false,
      isPaused: false,
    };
    this.notifyListeners();
  }

  private animate(): void {
    if (!this.state.isPlaying || this.state.isPaused) {
      this.animationId = null;
      return;
    }

    const now = performance.now();
    const deltaTime = (now - this.lastUpdateTime) * this.state.speed;
    this.lastUpdateTime = now;

    const nextTime = this.state.currentTime + deltaTime;
    let nextEventIndex = this.state.currentEventIndex;

    // Find next event to advance to
    while (nextEventIndex < this.state.events.length - 1 && 
           nextTime >= this.state.events[nextEventIndex + 1].timestamp) {
      nextEventIndex++;
    }

    // Check if reached the end of the timeline
    if (nextEventIndex >= this.state.events.length - 1 && 
        nextTime >= this.state.events[this.state.events.length - 1].timestamp) {
      this.state = {
        ...this.state,
        currentEventIndex: this.state.events.length - 1,
        currentTime: this.state.events[this.state.events.length - 1].timestamp,
        isPlaying: false,
        isPaused: false,
      };
      this.animationId = null;
      this.notifyListeners();
      return;
    }

    if (nextEventIndex !== this.state.currentEventIndex) {
      this.state = {
        ...this.state,
        currentEventIndex: nextEventIndex,
        currentTime: nextTime,
      };
      this.notifyListeners();
    } else {
      this.state = {
        ...this.state,
        currentTime: nextTime,
      };
    }

    this.animationId = safeRequestAnimationFrame(() => this.animate());
  }

  public cleanup(): void {
    if (this.animationId !== null) {
      safeCancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.state = { ...this.state, isPlaying: false, isPaused: false };
    this.listeners.clear();
  }

  public updateConfig(newConfig: Partial<ProcessLabConfig>): void {
    const sequenceChanged = newConfig.sequence !== undefined && newConfig.sequence !== this.config.sequence;
    const polymerChanged = newConfig.polymer !== undefined && newConfig.polymer !== this.config.polymer;
    const frameChanged = newConfig.frame !== undefined && newConfig.frame !== this.config.frame;
    this.config = { ...this.config, ...newConfig };
    if (sequenceChanged || polymerChanged || frameChanged) {
      if (this.animationId !== null) {
        safeCancelAnimationFrame(this.animationId);
        this.animationId = null;
      }
      this.state = {
        ...this.state,
        events: this.generateEvents(),
        currentEventIndex: 0,
        currentTime: 0,
        isPlaying: false,
        isPaused: false,
      };
      this.notifyListeners();
    }
  }
}

/** Utility functions for deterministic process calculations */
export const ProcessLabUtils = {
  getEventsForMode(events: readonly TimelineEvent[], mode: ProcessLabMode): readonly TimelineEvent[] {
    if (mode === "combined") return events;
    return events.filter(event => event.type.startsWith(`${mode}_`));
  },

  getCurrentEventForMode(events: readonly TimelineEvent[], currentEventIndex: number): TimelineEvent | null {
    let currentEvent: TimelineEvent | null = null;
    for (const event of events) {
      if (event.index > currentEventIndex) break;
      currentEvent = event;
    }
    return currentEvent;
  },

  validateSequence(sequence: string, polymer: Polymer, frame = 0): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!sequence || sequence.length === 0) {
      errors.push("Sequence cannot be empty");
    }
    if (sequence.length > 10000) {
      errors.push("Sequence exceeds maximum length of 10,000 bases");
    }
    const validBases = polymer === "DNA" ? "ACGT" : "ACGU";
    const invalid = [...new Set(sequence.split("").filter(base => !validBases.includes(base)))];
    if (invalid.length > 0) {
      errors.push(`Invalid bases for ${polymer}: ${invalid.join(", ")}`);
    }
    if (!Number.isInteger(frame) || frame < 0 || frame > 2) {
      errors.push("Reading frame must be 0, 1, or 2");
    }
    return { valid: errors.length === 0, errors };
  },

  getReadingFrames(sequence: string): { frame: number; codons: string[]; peptide: string }[] {
    const frames: { frame: number; codons: string[]; peptide: string }[] = [];
    for (let frame = 0; frame < 3; frame++) {
      const codons: string[] = [];
      let peptide = "";
      for (let i = frame; i <= sequence.length - 3; i += 3) {
        const codon = sequence.slice(i, i + 3);
        const aminoAcid = GENETIC_CODE[codon] || "X";
        if (aminoAcid === "*") {
          codons.push(codon);
          break;
        }
        codons.push(codon);
        peptide += aminoAcid;
      }
      frames.push({ frame, codons, peptide });
    }
    return frames;
  },

  formatTime(timestamp: number): string {
    const seconds = Math.floor(timestamp / 1000);
    const ms = Math.floor(timestamp % 1000);
    return `${seconds}.${ms.toString().padStart(3, "0")}s`;
  },

  getProcessSummary(events: readonly TimelineEvent[]): {
    readonly replicationComplete: boolean;
    readonly transcriptionComplete: boolean;
    readonly translationComplete: boolean;
    readonly finalPeptide: string;
    readonly totalEvents: number;
  } {
    const replicationComplete = events.some(e => e.type === "replication_complete");
    const transcriptionComplete = events.some(e => e.type === "transcription_complete");
    const translationComplete = events.some(e => e.type === "translation_complete");
    const finalPeptide = events
      .filter(e => e.state.translation?.peptides && e.state.translation.peptides.length > 0)
      .reduce((acc, e) => e.state.translation?.peptides?.join("") || acc, "");

    return {
      replicationComplete,
      transcriptionComplete,
      translationComplete,
      finalPeptide,
      totalEvents: events.length,
    };
  },
};

export default DeterministicProcessTimeline;