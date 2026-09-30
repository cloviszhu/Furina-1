// Presentation adapter only. No endpoint names or backend episode fields live
// here. Integration supplies list/revise/remove after its contract is agreed.
export class NaturalMemoryControls {
  constructor({ adapter, onBeforeMutation = () => {}, onMutation = () => {} } = {}) {
    Object.assign(this, { adapter, onBeforeMutation, onMutation });
    this.listeners = new Set(); this.generation = 0;
    this.state = { phase: adapter ? 'ready' : 'unconnected', rows: [], edit: null, deleting: null, pending: null, error: '' };
  }
  subscribe(listener) { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  update(patch) { if (this.disposed) return; this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(this.state); }
  async load() {
    if (!this.adapter || this.state.pending || this.disposed) return;
    const generation = ++this.generation;
    this.readController?.abort(); this.readController = new AbortController();
    const controller = this.readController;
    this.update({ phase: 'loading', error: '' });
    try {
      const rows = await this.adapter.list({ signal: controller.signal });
      if (generation !== this.generation || controller.signal.aborted) return;
      if (!Array.isArray(rows) || new Set(rows.map(r => r.key)).size !== rows.length || rows.some(r => typeof r.key !== 'string' || !r.key || typeof r.text !== 'string')) throw Error('记忆列表格式无效，请重新载入。');
      // Never overwrite a draft with a late list snapshot.
      this.update({ rows, phase: 'ready' });
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted) this.update({ phase: 'error', error: error.message || '记忆暂时无法载入。' });
    }
  }
  edit(key) {
    if (this.state.pending || (this.state.edit && this.state.edit.key !== key)) return;
    const row = this.state.rows.find(r => r.key === key); if (!row) return;
    this.update({ edit: { key, draft: row.text }, deleting: null, error: '' });
  }
  draft(text) { if (this.state.edit && !this.state.pending) this.state.edit.draft = text; }
  cancel() { if (!this.state.pending) this.update({ edit: null, deleting: null, error: '' }); }
  confirmDelete(key) {
    if (!this.state.pending && !this.state.edit && this.state.rows.some(r => r.key === key)) this.update({ deleting: key, edit: null, error: '' });
  }
  save() {
    const edit = this.state.edit;
    if (!edit?.draft.trim()) { this.update({ error: '请填写纠正后的记忆。' }); return; }
    return this.mutate('revise', edit.key, edit.draft);
  }
  remove() { if (this.state.deleting) return this.mutate('remove', this.state.deleting); }
  async mutate(operation, key, text) {
    if (!this.adapter || this.state.pending) return;
    // Supersede an in-flight list before beginning an explicit mutation.
    ++this.generation; this.readController?.abort();
    const controller = new AbortController(); this.mutationController = controller;
    const generation = this.generation;
    this.update({ pending: { operation, key }, error: '' });
    try {
      await this.onBeforeMutation();
      if (controller.signal.aborted) return;
      if (operation === 'revise') await this.adapter.revise(key, text, { signal: controller.signal });
      else await this.adapter.remove(key, { signal: controller.signal });
      if (generation !== this.generation || controller.signal.aborted) return;
      this.update({ edit: null, deleting: null, pending: null });
      // The operation succeeded. A subsequent refresh failure must not suggest
      // that the write failed or invite the user to repeat the mutation.
      try { await this.onMutation(); } catch { this.update({ error: '记忆已更新，相关内容刷新失败，请重新载入。' }); }
      await this.load();
    } catch (error) {
      if (generation === this.generation && !controller.signal.aborted) this.update({ phase: 'ready', pending: null, error: error.message || '操作未完成，请重试。' });
    }
  }
  dispose() {
    this.disposed = true; ++this.generation; this.readController?.abort(); this.mutationController?.abort(); this.listeners.clear();
  }
}

export function mountNaturalMemoryControls(container, controller) {
  const document = container.ownerDocument;
  const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
  const unsubscribe = controller.subscribe(state => {
    container.replaceChildren();
    container.append(node('h3', '自动整理的共同经历'), node('p', '交谈中整理出的记忆会显示在这里。你可以查看来源、纠正或删除。'));
    if (state.phase === 'unconnected') { container.append(node('p', '自动记忆管理尚未连接。')); return; }
    const status = node('p', state.error || (state.phase === 'loading' ? '正在载入记忆…' : ''), 'error');
    status.setAttribute('role', state.error ? 'alert' : 'status'); container.append(status);
    const refresh = node('button', '重新载入'); refresh.type = 'button'; refresh.disabled = Boolean(state.pending) || state.phase === 'loading'; refresh.onclick = () => void controller.load(); container.append(refresh);
    if (!state.rows.length && state.phase === 'ready') container.append(node('p', '还没有自动整理的共同经历。', 'empty'));
    for (const row of state.rows) {
      const card = node('article', undefined, 'memory-card'); card.dataset.memoryKey = row.key;
      card.append(node('p', row.text));
      if (row.updatedLabel) card.append(node('small', row.updatedLabel));
      if (row.evidence?.length) {
        const details = node('details'); details.append(node('summary', '查看来源'));
        for (const evidence of row.evidence) { if (evidence.label) details.append(node('small', evidence.label)); details.append(node('p', evidence.text)); }
        card.append(details);
      }
      const button = (label, callback) => { const n = node('button', label); n.type = 'button'; n.disabled = Boolean(state.pending) || Boolean((state.edit || state.deleting) && row.key !== (state.edit?.key || state.deleting)); n.onclick = callback; return n; };
      if (state.edit?.key === row.key) {
        const draft = node('textarea'); draft.value = state.edit.draft; draft.disabled = Boolean(state.pending);
        draft.setAttribute('aria-label', '纠正这条记忆'); draft.oninput = () => controller.draft(draft.value);
        card.append(draft, button(state.pending ? '正在保存…' : '保存纠正', () => void controller.save()), button('取消', () => controller.cancel()));
      } else if (state.deleting === row.key) {
        card.append(node('p', '删除这条记忆？'), button(state.pending ? '正在删除…' : '确认删除', () => void controller.remove()), button('取消', () => controller.cancel()));
      } else card.append(button('纠正', () => controller.edit(row.key)), button('删除', () => controller.confirmDelete(row.key)));
      container.append(card);
    }
  });
  return () => { unsubscribe(); controller.dispose(); container.replaceChildren(); };
}
