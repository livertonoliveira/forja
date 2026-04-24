export const statusColors: Record<string, string> = {
  done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  dev: 'bg-blue-100 text-blue-700',
  test: 'bg-blue-100 text-blue-700',
  perf: 'bg-yellow-100 text-yellow-700',
  security: 'bg-yellow-100 text-yellow-700',
  review: 'bg-purple-100 text-purple-700',
  homolog: 'bg-purple-100 text-purple-700',
  pr: 'bg-indigo-100 text-indigo-700',
  spec: 'bg-gray-100 text-gray-600',
  init: 'bg-gray-100 text-gray-600',
};

export const gateBadgeColors: Record<string, string> = {
  pass: 'bg-green-100 text-green-700',
  warn: 'bg-yellow-100 text-yellow-700',
  fail: 'bg-red-100 text-red-700',
};

export const gateTextColors: Record<string, string> = {
  pass: 'text-green-600',
  warn: 'text-yellow-600',
  fail: 'text-red-600',
};

export const gateBgColors: Record<string, string> = {
  pass: '#16a34a',
  warn: '#d97706',
  fail: '#dc2626',
};

export const gateDarkBgColors: Record<string, string> = {
  pass: '#4ADE80',
  warn: '#FCD34D',
  fail: '#F87171',
};

export const gateDisplay: Record<string, { label: string; cls: string }> = {
  pass: { label: '✓ pass', cls: 'text-green-600' },
  warn: { label: '⚠ warn', cls: 'text-yellow-600' },
  fail: { label: '✕ fail', cls: 'text-red-600' },
};
