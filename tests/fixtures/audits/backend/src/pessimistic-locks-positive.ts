// positive fixture: FOR UPDATE without NOWAIT or SKIP LOCKED
async function updateUser(id: string) {
  const result = await db.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE`, [id]);
  return result;
}
