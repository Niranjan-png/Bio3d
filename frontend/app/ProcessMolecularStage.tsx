"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createMolecularVisualProjector,
  type DeterministicProcessTimeline,
  type MolecularVisualState,
  type ProcessLabMode,
  type TimelineEvent,
} from "../lib/processLab";
import { getProcessAnimationState } from "../lib/processAnimation";
import { createStructureCoordinateLoader } from "../lib/structureCoordinates";
import { REPLICATION_STRUCTURE } from "../lib/replicationStructure";
import { TRANSCRIPTION_STRUCTURE } from "../lib/transcriptionStructure";
import { getTranslationStructureReadout, RIBOSOME_STRUCTURE } from "../lib/translationStructure";

const DISPLAY_BASES = 64;
const BASE_SPACING = 0.2;
const BASE_COLORS: Record<string, string> = {
  A: "#c8f36b",
  C: "#73c7ff",
  G: "#d8a4ff",
  T: "#ff846c",
  U: "#ff846c",
};
const AMINO_ACID_COLORS: Record<string, string> = {
  A: "#c8f36b", V: "#c8f36b", L: "#c8f36b", I: "#c8f36b", M: "#c8f36b", F: "#c8f36b", W: "#c8f36b",
  S: "#73c7ff", T: "#73c7ff", N: "#73c7ff", Q: "#73c7ff", C: "#73c7ff", Y: "#73c7ff",
  D: "#ff846c", E: "#ff846c", K: "#d8a4ff", R: "#d8a4ff", H: "#d8a4ff",
  G: "#f3d57a", P: "#f3d57a",
};

const loadRibosomeCoordinates = createStructureCoordinateLoader();
const loadReplicationCoordinates = createStructureCoordinateLoader();
const loadTranscriptionCoordinates = createStructureCoordinateLoader();

function disposeStructureViewer(viewer: any, mount: HTMLDivElement | null): void {
  if (!viewer) return;
  viewer.clear();
  const canvas = viewer.getCanvas?.();
  viewer.renderer?.context?.getExtension?.("WEBGL_lose_context")?.loseContext?.();
  canvas?.remove();
  mount?.replaceChildren();
}

interface ProcessMolecularStageProps {
  readonly timeline: DeterministicProcessTimeline | null;
  readonly events: readonly TimelineEvent[];
  readonly mode: ProcessLabMode;
  readonly frame: number;
  readonly currentEventIndex: number;
  readonly currentTime: number;
}

