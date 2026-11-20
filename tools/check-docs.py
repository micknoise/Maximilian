#!/usr/bin/env python3
"""Check that the agent documentation is still true.

Three checks, in order of how much they catch:

  1. COMPILE   every ```cpp fenced block in AGENTS.md and agents/** is compiled as a
               complete translation unit against the real headers.
  2. SYMBOLS   every maxi* identifier mentioned anywhere in those files exists in src/.
  3. LINKS     every relative markdown link points at a file that exists.
  (plus) SKILL.md files have valid YAML frontmatter with a name and a description.

The rule this enforces: a fenced ```cpp block is a promise that it compiles. If you want
to show a fragment, use inline code or a ```text block.

Usage:
    python tools/check-docs.py               # everything
    python tools/check-docs.py --no-compile  # skip the compiler (fast; symbols+links only)

Environment:
    CXX   compiler to use (default: g++; falls back to clang++ if g++ is absent)
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
LIBS = ROOT / "src" / "libs"
VERIFY = ROOT / "agents" / "verify"

# Doc set: the entry point plus everything under agents/.
DOC_GLOBS = ["AGENTS.md", "agents/**/*.md"]

FENCE_RE = re.compile(r"^```(\w+)?\s*$")
IDENT_RE = re.compile(r"\b(maxi[A-Z]\w*)")
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
CLASSMEMBER_RE = re.compile(r"\b(maxi[A-Z]\w*)::(\w+)")

SKIP_LINK_PREFIXES = ("http://", "https://", "#", "mailto:")

# Names the documentation mentions on purpose, which therefore must NOT be expected to
# exist in src/. Each entry states why, so adding one is a decision rather than a way to
# silence a real typo.
ALLOWED_MISSING = {
    "maxiRecorder":
        "removed from the library; documented explicitly as absent because "
        "21.Recording still uses it",
    "maxiSomething":
        "placeholder class name in the Cheerp guidance",
    "maxiFoo":
        "placeholder class name in the Cheerp guidance",
}


class Report:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, where: str, message: str) -> None:
        self.errors.append(f"{where}: {message}")

    def warn(self, where: str, message: str) -> None:
        self.warnings.append(f"{where}: {message}")


def doc_files() -> list[Path]:
    files: list[Path] = []
    for pattern in DOC_GLOBS:
        files.extend(sorted(ROOT.glob(pattern)))
    # de-duplicate, keep order, drop anything that vanished
    seen: set[Path] = set()
    out: list[Path] = []
    for f in files:
        if f.is_file() and f not in seen:
            seen.add(f)
            out.append(f)
    return out


def fences(path: Path):
    """Yield (line_number, language, [lines]) for each fenced block."""
    lines = path.read_text(encoding="utf-8").splitlines()
    i = 0
    while i < len(lines):
        m = FENCE_RE.match(lines[i].strip())
        if not m:
            i += 1
            continue
        lang = (m.group(1) or "").lower()
        start = i + 1
        body: list[str] = []
        i += 1
        while i < len(lines) and not lines[i].strip().startswith("```"):
            body.append(lines[i])
            i += 1
        yield start, lang, body
        i += 1


def find_compiler() -> str | None:
    for candidate in (os.environ.get("CXX"), "g++", "clang++"):
        if not candidate:
            continue
        found = shutil.which(candidate)
        if found:
            return found
    return None


def src_identifiers() -> set[str]:
    """Every identifier the docs are allowed to name.

    The library itself, plus the verification harness headers (which are part of the
    documentation's own contract, e.g. maxiMetrics).
    """
    idents: set[str] = set()
    token = re.compile(r"[A-Za-z_]\w*")
    search = list(SRC.rglob("*")) + list(VERIFY.glob("*.h"))
    for path in search:
        if path.suffix.lower() not in {".h", ".hpp", ".c", ".cpp", ".cc", ".mm"}:
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        idents.update(token.findall(text))
    return idents


def check_compile(files: list[Path], report: Report, cxx: str | None) -> int:
    if cxx is None:
        report.error("compile", "no C++ compiler found; set CXX or use --no-compile")
        return 0

    # Compile from a scratch directory under agents/verify so that doc snippets which
    # include "../harness.h" resolve exactly as they do in the real case files.
    scratch = VERIFY / ".doccheck"
    scratch.mkdir(parents=True, exist_ok=True)

    base = [cxx, "-std=c++17", "-fsyntax-only",
            "-I", str(SRC), "-I", str(LIBS), "-I", str(VERIFY)]

    compiled = 0
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        for line, lang, body in fences(path):
            if lang not in {"cpp", "c++", "cc"}:
                continue
            if not any(line_.strip() for line_ in body):
                continue
            snippet = scratch / f"fence_{path.stem}_{line}.cpp"
            snippet.write_text("\n".join(body) + "\n", encoding="utf-8")
            proc = subprocess.run(base + [str(snippet)],
                                  capture_output=True, text=True)
            compiled += 1
            if proc.returncode != 0:
                first = ""
                for err_line in proc.stderr.splitlines():
                    if "error:" in err_line:
                        first = err_line.split("error:", 1)[1].strip()
                        break
                if not first:
                    first = (proc.stderr.splitlines() or ["unknown error"])[0].strip()
                report.error(f"{rel}:{line}", f"cpp block does not compile -- {first}")

    for leftover in scratch.glob("*.cpp"):
        leftover.unlink(missing_ok=True)
    try:
        scratch.rmdir()
    except OSError:
        pass
    return compiled


def check_symbols(files: list[Path], report: Report) -> int:
    universe = src_identifiers()
    mentions = 0
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), start=1):
            # ignore fences that are prose-only shell blocks? no: identifiers are rare there
            for ident in IDENT_RE.findall(line):
                mentions += 1
                if ident in universe or ident in ALLOWED_MISSING:
                    continue
                report.error(f"{rel}:{lineno}",
                             f"'{ident}' is mentioned but does not exist in src/")
    return mentions


def check_links(files: list[Path], report: Report) -> int:
    checked = 0
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        text = path.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), start=1):
            for target in LINK_RE.findall(line):
                target = target.strip()
                if not target or target.startswith(SKIP_LINK_PREFIXES):
                    continue
                target = target.split("#", 1)[0]
                if not target:
                    continue
                checked += 1
                resolved = (path.parent / target).resolve()
                if not resolved.exists():
                    report.error(f"{rel}:{lineno}",
                                 f"link target does not exist: {target}")
    return checked


def check_skills(files: list[Path], report: Report) -> int:
    skills = sorted((ROOT / "agents" / "skills").glob("*/SKILL.md"))
    for skill in skills:
        rel = skill.relative_to(ROOT).as_posix()
        text = skill.read_text(encoding="utf-8")
        if not text.startswith("---"):
            report.error(rel, "missing YAML frontmatter")
            continue
        parts = text.split("---", 2)
        if len(parts) < 3:
            report.error(rel, "frontmatter is not closed with ---")
            continue
        front = parts[1]
        if not re.search(r"^name:\s*\S", front, re.MULTILINE):
            report.error(rel, "frontmatter has no name")
        elif not re.search(r"^name:\s*" + re.escape(skill.parent.name) + r"\s*$",
                           front, re.MULTILINE):
            report.error(rel, f"frontmatter name does not match folder "
                              f"'{skill.parent.name}'")
        desc = re.search(r"^description:\s*(.+)$", front, re.MULTILINE)
        if not desc:
            report.error(rel, "frontmatter has no description")
        elif len(desc.group(1)) < 40:
            report.warn(rel, "description is very short; a skill is only loaded if a "
                             "model can tell when to load it")
    return len(skills)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--no-compile", action="store_true",
                        help="skip compiling cpp blocks (symbols and links only)")
    args = parser.parse_args()

    files = doc_files()
    if not files:
        print("check-docs: no documentation files found", file=sys.stderr)
        return 2

    report = Report()
    cxx = find_compiler()

    compiled = 0 if args.no_compile else check_compile(files, report, cxx)
    mentions = check_symbols(files, report)
    links = check_links(files, report)
    skills = check_skills(files, report)

    print(f"check-docs: {len(files)} files, {skills} skills, "
          f"{compiled} cpp blocks compiled, {mentions} symbol mentions, "
          f"{links} links checked")

    for warning in report.warnings:
        print(f"  warning  {warning}")

    if report.errors:
        print()
        for error in report.errors:
            print(f"  ERROR    {error}")
        print(f"\ncheck-docs: {len(report.errors)} problem(s)")
        return 1

    print("check-docs: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
