// negative fixture: async readFile (non-blocking)
async function getConfig() {
  const { readFile } = await import('node:fs/promises');
  const data = await readFile('/etc/app/config.json', 'utf8');
  return JSON.parse(data);
}

export { getConfig };
