#!/bin/bash
# Compatibility entry point; use node scripts/install.js on any platform.
set -euo pipefail
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js is required. Install Node.js, then run node plugins/usage-limits/scripts/install.js.' >&2
  exit 1
fi
exec node "$(cd "$(dirname "$0")" && pwd)/install.js"
