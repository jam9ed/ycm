#!/usr/bin/env bash
# Headless smoke tests. Needs jsdom:  npm i -D jsdom
set -e
cd "$(dirname "$0")"
fail=0
for t in t-video.js t-config.js t-reconcile.js t-public.js t-links.js t-admin.js t-integration.js; do
  echo "── $t ─────────────────────────────────────────"
  node "$t" || fail=1
  echo
done
exit $fail
