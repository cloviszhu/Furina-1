// A fixed serial run, started only by a user click. Credentials never enter reports/storage.
export class BoundedTestRunner {
  constructor({ request, onUpdate = () => {}, onBudget = () => {} }) {
    Object.assign(this, { request, onUpdate, onBudget, generation: 0, running: false, rows: [], state: 'idle' });
  }
  async start(config, character) {
    if (this.running) return;
    const generation = ++this.generation;
    Object.assign(this, { running: true, state: 'starting', rows: [], id: globalThis.crypto.randomUUID(), error: '', controller: new AbortController() });
    const id = this.id;
    const signal = this.controller.signal; this.onUpdate(this);
    try {
      const run = await this.request('/api/remote-tests', { method: 'POST', signal, body: JSON.stringify({ id, confirmed: true, config, character }) });
      if (generation !== this.generation) return;
      if (run.id !== id) throw new Error('Test handshake mismatch');
      await this.request('/api/remote-tests/' + id + '/activate', { method: 'POST', signal, body: '{}' });
      if (generation !== this.generation || signal.aborted) return;
      this.id = run.id; this.onBudget(run.budget);
      this.rows = run.scenarios.map(s => ({ ...s, status: 'pending' })); this.state = 'running'; this.onUpdate(this);
      for (let index = 0; index < this.rows.length; index++) {
        if (generation !== this.generation || signal.aborted) return;
        this.rows[index].status = 'running'; this.onUpdate(this);
        const result = await this.request(`/api/remote-tests/${this.id}/step`, { method: 'POST', signal, body: JSON.stringify({ index, config }) });
        if (generation !== this.generation || signal.aborted) return;
        const { budget, ...safeResult } = result;
        this.rows[index] = { ...this.rows[index], ...safeResult }; this.onBudget(budget);
        this.state = result.state; this.onUpdate(this);
        if (result.state !== 'running') break;
      }
    } catch {
      if (generation !== this.generation) return;
      this.state = signal.aborted ? 'cancelled' : 'stopped';
      this.error = '配置、预算、价格有效期或连接检查未通过。已停止，没有自动重试。';
      for (const row of this.rows) if (row.status === 'running') { row.status = 'failed'; row.error = this.error; }
      if (this.id) void this.request(`/api/remote-tests/${this.id}/cancel`, { method: 'POST', body: '{}' }).catch(() => {});
    } finally {
      if (generation === this.generation) {
        this.running = false; this.controller = null;
        for (const row of this.rows) if (row.status === 'pending') row.status = 'skipped';
        this.onUpdate(this);
      }
    }
  }
  stop() {
    if (!this.running) return;
    ++this.generation; this.controller?.abort(); this.controller = null; this.running = false; this.state = 'cancelled';
    for (const row of this.rows) {
      if (row.status === 'running') { row.status = 'cancelled'; row.error = '进行中的请求可能已计费，预留不退。'; }
      else if (row.status === 'pending') row.status = 'skipped';
    }
    this.onUpdate(this);
    if (this.id) void this.request(`/api/remote-tests/${this.id}/cancel`, { method: 'POST', body: '{}', keepalive: true }).catch(() => {});
  }
}

export function mountRemoteTests({ api, config, character, updateBudget, isBusy = () => false }) {
  const $ = id => document.getElementById(id);
  let selectedReport = null;
  const refreshReports = async () => {
    try {
      const { reports } = await api('/api/test-reports');
      $('batch-report-list').replaceChildren();
      for (const report of reports.sort((a, b) => b.createdAt - a.createdAt)) {
        const option = document.createElement('option'); option.value = report.id;
        option.textContent = `${new Date(report.createdAt).toLocaleString()} · ${report.model} · ${report.state} · ${report.count}/6`;
        $('batch-report-list').append(option);
      }
      $('batch-report-status').textContent = `本地隔离报告 ${reports.length}/100；不写正式聊天或记忆，不自动删除。`;
    } catch { $('batch-report-status').textContent = '报告区无法读取；已有报告不会自动删除。'; }
  };
  $('batch-report-refresh').onclick = refreshReports;
  $('batch-report-read').onclick = async () => {
    try {
      selectedReport = await api(`/api/test-reports/${$('batch-report-list').value}`);
      $('batch-report-output').value = JSON.stringify(selectedReport, null, 2);
      $('batch-report-export').disabled = false;
    } catch { $('batch-report-status').textContent = '所选报告不可读取。'; }
  };
  $('batch-report-export').onclick = () => {
    if (!selectedReport) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(selectedReport, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `exo-test-${selectedReport.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  void refreshReports();
  const labels = { idle: '尚未启动真实测试', starting: '检查配置（尚未调用模型）', running: '真实 API 测试进行中', completed: '六项真实测试结束，待人工审阅', stopped: '已停止；没有重试', cancelled: '已取消；不会继续调用', pending: '待执行', failed: '失败', skipped: '未执行' };
  const controls = ['remote-test', 'batch-start', 'provider', 'model-name', 'base-url', 'api-key', 'clear-key'];
  const runner = new BoundedTestRunner({ request: api, onBudget: updateBudget, onUpdate: run => {
    controls.forEach(id => { $(id).disabled = run.running || (['remote-test', 'batch-start'].includes(id) && isBusy()); }); $('batch-cancel').disabled = !run.running;
    $('batch-state').textContent = `${labels[run.state] || run.state}。${run.error || ''}`;
    $('batch-results').replaceChildren();
    for (const row of run.rows) {
      const item = document.createElement('li'), header = document.createElement('strong');
      header.textContent = `${row.label} · ${row.status === 'completed' ? '请求成功' : labels[row.status] || row.status}`; item.append(header);
      const detail = document.createElement('p');
      detail.textContent = row.elapsedMs === undefined ? row.text : `${(row.elapsedMs / 1000).toFixed(1)} 秒 · 输入/输出 tokens ${row.usage?.prompt_tokens ?? '未知'}/${row.usage?.completion_tokens ?? '未知'} · 估算费用 ${row.estimatedCny == null ? '未知' : `¥${row.estimatedCny.toFixed(6)}`} · 保守预留 ¥${row.reservedCny.toFixed(5)}`; item.append(detail);
      if (row.elapsedMs !== undefined && row.text) {
        const text = document.createElement('p'); text.textContent = row.text; item.append(text);
        const review = document.createElement('small'); review.textContent = `JSON 表达契约：${row.structured ? '有效' : '未提供'} · emotion=${row.emotion || '无'}。角色、自然度及事实仍需人工审阅。`; item.append(review);
      }
      if (row.error) { const error = document.createElement('p'); error.textContent = row.error; item.append(error); }
      $('batch-results').append(item);
    }
  } });
  $('batch-start').onclick = () => {
    if (isBusy()) { $('batch-state').textContent = '请等当前回复结束再启动测试；未产生额外调用。'; return; }
    const chosen = config();
    if (chosen.provider !== 'deepseek' || !chosen.model || !chosen.apiKey.trim()) {
      $('batch-state').textContent = '请本人选择 DeepSeek、填写官方模型名和 API key。配置未完成，未产生调用。'; return;
    }
    void runner.start(chosen, character());
  };
  $('batch-cancel').onclick = () => runner.stop();
  globalThis.addEventListener('pagehide', () => runner.stop());
  void api('/api/remote-tests').then(({ scenarios }) => {
    if (runner.state !== 'idle') return;
    runner.rows = scenarios.map(s => ({ ...s, status: 'pending' })); runner.onUpdate(runner);
  }).catch(() => { $('batch-state').textContent = '测试接口尚未加载，请等待部署后刷新。'; });
  return runner;
}
