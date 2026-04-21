import format from 'moment';

export function formatDate(date: Date): string {
  return format(date, 'YYYY-MM-DD');
}
