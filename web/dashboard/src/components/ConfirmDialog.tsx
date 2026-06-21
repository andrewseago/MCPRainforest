import { useId } from "react";
import { Dialog } from "./Dialog";

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "default";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  return (
    <Dialog onClose={onCancel} open={open} titleId={titleId}>
      <div className="modal-header">
        <div>
          <p className="panel-label">Confirm</p>
          <h2 id={titleId}>{title}</h2>
        </div>
      </div>
      <p className="confirm-message">{message}</p>
      <div className="modal-footer">
        <button autoFocus className="secondary-action" onClick={onCancel} type="button">
          Cancel
        </button>
        <button
          className={tone === "danger" ? "danger-action" : "primary-action"}
          disabled={busy}
          onClick={onConfirm}
          type="button"
        >
          {busy ? "Working..." : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
