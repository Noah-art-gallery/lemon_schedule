interface ProgressRingProps {
  completed: number;
  total: number;
  label?: string;
}

export function ProgressRing({ completed, total, label = "오늘 완료율" }: ProgressRingProps) {
  const empty = total === 0;
  const percentage = empty ? 0 : Math.round((completed / total) * 100);
  const radius = 38;
  const circumference = Math.PI * 2 * radius;
  const dashOffset = circumference - (percentage / 100) * circumference;

  return (
    <div
      className="progress-ring"
      role="img"
      aria-label={empty ? `${label}: 오늘 할 일 없음` : `${label}: ${percentage}%`}
    >
      <svg viewBox="0 0 96 96" aria-hidden="true">
        <circle className="progress-ring__track" cx="48" cy="48" r={radius} />
        <circle
          className="progress-ring__value"
          cx="48"
          cy="48"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      <span className="progress-ring__text">
        {empty ? <small>할 일 없음</small> : <strong>{percentage}%</strong>}
      </span>
    </div>
  );
}
