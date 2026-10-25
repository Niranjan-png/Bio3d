from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_statistics_endpoint_returns_composition_and_gc_percentage() -> None:
    response = client.post(
        "/api/sequence/statistics",
        json={"sequence": "atgc", "molecule_type": "DNA"},
    )

    assert response.status_code == 200
    assert response.json() == {
        "molecule_type": "DNA",
        "length": 4,
        "nucleotide_composition": {"A": 1, "C": 1, "G": 1, "T": 1},
        "gc_percentage": 50.0,
    }


def test_translation_endpoint_accepts_frame_and_reports_stop() -> None:
    response = client.post(
        "/api/sequence/translation",
        json={"sequence": "AATGAAATAA", "molecule_type": "DNA", "frame": 1},
    )

    assert response.status_code == 200
    assert response.json()["peptide"] == "MK"
    assert response.json()["stop_codon"] == "TAA"
    assert response.json()["frame"] == 1


def test_orf_endpoint_returns_coordinates_and_strand() -> None:
    response = client.post(
        "/api/sequence/orfs",
        json={"sequence": "CCCATGAAATAACCC", "molecule_type": "DNA"},
    )

    assert response.status_code == 200
    assert response.json()["count"] == 1
    assert response.json()["orfs"][0]["start"] == 3
    assert response.json()["orfs"][0]["end"] == 12


def test_compare_endpoint_reports_substitution_insertion_and_deletion() -> None:
    cases = [
        ("AACCGGTT", "AATCGGTT", "substitution", 2, 3, 2, 3),
        ("ACAT", "ACGAT", "insertion", 2, 2, 2, 3),
        ("ACGT", "ACT", "deletion", 2, 3, 2, 2),
    ]

    for reference, query, kind, ref_start, ref_end, query_start, query_end in cases:
        response = client.post(
            "/api/sequence/compare",
            json={
                "reference": reference,
                "query": query,
                "molecule_type": "DNA",
            },
        )

        assert response.status_code == 200
        variant = response.json()["variants"][0]
        assert variant["kind"] == kind
        assert (variant["reference_start"], variant["reference_end"]) == (ref_start, ref_end)
        assert (variant["query_start"], variant["query_end"]) == (query_start, query_end)


def test_sequence_endpoints_reject_invalid_or_incompatible_inputs() -> None:
    invalid = client.post(
        "/api/sequence/statistics",
        json={"sequence": "ACGU", "molecule_type": "DNA"},
    )
    invalid_frame = client.post(
        "/api/sequence/translation",
        json={"sequence": "ATG", "molecule_type": "DNA", "frame": 3},
    )
    mismatched_comparison = client.post(
        "/api/sequence/compare",
        json={"reference": "ACGT", "query": "ACGU", "molecule_type": "DNA"},
    )

    assert invalid.status_code == 422
    assert invalid_frame.status_code == 422
    assert mismatched_comparison.status_code == 422


def test_sequence_endpoints_allow_configured_frontend_cors_preflight() -> None:
    response = client.options(
        "/api/sequence/statistics",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert "POST" in response.headers["access-control-allow-methods"]
    assert "content-type" in response.headers["access-control-allow-headers"].lower()
