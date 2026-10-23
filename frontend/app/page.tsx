"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import DnaLab from "./DnaLab";
import ProcessLab from "./ProcessLab";

type Representation = "cartoon" | "stick" | "sphere" | "line";
type ColorMode = "chain" | "element" | "residue";

type ParsedAtom = {
  serial: number;
  name: string;
  residue: string;
  residueNumber: string;
  chain: string;
  element: string;
  x: number;
  y: number;
  z: number;
};

type StructureSummary = {
  atoms: ParsedAtom[];
  chains: string[];
  residues: number;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const RCSB_FILE_URL = (id: string) => `https://files.rcsb.org/download/${id.toUpperCase()}.pdb`;

function parsePdb(data: string): StructureSummary {
  const atoms: ParsedAtom[] = [];
  const chains = new Set<string>();
  const residues = new Set<string>();
  let hasModel = false;
  let inFirstModel = true;

  for (const line of data.split(/\r?\n/)) {
    const record = line.slice(0, 6).trim();
    if (record === "MODEL") {
      if (hasModel) inFirstModel = false;
      hasModel = true;
      continue;
    }
    if (record === "ENDMDL" && hasModel) {
      inFirstModel = false;
      continue;
    }
    if (!inFirstModel || (record !== "ATOM" && record !== "HETATM")) continue;

    const chain = line.slice(21, 22).trim() || "_";
    const residue = line.slice(17, 20).trim() || "UNK";
    const residueNumber = `${line.slice(22, 26).trim()}${line.slice(26, 27).trim()}` || "?";
    const element = line.slice(76, 78).trim() || line.slice(12, 16).replace(/[^A-Za-z]/g, "").slice(0, 2) || "?";
    const atom = {
      serial: Number(line.slice(6, 11).trim()) || atoms.length + 1,
      name: line.slice(12, 16).trim() || "?",
      residue,
      residueNumber,
      chain,
      element: element[0].toUpperCase() + element.slice(1).toLowerCase(),
      x: Number(line.slice(30, 38).trim()),
      y: Number(line.slice(38, 46).trim()),
      z: Number(line.slice(46, 54).trim()),
    };
    if ([atom.x, atom.y, atom.z].every(Number.isFinite)) {
      atoms.push(atom);
      chains.add(chain);
      residues.add(`${chain}:${residueNumber}:${residue}`);
    }
  }
  return { atoms, chains: [...chains].sort(), residues: residues.size };
}

function readableChain(chain: string) {
  return chain === "_" ? "Unassigned" : `Chain ${chain}`;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export default function Home() {
  const canvasRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<any>(null);
  const sourceRef = useRef<string>("");
  const summaryRef = useRef<StructureSummary>({ atoms: [], chains: [], residues: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const [pdbId, setPdbId] = useState("");
  const [status, setStatus] = useState("No structure loaded — enter a PDB ID or choose a local PDB file.");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [viewerReady, setViewerReady] = useState(false);
  const [summary, setSummary] = useState<StructureSummary>({ atoms: [], chains: [], residues: 0 });
  const [visibleChains, setVisibleChains] = useState<string[]>([]);
  const [activeChain, setActiveChain] = useState("all");
  const [representation, setRepresentation] = useState<Representation>("cartoon");
  const [colorMode, setColorMode] = useState<ColorMode>("chain");
  const [selectedAtom, setSelectedAtom] = useState<ParsedAtom | null>(null);

  const applyAppearance = useCallback(() => {
    const viewer = viewerRef.current;
    if (!viewer || !sourceRef.current) return;
    const colorScheme = colorMode === "chain" ? "chain" : colorMode === "element" ? "Jmol" : "amino";
    viewer.setStyle({}, { hidden: true });
    const selectedChains = activeChain === "all" ? visibleChains : visibleChains.filter((chain) => chain === activeChain);
    selectedChains.forEach((chain) => {
      const selection = { chain: chain === "_" ? "" : chain };
      viewer.setStyle(selection, { [representation]: { colorscheme: colorScheme } });
    });
    viewer.render();
  }, [activeChain, colorMode, representation, visibleChains]);

  useEffect(() => {
    let observer: ResizeObserver | undefined;
    let disposed = false;
    async function initialiseViewer() {
      if (!canvasRef.current) return;
      try {
        const module = await import("3dmol");
        if (disposed || !canvasRef.current) return;
        const mol = (module as any).default ?? module;
        const viewer = mol.createViewer(canvasRef.current, { backgroundColor: "#07100f", antialias: true });
        viewer.setClickable({}, true, (atom: any) => {
          const parsed = summaryRef.current.atoms.find((item) => item.serial === atom.serial || (item.name === atom.atom && item.chain === (atom.chain || "_") && item.residueNumber === String(atom.resi)));
          if (parsed) setSelectedAtom(parsed);
        });
        viewerRef.current = viewer;
        observer = new ResizeObserver(() => viewer.resize());
        observer.observe(canvasRef.current);
        setViewerReady(true);
      } catch {
        setError("The 3D viewer could not be initialized. Check that browser scripts and WebGL are available, then reload.");
      }
    }
    initialiseViewer();
    return () => {
      disposed = true;
      observer?.disconnect();
      abortRef.current?.abort();
      viewerRef.current?.clear();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => applyAppearance(), [applyAppearance]);

  const displayPdb = useCallback((data: string, label: string) => {
    const parsed = parsePdb(data);
    if (!parsed.atoms.length) throw new Error("No readable ATOM or HETATM coordinates were found. Please supply a standard PDB coordinate file.");
    const viewer = viewerRef.current;
    if (!viewer) throw new Error("The molecular viewer is still starting. Please try again in a moment.");
    viewer.clear();
    viewer.addModel(data, "pdb");
    viewer.zoomTo();
    viewer.render();
    sourceRef.current = data;
    summaryRef.current = parsed;
    setSummary(parsed);
    setVisibleChains(parsed.chains);
    setActiveChain("all");
    setSelectedAtom(null);
    setStatus(`${label} loaded: ${parsed.atoms.length.toLocaleString()} atoms across ${parsed.chains.length} chain${parsed.chains.length === 1 ? "" : "s"}.`);
  }, []);

  const fetchPdb = useCallback(async (id: string) => {
    const normalized = id.trim().toUpperCase();
    if (!/^[1-9][A-Z0-9]{3}$/.test(normalized)) {
      setError("A PDB ID has four characters, begins with a number, and contains only letters or numbers (for example, 1CRN).");
      return;
    }
    if (!navigator.onLine) {
      setError("You appear to be offline. Remote PDB retrieval is unavailable; choose a local PDB file instead.");
      return;
    }
    abortRef.current?.abort();
    setLoading(true); setError(""); setStatus(`Retrieving ${normalized} from the RCSB Protein Data Bank…`);
    try {
      let data = "";
      let lastError = "";
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const controller = new AbortController();
        abortRef.current = controller;
        const timeout = window.setTimeout(() => controller.abort(), 12000);
        try {
          const response = await fetch(RCSB_FILE_URL(normalized), { signal: controller.signal, headers: { Accept: "chemical/x-pdb,text/plain" } });
          if (!response.ok) throw new Error(response.status === 404 ? "This PDB ID was not found at RCSB." : `RCSB returned HTTP ${response.status}.`);
          data = await response.text();
          break;
        } catch (requestError) {
          lastError = controller.signal.aborted ? "The request timed out." : requestError instanceof Error ? requestError.message : "Network request failed.";
          if (attempt < 3) await sleep(attempt * 700);
        } finally {
          window.clearTimeout(timeout);
        }
      }
      if (!data) throw new Error(`${lastError} Retried three times.`);
      displayPdb(data, `RCSB PDB ${normalized}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to retrieve this structure.");
      setStatus("No new structure was loaded.");
    } finally { setLoading(false); }
  }, [displayPdb]);

  function handleRemoteLoad(event: FormEvent) { event.preventDefault(); void fetchPdb(pdbId); }
  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.(pdb|ent)$/i.test(file.name)) { setError("Only PDB coordinate files (.pdb or .ent) are accepted in this milestone."); return; }
    if (file.size > MAX_FILE_BYTES) { setError("This file exceeds the 10 MB local safety limit."); return; }
    setError(""); setLoading(true); setStatus(`Reading ${file.name} locally…`);
    file.text().then((data) => displayPdb(data, file.name)).catch((fileError) => setError(fileError instanceof Error ? fileError.message : "The selected file could not be read.")).finally(() => setLoading(false));
  }
  function resetView() { viewerRef.current?.zoomTo(); viewerRef.current?.render(); setSelectedAtom(null); }
  function fitSelection() { const chain = activeChain === "all" ? {} : { chain: activeChain === "_" ? "" : activeChain }; viewerRef.current?.zoomTo(chain); viewerRef.current?.render(); }
  function toggleFullscreen() { canvasRef.current?.parentElement?.requestFullscreen?.().catch(() => setError("Fullscreen was blocked by this browser.")); }

  const atomLabel = useMemo(() => selectedAtom ? `${selectedAtom.name} · ${selectedAtom.residue} ${selectedAtom.residueNumber} · ${readableChain(selectedAtom.chain)}` : "Click an atom in the viewport to inspect its parsed PDB record.", [selectedAtom]);

  return <main className="app-shell">
    <header className="topbar"><a className="brand" href="#viewer" aria-label="BioPilot 3D Lab molecular viewer"><span aria-hidden="true">⌬</span> BioPilot <em>3D Lab</em></a><p>Structure workspace <b>Milestones 2–3</b></p><a className="lab-nav" href="#dna-lab">DNA Lab</a><span className="ready-dot">Browser-only viewer</span></header>
    <section className="intro"><p className="eyebrow">Molecular structure inspection</p><h1>See the coordinates.<br /><i>Keep the evidence close.</i></h1><p>Load a Protein Data Bank identifier on demand or inspect a local PDB coordinate file. Nothing is fetched automatically and no account is required.</p></section>
    <section id="viewer" className="viewer-workspace" aria-label="Protein structure viewer">
      <aside className="control-panel">
        <div><p className="panel-kicker">Source</p><h2>Load structure</h2><form onSubmit={handleRemoteLoad}><label htmlFor="pdb-id">RCSB PDB ID</label><div className="input-row"><input id="pdb-id" value={pdbId} onChange={(event) => setPdbId(event.target.value)} placeholder="e.g. 1CRN" maxLength={4} autoCapitalize="characters" /><button className="accent" type="submit" disabled={loading || !viewerReady}>{loading ? "Loading" : "Load"}</button></div></form><button className="sample-link" type="button" onClick={() => void fetchPdb("1CRN")} disabled={loading || !viewerReady}>Load 1CRN manually <span>↗</span></button><p className="helper">Remote coordinates are requested from <a href="https://www.rcsb.org/" target="_blank" rel="noreferrer">RCSB PDB</a> only after you select Load. 12-second timeout; up to 3 attempts.</p><label className="upload" htmlFor="pdb-file"><input id="pdb-file" type="file" accept=".pdb,.ent" onChange={handleFile} disabled={loading || !viewerReady} />Choose local PDB <small>≤ 10 MB</small></label></div>
        <div className="panel-section"><p className="panel-kicker">Display</p><label htmlFor="representation">Representation</label><select id="representation" value={representation} onChange={(event) => setRepresentation(event.target.value as Representation)}><option value="cartoon">Cartoon</option><option value="stick">Sticks</option><option value="sphere">Spacefill</option><option value="line">Lines</option></select><label htmlFor="colors">Color</label><select id="colors" value={colorMode} onChange={(event) => setColorMode(event.target.value as ColorMode)}><option value="chain">By chain</option><option value="element">By element (Jmol)</option><option value="residue">By residue class</option></select></div>
        <div className="panel-section controls"><button type="button" onClick={resetView} disabled={!sourceRef.current}>Reset view</button><button type="button" onClick={fitSelection} disabled={!sourceRef.current}>Fit selection</button><button type="button" onClick={toggleFullscreen} disabled={!viewerReady}>Fullscreen</button></div>
      </aside>
      <div className="canvas-column"><div className="viewport-frame"><div ref={canvasRef} className="molecule-canvas" aria-label="Interactive 3D molecular structure canvas" role="application" />{!sourceRef.current && !loading && <div className="empty-state"><strong>Ready for real coordinates</strong><span>Enter a PDB ID or upload a PDB file to begin.</span></div>}{loading && <div className="loading-state" role="status"><span className="spinner" /> Loading coordinates…</div>}<div className="viewport-badge">3Dmol.js · WebGL</div></div><div className="notice" aria-live="polite">{error ? <><strong>Load issue.</strong> {error}</> : status}</div><div className="scientific-note"><strong>Interpretation note.</strong> Displayed coordinates are deposited structural models, not a measure of certainty or biological activity. Check the RCSB entry, experimental method, resolution, model, ligands, and author annotations before drawing conclusions.</div></div>
      <aside className="inspect-panel"><div><p className="panel-kicker">Structure index</p><h2>{summary.atoms.length ? "Parsed coordinates" : "Awaiting data"}</h2><dl className="metrics"><div><dt>Atoms</dt><dd>{summary.atoms.length.toLocaleString()}</dd></div><div><dt>Residues</dt><dd>{summary.residues.toLocaleString()}</dd></div><div><dt>Chains</dt><dd>{summary.chains.length}</dd></div></dl></div><div className="panel-section"><p className="panel-kicker">Chain visibility</p><div className="chain-list">{summary.chains.length ? summary.chains.map((chain) => <label key={chain}><input type="checkbox" checked={visibleChains.includes(chain)} onChange={() => setVisibleChains((current) => current.includes(chain) ? current.filter((item) => item !== chain) : [...current, chain])} /> <span className={`chain-swatch chain-${chain.charCodeAt(0) % 5}`} />{readableChain(chain)}</label>) : <p className="placeholder">Loaded chains will appear here.</p>}</div><label htmlFor="active-chain">Focus chain</label><select id="active-chain" value={activeChain} onChange={(event) => setActiveChain(event.target.value)} disabled={!summary.chains.length}><option value="all">All visible chains</option>{summary.chains.map((chain) => <option key={chain} value={chain}>{readableChain(chain)}</option>)}</select></div><div className="panel-section atom-card"><p className="panel-kicker">Atom inspection</p><p>{atomLabel}</p>{selectedAtom && <code>{selectedAtom.element} · x {selectedAtom.x.toFixed(3)} · y {selectedAtom.y.toFixed(3)} · z {selectedAtom.z.toFixed(3)} Å</code>}</div><div className="legend"><p className="panel-kicker">Legend</p><span><i className="oxygen" />Oxygen</span><span><i className="nitrogen" />Nitrogen</span><span><i className="carbon" />Carbon</span><span>Chain/residue schemes use 3Dmol.js coloring.</span></div></aside>
    </section>
    <DnaLab />
    <ProcessLab sequence="ATGCGTACGTTAGCCATGCA" polymer="DNA" />
    <footer><span>BioPilot 3D Lab</span><span>PDB-only in Milestone 2</span><span>Local files stay in this browser session</span></footer>
  </main>;
}
