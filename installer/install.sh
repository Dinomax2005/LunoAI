#!/usr/bin/env bash
# Source-checkout installer: no optional activity without explicit CLI flags.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
python_bin="${LUNO_PYTHON:-python3}"
exec "$python_bin" -m luno_desktop setup "$@"
