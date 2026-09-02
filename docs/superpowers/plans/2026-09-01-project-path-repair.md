# Project Path Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore every active LocalLens worktree and local runtime path after the workspace root changed from `C:\Users\Admin\Documents\Đồ án` to `C:\Users\Admin\Documents\Project`.

**Architecture:** Use Git's native `worktree repair --relative-paths` command to repair the bidirectional worktree metadata instead of manually rewriting internal Git files. Treat pnpm project links and active `.superpowers` ledgers as separate operational layers. Preserve Git logs, Codex task history, reports that use the Vietnamese phrase “đồ án”, and all user worktree changes.

**Tech Stack:** Git 2.53 for Windows, PowerShell 7, pnpm, Next.js, Vitest, Playwright.

**Spec:** Current user request and the failing preflight recorded by `git -C <worktree> rev-parse --show-toplevel` for all 13 linked worktrees.

## Global Constraints

- Do not reset, stash, discard, merge, push, publish, prune, or delete a worktree.
- Do not rewrite Git logs or Codex session history.
- Do not rename `Đồ án.docx` or replace natural-language uses of “đồ án”.
- Back up all Git pointer files before repair.
- Preserve every dirty or untracked file exactly as found.
- Use relative worktree links so a future move of the common parent directory does not recreate this failure.

---

### Task 1: Capture the failing state and repair inputs

**Files:**
- Read: `localens/.git/worktrees/*/gitdir`
- Read: `localens/.worktrees/*/.git`
- Create: `tmp/worktree-path-repair-20260901/`

**Interfaces:**
- Consumes: the current `Project` workspace and all 13 linked worktree directories.
- Produces: a backup of each forward/back pointer plus a manifest of pre-repair Git probes.

- [ ] **Step 1: Run the failing probe**

  Run `git -C <each-worktree> rev-parse --show-toplevel` and require all failures to identify the old `Đồ án` Git directory.

- [ ] **Step 2: Record both sides of every link**

  Capture each linked worktree's `.git` file and the matching common-repository `.git/worktrees/<id>/gitdir` file.

- [ ] **Step 3: Back up the pointer files**

  Copy the 26 text pointer files to `tmp/worktree-path-repair-20260901/` without modifying indexes, refs, logs, or working files.

### Task 2: Repair Git worktrees with relative links

**Files:**
- Modify through Git: `localens/.git/worktrees/*/gitdir`
- Modify through Git: `localens/.worktrees/*/.git`

**Interfaces:**
- Consumes: the 13 existing worktree directories and their common Git repository.
- Produces: valid relative bidirectional links for every worktree.

- [ ] **Step 1: Test the hypothesis on one worktree**

  Run `git worktree repair --relative-paths <one-worktree>` from `localens`, then require `rev-parse` and `status` to succeed for that worktree.

- [ ] **Step 2: Repair the remaining worktrees**

  Run the same native repair command with the remaining 12 exact paths.

- [ ] **Step 3: Verify repository identity and branch mapping**

  Require each worktree to resolve to its new `Project` path, retain its original branch or detached state, and remain present in `git worktree list --porcelain` without `prunable`.

### Task 3: Repair operational path consumers

**Files:**
- Modify: active `.superpowers/sdd/**/*.md` files containing the old absolute workspace prefix.
- Repair/regenerate: `.pnpm-store/v11/projects/*` broken project links.
- Inspect: project `.npmrc`, `node_modules/.modules.yaml`, Next.js/Playwright caches, and current process working directories.

**Interfaces:**
- Consumes: a functioning `localens-mvp` worktree.
- Produces: runnable pnpm and current clickable ledger paths under `Project`.

- [ ] **Step 1: Rewrite only active operational ledgers**

  Replace the exact old absolute prefix with the new prefix; leave Git history, Codex history, and ordinary Vietnamese prose unchanged.

- [ ] **Step 2: Regenerate broken pnpm project links**

  Remove only confirmed broken cache links and let `pnpm install --offline` or the existing lockfile recreate valid metadata without changing dependency versions.

- [ ] **Step 3: Check generated caches**

  Rebuild rather than manually editing `.next`, `out`, coverage, Playwright reports, or test results if they contain stale absolute paths.

### Task 4: Verify the repaired workspace end to end

**Files:**
- Test: all 13 Git worktrees.
- Test: `localens/.worktrees/localens-mvp/package.json` scripts.
- Test: LocalLens static build and local HTTP route.

**Interfaces:**
- Consumes: repaired Git and runtime metadata.
- Produces: current evidence that Git operations, dependency resolution, tests, build, and local serving work from `Project`.

- [ ] **Step 1: Run Git gates**

  Require `rev-parse`, `status --short --branch`, and `worktree list --porcelain` to succeed for every worktree with no old operational pointer.

- [ ] **Step 2: Run dependency and application gates**

  Run the repository's locked pnpm install/check commands, followed by the relevant unit, type, lint, build, and Playwright gates defined in `package.json`.

- [ ] **Step 3: Run the local HTTP gate**

  Start the app from the repaired MVP worktree, require HTTP 200 on `/vi/`, and stop only the process started by this verification.

- [ ] **Step 4: Audit residual old-name matches**

  Classify remaining matches as historical/audit data, report prose/filenames, generated caches, or actionable runtime paths. Completion requires zero actionable runtime references to the old absolute workspace.
