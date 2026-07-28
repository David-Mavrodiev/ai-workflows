#!/usr/bin/env bash
# Fast build/typecheck/test/lint pass with ecosystem auto-detection.
# Mirrors build-verify.ps1. Exit: 0 pass, 1 fail, 2 bad path, 3 no stack.
set -uo pipefail

path="."
skip_build="${SKIP_BUILD:-}"
skip_tests="${SKIP_TESTS:-}"
skip_lint="${SKIP_LINT:-}"
for a in "$@"; do
  case "$a" in
    --skip-build) skip_build=1 ;;
    --skip-tests) skip_tests=1 ;;
    --skip-lint)  skip_lint=1 ;;
    --*) echo "unknown flag: $a" >&2 ;;
    *) path="$a" ;;
  esac
done

[ -d "$path" ] || { echo "    FAIL path not found: $path" >&2; exit 2; }
cd "$path" || exit 2
root="$(pwd)"
echo "==> build-verify: $root"

have() { command -v "$1" >/dev/null 2>&1; }
detected=0
fails=0

run() { echo "    \$ $*"; "$@"; }
record() {
  local name="$1"; shift
  if run "$@"; then echo "    OK   $name"; else echo "    FAIL $name"; fails=$((fails + 1)); fi
}
has_pkg_script() { have node && node -e "process.exit(((require('./package.json').scripts||{})['$1'])?0:1)" 2>/dev/null; }

# ---- Node ------------------------------------------------------------------
if [ -f package.json ]; then
  detected=1
  pm=npm
  [ -f pnpm-lock.yaml ] && pm=pnpm
  [ -f yarn.lock ] && pm=yarn
  have "$pm" || pm=npm
  pkg_run() { if [ "$pm" = yarn ]; then run "$pm" "$1"; else run "$pm" run "$1"; fi; }
  pkg_record() { local n="$1"; if pkg_run "$2"; then echo "    OK   $n"; else echo "    FAIL $n"; fails=$((fails + 1)); fi; }

  [ -z "$skip_build" ] && has_pkg_script build && pkg_record "node: build" build
  if [ -z "$skip_build" ] && has_pkg_script typecheck; then
    pkg_record "node: typecheck" typecheck
  elif [ -z "$skip_build" ] && [ -f tsconfig.json ] && have npx; then
    record "node: tsc --noEmit" npx --no-install tsc --noEmit
  fi
  [ -z "$skip_tests" ] && has_pkg_script test && pkg_record "node: test" test
  [ -z "$skip_lint" ]  && has_pkg_script lint && pkg_record "node: lint" lint
fi

# ---- .NET ------------------------------------------------------------------
if ls -1 ./*.sln ./*.csproj ./*.fsproj >/dev/null 2>&1 && have dotnet; then
  detected=1
  [ -z "$skip_build" ] && record "dotnet: build" dotnet build --nologo
  [ -z "$skip_tests" ] && record "dotnet: test"  dotnet test --nologo
  [ -z "$skip_lint" ]  && record "dotnet: format" dotnet format --verify-no-changes
fi

# ---- Python ----------------------------------------------------------------
if [ -f pyproject.toml ] || [ -f setup.py ] || [ -f requirements.txt ]; then
  detected=1
  if [ -z "$skip_tests" ] && have pytest; then record "python: pytest" pytest -q
  elif [ -z "$skip_tests" ] && have python; then record "python: pytest" python -m pytest -q; fi
  [ -z "$skip_lint" ] && have ruff && record "python: ruff" ruff check .
fi

# ---- Rust ------------------------------------------------------------------
if [ -f Cargo.toml ] && have cargo; then
  detected=1
  [ -z "$skip_build" ] && record "cargo: build" cargo build --quiet
  [ -z "$skip_tests" ] && record "cargo: test"  cargo test --quiet
  [ -z "$skip_lint" ]  && record "cargo: clippy" cargo clippy --quiet
fi

# ---- Go --------------------------------------------------------------------
if [ -f go.mod ] && have go; then
  detected=1
  [ -z "$skip_build" ] && record "go: build" go build ./...
  [ -z "$skip_tests" ] && record "go: test"  go test ./...
  [ -z "$skip_lint" ]  && record "go: vet"   go vet ./...
fi

if [ "$detected" -eq 0 ]; then
  echo "    --   no known stack detected under $root — run this repo's build/test/lint manually."
  exit 3
fi

echo ""
if [ "$fails" -gt 0 ]; then
  echo "RESULT: FAIL ($fails stage(s))"
  exit 1
fi
echo "RESULT: PASS"
exit 0
