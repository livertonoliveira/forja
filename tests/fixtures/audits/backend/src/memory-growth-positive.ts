// positive fixture: module-level Map with no eviction
const cache = new Map<string, any>();

declare const db: { find: (id: string) => Promise<any> };

async function getUser(id: string) {
  if (cache.has(id)) return cache.get(id);
  const user = await db.find(id);
  cache.set(id, user);
  return user;
}

export { getUser };
