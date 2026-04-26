import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from "../ui/dialog";
import { Button } from "../ui/button";

const ModalContext = createContext(null);

function normalizeModalInput(input, fallbackMessage = "") {
  if (typeof input === "string") {
    return {
      title: "Notice",
      message: input || fallbackMessage,
    };
  }

  return {
    title: input?.title || "Notice",
    message: input?.message || fallbackMessage,
    confirmText: input?.confirmText,
    cancelText: input?.cancelText,
  };
}

export function ModalProvider({ children }) {
  const resolverRef = useRef(null);
  const [modalState, setModalState] = useState({
    open: false,
    type: "alert",
    title: "Notice",
    message: "",
    confirmText: "OK",
    cancelText: "Cancel",
  });

  const resolveModal = useCallback((value) => {
    if (resolverRef.current) {
      resolverRef.current(value);
      resolverRef.current = null;
    }
  }, []);

  const closeModal = useCallback(
    (value) => {
      setModalState((prev) => ({ ...prev, open: false }));
      resolveModal(value);
    },
    [resolveModal]
  );

  const openModal = useCallback((nextState) => {
    if (resolverRef.current) {
      resolverRef.current(false);
      resolverRef.current = null;
    }

    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setModalState({
        ...nextState,
        open: true,
      });
    });
  }, []);

  const showAlert = useCallback(
    (input, fallbackMessage = "") => {
      const normalized = normalizeModalInput(input, fallbackMessage);
      return openModal({
        type: "alert",
        title: normalized.title,
        message: normalized.message,
        confirmText: normalized.confirmText || "OK",
        cancelText: "Cancel",
      });
    },
    [openModal]
  );

  const showConfirm = useCallback(
    (input, fallbackMessage = "") => {
      const normalized = normalizeModalInput(input, fallbackMessage);
      return openModal({
        type: "confirm",
        title: normalized.title || "Confirm",
        message: normalized.message || fallbackMessage,
        confirmText: normalized.confirmText || "OK",
        cancelText: normalized.cancelText || "Cancel",
      });
    },
    [openModal]
  );

  const value = useMemo(
    () => ({
      showAlert,
      showConfirm,
    }),
    [showAlert, showConfirm]
  );

  const showCancel = modalState.type === "confirm";

  return (
    <ModalContext.Provider value={value}>
      {children}
      <Dialog
        open={modalState.open}
        onOpenChange={(next) => {
          if (!next) closeModal(false);
        }}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>{modalState.title}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-ink-muted whitespace-pre-wrap">
              {modalState.message}
            </p>
          </DialogBody>
          <DialogFooter>
            {showCancel ? (
              <Button variant="secondary" onClick={() => closeModal(false)}>
                {modalState.cancelText}
              </Button>
            ) : null}
            <Button onClick={() => closeModal(true)}>
              {modalState.confirmText}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);

  if (!context) {
    throw new Error("useModal must be used within a ModalProvider.");
  }

  return context;
}
