import copy
import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

import xlrd
import xlwt

from scripts.update_emission_factors import (
    APPROVED_DATA_PATH,
    PipelineError,
    build_candidate,
    extract_warm_workbook,
    find_latest_workbook,
    load_approved_data,
    main,
    publication_date_from_url,
    write_candidate_files,
)


RECYCLING_HEADER = (
    "Recycling of Post-Consumer Material: Default or Customized Transportation Distance"
)


def make_workbook(
    recycling_header: str = RECYCLING_HEADER,
    version: int = 16,
    glass_value: float = -0.2760901764592596,
) -> bytes:
    workbook = xlwt.Workbook()
    inputs = workbook.add_sheet("Analysis Inputs")
    inputs.write(1, 1, f"Version {version}")
    guide = workbook.add_sheet("User's Guide")
    guide.write(0, 0, "Please enter data in short tons.")
    workbook.add_sheet("Summary Report (MTCO2E)")

    summary = workbook.add_sheet("Summary Data")
    headers = ["Notes", "Material", "Unused", "Pathway", recycling_header]
    for col, value in enumerate(headers):
        summary.write(2, col, value)

    rows = [
        (3, "Mixed Paper (general)", -3.5455235990647034),
        (5, "Mixed Plastics", -0.9255234067519946),
        (7, "Glass", glass_value),
    ]
    for row, material, value in rows:
        summary.write(row, 1, material)
        summary.write(row, 4, value)

    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


class EmissionFactorPipelineTests(unittest.TestCase):
    def test_extracts_by_semantic_headers_and_material_labels(self) -> None:
        extracted = extract_warm_workbook(make_workbook(), expected_version=16)

        self.assertEqual(extracted["version"], 16)
        self.assertEqual(extracted["layout"]["sheet"], "Summary Data")
        self.assertEqual(extracted["layout"]["headerRow"], 3)
        self.assertEqual(extracted["layout"]["materialColumn"], "B")
        self.assertEqual(extracted["layout"]["recyclingColumn"], "E")
        self.assertEqual(extracted["factors"]["glass"]["sourceLocation"].split(";")[0],
                         "Summary Data!E8")
        self.assertAlmostEqual(
            extracted["factors"]["glass"]["factor"],
            0.30433732434615207,
        )
        self.assertAlmostEqual(
            extracted["factors"]["plastic"]["factor"],
            1.0202149197879966,
        )
        self.assertAlmostEqual(
            extracted["factors"]["paper"]["factor"],
            3.908270766398367,
        )

    def test_fails_safely_when_recycling_header_changes(self) -> None:
        with self.assertRaisesRegex(PipelineError, "layout may have changed"):
            extract_warm_workbook(make_workbook(recycling_header="Waste management"))

    def test_rejects_source_version_mismatch(self) -> None:
        with self.assertRaisesRegex(PipelineError, "but workbook contents identify version 15"):
            extract_warm_workbook(make_workbook(version=15), expected_version=16)

    def test_rejects_invalid_sign_for_net_recycling_factor(self) -> None:
        with self.assertRaisesRegex(PipelineError, "expected a finite negative"):
            extract_warm_workbook(make_workbook(glass_value=0.276))

    def test_candidate_is_separate_and_preserves_steel(self) -> None:
        approved_bytes_before = APPROVED_DATA_PATH.read_bytes()
        approved = load_approved_data()
        approved_copy = copy.deepcopy(approved)
        extracted = extract_warm_workbook(make_workbook())
        for material_id, extracted_factor in extracted["factors"].items():
            approved_copy["factors"][material_id]["modelSha256"] = "test-hash"
            approved_copy["factors"][material_id]["modelLocation"] = (
                extracted_factor["sourceLocation"].split(";", 1)[0]
            )
        candidate = build_candidate(
            extracted,
            approved_copy,
            "https://www.epa.gov/system/files/documents/2023-12/warm_v16.xls",
            "December 2023",
            "test-hash",
            "2026-10-10T00:00:00+00:00",
        )

        self.assertEqual(candidate["candidateStatus"], "not-approved-not-for-application-runtime")
        self.assertEqual(
            candidate["factorCandidates"]["glass"]["reviewStatus"],
            "extracted-awaiting-review",
        )
        self.assertNotIn("steelScrap", candidate["factorCandidates"])
        self.assertEqual(approved, load_approved_data())

        with tempfile.TemporaryDirectory() as output_dir:
            candidate_path, diff_path = write_candidate_files(candidate, Path(output_dir))
            self.assertTrue(candidate_path.is_file())
            self.assertTrue(diff_path.is_file())
            self.assertIn(
                "approved application factor json is not modified",
                diff_path.read_text(encoding="utf-8").lower(),
            )

        self.assertEqual(APPROVED_DATA_PATH.read_bytes(), approved_bytes_before)

    def test_candidate_marks_source_hash_change_for_review(self) -> None:
        approved = load_approved_data()
        candidate = build_candidate(
            extract_warm_workbook(make_workbook()),
            approved,
            "https://www.epa.gov/system/files/documents/2023-12/warm_v16.xls",
            "December 2023",
            "different-workbook-hash",
            "2026-10-10T00:00:00+00:00",
        )
        self.assertEqual(
            candidate["factorCandidates"]["glass"]["reviewStatus"],
            "changed-since-approved",
        )

    def test_publication_date_requires_date_in_official_url(self) -> None:
        self.assertEqual(
            publication_date_from_url(
                "https://www.epa.gov/system/files/documents/2023-12/warm_v16.xls"
            ),
            "December 2023",
        )
        self.assertIsNone(
            publication_date_from_url("https://www.epa.gov/files/warm_v17.xls")
        )

    def test_selects_highest_explicit_warm_version_from_official_index(self) -> None:
        index = b"""
        <a href="/system/files/documents/2023-12/warm_v16.xls">Version 16</a>
        <a href="/system/files/documents/2020-11/warm_v15.xls">Version 15</a>
        """
        version, url = find_latest_workbook(index)
        self.assertEqual(version, 16)
        self.assertEqual(
            url,
            "https://www.epa.gov/system/files/documents/2023-12/warm_v16.xls",
        )

    def test_invalid_workbook_writes_failure_report_not_factor_candidate(self) -> None:
        approved_bytes_before = APPROVED_DATA_PATH.read_bytes()
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            invalid_workbook = temp_path / "invalid.xls"
            invalid_workbook.write_bytes(b"not a workbook")
            output_dir = temp_path / "candidates"
            with redirect_stderr(io.StringIO()), redirect_stdout(io.StringIO()):
                result = main(
                    [
                        "--workbook",
                        str(invalid_workbook),
                        "--output-dir",
                        str(output_dir),
                    ]
                )
            self.assertEqual(result, 1)
            self.assertEqual(list(output_dir.glob("*.json")), [])
            failure_reports = list(output_dir.glob("*.report.md"))
            self.assertEqual(len(failure_reports), 1)
            self.assertIn(
                "approved factor file: not modified",
                failure_reports[0].read_text(encoding="utf-8").lower(),
            )
        self.assertEqual(APPROVED_DATA_PATH.read_bytes(), approved_bytes_before)


if __name__ == "__main__":
    unittest.main()
