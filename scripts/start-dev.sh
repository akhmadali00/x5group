#!/bin/bash
# mahalliy sinov: baza + Next dev server (foydalanilmaydi Vercel'da)
cd "$(dirname "$0")/.."
cat /tmp/next.pid 2>/dev/null | xargs -r kill 2>/dev/null
setsid nohup npx next dev -p 3100 > /tmp/next.log 2>&1 < /dev/null &
echo $! > /tmp/next.pid
