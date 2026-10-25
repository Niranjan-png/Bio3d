from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MoleculeType = Literal["DNA", "RNA"]
ReadingFrame = Literal[0, 1, 2]
SequenceKind = Literal["substitution", "insertion", "deletion"]
MAX_SEQUENCE_LENGTH = 10_000


def normalize_and_validate_sequence(sequence: str, molecule_type: MoleculeType) -> str:
    """Normalize whitespace/case, then require a non-empty canonical sequence."""
    normalized = "".join(sequence.split()).upper()
    if not normalized:
        raise ValueError("sequence must contain at least one nucleotide")
    if len(normalized) > MAX_SEQUENCE_LENGTH:
        raise ValueError(f"sequence must not exceed {MAX_SEQUENCE_LENGTH} nucleotides")

    allowed = set("ACGT" if molecule_type == "DNA" else "ACGU")
    invalid = sorted(set(normalized) - allowed)
    if invalid:
        symbols = ", ".join(repr(symbol) for symbol in invalid)
        raise ValueError(f"{molecule_type} sequence contains unsupported nucleotide(s): {symbols}")
    return normalized


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SequenceRequest(APIModel):
    sequence: str = Field(description="Plain canonical sequence; whitespace is ignored.")
    molecule_type: MoleculeType

    @model_validator(mode="after")
    def validate_sequence(self) -> "SequenceRequest":
        self.sequence = normalize_and_validate_sequence(self.sequence, self.molecule_type)
        return self


class TranslationRequest(SequenceRequest):
    frame: ReadingFrame = Field(
        default=0,
        description="Zero-based offset (0, 1, or 2) on the supplied 5′→3′ strand.",
    )


class ORFRequest(SequenceRequest):
    pass


class MutationComparisonRequest(APIModel):
    reference: str = Field(description="Reference sequence, in the same molecule alphabet as query.")
    query: str = Field(description="Query sequence, in the same molecule alphabet as reference.")
    molecule_type: MoleculeType

    @model_validator(mode="after")
    def validate_sequences(self) -> "MutationComparisonRequest":
        self.reference = normalize_and_validate_sequence(self.reference, self.molecule_type)
        self.query = normalize_and_validate_sequence(self.query, self.molecule_type)
        return self


class SequenceStatistics(APIModel):
    molecule_type: MoleculeType
    length: int
    nucleotide_composition: dict[str, int]
    gc_percentage: float


class TranslationResult(APIModel):
    molecule_type: MoleculeType
    frame: ReadingFrame
    peptide: str
    protein_length: int
    translated_codon_count: int = Field(description="Number of translated sense codons; excludes a stop codon.")
    stop_codon: str | None = Field(description="First in-frame stop codon, if present.")
    terminated_by_stop: bool
    ignored_trailing_bases: int


class OpenReadingFrame(APIModel):
    strand: Literal["+", "-"]
    frame: ReadingFrame = Field(description="Zero-based offset on the reported 5′→3′ strand.")
    start: int = Field(description="Low, zero-based inclusive coordinate of the span on the supplied sequence.")
    end: int = Field(description="High, zero-based exclusive coordinate; span includes the terminal stop.")
    start_codon: str = Field(description="ATG/AUG on the reported strand; on '-' it lies near the high-coordinate end.")
    stop_codon: str = Field(description="First downstream in-frame stop on the reported strand.")
    peptide: str = Field(description="Translated amino acids, excluding the terminal stop.")


class ORFResult(APIModel):
    molecule_type: MoleculeType
    orfs: list[OpenReadingFrame]
    count: int


class MutationVariant(APIModel):
    kind: SequenceKind
    reference_start: int = Field(description="Zero-based, inclusive reference coordinate.")
    reference_end: int = Field(description="Zero-based, exclusive reference coordinate.")
    query_start: int = Field(description="Zero-based, inclusive query coordinate.")
    query_end: int = Field(description="Zero-based, exclusive query coordinate.")
    reference_allele: str = Field(description="Deleted/replaced reference bases; empty for insertions.")
    query_allele: str = Field(description="Inserted/replacement query bases; empty for deletions.")


class MutationCounts(APIModel):
    substitutions: int
    insertions: int
    deletions: int


class MutationComparisonResult(APIModel):
    molecule_type: MoleculeType
    reference_length: int
    query_length: int
    alignment_score: float
    counts: MutationCounts
    variants: list[MutationVariant]
