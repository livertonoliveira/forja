// negative fixture: FOR UPDATE with NOWAIT (safe)
async function updateUser(id: string) {
  return await db.transaction(async (trx: any) => {
    return trx.query(`SELECT * FROM users WHERE id = $1 FOR UPDATE NOWAIT`, [id]);
  });
}
