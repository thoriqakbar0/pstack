---
name: ephemeral-bend
description: "Use when the user wants to try, compute, or check something in Bend without keeping a project: \"in bend\", \"try this in Bend\", \"compute X with bend\", \"does this type-check in Bend\". Writes a throwaway .bend file in a temp dir, runs it, reports the output, and deletes the dir."
---

# Ephemeral Bend

Run one throwaway Bend program and leave nothing behind. For a Bend project the user keeps, follow that project's own rules instead.

1. **Read the guide.** Run `bend guide` before writing any Bend this session. Read `bend guide shaders` too before a GPU (`!`) program, and look names up with `bend base <name>`.
2. **Make a temp dir.** `D=$(mktemp -d)`. Write every file inside `$D`, never in the working tree.
3. **Write one `.bend` file.** Give it a `main() -> IO(Unit)` that prints the answer, because an IO `main` runs compiled and a value `main` is normalized by the slow checker. When the task says "parallel" or the work splits evenly, use a balanced parallel call (`a b = f(x) g(y)`) as the guide's Parallelism section shows.
4. **Run it.** `bend $D/<name>.bend`. Use `bend $D/<name>.bend --check-only` when the user asked only whether it type-checks. On a checker error, fix the file and rerun. Stop after three failed fixes and report the last error.
5. **Report.** Show the program, the exact command, and its output or the final error, verbatim.
6. **Delete the dir.** `trash "$D"`, or `rm -rf "$D"` where `trash` is missing, then confirm with `test ! -e "$D"`. Delete it on failure too. Keep it only when the user asks to keep the file, and then print its path.
