import pytest
from pydantic import ValidationError

from app.schemas import (
    MutationComparisonRequest,
    ORFRequest,
    SequenceRequest,
    TranslationRequest,
)
from app.sequence_analysis import compare_sequences, find_orfs, sequence_statistics, translate_sequence


def test_statistics_return_canonical_composition_and_gc_percentage() -> None:
    result = sequence_statistics("ATGCC", "DNA")

    assert result.length == 5
    assert result.nucleotide_composition == {"A": 1, "C": 2, "G": 1, "T": 1}
    assert result.gc_percentage == 60.0


def test_sequence_validation_normalizes_case_and_whitespace() -> None:
    request = SequenceRequest(sequence=" aug\nccu ", molecule_type="RNA")

    assert request.sequence == "AUGCCU"


@pytest.mark.parametrize(
    ("sequence", "molecule_type"),
    [
        ("", "DNA"),
        ("ACGTN", "DNA"),
        ("ACGU", "DNA"),
        ("ACGT", "RNA"),
        ("ACGUZ", "RNA"),
        ("A" * 10_001, "DNA"),
    ],
)
def test_sequence_validation_rejects_empty_unsupported_or_over_limit_inputs(
    sequence: str,
    molecule_type: str,
) -> None:
    with pytest.raises(ValidationError):
        SequenceRequest(sequence=sequence, molecule_type=molecule_type)


def test_translation_stops_before_first_stop_and_excludes_stop_from_peptide() -> None:
    result = translate_sequence(
        TranslationRequest(sequence="ATGAAATAACCC", molecule_type="DNA", frame=0)
    )

    assert result.peptide == "MK"
    assert result.stop_codon == "TAA"
    assert result.terminated_by_stop is True
    assert result.translated_codon_count == 2
    assert result.ignored_trailing_bases == 0


@pytest.mark.parametrize(
    ("molecule_type", "stop_codon"),
    [
        ("DNA", "TAA"),
        ("DNA", "TAG"),
        ("DNA", "TGA"),
        ("RNA", "UAA"),
        ("RNA", "UAG"),
        ("RNA", "UGA"),
    ],
)
def test_translation_recognizes_each_standard_stop_codon(
    molecule_type: str,
    stop_codon: str,
) -> None:
    start = "ATG" if molecule_type == "DNA" else "AUG"
    result = translate_sequence(
        TranslationRequest(sequence=f"{start}{stop_codon}", molecule_type=molecule_type)
    )

    assert result.peptide == "M"
    assert result.stop_codon == stop_codon


def test_translation_applies_frame_offset_and_ignores_partial_trailing_codon() -> None:
    result = translate_sequence(
        TranslationRequest(sequence="AATGAAAT", molecule_type="DNA", frame=1)
    )

    assert result.peptide == "MK"
    assert result.frame == 1
    assert result.stop_codon is None
    assert result.ignored_trailing_bases == 1


def test_rna_translation_uses_standard_genetic_code() -> None:
    result = translate_sequence(
        TranslationRequest(sequence="AUGUAA", molecule_type="RNA")
    )

    assert result.peptide == "M"
    assert result.stop_codon == "UAA"


def test_orf_detection_reports_forward_coordinates_and_includes_stop_span() -> None:
    result = find_orfs("CCCATGAAATAACCC", "DNA")

    assert result.count == 1
    assert result.orfs[0].model_dump() == {
        "strand": "+",
        "frame": 0,
        "start": 3,
        "end": 12,
        "start_codon": "ATG",
        "stop_codon": "TAA",
        "peptide": "MK",
    }


def test_orf_detection_reports_frame_offset_on_oriented_strand() -> None:
    result = find_orfs("AATGAAATAA", "DNA")

    assert result.count == 1
    assert result.orfs[0].frame == 1
    assert (result.orfs[0].start, result.orfs[0].end) == (1, 10)


def test_orf_detection_reports_reverse_strand_coordinates() -> None:
    result = find_orfs("GGGTTATTTCATGGG", "DNA")

    assert result.count == 1
    assert result.orfs[0].strand == "-"
    assert result.orfs[0].frame == 0
    assert (result.orfs[0].start, result.orfs[0].end) == (3, 12)
    assert result.orfs[0].peptide == "MK"


def test_rna_orf_detection_uses_forward_strand_and_rna_codons() -> None:
    result = find_orfs("CCCAUGAAAUAA", "RNA")

    assert result.count == 1
    assert result.orfs[0].strand == "+"
    assert result.orfs[0].start_codon == "AUG"
    assert result.orfs[0].stop_codon == "UAA"


def test_orf_detection_requires_start_and_in_frame_stop() -> None:
    result = find_orfs("CCCAAATAACCCATGAAA", "DNA")

    assert result.orfs == []


def test_orf_detection_reports_overlapping_starts_separately() -> None:
    result = find_orfs("ATGATGTAA", "DNA")

    assert [(orf.start, orf.end, orf.peptide) for orf in result.orfs] == [
        (0, 9, "MM"),
        (3, 9, "M"),
    ]


def test_mutation_comparison_reports_substitution_with_zero_based_coordinates() -> None:
    result = compare_sequences(
        MutationComparisonRequest(
            reference="AACCGGTT",
            query="AATCGGTT",
            molecule_type="DNA",
        )
    )

    assert result.counts.substitutions == 1
    assert result.counts.insertions == 0
    assert result.counts.deletions == 0
    assert result.variants[0].model_dump() == {
        "kind": "substitution",
        "reference_start": 2,
        "reference_end": 3,
        "query_start": 2,
        "query_end": 3,
        "reference_allele": "C",
        "query_allele": "T",
    }


def test_mutation_comparison_of_identical_sequences_has_no_variants() -> None:
    result = compare_sequences(
        MutationComparisonRequest(
            reference="ACGT",
            query="ACGT",
            molecule_type="DNA",
        )
    )

    assert result.variants == []
    assert result.counts.model_dump() == {
        "substitutions": 0,
        "insertions": 0,
        "deletions": 0,
    }


@pytest.mark.parametrize(
    ("reference", "query", "kind", "reference_range", "query_range", "reference_allele", "query_allele"),
    [
        ("ACAT", "ACGAT", "insertion", (2, 2), (2, 3), "", "G"),
        ("ACGT", "ACT", "deletion", (2, 3), (2, 2), "G", ""),
    ],
)
def test_mutation_comparison_reports_indels(
    reference: str,
    query: str,
    kind: str,
    reference_range: tuple[int, int],
    query_range: tuple[int, int],
    reference_allele: str,
    query_allele: str,
) -> None:
    result = compare_sequences(
        MutationComparisonRequest(
            reference=reference,
            query=query,
            molecule_type="DNA",
        )
    )

    variant = result.variants[0]
    assert variant.kind == kind
    assert (variant.reference_start, variant.reference_end) == reference_range
    assert (variant.query_start, variant.query_end) == query_range
    assert variant.reference_allele == reference_allele
    assert variant.query_allele == query_allele


def test_mutation_comparison_rejects_molecule_mismatch_alphabet() -> None:
    with pytest.raises(ValidationError):
        MutationComparisonRequest(
            reference="ACGT",
            query="ACGU",
            molecule_type="DNA",
        )


def test_orf_request_uses_the_same_sequence_validation() -> None:
    with pytest.raises(ValidationError):
        ORFRequest(sequence="ATGN", molecule_type="DNA")
