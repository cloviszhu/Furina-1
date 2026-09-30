// Original procedural choreography. No downloaded/copyrighted motion assets.
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
export const ease = value => { const x = clamp(value, 0, 1); return x * x * x * (x * (x * 6 - 15) + 10); };
export function gestureWeight(elapsed, end = 3.6) {
  return ease(elapsed / .85) * (1 - ease((elapsed - (end - 1.2)) / 1.2));
}
// Different channels have independent periods/phases; feet/root remain planted.
export function motionFrame({ time: t, mode = 'idle', modeElapsed = 0, expression = 'neutral', action, elapsed = 0, mouth = 0, gazeYaw = 0, gazePitch = 0 }) {
  const listening = mode === 'listening', speaking = mode === 'speaking';
  const quiet = expression === 'sad' ? .45 : expression === 'calm' ? .75 : 1;
  const breath = Math.sin(t * 1.28) * quiet, settle = Math.sin(t * .39 + .8) * quiet;
  const interest = listening ? .025 * quiet : 0;
  const yaw = clamp(gazeYaw, -.14, .14), pitch = clamp(gazePitch, -.065, .065);
  const w = action ? gestureWeight(elapsed, action === 'nod' ? 2 : 3.6) : 0;
  const greet = action === 'greet' ? w : 0;
  const wave = ease((elapsed - .9) / .2) * (1 - ease((elapsed - 2.2) / .35)) * Math.sin((elapsed - .9) * 5.2);
  // One deliberate acknowledgement, rather than an indefinitely bobbing head.
  const nod = action === 'nod' ? Math.sin(Math.PI * clamp(elapsed / 1.25, 0, 1)) * .10 * w : 0;
  const speechAccent = speaking ? gestureWeight(modeElapsed, 2.8) : 0;
  const bones = {
    '上半身': [.008 * breath + interest, yaw * .14 + .009 * settle, .007 * Math.sin(t * .52 + 1.2) * quiet],
    '上半身2': [-.005 * Math.sin(t * 1.28 - .45), yaw * .18, -.004 * settle],
    '首': [pitch * .25 + nod * .25, yaw * .22, -.012 * settle],
    '頭': [pitch * .5 + nod * .75 + .006 * Math.sin(t * .61 + 1.6) * quiet + (expression === 'sad' ? .018 : expression === 'happy' ? -.018 * speechAccent : 0), yaw * .46 + .012 * Math.sin(t * .31) * (listening ? .25 : quiet), .014 * settle + greet * .025],
    '両目': [pitch * .25, yaw * .35 + .008 * Math.sin(t * .83 + .6) * (listening ? .25 : 1), 0],
    '右肩': [0, 0, -.012 * breath - .045 * greet],
    '左肩': [0, 0, .009 * Math.sin(t * 1.28 - .2)],
    '右腕': [-.10 - .04 * greet, -.03 - .05 * greet, .84 - .44 * greet - .025 * speechAccent + .005 * breath],
    '左腕': [-.06, .025, -.92 + .006 * Math.sin(t * 1.28 + .7)],
    '右ひじ': [0, .28 - .13 * greet + .09 * speechAccent, .06 - 2.46 * greet - .11 * speechAccent],
    '左ひじ': [0, -.22, -.06],
    '右手首': [.04 + .06 * greet, .025 * greet, -.035 + greet * .08 * wave],
    '左手首': [.025, 0, .035],
  };
  // Fingers loosen slightly in rest; open during greeting. Missing bones are skipped.
  for (const side of ['右', '左']) for (const finger of ['人指', '中指', '薬指', '小指']) {
    for (const joint of ['１', '２', '３']) bones[`${side}${finger}${joint}`] = [0, 0, (side === '右' ? -1 : 1) * .09 * (side === '右' ? 1 - greet : 1)];
  }
  // Uneven but reproducible blink intervals; rapid closure, slower opening.
  const blinkTimes = [2.1, 6.8, 10.2, 15.6, 19.1, 23.5, 28.8];
  let blink = 0;
  for (const at of blinkTimes) {
    const phase = (t % 31.7) - at;
    if (phase >= 0 && phase < .24) blink = phase < .075 ? ease(phase / .075) : 1 - ease((phase - .075) / .165);
  }
  return { bones, morphs: {
    'まばたき': blink, 'あ': clamp(mouth, 0, 1) * .6, 'い': clamp(mouth, 0, 1) * .10, 'う': clamp(mouth, 0, 1) * .08,
    'にこり': expression === 'happy' ? .28 : expression === 'calm' ? .10 : .04 * greet,
    '悲しむ': expression === 'sad' ? .18 : 0, '困る': expression === 'sad' ? .12 : 0,
    '怒り目': expression === 'angry' ? .20 : 0, '怒り': expression === 'angry' ? .18 : 0,
    'びっくり': expression === 'surprised' ? .22 : 0,
  } };
}
