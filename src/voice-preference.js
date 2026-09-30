// Persist the user's preference, not a temporary playback fallback.
export function resolveVoicePreference(preferred, voices, deleted = []) {
  const removed = preferred && deleted.includes(preferred);
  const available = voices.filter(v => v.localService && !deleted.includes(v.value));
  const selected = available.find(v => v.value === preferred);
  const fallback = available.find(v => v.engine === 'gpt-sovits');
  const effective = selected?.value || fallback?.value || '';
  return {
    preferred: removed || !preferred ? effective : preferred,
    effective,
    reason: removed ? 'deleted' : preferred && !selected ? 'temporary' : 'ready',
  };
}
