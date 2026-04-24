export const SEVERITY_VARIANT = {
  critical: 'fail',
  high: 'fail',
  medium: 'warn',
  low: 'pass',
} as const satisfies Record<string, 'fail' | 'warn' | 'pass'>;

export type SeverityVariant = typeof SEVERITY_VARIANT[keyof typeof SEVERITY_VARIANT];

const DATE_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatHistoryDate(isoString: string): string {
  return DATE_FORMATTER.format(new Date(isoString));
}
