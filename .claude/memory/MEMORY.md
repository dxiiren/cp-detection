# Project memory — cp-detection

Lightweight, file-based project memory. This file is the index, loaded each session: one line per
memory, `- [Title](file.md) — hook`. Each memory is one fact in its own `*.md` file beside this
one; read the fact file on demand when its index hook is relevant.

Rules: before saving, check for an existing file that already covers the fact — update rather than
duplicate; delete a memory that turns out wrong. Don't store what the repo already records (code
structure, git history, CLAUDE.md, `.docs/`).

## Index

_No memories yet._
