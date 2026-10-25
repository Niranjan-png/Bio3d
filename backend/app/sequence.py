from fastapi import APIRouter

from app.schemas import (
    MutationComparisonRequest,
    MutationComparisonResult,
    ORFRequest,
    ORFResult,
    SequenceRequest,
    SequenceStatistics,
    TranslationRequest,
    TranslationResult,
)
from app.sequence_analysis import (
    compare_sequences,
    find_orfs,
    sequence_statistics,
    translate_sequence,
)

router = APIRouter(prefix="/api/sequence", tags=["sequence analysis"])


@router.post("/statistics", response_model=SequenceStatistics)
def get_sequence_statistics(request: SequenceRequest) -> SequenceStatistics:
    return sequence_statistics(request.sequence, request.molecule_type)


@router.post("/translation", response_model=TranslationResult)
def translate(request: TranslationRequest) -> TranslationResult:
    return translate_sequence(request)


@router.post("/orfs", response_model=ORFResult)
def get_orfs(request: ORFRequest) -> ORFResult:
    return find_orfs(request.sequence, request.molecule_type)


@router.post("/compare", response_model=MutationComparisonResult)
def compare(request: MutationComparisonRequest) -> MutationComparisonResult:
    return compare_sequences(request)
