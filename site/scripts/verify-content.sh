#!/usr/bin/env bash
#
# Prove a change to the docs generators left their output unchanged.
#
# The generated trees are gitignored, so there is no committed copy to diff
# against. The baseline is built from a throwaway worktree at a given ref —
# committed code, no stashing — and compared against the working tree.
#
# Three things a plain `diff -r` would miss, each checked below:
#
#   1. Idempotency. `writeIfChanged` plus the stale-file sweeps mean a second
#      run can differ from the first; that is exactly how a sweep bug surfaces.
#      So the working tree is built twice and run 1 diffed against run 2.
#   2. The sibling repo. Two generators read `style-bindings.json` from
#      `../specs-transforms` and fall back to emitting no section when it is
#      absent. A worktree in /tmp has no such sibling, so it would take the
#      fallback branch while the working tree takes the present branch, and the
#      diff would be noise. The baseline's parent gets a symlink to the real
#      sibling so both sides exercise the same branch.
#   3. An empty diff can mean a crash. Every generator's exit status is
#      checked, every .mjs is syntax-checked, and the page count is asserted
#      non-zero per tree.
#
# Generators are invoked with `node` directly rather than through
# `npm run build:content`: the workspace build-posture hook denies `npm run
# build*` in this repo, and `watch-content.mjs` already spawns them this way.
#
# Usage:
#   bash scripts/verify-content.sh [baseline-ref]      # default: HEAD
#
# Exit status is 0 only when both diffs are empty and every guard passed.

set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
site=$(cd "$here/.." && pwd)
repo=$(cd "$site/.." && pwd)
ref="${1:-HEAD}"

# The generators, in the order `build:content` runs them. Kept as one list so
# the harness and package.json cannot drift apart silently.
GENERATORS=(
  build-releases.mjs
  build-adrs.mjs
  build-specification.mjs
  build-mappings.mjs
  build-style-pages.mjs
  build-prop-pages.mjs
  build-anatomy-pages.mjs
)

# Every artifact the generators own. Diffing only the big trees would miss a
# regression in the three small generators entirely.
ARTIFACTS=(
  src/content/docs/schema/styles
  src/content/docs/schema/props
  src/content/docs/schema/anatomy
  src/content/docs/schema/mappings
  src/content/docs/adr
  src/content/docs/schema/specification.md
  src/content/docs/overview/releases.mdx
)

work=$(mktemp -d)
baseline_tree="$work/baseline/spectacular"
trap 'git -C "$repo" worktree remove --force "$baseline_tree" >/dev/null 2>&1; rm -rf "$work"' EXIT

fail=0
note() { printf '  %s\n' "$*"; }
bad() { printf '  ✗ %s\n' "$*"; fail=1; }
ok() { printf '  ✓ %s\n' "$*"; }

# ── Guard: a running dev server does not survive the ADR generator ───────────
# build-adrs.mjs removes its whole output directory and writes it back, which
# a live `astro dev` does not survive. Until that generator writes in place,
# this harness must not run underneath one.
if lsof -nP -iTCP:4323 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "✗ Something is listening on 4323 — stop the dev server first."
  echo "  build-adrs.mjs wipes and rewrites src/content/docs/adr/, which a running astro dev does not survive."
  exit 1
fi

# ── Syntax check ─────────────────────────────────────────────────────────────
echo "Syntax"
while IFS= read -r f; do
  if ! node --check "$f" 2>/dev/null; then
    bad "node --check failed: ${f#"$site"/}"
  fi
done < <(find "$site/scripts" -name '*.mjs')
[ "$fail" -eq 0 ] && ok "every .mjs parses"

# ── Build a tree ─────────────────────────────────────────────────────────────
# Runs the generators in order in $1, failing loudly on the first non-zero
# exit. Generator stdout is captured rather than shown; it is reported only
# when a generator fails, so a clean verify stays readable.
build_tree() {
  local root="$1" label="$2" log
  for g in "${GENERATORS[@]}"; do
    log=$(cd "$root/site" && node "scripts/$g" 2>&1)
    if [ $? -ne 0 ]; then
      bad "$label: $g exited non-zero"
      printf '%s\n' "$log" | sed 's/^/      /'
      return 1
    fi
  done
  return 0
}

# Copies the artifacts out of a built tree into $2, so a later build cannot
# overwrite the snapshot. Missing artifacts are recorded as such rather than
# skipped: an artifact that stops being produced is a regression, and a silent
# skip would read as an empty diff.
snapshot() {
  local root="$1" dest="$2" a
  mkdir -p "$dest"
  for a in "${ARTIFACTS[@]}"; do
    if [ -e "$root/site/$a" ]; then
      mkdir -p "$dest/$(dirname "$a")"
      cp -R "$root/site/$a" "$dest/$a"
    else
      mkdir -p "$dest/$(dirname "$a")"
      echo "ABSENT" > "$dest/$a.absent"
    fi
  done
  # An empty directory is not output, and treating it as output makes the
  # comparison unwinnable. The stale-file sweeps delete retired `.md` files but
  # never the directories that held them, so a long-lived working tree carries
  # empty folders a clean build never creates — five of them today, from a
  # retired gradient shape. Pruning them here compares what the generators
  # actually emit. The sweep should prune them too; that is the emitter's job,
  # not this harness's.
  find "$dest" -depth -type d -empty -delete 2>/dev/null
}

