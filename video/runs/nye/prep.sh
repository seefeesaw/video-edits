#!/usr/bin/env bash
# NYE batch prep: restage + bible + keyframes + keyframe sheet for each run (image model only, no Sora)
N="/c/Program Files/nodejs/node.exe"
prev=videos/r10-brown-library
for f in runs/nye/[0-9]*.json; do
  b=$(basename $f .json); n=${b:0:2}; v=$(echo $b | cut -d- -f2); s=$(echo $b | cut -d- -f3)
  D=videos/nye$n-$v-$s
  [ -f $D/video.json ] || "$N" tools/restage.mjs templates/nye.json $D $f --from $prev > /dev/null
  "$N" bible.mjs $D > $D/bible.log 2>&1
  "$N" keyframes.mjs $D > $D/keyframes.log 2>&1
  (cd $D/assets/keyframes && ffmpeg -v error -y $(for k in s1 s2 s3 s4 s5 s6 s7 s8; do echo -i $k.720x1280.png; done) -filter_complex "$(for i in 0 1 2 3 4 5 6 7; do printf "[$i]scale=270:480[k$i];"; done)[k0][k1][k2][k3]hstack=4[t];[k4][k5][k6][k7]hstack=4[u];[t][u]vstack" ../../out/kf-sheet.jpg)
  echo "PREP $D $(grep -c '^keyframe' $D/keyframes.log)"
  prev=$D
done
echo ALLPREP
