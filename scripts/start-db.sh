#!/bin/bash
cd "$(dirname "$0")/.."
[ -f /tmp/devdb.pid ] && kill "$(cat /tmp/devdb.pid)" 2>/dev/null
sleep 1
setsid nohup node scripts/dev-db.mjs 54329 > /tmp/devdb.log 2>&1 < /dev/null &
echo $! > /tmp/devdb.pid
