export type StatusTone = "good" | "warn" | "bad" | "muted";

export function StatusBadge({
  tone,
  text,
  dot = false,
}: {
  tone: StatusTone;
  text: string;
  dot?: boolean;
}) {
  return (
    <span className={`status-badge status-${tone}`}>
      {dot ? <span aria-hidden="true" className="status-badge-dot" /> : null}
      {text}
    </span>
  );
}
