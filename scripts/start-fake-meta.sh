#!/bin/bash
cd "$(dirname "$0")/.."
[ -f /tmp/fakemeta.pid ] && kill "$(cat /tmp/fakemeta.pid)" 2>/dev/null
setsid nohup node scripts/fake-meta.mjs 54402 > /tmp/fakemeta.log 2>&1 < /dev/null &
echo $! > /tmp/fakemeta.pid
