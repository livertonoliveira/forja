const SECRET_PATTERN_SOURCES: Array<[string, string]> = [
  ['sk-[a-zA-Z0-9]{32,}', 'g'],
  ['ghp_[a-zA-Z0-9]{36}', 'g'],
  ['(?:password|passwd|secret|token|key)\\s{0,64}[:=]\\s{0,64}[\'"]?[^\\s\'"]{8,}', 'gi'],
  ['(?:bearer|Authorization)\\s+[^\\s]{20,}', 'gi'],
];

function highEntropy(str: string, threshold = 4.5): boolean {
  if (str.length === 0) return false;
  const freq: Record<string, number> = {};
  for (const ch of str) {
    freq[ch] = (freq[ch] ?? 0) + 1;
  }
  const len = str.length;
  let entropy = 0;
  for (const count of Object.values(freq)) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy >= threshold;
}

export function redact(text: string): string {
  let result = text;
  for (const [src, flags] of SECRET_PATTERN_SOURCES) {
    result = result.replace(new RegExp(src, flags), '[REDACTED]');
  }
  // Skip entropy scan on large strings — real secrets are short tokens, not file contents.
  if (text.length <= 4096) {
    result = result.replace(/[a-zA-Z0-9+/=_-]{32,}/g, (match) =>
      highEntropy(match) ? '[REDACTED]' : match,
    );
  }
  return result;
}

export function redactObject(obj: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof obj === 'string') return redact(obj);
  if (Array.isArray(obj)) {
    if (seen.has(obj)) return '[Circular]';
    seen.add(obj);
    return obj.map(item => redactObject(item, seen));
  }
  if (obj !== null && typeof obj === 'object') {
    if (seen.has(obj as object)) return '[Circular]';
    seen.add(obj as object);
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = redactObject(value, seen);
    }
    return result;
  }
  return obj;
}
