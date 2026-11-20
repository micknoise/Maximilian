# agents/

Machine-readable onboarding for Maximilian, for AI coding agents and for anyone who wants
the shortest path to "I understand this codebase".

Start at [`../AGENTS.md`](../AGENTS.md). Come here when you need detail.

## What is in here

| Path | What it is | Read it when |
|---|---|---|
| [`reference/architecture.md`](reference/architecture.md) | How the library is layered, the host contract, the JS build, where new code goes | You are about to change structure, or integrate the library into a new host |
| [`reference/api.md`](reference/api.md) | Class-by-class usage, with units and traps | You are writing DSP and need a signature or a unit |
| [`reference/pitfalls.md`](reference/pitfalls.md) | 18 failures people actually hit, with causes and fixes | Something is silent, wrong or will not build |
| [`reference/examples-map.md`](reference/examples-map.md) | All 28 examples, what each teaches, and which still compile | You want a pattern to copy |
| [`skills/`](skills/) | Task-shaped instructions, one `SKILL.md` each | You have a concrete job: "make a drum machine" |
| [`verify/`](verify/) | Offline render harness + four regression cases | You need to prove the DSP works |

## The single-source-of-truth rule

Skills do **not** duplicate API descriptions. They route.

- A signature or a unit belongs in `reference/api.md`.
- A failure mode belongs in `reference/pitfalls.md`.
- A skill says *what to build and in what order*, and links to those two files.

This is deliberate. Ten copies of "lores takes Hz" become ten different statements within a
year. One copy, checked by a script, stays true.

## How this stays true

`tools/check-docs.py` runs two checks over `AGENTS.md` and everything under `agents/`:

1. **Every fenced ```` ```cpp ```` block is compiled** against the real headers, as a
   complete translation unit. A snippet cannot drift from the API.
2. **Every `maxi*` identifier mentioned in prose is checked** against the headers, so a
   class name that was renamed or never existed is caught.

Run it after any change to these files:

```sh
python tools/check-docs.py
```

If you write a fragment that is not a complete program (a single call, a signature), use
`inline code` rather than a fenced block. **A fenced block is a promise that it compiles.**

## Using the skills in your tool

The pack is plain `SKILL.md` files with YAML frontmatter (`name`, `description`), which is
the format most agent tools converged on. There is nothing to install.

| Tool | How to load them |
|---|---|
| Any tool that reads `AGENTS.md` (Codex, Cursor, Gemini CLI, Amp, …) | Automatic: it finds `AGENTS.md`, which points at the skills |
| GitHub Copilot | Automatic: [`.github/copilot-instructions.md`](../.github/copilot-instructions.md) points here |
| Claude Code | `ln -s ../../agents/skills .claude/skills` (or copy the folder) |
| DeepSeek Harness / other plugin harnesses | Copy `agents/skills/` into the harness's skills directory, or ask the harness to read the folder |
| You, with no agent at all | Read the skill you need; they are short by design |

## Contributing to this folder

- Keep `AGENTS.md` short. It is a router, not a manual.
- Put new facts in `reference/`, not in a skill.
- If you discover a trap, add it to `pitfalls.md` with the symptom first — that is how
  people search for it.
- Run `tools/check-docs.py` before you commit. A doc that does not compile is a bug.
