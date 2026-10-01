// Coordinate explicit corrections/deletions with the original event lineage.
// Automatic episodes remain independent of ordinary history window cleanup.
export function mutateInteractionSource(store, interaction, eventId, text) {
  if (!interaction.db.prepare('SELECT 1 FROM im_episodes WHERE event_id=?').get(eventId)) {
    if (text === undefined) return interaction.delete(eventId);
    throw Object.assign(new Error('互动来源不存在。'), { status: 404 });
  }
  const result = interaction.transaction(() => {
    const references = store.db.prepare(`SELECT m.id FROM memories m LEFT JOIN im_source_aliases a ON a.source_id=m.source_id
      WHERE m.source_id=? OR a.event_id=?`).all(eventId, eventId);
    const result = text === undefined ? interaction.delete(eventId) : interaction.revise(eventId, text);
    for (const memory of references) {
      if (text === undefined || result.retained === false) store.db.prepare('DELETE FROM memories WHERE id=?').run(memory.id);
      else {
        const source = store.event('user', text, { kind: 'memory' });
        interaction.db.prepare('INSERT INTO im_source_aliases VALUES (?,?)').run(source.id, eventId);
        store.db.prepare('UPDATE memories SET text=?,source_id=?,updated_at=?,revision=revision+1 WHERE id=?').run(text, source.id, new Date().toISOString(), memory.id);
      }
    }
    store.clearSourceConversation(eventId, null);
    return result;
  });
  ++store.contextGeneration;
  return result;
}
