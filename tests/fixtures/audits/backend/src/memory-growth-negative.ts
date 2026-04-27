// negative fixture: Map with explicit size eviction
const MAX_SIZE = 1000;
const cache = new Map<string, any>();

declare const db: { find: (id: string) => Promise<any> };

async function getUser(id: string) {
  if (cache.has(id)) return cache.get(id);
  const user = await db.find(id);
  if (cache.size >= MAX_SIZE) cache.clear();
  cache.set(id, user);
  return user;
}

export { getUser };
