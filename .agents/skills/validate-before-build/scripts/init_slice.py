#!/usr/bin/env python3
"""Create a deterministic validation-slice experiment scaffold."""

from __future__ import annotations

import argparse
import json
import re
from datetime import date
from pathlib import Path


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not slug:
        raise ValueError("name must contain at least one letter or digit")
    return slug[:64].rstrip("-")


def next_number(parent: Path) -> int:
    numbers = []
    if parent.exists():
        for child in parent.iterdir():
            match = re.match(r"^(\d{3})-", child.name)
            if child.is_dir() and match:
                numbers.append(int(match.group(1)))
    return max(numbers, default=0) + 1


def write_json(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Create validation-slices/NNN-name with an experiment contract."
    )
    parser.add_argument("--root", default=".", help="Repository or workspace root")
    parser.add_argument("--name", required=True, help="Short descriptive experiment name")
    parser.add_argument("--decision", default="TODO", help="Decision this evidence changes")
    parser.add_argument("--hypothesis", default="TODO", help="Falsifiable hypothesis")
    parser.add_argument("--baseline", default="TODO", help="Current comparator or none")
    parser.add_argument("--timebox", default="2 days", help="Maximum experiment duration")
    args = parser.parse_args()

    root = Path(args.root).expanduser().resolve()
    parent = root / "validation-slices"
    parent.mkdir(parents=True, exist_ok=True)
    number = next_number(parent)
    slug = slugify(args.name)
    experiment_dir = parent / f"{number:03d}-{slug}"
    if experiment_dir.exists():
        raise SystemExit(f"Refusing to overwrite existing directory: {experiment_dir}")

    src_dir = experiment_dir / "src"
    inputs_dir = experiment_dir / "inputs"
    results_dir = experiment_dir / "results"
    for directory in (src_dir, inputs_dir, results_dir):
        directory.mkdir(parents=True)

    contract = {
        "version": 1,
        "name": args.name,
        "created": date.today().isoformat(),
        "status": "draft",
        "decision": args.decision,
        "hypothesis": args.hypothesis,
        "riskiest_assumption": "TODO",
        "baseline": args.baseline,
        "timebox": args.timebox,
        "decision_rules": {
            "VALIDATED": "PROCEED",
            "PARTIAL": "REVISE",
            "INVALIDATED": "STOP",
        },
        "metrics": [
            {
                "name": "TODO primary metric",
                "direction": "higher|lower|range",
                "unit": "TODO",
                "pass": "TODO",
                "partial": "TODO",
                "fail": "TODO",
                "fatal_gate": False,
            }
        ],
        "fidelity_map": [
            {"surface": "input distribution", "level": "TODO", "reason": "TODO"},
            {"surface": "risk-bearing behavior", "level": "TODO", "reason": "TODO"},
            {"surface": "output evaluation", "level": "TODO", "reason": "TODO"},
        ],
        "safety": {
            "uses_production_system": False,
            "contains_sensitive_data": False,
            "approval_or_basis": "not required",
            "raw_data_location": "none",
            "disposal_plan": "TODO",
        },
    }
    write_json(experiment_dir / "slice.json", contract)

    manifest = {
        "version": 1,
        "frozen": False,
        "source": "TODO",
        "sampling_strategy": "TODO",
        "holdout_policy": "TODO",
        "sensitive_data_policy": "No raw secrets, credentials, customer data, or PII in git.",
        "cases": [
            {
                "id": "TODO",
                "stratum": "common|difficult|edge|known-failure|holdout",
                "source_ref": "TODO stable pointer or redacted fixture",
                "content_hash": "TODO",
                "selection_reason": "TODO",
            }
        ],
    }
    write_json(inputs_dir / "manifest.json", manifest)
    (inputs_dir / ".gitignore").write_text(
        "*\n!.gitignore\n!manifest.json\n", encoding="utf-8"
    )
    (results_dir / "results.jsonl").write_text("", encoding="utf-8")

    slice_md = f"""# Validation Slice {number:03d}: {args.name}

## Decision

{args.decision}

## Hypothesis

{args.hypothesis}

## Riskiest Assumption

TODO

## Baseline

{args.baseline}

## Fidelity Map

Complete `slice.json`. Explain why each fake surface cannot change the decision.

## Run

```sh
TODO one-command execution
```

## Evidence Plan

- Primary metric and thresholds: see `slice.json`
- Frozen inputs: see `inputs/manifest.json`
- Per-case results: see `results/results.jsonl`

## Disposal Plan

TODO
"""
    (experiment_dir / "SLICE.md").write_text(slice_md, encoding="utf-8")

    summary = """# Validation Slice Result

## Verdict: TODO

## Action: TODO

## Decision

TODO

## Thresholds vs Observed

TODO

## Strongest Evidence

TODO

## Failure Clusters and Surprises

TODO

## Fidelity Gaps and Limitations

TODO

## Production Implications

TODO

## Evidence That Would Change the Decision

TODO
"""
    (results_dir / "summary.md").write_text(summary, encoding="utf-8")

    print(experiment_dir)


if __name__ == "__main__":
    main()
