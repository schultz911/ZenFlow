interface MetricBarProps {
  label: string;
  value: number;
  max?: number;
  detail?: string;
  tone?: 'blue' | 'green' | 'amber' | 'red';
}

export function MetricBar({ label, value, max = 100, detail, tone = 'blue' }: MetricBarProps) {
  const safeValue = Number.isFinite(value) ? Math.max(0, value) : 0;
  const limit = max > 0 ? max : 100;
  const colors = { blue: 'bg-blue-600 dark:bg-blue-400', green: 'bg-emerald-600 dark:bg-emerald-400', amber: 'bg-amber-600 dark:bg-amber-400', red: 'bg-red-600 dark:bg-red-400' };
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={Math.min(limit, safeValue)} aria-valuetext={detail ?? `${safeValue} of ${limit}`} className="metric-track">
      <div className={`metric-fill ${colors[tone]}`} style={{ width: `${Math.min(100, safeValue / limit * 100)}%` }} />
    </div>
  );
}
