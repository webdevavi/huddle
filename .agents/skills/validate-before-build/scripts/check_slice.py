#!/usr/bin/env python3
"""Validate a validation slice's readiness and completion evidence."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


ALLOWED_STATUSES = {"draft", "ready", "running", "complete"}
ALLOWED_DIRECTIONS = {"higher", "lower", "range"}
ALLOWED_FIDELITY = {"real", "production-like", "fake"}
REQUIRED_FILES = (
    "SLICE.md",
    "slice.json",
    "inputs/manifest.json",
    "results/results.jsonl",
    "results/summary.md",
)


def load_json(path: Path, errors: list[str]) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"{path}: {exc}")
        return {}


def is_placeholder(value: Any) -> bool:
    if isinstance(value, str):
        normalized = value.strip().lower()
        return not normalized or "todo" in normalized or normalized == "tbd"
    return value is None


def find_placeholders(value: Any, prefix: str = "") -> list[str]:
    found = []
    if isinstance(value, dict):
        for key, child in value.items():
            path = f"{prefix}.{key}" if prefix else key
            found.extend(find_placeholders(child, path))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            found.extend(find_placeholders(child, f"{prefix}[{index}]"))
    elif is_placeholder(value):
        found.append(prefix)
    return found


def require_fields(
    value: dict[str, Any], fields: tuple[str, ...], label: str, errors: list[str]
) -> None:
    for field in fields:
        if field not in value or is_placeholder(value[field]):
            errors.append(f"{label}.{field} is missing or still a placeholder")


def read_results(path: Path, errors: list[str]) -> list[dict[str, Any]]:
    rows = []
    for line_number, line in enumerate(
        path.read_text(encoding="utf-8").splitlines(), start=1
    ):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            errors.append(f"{path}:{line_number}: {exc}")
            continue
        if not isinstance(row, dict):
            errors.append(f"{path}:{line_number}: each row must be a JSON object")
            continue
        rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Check a validation-slice directory")
    parser.add_argument("slice_dir", help="Path to validation-slices/NNN-name")
    args = parser.parse_args()

    experiment_dir = Path(args.slice_dir).expanduser().resolve()
    errors: list[str] = []
    warnings: list[str] = []

    for relative in REQUIRED_FILES:
        if not (experiment_dir / relative).is_file():
            errors.append(f"missing required file: {relative}")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        raise SystemExit(1)

    contract = load_json(experiment_dir / "slice.json", errors)
    manifest = load_json(experiment_dir / "inputs/manifest.json", errors)
    if not isinstance(contract, dict) or not isinstance(manifest, dict):
        errors.append("slice.json and inputs/manifest.json must contain JSON objects")
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        raise SystemExit(1)

    require_fields(
        contract,
        (
            "name",
            "status",
            "decision",
            "hypothesis",
            "baseline",
            "timebox",
        ),
        "slice",
        errors,
    )
    status = contract.get("status")
    if status not in ALLOWED_STATUSES:
        errors.append(f"slice.status must be one of {sorted(ALLOWED_STATUSES)}")

    if status == "draft":
        placeholders = find_placeholders(contract)
        if placeholders:
            warnings.append(
                "draft contract still contains placeholders: " + ", ".join(placeholders)
            )

    if status in {"ready", "running", "complete"}:
        require_fields(
            contract,
            ("riskiest_assumption",),
            "slice",
            errors,
        )
        metrics = contract.get("metrics")
        if not isinstance(metrics, list) or not metrics:
            errors.append("slice.metrics must contain at least one metric")
        else:
            for index, metric in enumerate(metrics):
                if not isinstance(metric, dict):
                    errors.append(f"slice.metrics[{index}] must be an object")
                    continue
                require_fields(
                    metric,
                    ("name", "direction", "unit", "pass", "partial", "fail"),
                    f"slice.metrics[{index}]",
                    errors,
                )
                if metric.get("direction") not in ALLOWED_DIRECTIONS:
                    errors.append(
                        f"slice.metrics[{index}].direction must be one of "
                        f"{sorted(ALLOWED_DIRECTIONS)}"
                    )
        placeholders = find_placeholders(contract)
        if placeholders:
            errors.append(
                "slice.json still contains placeholders: " + ", ".join(placeholders)
            )
        fidelity = contract.get("fidelity_map")
        if not isinstance(fidelity, list) or len(fidelity) < 3:
            errors.append("slice.fidelity_map must cover input, behavior, and evaluation")
        else:
            for index, surface in enumerate(fidelity):
                if not isinstance(surface, dict):
                    errors.append(f"slice.fidelity_map[{index}] must be an object")
                    continue
                require_fields(
                    surface,
                    ("surface", "level", "reason"),
                    f"slice.fidelity_map[{index}]",
                    errors,
                )
                if surface.get("level") not in ALLOWED_FIDELITY:
                    errors.append(
                        f"slice.fidelity_map[{index}].level must be one of "
                        f"{sorted(ALLOWED_FIDELITY)}"
                    )
        if manifest.get("frozen") is not True:
            errors.append("inputs/manifest.json must set frozen to true before the run")
        manifest_placeholders = find_placeholders(manifest)
        if manifest_placeholders:
            errors.append(
                "inputs/manifest.json still contains placeholders: "
                + ", ".join(manifest_placeholders)
            )
        cases = manifest.get("cases")
        if not isinstance(cases, list) or not cases:
            errors.append("inputs.manifest cases must not be empty")
        else:
            ids = [case.get("id") for case in cases if isinstance(case, dict)]
            if len(ids) != len(cases) or len(set(ids)) != len(ids):
                errors.append("every input case must have a unique id")

    raw_input_files = [
        path.name
        for path in (experiment_dir / "inputs").iterdir()
        if path.is_file() and path.name not in {".gitignore", "manifest.json"}
    ]
    if raw_input_files:
        warnings.append(
            "raw input files exist under inputs/; verify they contain no secrets or PII: "
            + ", ".join(sorted(raw_input_files))
        )

    if status == "complete":
        rows = read_results(experiment_dir / "results/results.jsonl", errors)
        if not rows:
            errors.append("complete spike must contain per-case results")
        else:
            for index, row in enumerate(rows):
                require_fields(
                    row,
                    ("case_id", "variant", "run", "status", "metrics"),
                    f"results[{index}]",
                    errors,
                )
                if not isinstance(row.get("metrics"), dict):
                    errors.append(f"results[{index}].metrics must be an object")

            expected_case_ids = {
                case["id"]
                for case in manifest.get("cases", [])
                if isinstance(case, dict) and case.get("id")
            }
            observed_case_ids = {row.get("case_id") for row in rows}
            unknown_case_ids = observed_case_ids - expected_case_ids
            if unknown_case_ids:
                errors.append(
                    "results contain case IDs not in the frozen manifest: "
                    + ", ".join(sorted(str(value) for value in unknown_case_ids))
                )

            variants = {
                row.get("variant")
                for row in rows
                if isinstance(row.get("variant"), str)
            }
            candidate_variants = {
                variant for variant in variants if variant.startswith("candidate")
            }
            if not candidate_variants:
                errors.append("results must include at least one candidate variant")
            for variant in sorted(candidate_variants):
                variant_case_ids = {
                    row.get("case_id") for row in rows if row.get("variant") == variant
                }
                missing = expected_case_ids - variant_case_ids
                if missing:
                    errors.append(
                        f"variant '{variant}' is missing cases: "
                        + ", ".join(sorted(str(value) for value in missing))
                    )

            baseline = str(contract.get("baseline", "")).strip().lower()
            if not baseline.startswith("none"):
                if "baseline" not in variants:
                    errors.append(
                        "results must include baseline rows for the declared comparator"
                    )
                else:
                    baseline_case_ids = {
                        row.get("case_id")
                        for row in rows
                        if row.get("variant") == "baseline"
                    }
                    missing = expected_case_ids - baseline_case_ids
                    if missing:
                        errors.append(
                            "baseline is missing cases: "
                            + ", ".join(sorted(str(value) for value in missing))
                        )

        summary = (experiment_dir / "results/summary.md").read_text(encoding="utf-8")
        verdicts = ("VALIDATED", "PARTIAL", "INVALIDATED")
        actions = ("PROCEED", "REVISE", "STOP")
        verdict_count = sum(
            f"## Verdict: {value}" in summary for value in verdicts
        )
        action_count = sum(f"## Action: {value}" in summary for value in actions)
        if verdict_count != 1:
            errors.append("summary must declare exactly one evidence verdict")
        if action_count != 1:
            errors.append("summary must declare exactly one action")
        if "TODO" in summary.upper():
            errors.append("complete summary still contains TODO placeholders")

    for warning in warnings:
        print(f"WARN: {warning}")
    for error in errors:
        print(f"ERROR: {error}")
    if errors:
        raise SystemExit(1)
    print(f"PASS: Validation slice is valid for status '{status}'.")


if __name__ == "__main__":
    main()
