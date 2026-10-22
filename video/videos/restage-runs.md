# Restage runs of shorts/uMl76XX7epo ("I love this mug!!")

| # | video | variant | setting | hook | result |
|---|---|---|---|---|---|
| — | love-brown | brown | dining table | When the nights get cozy and it's / officially Harry Potter season | replica, comp 88.4, 7/7 cuts |
| — | oneshot-lovered | red | tray on a sofa | (same) | one-shot, comp 86.7 after push fix |
| — | oneshot2-lovewhite | white | window-seat nook | (same) | one-shot comp 88.9; fix: s2 empty-mug + s8 product-visible spill prompts |
| 01 | r01-brown-kitchen | brown | kitchen island | When the air turns crisp and it's / finally Harry Potter season | one-shot comp 90.1, 7/7 cuts, no fix |
| 02 | r02-red-bedside | red | bedside table | When it's cold outside and it feels / like Harry Potter season again | one-shot comp 86.3, 7/7 cuts; fix: s2 hold (Sora lit a candle in the empty mug), s4 empty-window line |
| 03 | r03-white-fireplace | white | fireside coffee table | When the evenings get darker and / it's Harry Potter season at last | one-shot comp 89.2, 7/7 cuts, no fix |
| 04 | r04-brown-study | brown | study desk | When sweater weather hits and it's / officially Harry Potter season | one-shot comp 87.9, 7/7 cuts; fix: s7 retimed to the take's real exit (v1 teleported = extra cut, v2 used); compare reports EXTRA cuts |
| 05 | r05-red-floor | red | floor picnic on a rug | When the rain starts and it feels / like it's Harry Potter season | one-shot comp 87.7, 7/7 cuts; fix: sora.mjs retries HTTP 408/5xx on create (a timeout dropped a take) |
| 06 | r06-white-nook | white | breakfast nook | When the first frost hits and it's / suddenly Harry Potter season | one-shot comp 88.4 (extra cut in s7: Sora took the board away on frame 1 in both takes); fix: 2 more s7 takes, template now makes 3 s7 takes |
| 07 | r07-brown-ottoman | brown | ottoman tray | When the candles come out and it's / officially Harry Potter season | one-shot comp 86.6 (spill invisible on the brown mug, bigger spills buried it); fix: s8 prompt asks for streams + a puddle, front lettering visible |
| 08 | r08-red-attic | red | attic loft desk | When autumn finally arrives and / it's Harry Potter season again | one-shot comp 88.4, 7/7 cuts, no fix (3rd s7 take used; new spill wording worked) |
| 09 | r09-white-sunroom | white | sunroom side table | When the nights get longer and it / feels like Harry Potter season | one-shot comp 91.2 (best), 7/7 cuts; fix: --pick skips takes with no green screen (crashed), s7 retimed off a jump (EXTRA cut) |
| 10 | r10-brown-library | brown | library side table | When it's cozy blanket weather and / time for Harry Potter season | one-shot comp 87.9 (last dip didn't spill); fix: s8 keyframe already overflowing (streams + puddle) → comp 87.8 with a clear spill |

# Restage runs of shorts/Su66AMPolD0 ("you + me?") — 2 takes per shot

