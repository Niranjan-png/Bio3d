"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createMolecularVisualProjector,
  type DeterministicProcessTimeline,
  type MolecularVisualState,
  type ProcessLabMode,
  type TimelineEvent,
} from "../lib/processLab";

const DISPLAY_BASES = 64;
const BASE_SPACING = 0.2;
const BASE_COLORS: Record<string, string> = {
  A: "#c8f36b",
  C: "#73c7ff",
  G: "#d8a4ff",
  T: "#ff846c",
  U: "#ff846c",
};

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
  readonly peptide: any;
  readonly bonds: any;
  readonly polymerase: any;
  readonly ribosome: any;
  readonly trna: any;
  readonly trnaStem: any;
  readonly dummy: any;
  readonly resize: ResizeObserver;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function baseX(index: number, count: number): number {
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
        {visibleStarts.map(start => (
          <span key={start} className={start === visual.activeCodonStart ? "active-codon" : ""}>
            {sequence.slice(start, start + 3)}
          </span>
        ))}
        {sequence.length > DISPLAY_BASES && <span className="sequence-overflow">…</span>}
      </code>
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
  const sceneRef = useRef<SceneObjects | null>(null);
  const latest = useRef({ timeline, projector: null as ReturnType<typeof createMolecularVisualProjector> | null });
  const [sceneError, setSceneError] = useState("");
  const projector = useMemo(
    () => (events.length ? createMolecularVisualProjector(events, mode) : null),
    [events, mode],
  );
  latest.current = { timeline, projector };

  const visual = useMemo(() => {
    if (!timeline || !projector) return null;
    return projector(currentEventIndex, currentTime, frame);
  }, [timeline, projector, currentEventIndex, currentTime, events, mode, frame]);

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
        for (const color of [...Object.values(BASE_COLORS), "#eef5f1", "#c8f36b"]) {
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
        const peptide = new THREE.InstancedMesh(baseGeometry, baseMaterial, DISPLAY_BASES);
        peptide.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        peptide.frustumCulled = false;
        scene.add(peptide);

        const bondPositions = new Float32Array(DISPLAY_BASES * 6);
        const bondGeometry = new THREE.BufferGeometry();
        const bondAttribute = new THREE.BufferAttribute(bondPositions, 3);
        bondAttribute.setUsage(THREE.DynamicDrawUsage);
        bondGeometry.setAttribute("position", bondAttribute);
        bondGeometry.setDrawRange(0, 0);
        const bondMaterial = new THREE.LineBasicMaterial({ color: "#829d91", transparent: true, opacity: 0.48 });
        const bonds = new THREE.LineSegments(bondGeometry, bondMaterial);
        scene.add(bonds);
        geometries.push(bondGeometry);
        materials.push(bondMaterial);

        const polymeraseMaterial = new THREE.MeshStandardMaterial({
          color: "#d8a4ff",
          emissive: "#301743",
          roughness: 0.3,
        });
        const polymerase = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), polymeraseMaterial);
        scene.add(polymerase);
        geometries.push(polymerase.geometry);
        materials.push(polymeraseMaterial);

        const ribosomeMaterial = new THREE.MeshStandardMaterial({
          color: "#c8f36b",
          emissive: "#263816",
          roughness: 0.32,
        });
        const ribosome = new THREE.Group();
        const lower = new THREE.Mesh(new THREE.SphereGeometry(0.58, 20, 14), ribosomeMaterial);
        lower.scale.set(1.45, 0.7, 0.75);
        const upper = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 14), ribosomeMaterial);
        upper.scale.set(1.45, 0.65, 0.75);
        upper.position.y = 0.34;
        ribosome.add(lower, upper);
        ribosome.visible = false;
        scene.add(ribosome);
        geometries.push(lower.geometry, upper.geometry);
        materials.push(ribosomeMaterial);

        const trnaMaterial = new THREE.MeshStandardMaterial({ color: "#73c7ff", emissive: "#102a38" });
        const trna = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), trnaMaterial);
        trna.visible = false;
        scene.add(trna);
        geometries.push(trna.geometry);
        materials.push(trnaMaterial);
        const trnaGeometry = new THREE.BufferGeometry();
        trnaGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
        const trnaStem = new THREE.Line(
          trnaGeometry,
          new THREE.LineBasicMaterial({ color: "#73c7ff", transparent: true, opacity: 0.8 }),
        );
        trnaStem.visible = false;
        scene.add(trnaStem);
        geometries.push(trnaGeometry);
        materials.push(trnaStem.material);

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
          peptide,
          bonds,
          polymerase,
          ribosome,
          trna,
          trnaStem,
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
            colorCache.get(base ? (BASE_COLORS[base] ?? "#eef5f1") : "#c8f36b"),
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
              const x = baseX(index, visibleCount);
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
                  y = -1.85;
                  z = 0;
                  scale = clamp(localActorPosition - index, 0, 1);
                  visible = isInSequence && scale > 0;
                }
                if (rowIndex < 2 && isInSequence && opening < 0.8) {
                  bondArray[bondCount++] = x;
                  bondArray[bondCount++] = 0.42 + twist + opening * 0.58;
                  bondArray[bondCount++] = depth;
                  bondArray[bondCount++] = x;
                  bondArray[bondCount++] = -0.42 - twist - opening * 0.58;
                  bondArray[bondCount++] = depth;
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

          sceneObjects.bonds.geometry.setDrawRange(0, bondCount / 3);
          sceneObjects.bonds.geometry.attributes.position.needsUpdate = true;
          for (let index = 0; index < DISPLAY_BASES; index++) {
            const peptideLength = Math.min(nextVisual?.peptides.length ?? 0, DISPLAY_BASES);
            const peptideOffset = Math.max(0, (nextVisual?.peptides.length ?? 0) - peptideLength);
            const aminoAcid = nextVisual?.peptides[peptideOffset + index];
            const x = baseX(localActorPosition, visibleCount) - (peptideLength - 1 - index) * 0.2;
            setInstance(
              sceneObjects.peptide,
              index,
              aminoAcid ? "A" : undefined,
              x,
              1.75 + Math.sin(index * 0.8) * 0.28,
              0.15,
              Boolean(aminoAcid) && index < peptideLength && nextVisual?.process === "translation",
              0.72,
            );
          }
          sceneObjects.peptide.instanceMatrix.needsUpdate = true;
          if (sceneObjects.peptide.instanceColor) sceneObjects.peptide.instanceColor.needsUpdate = true;

          const actorX = baseX(localActorPosition, visibleCount);
          sceneObjects.polymerase.visible = nextVisual?.process === "transcription";
          sceneObjects.polymerase.position.set(actorX, 0.55, 0.6);
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
          trnaPositions[1] = trnaY - 0.12;
          trnaPositions[2] = 0.4;
          trnaPositions[3] = actorX;
          trnaPositions[4] = 0.85;
          trnaPositions[5] = 0.4;
          sceneObjects.trnaStem.geometry.attributes.position.needsUpdate = true;
          sceneObjects.trnaStem.visible = nextVisual?.process === "translation";

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
        {visual && (
          <span className={`molecular-process-tag ${visual.process}`}>
            {visual.process} · {Math.round(visual.progress * 100)}%
          </span>
        )}
      </div>
      <div
        className="molecular-stage-canvas"
        ref={mount}
        role="img"
        aria-label="Animated deterministic visualization of the selected molecular process"
      />
      {sceneError && <p className="molecular-stage-error" role="status">{sceneError}</p>}
      {visual ? (
        <div className="molecular-stage-caption" aria-live="polite">
          <p>{visual.explanation}</p>
          <div className="molecular-sequences">
            {visual.process === "replication" && (
              <>
                <BaseSequence label="Parental strand" sequence={visual.primarySequence} cursor={visual.progress} />
                <BaseSequence label="New complement" sequence={visual.secondarySequence} progress={visual.progress} />
              </>
            )}
            {visual.process === "transcription" && (
              <>
                <BaseSequence label="DNA template" sequence={visual.primarySequence} cursor={visual.progress} />
                <BaseSequence label="Growing RNA" sequence={visual.productSequence} progress={visual.progress} />
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
