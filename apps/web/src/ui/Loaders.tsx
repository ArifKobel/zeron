export function WorkingSpinner() {
  return (
    <span className="working-spinner" aria-hidden>
      {Array.from({ length: 9 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${((i % 3) + Math.floor(i / 3)) * 0.083}s` }} />
      ))}
    </span>
  );
}

export function MiniSpinner() {
  const order = [0, 1, 3, 5, 4, 2];
  return (
    <span className="mini-spinner" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <i key={i} style={{ animationDelay: `${order.indexOf(i) * 0.125}s` }} />
      ))}
    </span>
  );
}

export function ZeronPulse({ label }: { label: string }) {
  return (
    <div className="zeron-pulse" role="status">
      <span aria-hidden>
        {Array.from({ length: 5 }, (_, i) => (
          <i key={i} style={{ animationDelay: `${i * 0.18}s` }} />
        ))}
      </span>
      {label}
    </div>
  );
}
