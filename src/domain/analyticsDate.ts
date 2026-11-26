export const ANALYTICS_TIME_ZONE = 'Asia/Kolkata';

const workspaceClock = new Intl.DateTimeFormat('en-CA', {
  timeZone: ANALYTICS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function getAnalyticsClock(now = new Date()): { date: string; closing: boolean } {
  const parts = Object.fromEntries(workspaceClock.formatToParts(now).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    closing: parts.hour === '23' && parts.minute === '59',
  };
}

export function isAnalyticsDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
