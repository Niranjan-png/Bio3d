# BioPilot 3D Lab — Milestones 2–5

A credential-free monorepo for BioPilot 3D Lab. Milestone 2 adds a browser-only 3Dmol.js protein structure viewer, Milestone 3 adds a browser-only Three.js idealized DNA/RNA helix laboratory, Milestone 4 adds a browser-only deterministic educational process lab for DNA replication, transcription, and translation, and Milestone 5 adds validated BioPython-backed sequence analysis API endpoints. The Milestone 4 process lab is not atomistic molecular dynamics (MD), a kinetics model, or a biological prediction.

## Structure viewer

The viewer does not retrieve coordinates until a user explicitly loads a valid four-character RCSB PDB ID, or chooses a local `.pdb`/`.ent` file (10 MB maximum). Remote PDB files are requested directly from the RCSB Protein Data Bank, with a 12-second per-attempt timeout and up to three attempts.

It provides real 3D model representations, chain visibility and focus, supported chain/element/residue coloring, atom click inspection from parsed PDB coordinate records, fit/reset/fullscreen controls, and source/scientific interpretation notices. mmCIF is intentionally not accepted because its parser and rendering path are not independently verified in this milestone.

## DNA / RNA idealized helix laboratory

The DNA Lab accepts a supplied plain-text or FASTA DNA/RNA sequence and builds a deterministic, interactive teaching visualization in the browser. DNA uses A–T/C–G pairing; RNA uses A–U/C–G pairing. IUPAC ambiguity symbols are preserved in the supplied strand and displayed as `?` in the complement rather than guessed.

This is **not an experimental structure** and must not be interpreted as one. Its documented parameters are a 4.4 model-unit radius, 1.45 model-unit rise per base pair, and adjustable 8–14 base pairs per turn, with a visual scale factor. Inputs are capped at 10,000 bases. For responsiveness, Three.js draws at most 180 base pairs in a navigable window while retaining the complete validated sequence logically. Selecting from the sequence strip or model keeps the two views synchronized; model selection updates material state without rebuilding the scene.

## DNA replication, transcription, and translation process lab (Milestone 4)

The process lab generates a deterministic timeline from its sequence input. Canonical DNA (`A`, `C`, `G`, `T`, up to 10,000 bases) supports the educational replication → transcription → translation sequence. DNA Lab forwards only valid, unambiguous DNA; IUPAC ambiguity remains available to the helix viewer, but is not sent to the process lab. Empty, over-limit, mixed-alphabet, ambiguous, or otherwise unsupported inputs are rejected by the process lab and reported in its validation panel. An invalid DNA submission leaves the last valid process sequence selected.

Canonical RNA (`A`, `C`, `G`, `U`) is accepted by the process engine for translation only. It is treated as a supplied 5′→3′ mRNA sequence; RNA is not propagated from DNA Lab and cannot enter DNA replication or transcription. The supplied DNA strand is treated as the parental strand, and its newly generated complementary strand is used as the transcription template.

Translation reads triplets from the selected zero-based reading-frame offset (0, 1, or 2). Incomplete trailing codons are ignored. The standard genetic code is used; the first in-frame stop codon ends translation and is shown as the terminating codon, but is excluded from the peptide. Start-codon recognition/scanning is not modeled: translation begins at the chosen offset, whether or not that codon is `AUG`. If no stop codon occurs, every complete codon is translated. Process modes filter which generated events are displayed; Combined shows all events.

All process steps use fixed, deterministic intervals and simplified strand/codon conventions for teaching. They do not model atom positions, molecular forces, enzyme kinetics, cellular context, or stochastic behavior, and must not be interpreted as real molecular dynamics or experimental results.

## Sequence analysis API (Milestone 5)

The FastAPI backend accepts canonical, non-empty DNA (`A/C/G/T`) or RNA
(`A/C/G/U`) sequences up to 10,000 nucleotides. Sequence input is case-insensitive
and whitespace is removed; ambiguity symbols and FASTA headers are rejected.
Request schemas share this validation and return HTTP 422 for invalid input.

- `POST /api/sequence/statistics` returns length, counts for each nucleotide in
  the selected alphabet, and GC percentage (`100 * (G + C) / length`, rounded to
  four decimal places).
- `POST /api/sequence/translation` translates complete codons from the selected
  zero-based frame (0–2) of the supplied 5′→3′ strand using the standard genetic
  code. DNA `T` is converted to RNA `U` for translation. Translation does not
  require or scan for a start codon; the first in-frame stop terminates translation
  and is reported separately, not included in the peptide. Trailing incomplete
  bases are ignored.
- `POST /api/sequence/orfs` reports complete ORFs only: each in-frame `ATG`/`AUG`
  start is paired with its first downstream in-frame stop (`TAA/TAG/TGA` or
  `UAA/UAG/UGA`); overlapping starts are reported separately. DNA is scanned on
  both strands, while RNA is scanned only on its supplied strand. Frame is the
  zero-based offset on each oriented 5′→3′ strand. Coordinates are low-to-high,
  zero-based half-open spans on the supplied sequence; the span includes the stop
  codon, and the peptide excludes it. For a `-` strand ORF, the biological start
  codon is at the high-coordinate end of that span.
- `POST /api/sequence/compare` globally aligns reference and query of the same
  molecule type and reports substitutions, insertions, and deletions. Variant
  coordinates are zero-based, half-open independently on reference and query;
  insertion reference coordinates are empty spans, and deletion query
  coordinates are empty spans. Adjacent substitutions are grouped into one
  variant record; counts report variant records, not changed bases. Alignment
  scores are +2 for a match, -1 for a mismatch, -2 for a gap opening, and -0.5
  per gap extension. Repetitive sequences can have multiple equally
  scoring indel placements; the returned location follows the selected optimal
  global alignment.

The API uses BioPython's standard genetic code and global pairwise alignment.
These outputs are sequence-level analysis, not clinical interpretation.

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
pnpm test:web
pnpm build:web
.venv\Scripts\python -m pytest backend/tests -q
curl.exe http://localhost:8000/api/health
```

Run the frontend TypeScript check from the `frontend` directory:

```cmd
npx tsc --noEmit
```

The Python test suite covers health/configuration and the sequence-analysis schemas,
biology rules, mutation coordinates, endpoints, and CORS preflight. No frontend
unit-test framework beyond Node's built-in test runner is required. `pnpm test:web`
runs the process timeline, mode filtering, sequence reset, input compatibility,
reading-frame, incomplete-codon, and stop-codon tests. `npx tsc --noEmit` checks
frontend types, and `pnpm build:web` creates the production frontend build.

## Layout

- `frontend/` — Next.js TypeScript App Router application and scientific shell.
- `backend/` — FastAPI application, environment-derived configuration, and tests.
- `pnpm-workspace.yaml` — frontend workspace manifest.
