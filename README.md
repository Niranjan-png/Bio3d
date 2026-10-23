# BioPilot 3D Lab — Milestones 2–4

A credential-free monorepo for BioPilot 3D Lab. Milestone 2 adds a browser-only 3Dmol.js protein structure viewer, Milestone 3 adds a browser-only Three.js idealized DNA/RNA helix laboratory, and Milestone 4 adds a browser-only deterministic process lab for DNA replication, transcription, and translation. Simulation, analysis, reports, trajectories, and agents remain out of scope.

## Structure viewer

The viewer does not retrieve coordinates until a user explicitly loads a valid four-character RCSB PDB ID, or chooses a local `.pdb`/`.ent` file (10 MB maximum). Remote PDB files are requested directly from the RCSB Protein Data Bank, with a 12-second per-attempt timeout and up to three attempts.

It provides real 3D model representations, chain visibility and focus, supported chain/element/residue coloring, atom click inspection from parsed PDB coordinate records, fit/reset/fullscreen controls, and source/scientific interpretation notices. mmCIF is intentionally not accepted because its parser and rendering path are not independently verified in this milestone.

## DNA / RNA idealized helix laboratory

The DNA Lab accepts a supplied plain-text or FASTA DNA/RNA sequence and builds a deterministic, interactive teaching visualization in the browser. DNA uses A–T/C–G pairing; RNA uses A–U/C–G pairing. IUPAC ambiguity symbols are preserved in the supplied strand and displayed as `?` in the complement rather than guessed.

This is **not an experimental structure** and must not be interpreted as one. Its documented parameters are a 4.4 model-unit radius, 1.45 model-unit rise per base pair, and adjustable 8–14 base pairs per turn, with a visual scale factor. Inputs are capped at 10,000 bases. For responsiveness, Three.js draws at most 180 base pairs in a navigable window while retaining the complete validated sequence logically. Selecting from the sequence strip or model keeps the two views synchronized; model selection updates material state without rebuilding the scene.

## Prerequisites

- Node.js 22+ with pnpm 10+
- Python 3.11+

## Configuration

Copy `.env.example` to a local `.env` only when changing defaults. Never commit `.env` files or credentials. The current application has no required secrets.

`BIOPILOT_CORS_ORIGINS` is an explicit comma-separated allowlist. Its development default is `http://localhost:3000`.

## Start the frontend

```cmd
pnpm install
pnpm dev:web
```

Open `http://localhost:3000`.

## Start the API

```cmd
py -3 -m venv .venv
.venv\Scripts\python -m pip install -e "./backend[dev]"
.venv\Scripts\uvicorn app.main:app --app-dir backend --reload --port 8000
```

Check the service at `http://localhost:8000/api/health` and interactive documentation at `http://localhost:8000/docs`.

## Verify

```cmd
pnpm build:web
.venv\Scripts\python -m pytest backend/tests -q
curl.exe http://localhost:8000/api/health
```

The Python test suite covers the health response, its configured development CORS
origin, and rejection of malformed or overly broad CORS origin values. No frontend
unit-test runner is configured; `pnpm build:web` is the frontend type-check and
production-build verification command.

## Layout

- `frontend/` — Next.js TypeScript App Router application and scientific shell.
- `backend/` — FastAPI application, environment-derived configuration, and tests.
- `pnpm-workspace.yaml` — frontend workspace manifest.
