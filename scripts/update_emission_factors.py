#!/usr/bin/env python3
"""Extract EPA WARM recycling factors into review-only candidate artifacts."""

from __future__ import annotations

import argparse
import difflib
import hashlib
import html.parser
import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

import xlrd


ROOT = Path(__file__).resolve().parents[1]
APPROVED_DATA_PATH = ROOT / "src" / "data" / "emission-factors.json"
WARM_VERSION_INDEX_URL = (
    "https://www.epa.gov/waste-reduction-model/versions-waste-reduction-model"
)
MAX_DOWNLOAD_BYTES = 80 * 1024 * 1024
SHORT_TON_KG = 907.18474
WARM_MATERIALS_DOCUMENTS = {
    16: (
        "https://www.epa.gov/system/files/documents/2023-12/"
        "warm_containers_packaging_and_non-durable_goods_materials_v16_dec.pdf"
    )
}
TARGET_MATERIALS = {
    "glass": "Glass",
    "plastic": "Mixed Plastics",
    "paper": "Mixed Paper (general)",
}


class PipelineError(Exception):
    """A source or validation problem that requires explicit review."""


class LinkParser(html.parser.HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[dict[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "a":
            self._href = dict(attrs).get("href")
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "a" and self._href is not None:
            self.links.append({"href": self._href, "text": " ".join(self._text).strip()})
            self._href = None
            self._text = []


def normalize(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.casefold()))


def validate_epa_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise PipelineError(f"Expected an HTTPS EPA source URL, got {url!r}.")
    if parsed.hostname != "epa.gov" and not parsed.hostname.endswith(".epa.gov"):
        raise PipelineError(f"Refusing non-EPA source host {parsed.hostname!r}.")


def fetch_bytes(url: str) -> bytes:
    validate_epa_url(url)
    request = Request(url, headers={"User-Agent": "ReSource emissions-factor checker"})
    try:
        with urlopen(request, timeout=30) as response:
            payload = response.read(MAX_DOWNLOAD_BYTES + 1)
    except (OSError, URLError) as error:
        raise PipelineError(f"Could not retrieve {url}: {error}") from error
    if len(payload) > MAX_DOWNLOAD_BYTES:
        raise PipelineError(f"Source exceeded the {MAX_DOWNLOAD_BYTES}-byte download limit.")
    if not payload:
        raise PipelineError(f"Source returned an empty response: {url}")
    return payload


def find_latest_workbook(index_html: bytes) -> tuple[int, str]:
    parser = LinkParser()
    parser.feed(index_html.decode("utf-8", errors="replace"))
    matches: list[tuple[int, str]] = []
    for link in parser.links:
        match = re.search(r"/warm_v(\d+)\.xls(?:$|[?#])", link["href"], re.IGNORECASE)
        if match:
            version = int(match.group(1))
            url = urljoin(WARM_VERSION_INDEX_URL, link["href"])
            validate_epa_url(url)
            matches.append((version, url))
    if not matches:
        raise PipelineError("EPA version page has no identifiable WARM Excel workbook link.")
    highest_version = max(version for version, _ in matches)
    latest_urls = {url for version, url in matches if version == highest_version}
    if len(latest_urls) != 1:
        raise PipelineError(
            f"EPA version page has ambiguous workbook links for WARM version {highest_version}."
        )
    return highest_version, latest_urls.pop()


def publication_date_from_url(url: str) -> str | None:
    match = re.search(r"/(20\d{2})-(0[1-9]|1[0-2])(?:/|$)", urlparse(url).path)
    if not match:
        return None
    year, month = int(match.group(1)), int(match.group(2))
    month_name = datetime(year, month, 1).strftime("%B")
    return f"{month_name} {year}"


def detect_version(book: xlrd.book.Book) -> int:
    versions: set[int] = set()
    version_pattern = re.compile(r"\bversion\s+(\d+)\b", re.IGNORECASE)
    for sheet in book.sheets():
        for row_index in range(sheet.nrows):
            for col_index in range(sheet.ncols):
                value = sheet.cell_value(row_index, col_index)
                if isinstance(value, str):
                    match = version_pattern.fullmatch(value.strip())
                    if match:
                        versions.add(int(match.group(1)))
    if len(versions) != 1:
        raise PipelineError(
            f"Expected exactly one WARM version in workbook contents; found {sorted(versions)}."
        )
    return versions.pop()


def column_name(index: int) -> str:
    result = ""
    while index >= 0:
        index, remainder = divmod(index, 26)
        result = chr(65 + remainder) + result
        index -= 1
    return result


def find_summary_table(book: xlrd.book.Book) -> tuple[xlrd.sheet.Sheet, int, int, int]:
    matches: list[tuple[xlrd.sheet.Sheet, int, int, int]] = []
    for sheet in book.sheets():
        for row_index in range(min(sheet.nrows, 30)):
            headers = [
                normalize(str(sheet.cell_value(row_index, col_index)))
                for col_index in range(sheet.ncols)
            ]
            material_columns = [
                col_index for col_index, header in enumerate(headers) if header == "material"
            ]
            recycling_columns = [
                col_index
                for col_index, header in enumerate(headers)
                if "recycling" in header and "post consumer material" in header
            ]
            if len(material_columns) == 1 and len(recycling_columns) == 1:
                matches.append(
                    (sheet, row_index, material_columns[0], recycling_columns[0])
                )

    if not matches:
        raise PipelineError(
            "Could not find a table with Material and post-consumer Recycling headers; "
            "workbook layout may have changed."
        )
    named_summary = [
        match for match in matches if normalize(match[0].name) == "summary data"
    ]
    selected = named_summary if len(named_summary) == 1 else matches
    if len(selected) != 1:
        names = sorted({match[0].name for match in selected})
        raise PipelineError(
            f"Multiple plausible recycling tables found ({names}); manual layout review required."
        )
    return selected[0]


def extract_warm_workbook(
    workbook_bytes: bytes, expected_version: int | None = None
) -> dict:
    try:
        book = xlrd.open_workbook(file_contents=workbook_bytes)
    except (xlrd.XLRDError, ValueError) as error:
        raise PipelineError(f"Could not parse the workbook as a supported .xls file: {error}") from error

    version = detect_version(book)
    if expected_version is not None and version != expected_version:
        raise PipelineError(
            f"EPA index points to WARM version {expected_version}, "
            f"but workbook contents identify version {version}."
        )

    guide_sheets = [sheet for sheet in book.sheets() if "guide" in sheet.name.casefold()]
    guide_text = " ".join(
        str(guide_sheets[0].cell_value(row, col))
        for row in range(guide_sheets[0].nrows)
        for col in range(guide_sheets[0].ncols)
    ) if len(guide_sheets) == 1 else ""
    if "short ton" not in guide_text.casefold():
        raise PipelineError(
            "Could not verify short-ton input units in a unique workbook guide sheet."
        )
    if not any(
        "summary report" in sheet.name.casefold() and "mtco2e" in sheet.name.casefold()
        for sheet in book.sheets()
    ):
        raise PipelineError("Could not verify the workbook's MTCO2E emissions unit.")

    sheet, header_row, material_col, recycling_col = find_summary_table(book)
    header = str(sheet.cell_value(header_row, recycling_col))
    extracted: dict[str, dict] = {}
    for material_id, source_label in TARGET_MATERIALS.items():
        rows = [
            row_index
            for row_index in range(header_row + 1, sheet.nrows)
            if normalize(str(sheet.cell_value(row_index, material_col)))
            == normalize(source_label)
        ]
        if len(rows) != 1:
            raise PipelineError(
                f"Expected one {source_label!r} row in {sheet.name!r}; found {len(rows)}."
            )
        row_index = rows[0]
        raw_value = sheet.cell_value(row_index, recycling_col)
        if isinstance(raw_value, bool) or not isinstance(raw_value, (int, float)):
            raise PipelineError(f"{source_label!r} recycling value is not numeric: {raw_value!r}.")
        source_value = float(raw_value)
        if not math.isfinite(source_value) or source_value >= 0:
            raise PipelineError(
                f"{source_label!r} expected a finite negative net-recycling value; "
                f"found {source_value!r}."
            )
        factor = -source_value * 1000 / SHORT_TON_KG
        if not math.isfinite(factor) or factor <= 0:
            raise PipelineError(f"Converted factor for {source_label!r} is invalid.")
        extracted[material_id] = {
            "sourceLabel": source_label,
            "sourceValue": source_value,
            "factor": factor,
            "sourceLocation": (
                f"{sheet.name}!{column_name(recycling_col)}{row_index + 1}; "
                f"header {column_name(recycling_col)}{header_row + 1}: {header}"
            ),
        }

    return {
        "version": version,
        "layout": {
            "sheet": sheet.name,
            "headerRow": header_row + 1,
            "materialColumn": column_name(material_col),
            "recyclingColumn": column_name(recycling_col),
            "recyclingHeader": header,
        },
        "factors": extracted,
    }


def load_approved_data(path: Path = APPROVED_DATA_PATH) -> dict:
    try:
        approved = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise PipelineError(f"Could not read approved factor data at {path}: {error}") from error
    if (
        not isinstance(approved, dict)
        or approved.get("schemaVersion") != 1
        or not isinstance(approved.get("factors"), dict)
    ):
        raise PipelineError(f"Approved factor data at {path} does not match schema version 1.")
    for material_id in TARGET_MATERIALS:
        factor = approved["factors"].get(material_id)
        if (
            not isinstance(factor, dict)
            or not isinstance(factor.get("factor"), (int, float))
            or not isinstance(factor.get("sourceValue"), (int, float))
            or not math.isfinite(factor["factor"])
            or factor["factor"] <= 0
            or not math.isfinite(factor["sourceValue"])
        ):
            raise PipelineError(f"Approved factor {material_id!r} is missing required numeric fields.")
    return approved


def build_candidate(
    extracted: dict,
    approved: dict,
    workbook_url: str,
    publication_date: str | None,
    workbook_sha256: str,
    checked_at: str,
) -> dict:
    version = extracted["version"]
    candidate_factors = {}
    year_match = re.match(r"([A-Za-z]+) (\d{4})$", publication_date or "")
    publication_year = int(year_match.group(2)) if year_match else None
    for material_id, factor_data in extracted["factors"].items():
        old = approved["factors"][material_id]
        old_version_match = re.search(
            r"\bversion\s+(\d+)\b",
            str(old.get("source", "")),
            re.IGNORECASE,
        )
        old_version = int(old_version_match.group(1)) if old_version_match else None
        model_location = factor_data["sourceLocation"].split(";", 1)[0]
        changed = not math.isclose(
            factor_data["sourceValue"],
            float(old["sourceValue"]),
            rel_tol=0,
            abs_tol=1e-12,
        ) or (
            publication_year is not None and publication_year != old.get("year")
        ) or (
            old_version is not None and version != old_version
        ) or (
            old.get("modelSha256") is not None
            and workbook_sha256 != old.get("modelSha256")
        ) or (
            old.get("modelLocation") is not None
            and model_location != old.get("modelLocation")
        )
        candidate_factors[material_id] = {
            **factor_data,
            "modelLocation": model_location,
            "unit": old["unit"],
            "sourceUnit": "MTCO2e/short ton",
            "sourceUrl": WARM_MATERIALS_DOCUMENTS.get(version),
            "modelUrl": workbook_url,
            "modelSha256": workbook_sha256,
            "year": publication_year,
            "publicationDate": publication_date,
            "reviewStatus": (
                "changed-since-approved" if changed else "extracted-awaiting-review"
            ),
            "approvedFactor": old["factor"],
            "approvedSourceValue": old["sourceValue"],
            "approvedModelLocation": old.get("modelLocation"),
            "approvedModelSha256": old.get("modelSha256"),
            "manualReview": [
                "Verify the factor in the matching official materials table.",
                "Confirm the current material definition, system boundary, and assumptions.",
            ],
        }
    return {
        "schemaVersion": 1,
        "candidateStatus": "not-approved-not-for-application-runtime",
        "checkedAt": checked_at,
        "source": {
            "organization": "US EPA",
            "name": f"Waste Reduction Model (WARM), Version {version}",
            "workbookUrl": workbook_url,
            "publicationDate": publication_date,
            "sha256": workbook_sha256,
            "layout": extracted["layout"],
        },
        "factorCandidates": candidate_factors,
        "notUpdated": {
            "steelScrap": "Manually sourced Broadbent (2016) benchmark; intentionally unchanged.",
            "heat": "Unsupported; no factor extracted.",
            "water": "Unsupported; no factor extracted.",
        },
    }


def render_diff(candidate: dict) -> str:
    lines = [
        f"WARM Version {candidate['source']['name'].rsplit(' ', 1)[-1]} candidate values",
        f"Source: {candidate['source']['workbookUrl']}",
        f"Workbook SHA-256: {candidate['source']['sha256']}",
        f"Detected layout: {candidate['source']['layout']}",
        "All proposals remain unapproved; the approved application factor JSON is not modified.",
        "Verified and suitable: none; automated extraction does not approve or establish suitability.",
        "Extracted, awaiting review: candidate rows below.",
        "Unsupported: heat and water; manually sourced steel is retained unchanged.",
        "Invalid or incompatible: an error report is written and no candidate JSON is produced.",
        "",
    ]
    for material_id, item in candidate["factorCandidates"].items():
        lines.extend(
            [
                f"@@ {material_id}: {item['reviewStatus']} @@",
                f"- approved source value: {item['approvedSourceValue']} {item['sourceUnit']}",
                f"- approved factor: {item['approvedFactor']} {item['unit']}",
                f"- approved workbook location: {item['approvedModelLocation']}",
                f"- approved workbook SHA-256: {item['approvedModelSha256']}",
                f"+ candidate source value: {item['sourceValue']} {item['sourceUnit']}",
                f"+ candidate factor: {item['factor']} {item['unit']}",
                f"+ candidate workbook location: {item['modelLocation']}",
                f"+ candidate workbook SHA-256: {item['modelSha256']}",
                f"  source location: {item['sourceLocation']}",
                f"  publication date: {item['publicationDate'] or 'not identified'}",
                "  review: verify primary documentation and methodology before promotion",
                "",
            ]
        )
    lines.extend(
        [
            "Steel remains the manually sourced Broadbent (2016) factor.",
            "Heat and water remain unsupported.",
            "",
        ]
    )
    return "\n".join(lines)


def write_candidate_files(candidate: dict, output_dir: Path) -> tuple[Path, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    version = candidate["source"]["name"].rsplit(" ", 1)[-1]
    base = f"warm-v{version}-candidate-{stamp}"
    candidate_path = output_dir / f"{base}.json"
    diff_path = output_dir / f"{base}.diff"
    candidate_text = json.dumps(candidate, indent=2, ensure_ascii=False) + "\n"
    diff_text = render_diff(candidate)
    for path, contents in ((candidate_path, candidate_text), (diff_path, diff_text)):
        try:
            with path.open("x", encoding="utf-8") as output_file:
                output_file.write(contents)
        except FileExistsError as error:
            raise PipelineError(f"Refusing to overwrite existing candidate artifact {path}.") from error
    return candidate_path, diff_path


def write_failure_report(output_dir: Path, checked_at: str, error: Exception) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = output_dir / f"warm-update-invalid-{stamp}.report.md"
    with path.open("x", encoding="utf-8") as report:
        report.write(
            "# WARM update check: invalid or incompatible\n\n"
            f"- Checked at: {checked_at}\n"
            "- Candidate JSON: not written\n"
            "- Approved factor file: not modified\n\n"
            "Manual review is required before retrying.\n\n"
            f"Error: {error}\n"
        )


def create_candidate(args: argparse.Namespace) -> tuple[dict, str]:
    if args.workbook:
        workbook_bytes = args.workbook.read_bytes()
        if args.source_url:
            validate_epa_url(args.source_url)
            workbook_url = args.source_url
        else:
            workbook_url = f"local-file:{args.workbook.name}"
        expected_version = None
    else:
        if args.source_url:
            raise PipelineError("--source-url is only valid when using --workbook.")
        index_html = fetch_bytes(args.index_url)
        expected_version, workbook_url = find_latest_workbook(index_html)
        workbook_bytes = fetch_bytes(workbook_url)

    extracted = extract_warm_workbook(workbook_bytes, expected_version)
    publication_date = publication_date_from_url(workbook_url)
    checked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    candidate = build_candidate(
        extracted,
        load_approved_data(),
        workbook_url,
        publication_date,
        hashlib.sha256(workbook_bytes).hexdigest(),
        checked_at,
    )
    return candidate, checked_at


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--index-url",
        default=WARM_VERSION_INDEX_URL,
        help="Official EPA WARM version index URL.",
    )
    parser.add_argument(
        "--workbook",
        type=Path,
        help="Use a local .xls workbook instead of retrieving the EPA version index.",
    )
    parser.add_argument(
        "--source-url",
        help="Official EPA workbook URL for metadata when --workbook is used.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "data" / "candidates",
        help="Directory for timestamped candidate JSON and diff artifacts.",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    checked_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    try:
        candidate, checked_at = create_candidate(args)
        candidate_path, diff_path = write_candidate_files(candidate, args.output_dir)
    except (PipelineError, OSError) as error:
        try:
            write_failure_report(args.output_dir, checked_at, error)
        except OSError as report_error:
            print(f"ERROR: {error}; could not write failure report: {report_error}", file=sys.stderr)
            return 1
        print(f"ERROR: {error}", file=sys.stderr)
        print(f"Invalid-source report written under {args.output_dir}", file=sys.stderr)
        return 1

    print(f"Candidate JSON: {candidate_path}")
    print(f"Review diff: {diff_path}")
    print("The approved application factor JSON was not modified.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
