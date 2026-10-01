// Coordinate explicit corrections/deletions with the original event lineage.
// Automatic episodes remain independent of ordinary history window cleanup.
export function syncConfirmedLineage(store, interaction, before) {
  const previous = new Map(before.map(m => [m.id, m.sourceId]));
  for (const memory of store.list()) {
    const prior = previous.get(memory.id);
    if (!prior || prior === memory.sourceId) continue;
    const canonical = interaction.sourceEventId(prior);
    if (interaction.db.prepare('SELECT 1 FROM im_episodes WHERE event_id=?').get(canonical)) {
      interaction.db.prepare('INSERT OR REPLACE INTO im_source_aliases VALUES (?,?)').run(memory.sourceId, canonical);
    }
  }
  interaction.db.prepare('DELETE FROM im_source_aliases WHERE NOT EXISTS (SELECT 1 FROM memories WHERE source_id=im_source_aliases.source_id)').run();
  for (const sourceId of new Set(before.map(m => m.sourceId))) {
    store.db.prepare("DELETE FROM events WHERE id=? AND kind='memory' AND NOT EXISTS (SELECT 1 FROM memories WHERE source_id=?)").run(sourceId, sourceId);
  }
}

export function mutateInteractionSource(store, interaction, eventId, text) {
  if (!interaction.db.prepare('SELECT 1 FROM im_episodes WHERE event_id=?').get(eventId)) {
    if (text === undefined) return interaction.delete(eventId);
    throw Object.assign(new Error('互动来源不存在。'), { status: 404 });
  }
  const result = interaction.transaction(() => {
    const before = store.list();
    const references = store.db.prepare(`SELECT m.id FROM memories m LEFT JOIN im_source_aliases a ON a.source_id=m.source_id
      WHERE m.source_id=? OR a.event_id=?`).all(eventId, eventId);
    const result = text === undefined ? interaction.delete(eventId) : interaction.revise(eventId, text);
    for (const memory of references) {
      if (text === undefined || result.retained === false) store.db.prepare('DELETE FROM memories WHERE id=?').run(memory.id);
      else {
        const source = store.event('user', text, { kind: 'memory' });
        store.db.prepare('UPDATE memories SET text=?,source_id=?,updated_at=?,revision=revision+1 WHERE id=?').run(text, source.id, new Date().toISOString(), memory.id);
      }
    }
    // The original helper uses SQL m.id<>?; NULL would suppress all survivors.
    store.clearSourceConversation(eventId, '');
    syncConfirmedLineage(store, interaction, before);
    return result;
  });
  ++store.contextGeneration;
  return result;
}
