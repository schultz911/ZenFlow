import { formatHours } from '../../utils/workload';

export function EfficiencyDetail({ estimatedHours, billableHours }: { estimatedHours: number; billableHours: number }) {
  const comparison = estimatedHours === billableHours
    ? 'On estimate'
    : `${formatHours(Math.abs(estimatedHours - billableHours))} ${estimatedHours > billableHours ? 'under estimate' : 'over est.'}`;

  return (
    <>
      <span className="inline-block">{formatHours(estimatedHours)} est. / {formatHours(billableHours)} billable ·</span>
      {' '}
      <span className="inline-block">{comparison}</span>
    </>
  );
}
