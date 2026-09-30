export function initReferences({ api, speech, voices }) {
  const $ = id => document.getElementById(id);
  let pending, working = false, channel;
  const note = text => { $('reference-state').textContent = text; };
  const clearPreview = () => { $('reference-preview').pause(); $('reference-preview').removeAttribute('src'); $('reference-preview').load(); $('reference-confirmation').hidden = true; $('reference-listened').checked = false; pending = null; };
  const controls = () => { $('reference-file').disabled = working; $('reference-check').disabled = working; $('reference-confirm').disabled = working || !pending; $('reference-discard').disabled = working; };
  const discard = async () => { const old = pending; clearPreview(); if (old) await api(`/api/reference-imports/${old.token}`, { method: 'DELETE' }); controls(); };
  async function refresh() {
    const result = await api('/api/reference-profiles');
    const selected = $('reference-profile').value;
    $('reference-profile').replaceChildren(new Option('新建声线（先导入 neutral）', ''));
    for (const p of result.profiles) if (p.managed && p.speakerId) {
      const option = new Option(`${p.label} · ${p.id} · ${p.emotions.join('/')}`, p.id); option.dataset.speaker = p.speakerId; option.dataset.label = p.label;
      $('reference-profile').append(option);
    }
    if ([...$('reference-profile').options].some(o => o.value === selected)) $('reference-profile').value = selected;
    if (result.error) note(result.error);
  }
  $('reference-profile').onchange = () => {
    const option = $('reference-profile').selectedOptions[0], existing = Boolean(option.value);
    $('reference-id').readOnly = existing; $('reference-speaker').readOnly = existing; $('reference-label').readOnly = existing;
    $('reference-id').value = option.value; $('reference-speaker').value = option.dataset.speaker || ''; $('reference-label').value = option.dataset.label || '';
    $('reference-same-speaker').checked = false;
  };
  $('reference-file').onchange = () => { void discard().catch(e => note(e.message)); note('新录音尚未检查；选择文件不会登记或训练。'); };
  $('reference-check').onclick = async () => {
    if (working) return;
    working = true; controls();
    try {
      await discard();
      const file = $('reference-file').files[0];
      if (!file || !/\.wav$/i.test(file.name)) throw Error('请选择你有权使用的 PCM16 .wav 文件。');
      if (file.size > 4 * 1024 * 1024) throw Error('参考录音最多 4 MiB。');
      const result = await api('/api/reference-imports', { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: file });
      pending = result; $('reference-preview').src = result.previewUrl; $('reference-confirmation').hidden = false;
      const r = result.report;
      note(`检查通过：${r.seconds.toFixed(2)} 秒 · ${Math.round(r.bytes / 1024)} KiB · ${r.inputRate} Hz / ${r.inputChannels} 声道 → 32000 Hz / 单声道；RMS ${r.rmsDb} dBFS，静音 ${(r.silenceRatio * 100).toFixed(1)}%，削波 0。${r.warnings.join(' ')} 预览十分钟后过期；尚未登记。`);
      await refresh();
    } catch (error) { note(error.message); }
    finally { working = false; controls(); }
  };
  $('reference-confirm').onclick = async () => {
    if (working || !pending) return;
    working = true; controls(); speech.stop(); $('reference-preview').pause();
    try {
      const result = await api(`/api/reference-imports/${pending.token}`, { method: 'POST', body: JSON.stringify({
        profileId: $('reference-id').value.trim(), speakerId: $('reference-speaker').value.trim(), label: $('reference-label').value.trim(),
        source: $('reference-source').value.trim(), license: $('reference-license').value.trim(), text: $('reference-text').value.trim(),
        language: $('reference-language').value, emotion: $('reference-emotion').value, usageAllowed: $('reference-rights').checked,
        previewConfirmed: $('reference-listened').checked, sameSpeakerConfirmed: $('reference-same-speaker').checked,
      }) });
      clearPreview(); $('reference-file').value = ''; $('reference-rights').checked = false; $('reference-same-speaker').checked = false;
      await refresh(); $('reference-profile').value = result.profileId; $('reference-profile').dispatchEvent(new Event('change')); await voices();
      const voice = `neural:${result.profileId}`;
      if (speech.voices.some(v => v.value === voice)) { $('voice-select').value = voice; $('voice-select').dispatchEvent(new Event('change')); $('voice-emotion').value = result.emotion; $('voice-emotion').dispatchEvent(new Event('change')); }
      channel?.postMessage({ type: 'references-mutated' });
      note(`已登记 ${result.profileId} / ${result.emotion}。TTS 可达时已选中该声线；可试听一句。相似度与人工听感尚待你验收。`);
    } catch (error) { note(error.message); }
    finally { working = false; controls(); }
  };
  $('reference-discard').onclick = () => { void discard().then(() => note('已放弃预览；未登记。')).catch(e => note(e.message)); };
  $('reference-preview').onplay = () => { speech.stop({ preservePreview: true }); };
  $('reference-preview').onerror = () => { if (pending) note('预览无法读取或已过期，请重新检查录音；尚未登记。'); };
  $('settings').addEventListener('close', () => $('reference-preview').pause());
  $('open-references').onclick = async () => { $('settings').showModal(); $('reference-tools').open = true; await refresh().catch(e => note(e.message)); $('reference-tools').scrollIntoView({ block: 'start' }); };
  $('reference-tools').addEventListener('toggle', () => { if ($('reference-tools').open) void refresh().catch(e => note(e.message)); });
  try { channel = new BroadcastChannel('exo-reference-mutations'); channel.onmessage = e => { if (e.data?.type === 'references-mutated') { speech.stop(); void Promise.all([refresh(), voices()]).catch(error => note(error.message)); } }; } catch { /* Refresh voices remains available. */ }
  globalThis.addEventListener('pagehide', () => { $('reference-preview').pause(); channel?.close(); });
  controls();
}
