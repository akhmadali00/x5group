#!/bin/bash
cd "$(dirname "$0")/.."
[ -f /tmp/faketg.pid ] && kill "$(cat /tmp/faketg.pid)" 2>/dev/null
setsid nohup node scripts/fake-telegram.mjs 54400 > /tmp/faketg.log 2>&1 < /dev/null &
echo $! > /tmp/faketg.pid