| # | video | variant | setting | hook | result |
|---|---|---|---|---|---|
| 01 | m3r01-red-vanity | red | dressing table | movie night / season is coming. | one-shot comp 87.0, 7/7 cuts; s7 board static (both takes dropped it on frame 1) |
| 02 | m3r02-white-floor | white | low floor table | cozy film / season is here. | one-shot comp 86.8, 7/7 cuts; fix: reworded hook lines centred at the original size (the fit box squeezed the shorter line) |
| 03 | m3r03-brown-bar | brown | black granite breakfast bar | holiday movie / season is back. | one-shot comp 86.3, 7/7 cuts, no fix |
| 04 | m3r04-red-xmas | red | festive dining table | christmas film / season is coming. | one-shot comp 85.9, 7/7 cuts; s4 keyframe regenerated (no lighter), s7 retimed past two jumps |
| 05 | m3r05-white-bench | white | bench at the foot of the bed | home movie / season is here. | one-shot comp 86.6, 7/7 cuts, no fix |
| 06 | m3r06-brown-media | brown | media-room console | snowy night / season is coming. | one-shot comp 86.3, 7/7 cuts, no fix |
| 07 | m3r07-red-farm | red | farmhouse kitchen table | festive film / season is back. | one-shot comp 85.9, 7/7 cuts; fix: s4 both takes replaced with a 'lit within half a second' prompt (neither lit the tealight); s2 holds its first 0.1 s (candle appeared at 0.15 s) |
| 08 | m3r08-white-cabin | white | log-cabin coffee table | cozy movie / season is coming. | one-shot comp 87.8, 7/7 cuts, no fix |
| 09 | m3r09-brown-city | brown | smoked-glass table, city apartment | holiday film / season is here. | one-shot comp 85.4, 7/7 cuts; fix: screen "despill" (the glass table reflected the green screen) |
| 10 | m3r10-red-boho | red | boho rattan side table | fireside movie / season is coming. | one-shot comp 86.0, 7/7 cuts, no fix |

# New Year's Eve restages of shorts/uMl76XX7epo (templates/nye.json, runs/nye/) — 2 takes per shot

| # | video | variant | setting | hook | result |
|---|---|---|---|---|---|
| 01 | nye01-red-countdown | red | countdown party table | When it's almost midnight and it's / officially fondue o'clock | one-shot comp 86.0, 7/7 cuts; s4 from 1.4 (both takes lit the tealight late, ~1.2 s) |
| 02 | nye02-white-champagne | white | champagne coffee table | When the year is almost over and / the countdown starts at home | one-shot comp 88.2, 7/7 cuts, no fix (s7 v2: v1 emptied the board before it left) |
| 03 | nye03-brown-fireworks | brown | marble table by a fireworks window | When the fireworks start and / it's the last night of the year | one-shot comp 90.1, 7/7 cuts, no fix |
| 04 | nye04-red-gold | red | black dining table, gold candelabras | When it's New Year's Eve and / the best plans are at home | one-shot comp 86.6, 7/7 cuts, no fix (s4 v1: v2 lit the mug's empty window) |
| 05 | nye05-white-nye | white | tray on a green velvet sofa | When everyone's out partying and / I'm in with my fondue mug | one-shot comp 87.6, 7/7 cuts, no fix (s4/s7 v1 chosen by action: the torch touches the wick, the board leaves) |
| 06 | nye06-brown-rooftop | brown | teak table by an open balcony door | When the city counts down and / my fondue is ready first | one-shot comp 86.3, 7/7 cuts, no fix (s7 v2: v1 had an empty board + a jump) |
| 07 | nye07-red-silver | red | gold mirrored bar cart | When the clock hits eleven and / it's time for the last treat of the year | one-shot comp 86.4, 7/7 cuts; s7 v1 slowed to speed 0.9 so the reversed entrance stops before the take's jump at 0.43 s (v2 moved the board the wrong way) |
| 08 | nye08-white-snowy | white | rustic pine table, snowy cabin window | When it's snowing on New Year's Eve and / we're staying in for fondue | one-shot comp 87.4, 7/7 cuts; keyframes rerun (first run wrote none); s8 v2 (v1 never spilled), s4 v2 lights on camera, s7 v1 (v2 teleported) |
| 09 | nye09-brown-glitter | brown | white glitter desk, gold sequin wall | When the new year is minutes away / and the fondue is melting | one-shot comp 89.6, 7/7 cuts, no fix (s7 v2: v1 had an empty board) |
| 10 | nye10-red-kitchen | red | black slate kitchen counter at midnight | When the clock strikes twelve and / the first bite of the year is fondue | one-shot comp 86.8, 7/7 cuts; s5 v1 (v2's tealight flickered out right after s4 lit it), s7 speed 1.75 (v1's board exits slowly) |
