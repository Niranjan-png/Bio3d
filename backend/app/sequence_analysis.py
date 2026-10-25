from bisect import bisect_left
from collections import Counter
from typing import Literal

from Bio.Align import PairwiseAligner
from Bio.Seq import Seq

from app.schemas import (
    MoleculeType,
    MutationComparisonRequest,
    MutationComparisonResult,
    MutationCounts,
    MutationVariant,
    ORFResult,
    OpenReadingFrame,
    SequenceKind,
    SequenceStatistics,
    TranslationRequest,
    TranslationResult,
)

STOP_CODONS = {
    "DNA": {"TAA", "TAG", "TGA"},
    "RNA": {"UAA", "UAG", "UGA"},
}
START_CODONS = {"DNA": "ATG", "RNA": "AUG"}


def sequence_statistics(sequence: str, molecule_type: MoleculeType) -> SequenceStatistics:
    counts = Counter(sequence)
    bases = "ACGT" if molecule_type == "DNA" else "ACGU"
    gc_count = counts["G"] + counts["C"]
    return SequenceStatistics(
        molecule_type=molecule_type,
        length=len(sequence),
        nucleotide_composition={base: counts[base] for base in bases},
        gc_percentage=round((gc_count / len(sequence)) * 100, 4),
    )


def translate_sequence(request: TranslationRequest) -> TranslationResult:
    sequence = request.sequence
    coding_sequence = sequence[request.frame :]
    complete_length = len(coding_sequence) - (len(coding_sequence) % 3)
    complete_sequence = coding_sequence[:complete_length]
    dna_sequence = complete_sequence.replace("U", "T")
    translated = str(Seq(dna_sequence).translate(table=1))
    stop_index = translated.find("*")
    terminated_by_stop = stop_index >= 0
    peptide = translated[:stop_index] if terminated_by_stop else translated
    stop_codon = None
    if terminated_by_stop:
        stop_offset = stop_index * 3
        stop_codon = complete_sequence[stop_offset : stop_offset + 3]

    return TranslationResult(
        molecule_type=request.molecule_type,
        frame=request.frame,
        peptide=peptide,
        protein_length=len(peptide),
        translated_codon_count=len(peptide),
        stop_codon=stop_codon,
        terminated_by_stop=terminated_by_stop,
        ignored_trailing_bases=len(coding_sequence) - complete_length,
    )


def _find_orfs_on_strand(
    sequence: str,
    molecule_type: MoleculeType,
    strand: Literal["+", "-"],
) -> list[OpenReadingFrame]:
    oriented_sequence = sequence
    if strand == "-":
        oriented_sequence = str(Seq(sequence.replace("U", "T")).reverse_complement())
        if molecule_type == "RNA":
            oriented_sequence = oriented_sequence.replace("T", "U")

    start_codon = START_CODONS[molecule_type]
    stop_codons = STOP_CODONS[molecule_type]
    found: list[OpenReadingFrame] = []

    for frame in range(3):
        codons = [
            oriented_sequence[index : index + 3]
            for index in range(frame, len(oriented_sequence) - 2, 3)
        ]
        stop_indices = [index for index, codon in enumerate(codons) if codon in stop_codons]
        for codon_index, codon in enumerate(codons):
            if codon != start_codon:
                continue
            stop_position = bisect_left(stop_indices, codon_index + 1)
            if stop_position == len(stop_indices):
                continue

            stop_index = stop_indices[stop_position]
            oriented_start = frame + codon_index * 3
            oriented_end = frame + (stop_index + 1) * 3
            if strand == "+":
                start, end = oriented_start, oriented_end
            else:
                start, end = len(sequence) - oriented_end, len(sequence) - oriented_start
            coding_region = oriented_sequence[oriented_start : frame + stop_index * 3]
            peptide = str(Seq(coding_region.replace("U", "T")).translate(table=1))
            found.append(
                OpenReadingFrame(
                    strand=strand,
                    frame=frame,
                    start=start,
                    end=end,
                    start_codon=start_codon,
                    stop_codon=codons[stop_index],
                    peptide=peptide,
                )
            )
    return found


def find_orfs(sequence: str, molecule_type: MoleculeType) -> ORFResult:
    strands: list[Literal["+", "-"]] = ["+"] if molecule_type == "RNA" else ["+", "-"]
    orfs = [
        orf
        for strand in strands
        for orf in _find_orfs_on_strand(sequence, molecule_type, strand)
    ]
    orfs.sort(key=lambda orf: (orf.start, orf.end, orf.strand, orf.frame))
    return ORFResult(molecule_type=molecule_type, orfs=orfs, count=len(orfs))


def _variant_from_alignment(
    kind: SequenceKind,
    reference_start: int,
    reference_end: int,
    query_start: int,
    query_end: int,
    reference: str,
    query: str,
) -> MutationVariant:
    return MutationVariant(
        kind=kind,
        reference_start=reference_start,
        reference_end=reference_end,
        query_start=query_start,
        query_end=query_end,
        reference_allele=reference[reference_start:reference_end],
        query_allele=query[query_start:query_end],
    )


def compare_sequences(request: MutationComparisonRequest) -> MutationComparisonResult:
    if request.reference == request.query:
        return MutationComparisonResult(
            molecule_type=request.molecule_type,
            reference_length=len(request.reference),
            query_length=len(request.query),
            alignment_score=2.0 * len(request.reference),
            counts=MutationCounts(substitutions=0, insertions=0, deletions=0),
            variants=[],
        )

    aligner = PairwiseAligner()
    aligner.mode = "global"
    aligner.match_score = 2
    aligner.mismatch_score = -1
    aligner.open_gap_score = -2
    aligner.extend_gap_score = -0.5
    alignment = aligner.align(request.reference, request.query)[0]

    variants: list[MutationVariant] = []
    coordinates = alignment.coordinates
    for index in range(coordinates.shape[1] - 1):
        reference_start, reference_end = map(int, coordinates[0, index : index + 2])
        query_start, query_end = map(int, coordinates[1, index : index + 2])
        reference_size = reference_end - reference_start
        query_size = query_end - query_start

        if reference_size and query_size:
            run_start: int | None = None
            for offset in range(reference_size):
                mismatch = request.reference[reference_start + offset] != request.query[query_start + offset]
                if mismatch and run_start is None:
                    run_start = offset
                if run_start is not None and (not mismatch or offset == reference_size - 1):
                    run_end = offset if not mismatch else offset + 1
                    variants.append(
                        _variant_from_alignment(
                            "substitution",
                            reference_start + run_start,
                            reference_start + run_end,
                            query_start + run_start,
                            query_start + run_end,
                            request.reference,
                            request.query,
                        )
                    )
                    run_start = None
        elif reference_size:
            variants.append(
                _variant_from_alignment(
                    "deletion",
                    reference_start,
                    reference_end,
                    query_start,
                    query_end,
                    request.reference,
                    request.query,
                )
            )
        elif query_size:
            variants.append(
                _variant_from_alignment(
                    "insertion",
                    reference_start,
                    reference_end,
                    query_start,
                    query_end,
                    request.reference,
                    request.query,
                )
            )

    counts = Counter(variant.kind for variant in variants)
    return MutationComparisonResult(
        molecule_type=request.molecule_type,
        reference_length=len(request.reference),
        query_length=len(request.query),
        alignment_score=float(alignment.score),
        counts=MutationCounts(
            substitutions=counts["substitution"],
            insertions=counts["insertion"],
            deletions=counts["deletion"],
        ),
        variants=variants,
    )