# ── Baseline ─────────────────────────────────────────────────────────────────
echo
echo "Baseline ($ref)"
mkdir -p "$work/baseline"
if ! git -C "$repo" worktree add --detach "$baseline_tree" "$ref" >/dev/null 2>&1; then
  echo "  ✗ could not create a worktree at $ref"
  exit 1
fi
note "worktree at $ref"

# See header note 2. The generators reach the sibling repo as `<repo>/../<name>`,
# so the link goes next to the worktree, not inside it.
for sibling in specs-transforms; do
  if [ -d "$repo/../$sibling" ]; then
    ln -s "$(cd "$repo/../$sibling" && pwd)" "$work/baseline/$sibling"
    note "linked sibling $sibling"
  else
    note "sibling $sibling absent here — both sides take the fallback branch"
  fi
done

# Built twice, and only the second run snapshotted. The working tree gets the
# same treatment below, and the reason is the same for both.
#
# One generator reads another's output: build-mappings.mjs consults the emitted
# schema/styles/ tree to decide which style keys it may link, but runs before
# build-style-pages.mjs in the chain. So on a cold tree it emits plain code
# spans where a warm one emits links — the first build of a fresh checkout is
# missing those cross-links entirely.
#
# That makes temperature, not the change under test, the loudest thing in a
# diff: compare a cold tree against a warm one and every style-key reference
# differs. Warming both sides makes the comparison symmetric. It does not fix
# the ordering bug, which is its own step; it stops that bug from masking every
# real diff until then.
if build_tree "$baseline_tree" "baseline run 1" && build_tree "$baseline_tree" "baseline run 2"; then
  snapshot "$baseline_tree" "$work/snap-baseline"
  ok "built twice and snapshotted"
else
  echo
  echo "Baseline build failed — nothing to compare against."
  exit 1
fi

# ── Working tree, twice ──────────────────────────────────────────────────────
echo
echo "Working tree"
# NOT warmed, deliberately, now that build-mappings reads the schema instead of
# another generator's output. The baseline is still built twice because the ref
# it points at usually still has that coupling — so this comparison is a cold
# working tree against a warm baseline, and an empty diff is the proof that
# temperature no longer changes what gets emitted.
if build_tree "$repo" "run 1"; then
  snapshot "$repo" "$work/snap-run1"
  ok "run 1 built"
else
  echo
  echo "Working tree build failed."
  exit 1
fi

if build_tree "$repo" "run 2"; then
  snapshot "$repo" "$work/snap-run2"
  ok "run 2 built"
else
  exit 1
fi

# ── Guard: output exists ─────────────────────────────────────────────────────
# An empty diff is also what two identical crashes produce. Assert each tree
# actually holds pages before believing a clean result.
echo
echo "Page counts"
for a in "${ARTIFACTS[@]}"; do
  if [ -f "$work/snap-run1/$a.absent" ]; then
    bad "$a not produced"
  elif [ -d "$work/snap-run1/$a" ]; then
    n=$(find "$work/snap-run1/$a" -name '*.md' | wc -l | tr -d ' ')
    if [ "$n" -eq 0 ]; then bad "$a is empty"; else note "$(printf '%4s  %s' "$n" "$a")"; fi
  else
    note "$(printf '%4s  %s' "file" "$a")"
  fi
done

# ── Guard: the sibling-repo fallbacks are still guarded ──────────────────────
# The snapshot can only ever exercise the present-sibling branch, so the
# fallback is asserted by reading the code rather than by diff. Each grep is
# the guard that makes the generator degrade instead of crash when
# specs-transforms is not checked out.
echo
echo "Fallback guards"
check_guard() {
  if grep -q "$2" "$site/scripts/$1"; then ok "$1: $3"; else bad "$1: $3 — guard missing"; fi
}
check_guard build-style-pages.mjs 'existsSync' 'sibling style-bindings read is guarded'
check_guard build-anatomy-pages.mjs 'existsSync' 'sibling style-bindings read is guarded'

# The inverse of a guard: build-mappings must NOT read another generator's
# output at all. It used to consult the emitted styles tree to decide which
# style keys it could link, which silently dropped every such link on a clean
# build. Asserted as an absence because that is what the fix is.
if grep -q "docs/schema/styles\|join(docsSchema, 'styles')" "$site/scripts/build-mappings.mjs"; then
  bad "build-mappings.mjs reads the emitted styles tree again — link rendering will depend on build order"
else
  ok "build-mappings.mjs: reads no other generator's output"
fi

# ── The diffs ────────────────────────────────────────────────────────────────
report_diff() {
  local a="$1" b="$2" label="$3" out
  out=$(diff -r "$a" "$b" 2>&1)
  if [ -z "$out" ]; then
    ok "$label: identical"
  else
    bad "$label: differs"
    printf '%s\n' "$out" | head -80 | sed 's/^/      /'
    local lines
    lines=$(printf '%s\n' "$out" | wc -l | tr -d ' ')
    [ "$lines" -gt 80 ] && note "… $((lines - 80)) more lines"
  fi
}

echo
echo "Diffs"
report_diff "$work/snap-run1" "$work/snap-run2" "idempotency (run 1 vs run 2)"
report_diff "$work/snap-baseline" "$work/snap-run1" "output vs baseline"

echo
if [ "$fail" -eq 0 ]; then
  echo "✓ Output unchanged against $ref, and stable across two runs."
else
  echo "✗ Verification failed. A non-empty 'output vs baseline' diff is expected"
  echo "  for a step that deliberately changes output — read it, do not wave it through."
fi
exit "$fail"
