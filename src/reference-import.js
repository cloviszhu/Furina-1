export function initReferences({ api, speech, voices }) {
  const $ = id => document.getElementById(id);
  let pending, working = false, channel, profiles = [], deletions = [];
  const note = text => { $('reference-state').textContent = text; };
  const clearPreview = () => { $('reference-preview').pause(); $('reference-preview').removeAttribute('src'); $('reference-preview').load(); $('reference-confirmation').hidden = true; $('reference-listened').checked = false; pending = null; };
  const controls = () => {
    $('reference-file').disabled = working; $('reference-check').disabled = working; $('reference-confirm').disabled = working || !pending; $('reference-discard').disabled = working;
    for (const id of ['reference-manage-profile', 'reference-manage-emotion', 'reference-deleted']) $(id).disabled = working;
    const p = profiles.find(p => p.id === $('reference-manage-profile').value);
    $('reference-delete-profile').disabled = working || !p;
    $('reference-delete-expression').disabled = working || !p || !p.emotions.includes($('reference-manage-emotion').value) || $('reference-manage-emotion').value === 'neutral';
    $('reference-restore').disabled = working || !deletions.find(d => d.id === $('reference-deleted').value && d.canRestore);
  };
  const managementNote = text => { $('reference-management-state').textContent = text; };
  const selectionNote = () => `当前选择：${$('voice-select').selectedOptions[0]?.textContent || '无可用声线'} / ${$('voice-emotion').value || 'neutral'}。`;
  function managementEmotions() {
    const previous = $('reference-manage-emotion').value, p = profiles.find(p => p.id === $('reference-manage-profile').value);
    $('reference-manage-emotion').replaceChildren(...(p?.emotions || []).map(e => new Option(e, e)));
    if (p?.emotions.includes(previous)) $('reference-manage-emotion').value = previous;
    controls();
  }
  const discard = async () => { const old = pending; clearPreview(); if (old) await api(`/api/reference-imports/${old.token}`, { method: 'DELETE' }); controls(); };
  async function refresh() {
    const [result, removed] = await Promise.all([api('/api/reference-profiles'), api('/api/reference-deletions')]);
    profiles = result.profiles.filter(p => p.managed && p.speakerId); deletions = removed.deletions;
    const previousManaged = $('reference-manage-profile').value, previousDeleted = $('reference-deleted').value;
    $('reference-manage-profile').replaceChildren(...(profiles.length ? profiles.map(p => new Option(`${p.label} · ${p.id}`, p.id)) : [new Option('暂无已导入声线', '')]));
    if (profiles.some(p => p.id === previousManaged)) $('reference-manage-profile').value = previousManaged;
    $('reference-deleted').replaceChildren(...(deletions.length ? deletions.map(d => new Option(`${d.label} / ${d.emotion || '整个声线'}${d.canRestore ? '' : '（当前登记冲突）'}`, d.id)) : [new Option('暂无删除记录', '')]));
    if (deletions.some(d => d.id === previousDeleted)) $('reference-deleted').value = previousDeleted;
    managementEmotions();
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
  $('reference-manage-profile').onchange = managementEmotions;
  $('reference-manage-emotion').onchange = controls;
  $('reference-deleted').onchange = controls;
  async function manage(operation) {
    if (working) return;
    const profileId = $('reference-manage-profile').value, emotion = $('reference-manage-emotion').value, deletionId = $('reference-deleted').value;
    const target = operation === 'restore' ? deletions.find(d => d.id === deletionId) : profiles.find(p => p.id === profileId);
    if (!target) return;
    const description = operation === 'restore' ? '恢复所选声线／表达（不会覆盖现有登记）' : `删除 ${target.label} / ${operation === 'expression' ? emotion : '整个声线'}，停止本页播放并解绑，保留本地恢复副本`;
    if (!globalThis.confirm(`${description}？原始录音与内置声线不变。`)) return;
    working = true; controls(); managementNote('正在更新登记，请等待…'); speech.stop(); $('reference-preview').pause();
    try {
      const result = operation === 'restore'
        ? await api(`/api/reference-deletions/${deletionId}/restore`, { method: 'POST', body: JSON.stringify({ confirmed: true }) })
        : await api(`/api/reference-profiles/${profileId}`, { method: 'DELETE', body: JSON.stringify({ confirmed: true, ...(operation === 'expression' ? { emotion } : {}) }) });
      await voices({ deletedProfileId: operation === 'profile' ? result.profileId : undefined, deletedExpression: operation === 'expression' ? result : undefined });
      await discard(); await refresh(); $('reference-profile').dispatchEvent(new Event('change'));
      channel?.postMessage({ type: 'references-mutated', operation, profileId: result.profileId, emotion: result.emotion });
      managementNote(`${operation === 'restore' ? '已恢复' : '已删除并解绑，可从删除记录恢复'}。${selectionNote()}${result.warning || ''}`);
    } catch (error) { managementNote(`操作未完成：${error.message} ${selectionNote()}`); }
    finally { working = false; controls(); }
  }
  $('reference-delete-profile').onclick = () => { void manage('profile'); };
  $('reference-delete-expression').onclick = () => { void manage('expression'); };
  $('reference-restore').onclick = () => { void manage('restore'); };
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
  try { channel = new BroadcastChannel('exo-reference-mutations'); channel.onmessage = e => { if (e.data?.type === 'references-mutated') {
    speech.stop();
    void (async () => {
      const affectedDraft = e.data.operation && $('reference-profile').value === e.data.profileId;
      if (affectedDraft) await discard();
      await voices({ deletedProfileId: e.data.operation === 'profile' ? e.data.profileId : undefined, deletedExpression: e.data.operation === 'expression' ? e.data : undefined });
      await refresh(); if (affectedDraft) $('reference-profile').dispatchEvent(new Event('change'));
      if (e.data.operation) managementNote(`另一标签页已更新登记。${selectionNote()}`);
    })().catch(error => note(error.message));
  } }; } catch { /* Refresh voices remains available. */ }
  globalThis.addEventListener('pagehide', () => { $('reference-preview').pause(); channel?.close(); });
  controls();
}