type SceneObjects = {
  readonly renderer: any;
  readonly camera: any;
  readonly baseRows: readonly any[];
  readonly backbones: readonly any[];
  readonly peptide: any;
  readonly bonds: any;
  readonly polymerase: any;
  readonly ribosome: any;
  readonly trna: any;
  readonly trnaStem: any;
  readonly helicase: any;
  readonly replicationClamp: any;
  readonly dummy: any;
  readonly resize: ResizeObserver;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function xFor(index: number, count: number): number {
  return (index - (Math.min(count, DISPLAY_BASES) - 1) / 2) * BASE_SPACING;
}

function BaseSequence({ label, sequence, progress, cursor }: {
  readonly label: string;
  readonly sequence: string;
  readonly progress?: number;
  readonly cursor?: number;
}) {
  const actorPosition = (cursor ?? progress ?? 0) * sequence.length;
  const windowStart = clamp(
    Math.floor(actorPosition - DISPLAY_BASES / 2),
    0,
    Math.max(0, sequence.length - DISPLAY_BASES),
  );
  const shown = sequence.slice(windowStart, windowStart + DISPLAY_BASES);
  return (
    <div className="molecular-sequence-row">
      <span className="molecular-sequence-label">{label}</span>
      <code>
        {[...shown].map((base, index) => (
          <span
            key={`${index}-${base}`}
            className={progress !== undefined && windowStart + index >= progress * sequence.length ? "not-yet-synthesized" : ""}
            style={{ color: BASE_COLORS[base] ?? "#eef5f1" }}
          >
            {base}
          </span>
        ))}
        {windowStart > 0 && <span className="sequence-overflow">…</span>}
        {windowStart + shown.length < sequence.length && <span className="sequence-overflow">…</span>}
      </code>
    </div>
  );
}

function CodonSequence({ visual }: { readonly visual: MolecularVisualState }) {
  const sequence = visual.primarySequence;
  const starts = Array.from(
    { length: Math.max(0, Math.floor((sequence.length - visual.frame) / 3)) },
    (_, index) => visual.frame + index * 3,
  );
  const beforeActive = Math.max(0, visual.activeCodonStart - visual.frame - (DISPLAY_BASES / 2));
  const windowStart = visual.frame + Math.floor(beforeActive / 3) * 3;
  const visibleStarts = starts.filter(start => start >= windowStart).slice(0, Math.floor(DISPLAY_BASES / 3));

  return (
    <div className="molecular-sequence-row">
      <span className="molecular-sequence-label">mRNA codons · frame {visual.frame}</span>
      <code className="codon-sequence">
        {windowStart > visual.frame && <span className="sequence-overflow">…</span>}
        {visibleStarts.map(start => (
          <span key={start} className={start === visual.activeCodonStart ? "active-codon" : ""}>
            {sequence.slice(start, start + 3)}
          </span>
        ))}
        {windowStart + visibleStarts.length * 3 < sequence.length && <span className="sequence-overflow">…</span>}
      </code>
    </div>
  );
}

function ProcessActionOverlay({ visual }: { readonly visual: MolecularVisualState }) {
  const action = getProcessAnimationState(visual);

  return (
    <div className={`process-action-overlay ${action.process}`} aria-live="polite">
      <div className="process-action-heading">
        <strong>{action.actionLabel}</strong>
        <span>{Math.round(action.progress * 100)}% · teaching overlay</span>
      </div>
      {action.process === "replication" && (
        <>
          <svg viewBox="0 0 360 122" role="img" aria-label={`Replication fork advanced ${action.synthesizedBases} of ${action.sequence.length} bases`}>
            <text x="20" y="15" className="parent-label">Parental DNA</text>
            <text x="20" y="31" className="parent-label">P1</text>
            <text x="20" y="79" className="parent-label">P2</text>
            <path d="M20 34 H340" className="parent-strand parent-one" />
            <path d="M20 82 H340" className="parent-strand parent-two" />
            {Array.from({ length: Math.max(0, Math.ceil((340 - (20 + 320 * action.forkPosition)) / 12)) }, (_, index) => {
              const x = 20 + 320 * action.forkPosition + index * 12;
              return x <= 340 ? <path key={x} d={`M${x} 35 v46`} className="base-pair-rung" /> : null;
            })}
            <path d={`M20 50 H${20 + 320 * action.forkPosition}`} className="daughter-strand daughter-one" />
            <path d={`M20 66 H${20 + 320 * action.forkPosition}`} className="daughter-strand daughter-two" />
            <path d={`M${20 + 320 * action.forkPosition} 26 l8 8 -8 8 -8-8 z`} className="fork-helicase" />
            <text x={Math.min(305, 20 + 320 * action.forkPosition + 8)} y="19" className="overlay-legend">Helicase</text>
            {action.synthesizedBases > 0 && (
              <>
                <path d={`M${Math.max(24, 20 + 320 * action.forkPosition - 18)} 45 v10`} className="polymerase-marker" />
                <path d={`M${Math.max(24, 20 + 320 * action.forkPosition - 18)} 61 v10`} className="polymerase-marker" />
              </>
            )}
            <text x="20" y="105" className="daughter-label">Daughter DNA · {action.synthesizedBases}/{action.sequence.length} bases</text>
            <text x="20" y="118" className="overlay-legend">Helicase / polymerase symbols are simplified; 6XTX contains CMG, not polymerase.</text>
          </svg>
          <div className="process-action-legend"><i className="parent-one-key" />Parent 1 <i className="parent-two-key" />Parent 2 <i className="daughter-key" />New DNA <i className="polymerase-key" />Polymerase*</div>
        </>
      )}
      {action.process === "transcription" && (
        <>
          <svg viewBox="0 0 360 122" role="img" aria-label={`RNA transcript has ${action.transcriptBases} of ${visual.productSequence.length} bases`}>
            <text x="20" y="15" className="overlay-legend">Template DNA</text>
            <path d={`M20 74 H${Math.max(20, 20 + 320 * action.forkPosition - 34)} Q${20 + 320 * action.forkPosition} 74 ${20 + 320 * action.forkPosition} 50 Q${20 + 320 * action.forkPosition} 74 ${Math.min(340, 54 + 320 * action.forkPosition)} 74 H340`} className="transcription-template" />
            <path d={`M20 38 H${Math.max(20, 20 + 320 * action.forkPosition - 34)} Q${20 + 320 * action.forkPosition} 38 ${20 + 320 * action.forkPosition} 62 Q${20 + 320 * action.forkPosition} 38 ${Math.min(340, 54 + 320 * action.forkPosition)} 38 H340`} className="transcription-nontemplate" />
            <path d={`M${20 + 320 * action.forkPosition} 57 C${Math.min(340, 42 + 320 * action.forkPosition)} 83 ${Math.max(20, 36 + 320 * action.forkPosition - action.transcriptBases * 9)} 92 ${Math.max(20, 36 + 320 * action.forkPosition - action.transcriptBases * 9)} 101`} className="transcription-rna" />
            <path d={`M${20 + 320 * action.forkPosition - 8} 49 l8 8 -8 8 -8-8 z`} className="transcription-polymerase" />
            <text x={Math.min(300, 20 + 320 * action.forkPosition + 8)} y="49" className="overlay-legend">Pol II</text>
            <text x="20" y="112" className="daughter-label">Nascent RNA · 5′ {action.product.length > 24 ? `…${action.product.slice(-24)}` : action.product || "—"} 3′</text>
          </svg>
          <div className="process-action-legend"><i className="template-key" />Template <i className="nontemplate-key" />Non-template <i className="rna-key" />RNA · {action.transcriptBases}/{visual.productSequence.length} nt</div>
        </>
      )}
      {action.process === "translation" && (
        <>
          <svg viewBox="0 0 360 132" role="img" aria-label={`Reading codon ${action.activeCodon || "—"} in frame ${visual.frame}; peptide length ${action.peptide.length}`}>
            <text x="20" y="14" className="overlay-legend">Peptide · {action.peptide.length} amino acid{action.peptide.length === 1 ? "" : "s"}</text>
            {action.peptide.slice(-8).split("").map((aminoAcid, index, chain) => {
              const x = 24 + index * 34;
              return <g key={`${aminoAcid}-${index}`}><rect x={x} y="20" width="26" height="18" rx="3" className="peptide-residue" /><text x={x + 13} y="33" textAnchor="middle" className="peptide-letter">{aminoAcid}</text>{index < chain.length - 1 && <path d={`M${x + 26} 29 h8`} className="peptide-bond" />}</g>;
            })}
            <path d="M70 53 Q70 43 82 43 H278 Q290 43 290 53 V110 H70 Z" className="ribosome-channel" />
            <text x="80" y="66" className="ribosome-site">P site</text>
            <text x="210" y="66" className="ribosome-site">A site</text>
            <path d="M20 101 H340" className="mrna-track" />
            {[-1, 0, 1, 2].map((offset) => {
              const codonIndex = action.activeCodonIndex + offset;
              const start = visual.frame + codonIndex * 3;
              const codon = codonIndex >= 0 ? visual.primarySequence.slice(start, start + 3) : "";
              const x = 130 + (offset + 1) * 56;
              return <g key={`${codonIndex}-${offset}`}><rect x={x} y="80" width="48" height="30" rx="3" className={offset === 0 ? "active-codon-box" : "codon-box"} /><text x={x + 24} y="99" textAnchor="middle" className={offset === 0 ? "active-codon-label" : "codon-label"}>{codon || "—"}</text></g>;
            })}
            <path d="M210 76 v-9 m0-5 v-8 m-8 7 q-9-8 0-14 q8 0 8 9 q0-9 8-9 q9 6 0 14" className="trna-icon" />
          </svg>
          <div className="process-action-legend"><i className="mrna-key" />mRNA · frame {visual.frame} <i className="trna-key" />tRNA / amino-acid icons are simplified</div>
        </>
      )}
      <p>Deterministic schematic synchronized to timeline events; deposited coordinates remain static.</p>
    </div>
  );
}

export default function ProcessMolecularStage({
  timeline,
  events,
  mode,
  frame,
  currentEventIndex,
  currentTime,
}: ProcessMolecularStageProps) {
  const mount = useRef<HTMLDivElement>(null);
  const replicationMount = useRef<HTMLDivElement>(null);
  const transcriptionMount = useRef<HTMLDivElement>(null);
  const translationMount = useRef<HTMLDivElement>(null);
  const replicationStructureViewer = useRef<any>(null);
  const transcriptionStructureViewer = useRef<any>(null);
  const structureViewer = useRef<any>(null);
  const replicationResizeObserver = useRef<ResizeObserver | null>(null);
  const transcriptionResizeObserver = useRef<ResizeObserver | null>(null);
  const structureResizeObserver = useRef<ResizeObserver | null>(null);
  const progressFill = useRef<HTMLElement>(null);
  const progressTrack = useRef<HTMLDivElement>(null);
  const progressLabel = useRef<HTMLSpanElement>(null);
  const sceneRef = useRef<SceneObjects | null>(null);
  const latest = useRef({ timeline, projector: null as ReturnType<typeof createMolecularVisualProjector> | null });
  const [sceneError, setSceneError] = useState("");
  const [replicationStructureStatus, setReplicationStructureStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [replicationStructureError, setReplicationStructureError] = useState("");
  const [replicationStructureRetry, setReplicationStructureRetry] = useState(0);
  const [transcriptionStructureStatus, setTranscriptionStructureStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [transcriptionStructureError, setTranscriptionStructureError] = useState("");
  const [transcriptionStructureRetry, setTranscriptionStructureRetry] = useState(0);
  const [structureStatus, setStructureStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [structureError, setStructureError] = useState("");
  const [structureRetry, setStructureRetry] = useState(0);
  const projector = useMemo(
    () => (events.length ? createMolecularVisualProjector(events, mode) : null),
    [events, mode],
  );
  latest.current = { timeline, projector };

  const visual = useMemo(() => {
    if (!timeline || !projector) return null;
    return projector(currentEventIndex, currentTime, frame);
  }, [timeline, projector, currentEventIndex, currentTime, events, mode, frame]);
  const translationReadout = visual?.process === "translation"
    ? getTranslationStructureReadout(visual)
    : null;
  const replicationVisual = visual?.process === "replication" ? visual : null;
  const transcriptionVisual = visual?.process === "transcription" ? visual : null;

  useEffect(() => {
    if (!replicationVisual || !replicationMount.current) return;
    let cancelled = false;

    if (replicationStructureViewer.current) {
      const viewer = replicationStructureViewer.current;
      const canvas = viewer.getCanvas?.();
      if (canvas && canvas.parentElement !== replicationMount.current) {
        replicationMount.current.appendChild(canvas);
      }
      requestAnimationFrame(() => viewer.resize());
      const observer = new ResizeObserver(() => viewer.resize());
      observer.observe(replicationMount.current);
      replicationResizeObserver.current = observer;
      return () => {
        observer.disconnect();
        if (replicationResizeObserver.current === observer) replicationResizeObserver.current = null;
      };
    }

    setReplicationStructureStatus("loading");
    setReplicationStructureError("");
    void (async () => {
      let viewer: any;
      try {
        const [module, coordinates] = await Promise.all([
          import("3dmol"),
          loadReplicationCoordinates(REPLICATION_STRUCTURE.url),
        ]);
        if (cancelled || !replicationMount.current) return;

        const mol = (module as any).default ?? module;
        viewer = mol.createViewer(replicationMount.current, {
          backgroundColor: "#071311",
          antialias: true,
        });
        viewer.addModel(coordinates, "cif");
        viewer.setStyle({}, { cartoon: { color: "#50677a", opacity: 0.24 } });
        const mcmColors = ["#7667ff", "#5c61f4", "#4c76f1", "#327fdf", "#286bbf", "#5872d5"];
        for (const [index, chain] of REPLICATION_STRUCTURE.mcmAuthChains.entries()) {
          viewer.setStyle({ chain }, { cartoon: { color: mcmColors[index], opacity: 1 } });
        }
        for (const chain of REPLICATION_STRUCTURE.ginsAuthChains) {
          viewer.setStyle({ chain }, { cartoon: { color: "#39b79d", opacity: 0.78 } });
        }
        viewer.setStyle({ chain: REPLICATION_STRUCTURE.cdc45AuthChain }, {
          cartoon: { color: "#f2a044", opacity: 0.88 },
        });
        viewer.setStyle({ chain: REPLICATION_STRUCTURE.dnaAuthChain }, {
          cartoon: { color: "#39e0ed", opacity: 1 },
          stick: { color: "#39e0ed", radius: 0.28 },
        });
        viewer.zoomTo({ chain: [...REPLICATION_STRUCTURE.mcmAuthChains, REPLICATION_STRUCTURE.dnaAuthChain] });
        viewer.zoom(1.12);
        viewer.render();
        if (cancelled) {
          viewer.clear();
          return;
        }
        replicationStructureViewer.current = viewer;
        replicationResizeObserver.current = new ResizeObserver(() => viewer.resize());
        replicationResizeObserver.current.observe(replicationMount.current);
        setReplicationStructureStatus("ready");
      } catch (error) {
        if (viewer) loadReplicationCoordinates.invalidate(REPLICATION_STRUCTURE.url);
        disposeStructureViewer(viewer, replicationMount.current);
        if (cancelled) return;
        setReplicationStructureStatus("error");
        setReplicationStructureError(
          error instanceof Error
            ? `The experimental replication structure could not be loaded: ${error.message}`
            : "The experimental replication structure could not be loaded. Check your connection and retry.",
        );
      }
    })();

    return () => {
      cancelled = true;
      replicationResizeObserver.current?.disconnect();
      replicationResizeObserver.current = null;
    };
  }, [replicationVisual?.process, replicationStructureRetry]);

  useEffect(() => {
    if (!transcriptionVisual || !transcriptionMount.current) return;
    let cancelled = false;

    if (transcriptionStructureViewer.current) {
      const viewer = transcriptionStructureViewer.current;
      const canvas = viewer.getCanvas?.();
      if (canvas && canvas.parentElement !== transcriptionMount.current) {
        transcriptionMount.current.appendChild(canvas);
      }
      requestAnimationFrame(() => viewer.resize());
      const observer = new ResizeObserver(() => viewer.resize());
      observer.observe(transcriptionMount.current);
      transcriptionResizeObserver.current = observer;
      return () => {
        observer.disconnect();
        if (transcriptionResizeObserver.current === observer) transcriptionResizeObserver.current = null;
      };
    }

    setTranscriptionStructureStatus("loading");
    setTranscriptionStructureError("");
    void (async () => {
      let viewer: any;
      try {
        const [module, coordinates] = await Promise.all([
          import("3dmol"),
          loadTranscriptionCoordinates(TRANSCRIPTION_STRUCTURE.url),
        ]);
        if (cancelled || !transcriptionMount.current) return;

        const mol = (module as any).default ?? module;
        viewer = mol.createViewer(transcriptionMount.current, {
          backgroundColor: "#071311",
          antialias: true,
        });
        viewer.addModel(coordinates, "cif");
        viewer.setStyle({}, { hidden: true });
        viewer.setStyle({ chain: TRANSCRIPTION_STRUCTURE.rpb1AuthChain }, {
          cartoon: { color: "#f05a9d", opacity: 1 },
        });
        viewer.setStyle({ chain: TRANSCRIPTION_STRUCTURE.rpb2AuthChain }, {
          cartoon: { color: "#8170ff", opacity: 1 },
        });
        for (const chain of TRANSCRIPTION_STRUCTURE.accessoryProteinAuthChains) {
          viewer.setStyle({ chain }, { cartoon: { color: "#7495aa", opacity: 0.3 } });
        }
        viewer.setStyle({ chain: TRANSCRIPTION_STRUCTURE.templateDnaAuthChain }, {
          cartoon: { color: "#27c4f2", opacity: 1 },
          stick: { color: "#27c4f2", radius: 0.2 },
        });
        viewer.setStyle({ chain: TRANSCRIPTION_STRUCTURE.nonTemplateDnaAuthChain }, {
          cartoon: { color: "#ffc857", opacity: 1 },
          stick: { color: "#ffc857", radius: 0.2 },
        });
        viewer.setStyle({ chain: TRANSCRIPTION_STRUCTURE.nascentRnaAuthChain }, {
          cartoon: { color: "#ff5bce", opacity: 1 },
          stick: { color: "#ff5bce", radius: 0.25 },
        });
        viewer.zoomTo({
          chain: [
            TRANSCRIPTION_STRUCTURE.rpb1AuthChain,
            TRANSCRIPTION_STRUCTURE.rpb2AuthChain,
            TRANSCRIPTION_STRUCTURE.templateDnaAuthChain,
            TRANSCRIPTION_STRUCTURE.nonTemplateDnaAuthChain,
            TRANSCRIPTION_STRUCTURE.nascentRnaAuthChain,
          ],
        });
        viewer.zoom(1.08);
        viewer.render();
        if (cancelled) {
          viewer.clear();
          return;
        }
        transcriptionStructureViewer.current = viewer;
        transcriptionResizeObserver.current = new ResizeObserver(() => viewer.resize());
        transcriptionResizeObserver.current.observe(transcriptionMount.current);
        setTranscriptionStructureStatus("ready");
      } catch (error) {
        if (viewer) loadTranscriptionCoordinates.invalidate(TRANSCRIPTION_STRUCTURE.url);
        disposeStructureViewer(viewer, transcriptionMount.current);
        if (cancelled) return;
        setTranscriptionStructureStatus("error");
        setTranscriptionStructureError(
          error instanceof Error
            ? `The experimental transcription structure could not be loaded: ${error.message}`
            : "The experimental transcription structure could not be loaded. Check your connection and retry.",
        );
      }
    })();

    return () => {
      cancelled = true;
      transcriptionResizeObserver.current?.disconnect();
      transcriptionResizeObserver.current = null;
    };
  }, [transcriptionVisual?.process, transcriptionStructureRetry]);

  useEffect(() => {
    if (visual?.process !== "translation" || !translationMount.current) return;
    let cancelled = false;

    if (structureViewer.current) {
      const viewer = structureViewer.current;
      const canvas = viewer.getCanvas?.();
      if (canvas && canvas.parentElement !== translationMount.current) {
        translationMount.current.appendChild(canvas);
      }
      requestAnimationFrame(() => viewer.resize());
      const observer = new ResizeObserver(() => viewer.resize());
      observer.observe(translationMount.current);
      structureResizeObserver.current = observer;
      return () => {
        observer.disconnect();
        if (structureResizeObserver.current === observer) structureResizeObserver.current = null;
      };
    }

    setStructureStatus("loading");
    setStructureError("");
    void (async () => {
      let viewer: any;
      try {
        const [module, coordinates] = await Promise.all([
          import("3dmol"),
          loadRibosomeCoordinates(RIBOSOME_STRUCTURE.url),
        ]);
        if (cancelled || !translationMount.current) return;

        const mol = (module as any).default ?? module;
        viewer = mol.createViewer(translationMount.current, {
          backgroundColor: "#071311",
          antialias: true,
        });
        viewer.addModel(coordinates, "cif");
        viewer.setStyle({}, { hidden: true });
        for (const chain of RIBOSOME_STRUCTURE.smallSubunitProteinAuthChains) {
          viewer.setStyle({ chain }, { cartoon: { color: "#45c7c2", opacity: 0.88 } });
        }
        for (const chain of RIBOSOME_STRUCTURE.largeSubunitProteinAuthChains) {
          viewer.setStyle({ chain }, { cartoon: { color: "#668cf2", opacity: 0.88 } });
        }
        viewer.setStyle({ chain: RIBOSOME_STRUCTURE.smallSubunitRrnaAuthChain }, {
          cartoon: { color: "#30b7d2", opacity: 0.9 },
        });
        for (const chain of RIBOSOME_STRUCTURE.largeSubunitRrnaAuthChains) {
          viewer.setStyle({ chain }, { cartoon: { color: "#f0a04b", opacity: 0.9 } });
        }
        viewer.setStyle({ chain: RIBOSOME_STRUCTURE.trnaAuthChain }, {
          cartoon: { color: "#ff55bb", opacity: 1 },
          stick: { color: "#ff55bb", radius: 0.24 },
        });
        viewer.setStyle({ chain: RIBOSOME_STRUCTURE.mrnaAuthChain }, {
          cartoon: { color: "#c7ed54", opacity: 1 },
          stick: { color: "#c7ed54", radius: 0.28 },
        });
        viewer.zoomTo({
          chain: [
            ...RIBOSOME_STRUCTURE.smallSubunitProteinAuthChains,
            RIBOSOME_STRUCTURE.smallSubunitRrnaAuthChain,
            ...RIBOSOME_STRUCTURE.largeSubunitProteinAuthChains,
            ...RIBOSOME_STRUCTURE.largeSubunitRrnaAuthChains,
            RIBOSOME_STRUCTURE.trnaAuthChain,
            RIBOSOME_STRUCTURE.mrnaAuthChain,
          ],
        });
        viewer.zoom(0.92);
        viewer.render();
        if (cancelled) {
          viewer.clear();
          return;
        }
        structureViewer.current = viewer;
        structureResizeObserver.current = new ResizeObserver(() => viewer.resize());
        structureResizeObserver.current.observe(translationMount.current);
        setStructureStatus("ready");
      } catch (error) {
        if (viewer) loadRibosomeCoordinates.invalidate(RIBOSOME_STRUCTURE.url);
        disposeStructureViewer(viewer, translationMount.current);
        if (cancelled) return;
        setStructureStatus("error");
        setStructureError(
          error instanceof Error
            ? `The experimental ribosome structure could not be loaded: ${error.message}`
            : "The experimental ribosome structure could not be loaded. Check your connection and retry.",
        );
      }
    })();

    return () => {
      cancelled = true;
      structureResizeObserver.current?.disconnect();
      structureResizeObserver.current = null;
    };
  }, [visual?.process, structureRetry]);

  useEffect(() => () => {
    replicationResizeObserver.current?.disconnect();
    disposeStructureViewer(replicationStructureViewer.current, replicationMount.current);
    replicationStructureViewer.current = null;
    transcriptionResizeObserver.current?.disconnect();
    disposeStructureViewer(transcriptionStructureViewer.current, transcriptionMount.current);
    transcriptionStructureViewer.current = null;
    structureResizeObserver.current?.disconnect();
    disposeStructureViewer(structureViewer.current, translationMount.current);
    structureViewer.current = null;
  }, []);

  useEffect(() => {
    let disposed = false;
    let animationFrame = 0;
    let rendererInstance: any = null;
    let resizeObserver: ResizeObserver | null = null;
    const geometries: any[] = [];
    const materials: any[] = [];
    let scene: any;

    void (async () => {
      try {
        const THREE = await import("three");
        if (disposed || !mount.current) return;

        scene = new THREE.Scene();
        scene.background = new THREE.Color("#071311");
        const camera = new THREE.OrthographicCamera(-10, 10, 5, -5, 0.1, 100);
        camera.position.set(0, 0, 24);
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        rendererInstance = renderer;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        mount.current.replaceChildren(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 1.6));
        const light = new THREE.DirectionalLight(0xc8f36b, 1.8);
        light.position.set(-4, 8, 12);
        scene.add(light);

        const baseGeometry = new THREE.SphereGeometry(0.13, 12, 10);
        const baseMaterial = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.08 });
        const colorCache = new Map<string, any>();
        for (const color of [...Object.values(BASE_COLORS), ...Object.values(AMINO_ACID_COLORS), "#eef5f1", "#c8f36b"]) {
          colorCache.set(color, new THREE.Color(color));
        }
        geometries.push(baseGeometry);
        materials.push(baseMaterial);
        const baseRows = Array.from({ length: 3 }, () => {
          const row = new THREE.InstancedMesh(baseGeometry, baseMaterial, DISPLAY_BASES);
          row.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          row.frustumCulled = false;
          scene.add(row);
          return row;
        });
        const backboneMaterial = new THREE.LineBasicMaterial({ color: "#9cb3a8", transparent: true, opacity: 0.78 });
        materials.push(backboneMaterial);
        const backbones = baseRows.map(() => {
          const geometry = new THREE.BufferGeometry();
          const attribute = new THREE.BufferAttribute(new Float32Array(DISPLAY_BASES * 12), 3);
          attribute.setUsage(THREE.DynamicDrawUsage);
          geometry.setAttribute("position", attribute);
          geometry.setDrawRange(0, 0);
          const line = new THREE.LineSegments(geometry, backboneMaterial);
          line.frustumCulled = false;
          scene.add(line);
          geometries.push(geometry);
          return line;
        });
        const peptide = new THREE.InstancedMesh(baseGeometry, baseMaterial, DISPLAY_BASES);
        peptide.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        peptide.frustumCulled = false;
        scene.add(peptide);

        const bondPositions = new Float32Array(DISPLAY_BASES * 18);
        const bondGeometry = new THREE.BufferGeometry();
        const bondAttribute = new THREE.BufferAttribute(bondPositions, 3);
        bondAttribute.setUsage(THREE.DynamicDrawUsage);
        bondGeometry.setAttribute("position", bondAttribute);
        bondGeometry.setDrawRange(0, 0);
        const bondMaterial = new THREE.LineBasicMaterial({ color: "#829d91", transparent: true, opacity: 0.48 });
        const bonds = new THREE.LineSegments(bondGeometry, bondMaterial);
        bonds.frustumCulled = false;
        scene.add(bonds);
        geometries.push(bondGeometry);
        materials.push(bondMaterial);

        const polymeraseMaterial = new THREE.MeshStandardMaterial({ color: "#d8a4ff", emissive: "#301743", roughness: 0.38 });
        const polymerase = new THREE.Group();
        const polymeraseCore = new THREE.Mesh(new THREE.SphereGeometry(0.43, 20, 14), polymeraseMaterial);
        polymeraseCore.scale.set(1.08, 0.74, 0.8);
        const polymeraseLobe = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 12), polymeraseMaterial);
        polymeraseLobe.position.set(0.32, 0.22, 0.12);
        polymeraseLobe.scale.set(1.05, 0.8, 0.75);
        const polymeraseJaw = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.055, 8, 20, Math.PI * 1.45), polymeraseMaterial);
        polymeraseJaw.position.set(0, -0.14, 0.36);
        polymeraseJaw.rotation.z = Math.PI * 0.78;
        polymerase.add(polymeraseCore, polymeraseLobe, polymeraseJaw);
        scene.add(polymerase);
        geometries.push(polymeraseCore.geometry, polymeraseLobe.geometry, polymeraseJaw.geometry);
        materials.push(polymeraseMaterial);

        const ribosomeMaterial = new THREE.MeshStandardMaterial({ color: "#b8d986", emissive: "#172414", roughness: 0.48 });
        const ribosome = new THREE.Group();
        const lower = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.2, 12, 32, Math.PI * 1.45), ribosomeMaterial);
        lower.scale.set(1.8, 1.1, 0.8);
        lower.position.y = -0.05;
        lower.rotation.z = -Math.PI * 0.23;
        const upper = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.17, 12, 32, Math.PI * 1.35), ribosomeMaterial);
        upper.scale.set(1.8, 1.05, 0.8);
        upper.position.y = 0.62;
        upper.rotation.z = Math.PI * 0.82;
        const groove = new THREE.MeshStandardMaterial({
          color: "#27382d",
          emissive: "#101b14",
          side: THREE.DoubleSide,
        });
        const channel = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.075, 10, 28, Math.PI), groove);
        channel.position.set(0, 0.16, 0.48);
        channel.rotation.z = Math.PI;
        ribosome.add(lower, upper, channel);
        ribosome.visible = false;
        scene.add(ribosome);
        geometries.push(lower.geometry, upper.geometry, channel.geometry);
        materials.push(ribosomeMaterial, groove);

        const trnaMaterial = new THREE.MeshStandardMaterial({ color: "#73c7ff", emissive: "#102a38" });
        const trna = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), trnaMaterial);
        trna.visible = false;
        scene.add(trna);
        geometries.push(trna.geometry);
        materials.push(trnaMaterial);
        const trnaGeometry = new THREE.BufferGeometry();
        trnaGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12), 3));
        const trnaStem = new THREE.Line(
          trnaGeometry,
          new THREE.LineBasicMaterial({ color: "#73c7ff", transparent: true, opacity: 0.8 }),
        );
        trnaStem.visible = false;
        scene.add(trnaStem);
        geometries.push(trnaGeometry);
        materials.push(trnaStem.material);
        const helicaseMaterial = new THREE.MeshStandardMaterial({ color: "#ffbd69", emissive: "#38220d", roughness: 0.4 });
        const helicase = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.11, 12, 28), helicaseMaterial);
        helicase.position.z = 0.4;
        scene.add(helicase);
        geometries.push(helicase.geometry);
        materials.push(helicaseMaterial);
        const clampMaterial = new THREE.MeshStandardMaterial({ color: "#73c7ff", emissive: "#112b3c", roughness: 0.4 });
        const replicationClamp = new THREE.Group();
        const clampRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.075, 10, 24), clampMaterial);
        const clampBody = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), clampMaterial);
        clampBody.position.x = 0.28;
        replicationClamp.add(clampRing, clampBody);
        scene.add(replicationClamp);
        geometries.push(clampRing.geometry, clampBody.geometry);
        materials.push(clampMaterial);

        const resize = new ResizeObserver(() => {
          if (!mount.current) return;
          const { width, height } = mount.current.getBoundingClientRect();
          if (!width || !height) return;
          const halfHeight = 5;
          camera.left = -halfHeight * (width / height);
          camera.right = halfHeight * (width / height);
          camera.top = halfHeight;
          camera.bottom = -halfHeight;
          camera.updateProjectionMatrix();
          renderer.setSize(width, height, false);
        });
        resizeObserver = resize;
        resize.observe(mount.current);
        const objects: SceneObjects = {
          renderer,
          camera,
          baseRows,
          backbones,
          peptide,
          bonds,
          polymerase,
          ribosome,
          trna,
          trnaStem,
          helicase,
          replicationClamp,
          dummy: new THREE.Object3D(),
          resize,
        };
        sceneRef.current = objects;

        const setInstance = (
          mesh: any,
          instanceIndex: number,
          base: string | undefined,
          x: number,
          y: number,
          z: number,
          visible: boolean,
          scale = 1,
        ) => {
          const state = sceneRef.current;
          if (!state) return;
          const dummy = state.dummy;
          dummy.position.set(x, y, z);
          dummy.scale.setScalar(visible ? scale : 0.0001);
          dummy.updateMatrix();
          mesh.setMatrixAt(instanceIndex, dummy.matrix);
          mesh.setColorAt(
            instanceIndex,
            colorCache.get(base ? (colorCache.has(base) ? base : BASE_COLORS[base] ?? "#eef5f1") : "#c8f36b"),
          );
        };

        const render = () => {
          if (disposed || !sceneRef.current) return;
          const current = latest.current;
          const state = current.timeline?.getState();
          const nextVisual =
            state && current.projector
              ? current.projector(state.currentEventIndex, state.currentTime, state.selectedFrame)
              : null;
          if (nextVisual) {
            const percent = Math.round(nextVisual.progress * 100);
            if (progressLabel.current) progressLabel.current.textContent = `${percent}%`;
            if (progressFill.current) {
              progressFill.current.style.transform = `scaleX(${nextVisual.progress})`;
            }
            progressTrack.current?.setAttribute("aria-valuenow", String(percent));
          }
          const sceneObjects = sceneRef.current;
          const bondArray = sceneObjects.bonds.geometry.attributes.position.array as Float32Array;
          let bondCount = 0;
          const primaryLength = nextVisual?.primarySequence.length ?? 0;
          const visibleCount = Math.min(primaryLength, DISPLAY_BASES);
          const windowStart = nextVisual
            ? clamp(
                Math.floor(nextVisual.actorPosition - visibleCount / 2),
                0,
                Math.max(0, primaryLength - visibleCount),
              )
            : 0;
          const localActorPosition = nextVisual
            ? clamp(nextVisual.actorPosition - windowStart, 0, visibleCount)
            : 0;

          for (let rowIndex = 0; rowIndex < sceneObjects.baseRows.length; rowIndex++) {
            const mesh = sceneObjects.baseRows[rowIndex];
            for (let index = 0; index < DISPLAY_BASES; index++) {
              const sourceIndex = windowStart + index;
              const isInSequence = Boolean(nextVisual && index < visibleCount);
              const x = xFor(index, visibleCount);
              const twist = Math.sin(sourceIndex * Math.PI * 2 / 10) * 0.2;
              const depth = Math.cos(sourceIndex * Math.PI * 2 / 10) * 0.42;
              let base: string | undefined;
              let y = 0;
              let z = depth;
              let visible = false;
              let scale = 1;

              if (nextVisual?.process === "replication") {
                const opening = clamp((localActorPosition - index) / 3, 0, 1);
                if (rowIndex === 0) {
                  base = nextVisual.primarySequence[sourceIndex];
                  y = 0.42 + twist + opening * 0.58;
                  visible = isInSequence;
                } else if (rowIndex === 1) {
                  base = nextVisual.secondarySequence[sourceIndex];
                  y = -0.42 - twist - opening * 0.58;
                  visible = isInSequence;
                } else {
                  base = nextVisual.secondarySequence[sourceIndex];
                  y = 0.42 + twist + opening * 0.58 - 0.82;
                  z = 0;
                  scale = clamp(localActorPosition - index, 0, 1);
                  visible = isInSequence && scale > 0;
                }
                if (rowIndex === 0 && isInSequence && opening < 0.8) {
                  bondArray[bondCount++] = x;
                  bondArray[bondCount++] = 0.42 + twist + opening * 0.58;
                  bondArray[bondCount++] = depth;
                  bondArray[bondCount++] = x;
                  bondArray[bondCount++] = -0.42 - twist - opening * 0.58;
                  bondArray[bondCount++] = depth;
                } else if (rowIndex === 2 && isInSequence && scale > 0) {
                  bondArray[bondCount++] = x;
                  bondArray[bondCount++] = 0.42 + twist + opening * 0.58;
                  bondArray[bondCount++] = depth;
                  bondArray[bondCount++] = x;
                  bondArray[bondCount++] = 0.42 + twist + opening * 0.58 - 0.82;
                  bondArray[bondCount++] = 0;
                }
              } else if (nextVisual?.process === "transcription") {
                if (rowIndex === 0) {
                  base = nextVisual.primarySequence[sourceIndex];
                  y = 0.9 + twist;
                  visible = isInSequence;
                } else if (rowIndex === 1) {
                  base = nextVisual.secondarySequence[sourceIndex];
                  y = -0.05 - twist;
                  visible = isInSequence;
                  if (isInSequence) {
                    bondArray[bondCount++] = x;
                    bondArray[bondCount++] = 0.9 + twist;
                    bondArray[bondCount++] = depth;
                    bondArray[bondCount++] = x;
                    bondArray[bondCount++] = -0.05 - twist;
                    bondArray[bondCount++] = depth;
                  }
                } else {
                  base = nextVisual.productSequence[sourceIndex];
                  y = -0.9;
                  z = -0.2;
                  scale = clamp(localActorPosition - index, 0, 1);
                  visible = Boolean(base) && scale > 0;
                }
              } else if (nextVisual?.process === "translation" && rowIndex === 0) {
                base = nextVisual.primarySequence[sourceIndex];
                y = -0.1;
                visible = isInSequence;
              }
              setInstance(mesh, index, base, x, y, z, visible, scale);
            }
            mesh.instanceMatrix.needsUpdate = true;
            if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          }
          for (let rowIndex = 0; rowIndex < sceneObjects.backbones.length; rowIndex++) {
            const positions = sceneObjects.backbones[rowIndex].geometry.attributes.position.array as Float32Array;
            let segment = 0;
            let previous: [number, number, number] | null = null;
            for (let index = 0; index < DISPLAY_BASES; index++) {
              const sourceIndex = windowStart + index;
              if (index >= visibleCount) break;
              let y = -0.1;
              let z = Math.cos(sourceIndex * Math.PI * 2 / 10) * 0.42;
              let exists = false;
              if (nextVisual?.process === "replication") {
                const opening = clamp((localActorPosition - index) / 3, 0, 1);
                if (rowIndex === 0) { y = 0.42 + Math.sin(sourceIndex * Math.PI * 2 / 10) * 0.2 + opening * 0.58; exists = true; }
                else if (rowIndex === 1) { y = -0.42 - Math.sin(sourceIndex * Math.PI * 2 / 10) * 0.2 - opening * 0.58; exists = true; }
                else {
                  const opening = clamp((localActorPosition - index) / 3, 0, 1);
                  y = 0.42 + Math.sin(sourceIndex * Math.PI * 2 / 10) * 0.2 + opening * 0.58 - 0.82;
                  z = 0;
                  exists = index < localActorPosition;
                }
              } else if (nextVisual?.process === "transcription") {
                if (rowIndex === 0) { y = 0.9 + Math.sin(sourceIndex * Math.PI * 2 / 10) * 0.2; exists = true; }
                else if (rowIndex === 1) { y = -0.05 - Math.sin(sourceIndex * Math.PI * 2 / 10) * 0.2; exists = true; }
                else { y = -0.9; z = -0.2; exists = index < localActorPosition && Boolean(nextVisual.productSequence[sourceIndex]); }
              } else if (nextVisual?.process === "translation" && rowIndex === 0) {
                y = -0.1; exists = true;
              }
              if (!exists) continue;
              const point: [number, number, number] = [xFor(index, visibleCount), y, z];
              if (previous) {
                const offset = segment * 6;
                positions[offset] = previous[0];
                positions[offset + 1] = previous[1];
                positions[offset + 2] = previous[2];
                positions[offset + 3] = point[0];
                positions[offset + 4] = point[1];
                positions[offset + 5] = point[2];
                segment++;
              }
              previous = point;
            }
            sceneObjects.backbones[rowIndex].geometry.setDrawRange(0, segment * 2);
            sceneObjects.backbones[rowIndex].geometry.attributes.position.needsUpdate = true;
          }

          sceneObjects.bonds.geometry.setDrawRange(0, bondCount / 3);
          sceneObjects.bonds.geometry.attributes.position.needsUpdate = true;
          for (let index = 0; index < DISPLAY_BASES; index++) {
            const peptideLength = Math.min(nextVisual?.peptides.length ?? 0, DISPLAY_BASES);
            const peptideOffset = Math.max(0, (nextVisual?.peptides.length ?? 0) - peptideLength);
            const aminoAcid = nextVisual?.peptides[peptideOffset + index];
            const x = xFor(localActorPosition, visibleCount) - (peptideLength - 1 - index) * 0.2;
            setInstance(
              sceneObjects.peptide,
              index,
              aminoAcid ? (AMINO_ACID_COLORS[aminoAcid] ?? "#c8f36b") : undefined,
              x,
              1.75 + Math.sin(index * 0.8) * 0.28,
              0.15,
              Boolean(aminoAcid) && index < peptideLength && nextVisual?.process === "translation",
              0.72,
            );
          }
          sceneObjects.peptide.instanceMatrix.needsUpdate = true;
          if (sceneObjects.peptide.instanceColor) sceneObjects.peptide.instanceColor.needsUpdate = true;

          const actorX = xFor(localActorPosition, visibleCount);
          sceneObjects.polymerase.visible = nextVisual?.process === "transcription" || nextVisual?.process === "replication";
          sceneObjects.polymerase.position.set(
            actorX + (nextVisual?.process === "replication" ? 0.52 : 0),
            nextVisual?.process === "replication" ? -0.3 : 0.55,
            0.6,
          );
          sceneObjects.ribosome.visible = nextVisual?.process === "translation";
          sceneObjects.ribosome.position.set(actorX, 0.42, 0.5);
          sceneObjects.trna.visible = nextVisual?.process === "translation";
          const codonPhase = nextVisual
            ? clamp((nextVisual.actorPosition - nextVisual.activeCodonStart) / 3, 0, 1)
            : 0;
          const trnaY = 2.15 - Math.sin(codonPhase * Math.PI) * 0.85;
          sceneObjects.trna.position.set(actorX, trnaY, 0.45);
          const trnaPositions = sceneObjects.trnaStem.geometry.attributes.position.array as Float32Array;
          trnaPositions[0] = actorX;
          trnaPositions[1] = 0.86;
          trnaPositions[2] = 0.4;
          trnaPositions[3] = actorX - 0.15;
          trnaPositions[4] = 1.2;
          trnaPositions[5] = 0.4;
          trnaPositions[6] = actorX;
          trnaPositions[7] = 1.54;
          trnaPositions[8] = 0.4;
          trnaPositions[9] = actorX + 0.12;
          trnaPositions[10] = trnaY - 0.12;
          trnaPositions[11] = 0.4;
          sceneObjects.trnaStem.geometry.attributes.position.needsUpdate = true;
          sceneObjects.trnaStem.visible = nextVisual?.process === "translation";
          sceneObjects.helicase.visible = nextVisual?.process === "replication";
          sceneObjects.helicase.position.set(actorX, 0, 0.8);
          sceneObjects.replicationClamp.visible = nextVisual?.process === "replication";
          sceneObjects.replicationClamp.position.set(actorX + 0.52, -0.3, 0.75);

          sceneObjects.renderer.render(scene, sceneObjects.camera);
          animationFrame = requestAnimationFrame(render);
        };
        render();
      } catch {
        resizeObserver?.disconnect();
        rendererInstance?.dispose();
        rendererInstance?.domElement.remove();
        geometries.forEach(geometry => geometry.dispose());
        materials.forEach(material => material.dispose());
        scene?.clear();
        if (!disposed) setSceneError("The molecular stage could not initialize WebGL in this browser.");
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      const current = sceneRef.current;
      resizeObserver?.disconnect();
      sceneRef.current = null;
      rendererInstance?.dispose();
      current?.renderer.domElement.remove();
      geometries.forEach(geometry => geometry.dispose());
      materials.forEach(material => material.dispose());
      if (scene) {
        scene.clear();
      }
    };
  }, []);

  return (
    <section className="molecular-stage" aria-labelledby="molecular-stage-heading">
      <div className="molecular-stage-header">
        <div>
          <p className="eyebrow">Deterministic teaching visualization · not molecular dynamics</p>
          <h3 id="molecular-stage-heading">Molecular process stage</h3>
        </div>
        {visual && <span className={`molecular-process-tag ${visual.process}`}>{visual.process}</span>}
      </div>
      {visual && (
        <div className="molecular-event-progress">
          <span>{visual.event.type.replaceAll("_", " ")}</span>
          <span ref={progressLabel}>{Math.round(visual.progress * 100)}%</span>
          <div ref={progressTrack} role="progressbar" aria-label="Current process progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(visual.progress * 100)}>
            <i ref={progressFill} style={{ transform: `scaleX(${visual.progress})` }} />
          </div>
        </div>
      )}
      <div className="molecular-scene" role="img" aria-label="Animated deterministic visualization of the selected molecular process">
        <div
          className="molecular-stage-canvas"
          ref={mount}
          style={{ display: translationReadout || replicationVisual || transcriptionVisual ? "none" : "block" }}
        />
        <div
          className="replication-structure-stage"
          aria-label="Experimental human CMG helicase and modeled DNA with a simplified fork animation"
          aria-hidden={!replicationVisual}
          style={{ display: replicationVisual ? "block" : "none" }}
        >
            <div className="replication-structure-canvas" ref={replicationMount} />
            {replicationStructureStatus !== "ready" && replicationStructureStatus !== "error" && (
              <div className="translation-structure-status" role="status">
                <span className="spinner" />
                Loading experimental CMG–DNA coordinates from RCSB PDB…
              </div>
            )}
            {replicationStructureStatus === "error" && (
              <div className="translation-structure-status translation-structure-error" role="alert">
                <span>{replicationStructureError}</span>
                <button type="button" onClick={() => setReplicationStructureRetry(value => value + 1)}>
                  Retry structure load
                </button>
              </div>
            )}
            <div className="replication-structure-credit">
              <strong>Human CMG helicase · MCM2–7 ring</strong>
              <span>MCM chains 2–7 · GINS A–D · CDC45 E</span>
              <span>DNA chain M is the only modeled strand; coordinates stay static.</span>
            </div>
            {replicationVisual && <ProcessActionOverlay visual={replicationVisual} />}
        </div>
        <div
          className="transcription-structure-stage"
          aria-label="Experimental yeast RNA polymerase II transcription complex with DNA bubble and nine-nucleotide RNA"
          aria-hidden={!transcriptionVisual}
          style={{ display: transcriptionVisual ? "block" : "none" }}
        >
            <div className="transcription-structure-canvas" ref={transcriptionMount} />
            {transcriptionStructureStatus !== "ready" && transcriptionStructureStatus !== "error" && (
              <div className="translation-structure-status" role="status">
                <span className="spinner" />
                Loading experimental RNA polymerase II coordinates from RCSB PDB…
              </div>
            )}
            {transcriptionStructureStatus === "error" && (
              <div className="translation-structure-status translation-structure-error" role="alert">
                <span>{transcriptionStructureError}</span>
                <button type="button" onClick={() => setTranscriptionStructureRetry(value => value + 1)}>
                  Retry structure load
                </button>
              </div>
            )}
            <div className="transcription-structure-credit">
              <strong>Yeast RNA polymerase II · transcription bubble</strong>
              <span>Template DNA U · non-template DNA S · 9-nt RNA R</span>
              <span>Deposited coordinates are static; timeline progress is a simplified overlay.</span>
            </div>
            <div className="transcription-structure-legend" aria-hidden="true">
              <span><i className="pol-key" />Pol II core</span>
              <span><i className="template-key" />Template DNA</span>
              <span><i className="non-template-key" />Non-template DNA</span>
              <span><i className="nascent-rna-key" />Resolved RNA</span>
            </div>
            {transcriptionVisual && <ProcessActionOverlay visual={transcriptionVisual} />}
        </div>
        <div
          className="translation-structure-stage"
          aria-label="Experimental E. coli ribosome structure with event-driven translation progress overlay"
          aria-hidden={!translationReadout}
          style={{ display: translationReadout ? "block" : "none" }}
        >
            <div className="translation-structure-canvas" ref={translationMount} />
            {structureStatus !== "ready" && structureStatus !== "error" && (
              <div className="translation-structure-status" role="status">
                <span className="spinner" />
                Loading experimental ribosome coordinates from RCSB PDB…
              </div>
            )}
            {structureStatus === "error" && (
              <div className="translation-structure-status translation-structure-error" role="alert">
                <span>{structureError}</span>
                <button type="button" onClick={() => setStructureRetry(value => value + 1)}>Retry structure load</button>
              </div>
            )}
            <div className="translation-structure-credit">
              <strong>*E. coli* 70S · focused on mRNA and Phe-tRNA</strong>
              <span>One complete ribosome copy · deposited mRNA/tRNA shown</span>
              <span>Peptide drawing is a simplified overlay, not in PDB 4V9D.</span>
            </div>
            {visual?.process === "translation" && <ProcessActionOverlay visual={visual} />}
        </div>
        {visual && !replicationVisual && !transcriptionVisual && !translationReadout && (
          <div className="molecular-scene-key" aria-hidden="true">
            {visual.process === "replication" && <><span><i className="dna-key" />Parental DNA</span><span><i className="daughter-key" />Daughter strand</span><span><i className="helicase-key" />Helicase</span><span><i className="polymerase-key" />Polymerase</span></>}
            {visual.process === "transcription" && <><span><i className="dna-key" />DNA duplex</span><span><i className="rna-key" />Nascent RNA</span><span><i className="polymerase-key" />RNA polymerase</span></>}
            {visual.process === "translation" && <><span><i className="mrna-key" />mRNA · 5′→3′</span><span><i className="trna-key" />tRNA adaptor</span><span><i className="polymerase-key" />Ribosome</span><span><i className="peptide-key" />Peptide</span></>}
          </div>
        )}
      </div>
      {sceneError && <p className="molecular-stage-error" role="status">{sceneError}</p>}
      {replicationVisual && (
        <p className="molecular-structure-attribution">
          Structure: <a href={REPLICATION_STRUCTURE.entryUrl} target="_blank" rel="noreferrer">RCSB PDB {REPLICATION_STRUCTURE.id}, assembly {REPLICATION_STRUCTURE.assembly}</a>
          {" · "}{REPLICATION_STRUCTURE.title} · {REPLICATION_STRUCTURE.resolution} ·
          {" "}<a href={REPLICATION_STRUCTURE.citationUrl} target="_blank" rel="noreferrer">{REPLICATION_STRUCTURE.citation}</a>.
          This deposited complex contains CMG helicase and one synthetic DNA strand, not a DNA polymerase. The fork, second parental strand, daughter strands, and polymerase marker are a separate simplified teaching overlay, not deposited coordinates.
          Only experimentally resolved DNA coordinates are drawn in the structure; unmodeled components are not invented.
        </p>
      )}
      {translationReadout && (
        <p className="molecular-structure-attribution">
          Structure: <a href={RIBOSOME_STRUCTURE.entryUrl} target="_blank" rel="noreferrer">RCSB PDB {RIBOSOME_STRUCTURE.id}</a>
          {" · "}{RIBOSOME_STRUCTURE.resolution}{" · "}
          <a href={RIBOSOME_STRUCTURE.citationUrl} target="_blank" rel="noreferrer">{RIBOSOME_STRUCTURE.citation}</a>.
          Author chains AA/AB–AU and CA/CB/CC–C4 show one 30S/50S copy; AV is Phe-tRNA and AX is mRNA. The peptide is not resolved here. Deposited coordinates remain static; codon progress and the peptide drawing are simplified overlays, not molecular dynamics.
        </p>
      )}
      {transcriptionVisual && (
        <p className="molecular-structure-attribution">
          Structure: <a href={TRANSCRIPTION_STRUCTURE.entryUrl} target="_blank" rel="noreferrer">RCSB PDB {TRANSCRIPTION_STRUCTURE.id}, assembly {TRANSCRIPTION_STRUCTURE.assembly}</a>
          {" · "}{TRANSCRIPTION_STRUCTURE.title} · {TRANSCRIPTION_STRUCTURE.resolution} ·
          {" "}<a href={TRANSCRIPTION_STRUCTURE.citationUrl} target="_blank" rel="noreferrer">{TRANSCRIPTION_STRUCTURE.citation}</a>.
          Author chains A/B are Pol II RPB1/RPB2; S/U are non-template/template DNA and R is the deposited 9-nt nascent RNA. Coordinates are static; the input sequence/progress display is a simplified overlay and is not substituted for the deposited RNA.
        </p>
      )}
      {visual ? (
        <div className="molecular-stage-caption" aria-live="polite">
          <p>{visual.explanation}</p>
          <div className="molecular-sequences">
            {visual.process === "replication" && (
              <>
                <BaseSequence label="Parental · 5′→3′" sequence={visual.primarySequence} cursor={visual.progress} />
                <BaseSequence label="Complement · antiparallel" sequence={visual.secondarySequence} progress={visual.progress} />
              </>
            )}
            {visual.process === "transcription" && (
              <>
                <BaseSequence label="Input template · schematic" sequence={visual.primarySequence} cursor={visual.progress} />
                <BaseSequence label="Transcript progress · schematic" sequence={visual.productSequence} progress={visual.progress} />
              </>
            )}
            {visual.process === "translation" && (
              <>
                <CodonSequence visual={visual} />
                <div className="molecular-sequence-row">
                  <span className="molecular-sequence-label">Growing peptide</span>
                  <code className="peptide-sequence">{visual.productSequence || "—"}</code>
                </div>
              </>
            )}
          </div>
          <p className="molecular-stage-legend">
            {visual.process === "replication" && "The opening fork separates the parental strands as complementary bases are added."}
            {visual.process === "transcription" && "RNA polymerase follows the template while the 5′→3′ RNA transcript grows."}
            {visual.process === "translation" && "The ribosome advances by codons; tRNA delivery and peptide growth are schematic."}
          </p>
        </div>
      ) : (
        <p className="molecular-stage-empty">
          {timeline ? "Choose a mode with an available event or correct the input sequence." : "Preparing the molecular process stage…"}
        </p>
      )}
    </section>
  );
}
