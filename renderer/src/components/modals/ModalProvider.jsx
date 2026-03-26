import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import ModalDialog from "./ModalDialog";

const ModalContext = createContext(null);

function normalizeModalInput(input, fallbackMessage = "") {
  if (typeof input === "string") {
    return {
      title: "Notice",
      message: input || fallbackMessage
    };
  }

  return {
    title: input?.title || "Notice",
    message: input?.message || fallbackMessage,
    confirmText: input?.confirmText,
    cancelText: input?.cancelText
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
    cancelText: "Cancel"
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
        open: true
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
        cancelText: "Cancel"
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
        cancelText: normalized.cancelText || "Cancel"
      });
    },
    [openModal]
  );

  const value = useMemo(
    () => ({
      showAlert,
      showConfirm
    }),
    [showAlert, showConfirm]
  );

  return (
    <ModalContext.Provider value={value}>
      {children}
      <ModalDialog
        open={modalState.open}
        title={modalState.title}
        message={modalState.message}
        confirmText={modalState.confirmText}
        cancelText={modalState.cancelText}
        showCancel={modalState.type === "confirm"}
        onConfirm={() => closeModal(true)}
        onCancel={() => closeModal(false)}
        onClose={() => closeModal(false)}
      />
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
