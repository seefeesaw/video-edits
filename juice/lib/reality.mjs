// Hard reality rules: what the camera sees must be physically possible and consistent from shot to
// shot (a glass packed with 40 ice balls can't hold 15 a few shots later). Used by keyframes.mjs (first
// frames), sora.mjs (the motion) and reality.mjs (the check).
//
// video.json:
//   "physics": ["<rules only this video needs>", …]                (optional, added to the universal ones)
//   shot "state": { "start": "<exact physical state when the shot begins>", "end": "<…when it ends>" }
//     Name every container's contents with counts/levels, what is open or closed, what is in which hand.
//     A shot's start must equal the previous shot's end (same setup or not), unless the original video
//     itself skips time between them. Jump cuts cut from another shot's take ("takes": 0) inherit it.

export const RULES = [
  'Everything obeys real-world physics and stays consistent; it must look filmed, not generated.',
  'Objects never appear, vanish, duplicate, merge, shrink, grow or change shape, colour, material or count unless the action visibly causes it. Things poured into a container stay in it.',
  'Counts and levels only change through a visible action: a container fills only while something is poured in and empties only while something is poured or drunk out; a level never drops by itself, and solid pieces (ice balls, fruit) keep their number and size.',
  'Liquids pour in a continuous stream, splash, foam and settle with gravity; bubbles rise; ice floats (a glass packed with ice may lift slightly as one block when water fills it, leaving a thin water layer at the bottom); nothing melts or dissolves in seconds unless stated.',
  'Rigid objects (glasses, bottles, jars, lids, mugs) keep their exact shape, proportions, label and printed text in every frame; labels never morph or change wording.',
  'Hands have five fingers with natural joints and nails, grip objects with real contact and move at human speed; nothing hovers without support.',
  'Light, shadows, reflections and refraction stay consistent with the room; the camera behaves like a phone held by a person (no warping, morphing, melting textures or impossible camera moves).',
];

export function realityText(spec, shot, { still = false } = {}) {
  const rules = [...RULES, ...(spec.physics || [])];
  const st = stateOf(spec, shot);
  const parts = [`PHYSICAL REALITY (hard rules): ${rules.join(' ')}`];
  if (st?.start) parts.push(still ? `Exact physical state in this frame: ${st.start}` : `Physical state at the start: ${st.start}`);
  if (st?.end && !still) parts.push(`Physical state at the end: ${st.end}. Only the described action changes anything between the two; everything else stays exactly as it is.`);
  return parts.join('\n');
}

// a jump-cut shot ("takes": 0, "clip" from another shot) uses the state of the shot that made the clip
export function stateOf(spec, shot, { slot = false } = {}) {
  // slot: describe only the part of the take THIS shot shows: a lead shot whose take continues in later
  // jump cuts shows only the start of the action, so its stated end belongs to the last of them
  if (shot.state && slot && spec.shots.some((s) => s.takes === 0 && s.clip?.startsWith(`clips/${shot.id}.`))) return { start: shot.state.start, end: `the action has only begun (it continues in the next shots, toward: ${shot.state.end})` };
  if (shot.state) return shot.state;
  if (shot.takes === 0 && shot.clip) {
    // a jump cut is a later moment of the same action: it continues from the previous shot and heads
    // for the lead shot's end state (giving it the lead's START would claim the action reset)
    const lead = spec.shots.find((s) => s.takes && shot.clip.startsWith(`clips/${s.id}.`));
    return lead?.state && { start: `continues exactly from the previous shot (a later moment of the same action as ${lead.id})`, end: `on the way to: ${lead.state.end}` };
  }
  return null;
}
