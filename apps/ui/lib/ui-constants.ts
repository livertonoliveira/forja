export const statusColors: Record<string, string> = {
  done: 'bg-green-900 text-green-300',
  failed: 'bg-red-900 text-red-300',
  dev: 'bg-blue-900 text-blue-300',
  test: 'bg-blue-900 text-blue-300',
  perf: 'bg-yellow-900 text-yellow-300',
  security: 'bg-yellow-900 text-yellow-300',
  review: 'bg-purple-900 text-purple-300',
  homolog: 'bg-purple-900 text-purple-300',
  pr: 'bg-indigo-900 text-indigo-300',
  spec: 'bg-gray-700 text-gray-300',
  init: 'bg-gray-700 text-gray-300',
};

export const gateTextColors: Record<string, string> = {
  pass: 'text-green-400',
  warn: 'text-yellow-400',
  fail: 'text-red-400',
};

export const gateBgColors: Record<string, string> = {
  pass: '#22c55e',
  warn: '#f59e0b',
  fail: '#ef4444',
};

export const gateDisplay: Record<string, { label: string; cls: string }> = {
  pass: { label: '✓ pass', cls: 'text-green-400' },
  warn: { label: '⚠ warn', cls: 'text-yellow-400' },
  fail: { label: '✕ fail', cls: 'text-red-400' },
};
