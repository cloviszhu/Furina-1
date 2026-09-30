// Recoverable removal of app-owned copies. Original upload paths are never known.
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, copyFile, rename, unlink, rmdir, realpath, stat, readdir } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadTtsConfig } from './local-tts.js';

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const OWNED = /^import-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.wav$/;
const EMOTIONS = ['neutral', 'calm', 'happy', 'sad', 'angry', 'surprised'];
const fail = (text, status = 400) => Object.assign(new Error(text), { status });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equalPath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
const clean = config => { const copy = structuredClone(config); for (const p of copy.profiles) for (const r of Object.values(p.references)) delete r.path; return copy; };

async function directory(path, create = false) {
  if (create) await mkdir(path, { recursive: true });
  const canonical = await realpath(path);
  if (!equalPath(canonical, resolve(path)) || !(await stat(canonical)).isDirectory()) throw fail('参考管理目录不能使用重定向路径。', 403);
  return canonical;
}
async function file(path, max = 4 * 1024 * 1024) {
  const canonical = await realpath(path), info = await stat(canonical);
  if (!equalPath(canonical, resolve(path)) || !info.isFile() || info.size > max) throw fail('参考管理文件路径或大小异常。', 403);
  return await readFile(canonical);
}

export class ReferenceDeletions {
  constructor(owner) { this.owner = owner; }
  async roots(create = false) {
    const data = await directory(this.owner.dataDir);
    const references = await directory(join(data, 'tts-references'));
    const trash = await directory(join(data, 'tts-reference-trash'), create);
    return { data, references, trash };
  }
  async manifest(roots, id) {
    if (!UUID.test(id)) throw fail('删除记录 ID 无效。');
    const archive = await directory(join(roots.trash, id));
    const entry = JSON.parse(await file(join(archive, 'manifest.json'), 32000));
    if (entry.version !== 1 || entry.id !== id || !['profile', 'expression'].includes(entry.scope) ||
        entry.profile?.managed !== true || !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(entry.profile.id || '') ||
        !/^[a-z0-9][a-z0-9_-]{0,39}$/.test(entry.profile.speakerId || '') ||
        !Array.isArray(entry.files) || !entry.files.length || entry.files.length > 6 ||
        entry.files.some(f => !OWNED.test(f.file || '') || !/^[a-f0-9]{64}$/.test(f.sha256 || '')) ||
        new Set(entry.files.map(f => f.file)).size !== entry.files.length ||
        typeof entry.deletedAt !== 'string' || !Number.isFinite(Date.parse(entry.deletedAt)) ||
        typeof entry.profile.label !== 'string' ||
        Object.entries(entry.profile.references || {}).some(([e, r]) => !EMOTIONS.includes(e) || r?.speakerId !== entry.profile.speakerId || !r.importedAt) ||
        (entry.scope === 'expression' && (!EMOTIONS.includes(entry.emotion) || entry.emotion === 'neutral' || Object.keys(entry.profile.references || {}).length !== 1 || !entry.profile.references[entry.emotion])) ||
        (entry.scope === 'profile' && !entry.profile.references?.neutral) ||
        JSON.stringify(entry.files.map(f => f.file).sort()) !== JSON.stringify(Object.values(entry.profile.references || {}).map(r => r.file).sort())) throw fail('删除记录无效；不会覆盖现有登记。', 409);
    return { archive, entry };
  }
  available(entry, config = this.owner.tts.config) {
    const current = config?.profiles.find(p => p.id === entry.profile.id);
    return entry.scope === 'profile' ? !current : Boolean(current?.managed && current.speakerId === entry.profile.speakerId && !current.references[entry.emotion]);
  }
  async list() {
    let roots;
    try { roots = await this.roots(); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    const result = [];
    for (const node of await readdir(roots.trash, { withFileTypes: true })) {
      if (!UUID.test(node.name)) throw fail('删除归档包含未知文件；请检查本机目录。', 409);
      const { entry } = await this.manifest(roots, node.name);
      result.push({ id: entry.id, profileId: entry.profile.id, label: entry.profile.label, speakerId: entry.profile.speakerId,
        emotion: entry.scope === 'expression' ? entry.emotion : null, deletedAt: entry.deletedAt, canRestore: this.available(entry) });
    }
    return result.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
  }
  async mutate(action) {
    const o = this.owner;
    if (o.tts.quarantined) throw fail('TTS 超时后计算状态不确定；请先重启 TTS 和项目服务，再删除或恢复。', 409);
    if (o.committing || o.tts.active || o.tts.queue?.length) throw fail('语音正在生成或排队；停止播放后等待队列释放，再删除或恢复。', 409);
    o.committing = true;
    try { return await action(); } finally { o.committing = false; }
  }
  async replace(config, expected, data) {
    const destination = join(data, 'tts-config.json'), temporary = join(data, `tts-config-${randomUUID()}.tmp`);
    let validated;
    try {
      await writeFile(temporary, JSON.stringify(config, null, 2), { flag: 'wx' });
      validated = await loadTtsConfig(data, temporary);
      const persisted = JSON.parse(await file(destination, 32000));
      if (JSON.stringify(persisted) !== JSON.stringify(expected)) throw fail('登记已在其他位置改变；请刷新服务后重试。', 409);
      await rename(temporary, destination);
      this.owner.tts.config = validated;
    } finally { await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; }); }
  }
  async remove(profileId, input) {
    if (!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(profileId) || input?.confirmed !== true || Object.keys(input).some(k => !['confirmed', 'emotion'].includes(k))) throw fail('请明确确认删除有效的自定义声线。');
    const emotion = input.emotion ?? null;
    if (emotion !== null && (!EMOTIONS.includes(emotion) || emotion === 'neutral')) throw fail('neutral 是声线基础；请用删除整条声线移除它。');
    return await this.mutate(async () => {
      const expected = clean(this.owner.tts.config || { profiles: [] });
      const profile = expected.profiles.find(p => p.id === profileId);
      if (!profile) throw fail('该声线已经不存在。', 404);
      if (profile.managed !== true || !profile.speakerId) throw fail('只能删除由本应用导入的自定义声线；内置测试声不可删除。', 403);
      if (emotion && !profile.references[emotion]) throw fail('该表达已经不存在。', 404);
      const selected = emotion ? { [emotion]: profile.references[emotion] } : profile.references;
      const names = Object.values(selected).map(r => r.file);
      if (!names.length || names.some(n => !OWNED.test(n)) || new Set(names).size !== names.length ||
          Object.values(selected).some(r => r.speakerId !== profile.speakerId || !r.importedAt)) throw fail('只允许删除本应用生成的受管理副本。', 403);
      for (const p of expected.profiles) for (const [e, ref] of Object.entries(p.references)) {
        if (names.includes(ref.file) && (p.id !== profileId || (emotion && e !== emotion))) throw fail('参考副本仍被其他登记引用，不能删除。', 409);
      }
      const roots = await this.roots(true);
      if ((await readdir(roots.trash)).length >= 20) throw fail('已有二十次可恢复删除；请先恢复需要的记录，再管理本机归档。', 409);
      const audio = [];
      for (const name of names) audio.push({ file: name, bytes: await file(join(roots.references, name)) });
      const next = structuredClone(expected);
      if (emotion) delete next.profiles.find(p => p.id === profileId).references[emotion];
      else next.profiles = next.profiles.filter(p => p.id !== profileId);
      const id = randomUUID(), archive = join(roots.trash, id);
      const entry = { version: 1, id, scope: emotion ? 'expression' : 'profile', emotion,
        deletedAt: new Date(this.owner.now()).toISOString(), profile: { ...profile, references: selected },
        files: audio.map(a => ({ file: a.file, sha256: hash(a.bytes) })) };
      await mkdir(archive);
      let committed = false, warning = null;
      try {
        for (const a of audio) await writeFile(join(archive, a.file), a.bytes, { flag: 'wx' });
        await writeFile(join(archive, 'manifest.json'), JSON.stringify(entry, null, 2), { flag: 'wx' });
        await this.replace(next, expected, roots.data); committed = true;
        // Registry removal commits first. A crash leaves the recovery archive,
        // and any remaining active-directory file is unregistered, not playable.
        for (const a of audio) {
          try {
            if (hash(await file(join(roots.references, a.file))) !== hash(a.bytes)) throw fail('副本已改变。');
            await unlink(join(roots.references, a.file));
          } catch { warning = '登记已移除；部分未登记副本保留在本机，归档可恢复。'; }
        }
        return { profileId, emotion, deletionId: id, warning, profiles: this.owner.list() };
      } finally {
        if (!committed) {
          for (const a of audio) await unlink(join(archive, a.file)).catch(() => {});
          await unlink(join(archive, 'manifest.json')).catch(() => {}); await rmdir(archive).catch(() => {});
        }
      }
    });
  }
  async restore(id, input) {
    if (input?.confirmed !== true || Object.keys(input).some(k => k !== 'confirmed')) throw fail('请明确确认恢复。');
    return await this.mutate(async () => {
      const roots = await this.roots(), { archive, entry } = await this.manifest(roots, id);
      const expected = clean(this.owner.tts.config || { profiles: [] });
      if (!this.available(entry, expected)) throw fail('声线或表达已存在、已改变或缺少基础声线；恢复不会覆盖现有登记。', 409);
      if (entry.scope === 'profile' && expected.profiles.length >= 12) throw fail('声线已满，请先管理已有声线。', 409);
      for (const p of expected.profiles) for (const ref of Object.values(p.references)) if (entry.files.some(f => f.file === ref.file)) throw fail('副本已被其他登记引用，拒绝恢复。', 409);
      const next = structuredClone(expected);
      if (entry.scope === 'profile') next.profiles.push(entry.profile);
      else next.profiles.find(p => p.id === entry.profile.id).references[entry.emotion] = entry.profile.references[entry.emotion];
      const copied = [];
      let committed = false;
      try {
        for (const f of entry.files) {
          const bytes = await file(join(archive, f.file));
          if (hash(bytes) !== f.sha256) throw fail('恢复副本校验失败；没有覆盖登记。', 409);
          const target = join(roots.references, f.file);
          try { if (hash(await file(target)) !== f.sha256) throw fail('恢复位置已有不同文件，拒绝覆盖。', 409); }
          catch (error) {
            if (error.code !== 'ENOENT') throw error;
            await copyFile(join(archive, f.file), target, constants.COPYFILE_EXCL); copied.push(target);
          }
        }
        await this.replace(next, expected, roots.data); committed = true;
        // Only known archive files; never recursive deletion or user source paths.
        let warning = null;
        try { for (const f of entry.files) await unlink(join(archive, f.file)); await unlink(join(archive, 'manifest.json')); await rmdir(archive); }
        catch { warning = '声线已恢复；部分恢复归档保留在本机。'; }
        return { profileId: entry.profile.id, emotion: entry.emotion, warning, profiles: this.owner.list() };
      } finally { if (!committed) for (const target of copied) await unlink(target).catch(() => {}); }
    });
  }
}
