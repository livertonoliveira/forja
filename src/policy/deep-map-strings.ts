export function deepMapStrings(
  obj: Record<string, unknown>,
  fn: (value: string) => string,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      typeof v === 'string'
        ? fn(v)
        : v !== null && typeof v === 'object' && !Array.isArray(v)
          ? deepMapStrings(v as Record<string, unknown>, fn)
          : v,
    ])
  );
}
