# usage: sh runs/nye/next.sh <done-video> <next-video>: waits for the done video's Sora run, starts the next one
until grep -q "^EXIT" videos/$1/sora.log 2>/dev/null; do sleep 10; done
[ -n "$2" ] && { D=videos/$2; ("/c/Program Files/nodejs/node.exe" sora.mjs $D > $D/sora.log 2>&1; echo "EXIT $?" >> $D/sora.log) & echo "started $2"; }
tail -1 videos/$1/sora.log
