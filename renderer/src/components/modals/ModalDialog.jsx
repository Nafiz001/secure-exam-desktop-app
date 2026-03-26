import { useEffect } from "react";

export default function ModalDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  showCancel,
  onConfirm,
  onCancel,
  onClose
}) {
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h3 id="modal-title">{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            x
          </button>
        </div>

        <p className="modal-message">{message}</p>

        <div className="modal-actions">
          {showCancel ? (
            <button type="button" className="secondary" onClick={onCancel}>
              {cancelText}
            </button>
          ) : null}
          <button type="button" onClick={onConfirm}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
