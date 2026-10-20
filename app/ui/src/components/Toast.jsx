import React, { useEffect, useState } from 'react';
import { colors, radius, shadow, font, transition } from '../design-system';

export function ToastContainer() {
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    const newToast = { id, message, type };
    setToasts((prev) => [...prev, newToast]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  if (typeof window !== 'undefined') {
    window.__TOAST__ = addToast;
  }

  return (
    <div
      id="toast-container"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} message={toast.message} type={toast.type} />
      ))}
    </div>
  );
}

function Toast({ message, type }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(true);
  }, []);

  const bgColor = type === 'error' ? 'rgba(220,40,40,0.9)' :
                  type === 'success' ? 'rgba(34,197,94,0.9)' :
                  type === 'warning' ? 'rgba(245,158,11,0.9)' :
                  'rgba(220,40,40,0.9)';
  const borderColor = type === 'error' ? colors.accent :
                      type === 'success' ? colors.success :
                      type === 'warning' ? colors.warning :
                      colors.accent;

  return (
    <div
      style={{
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: radius.md,
        padding: '12px 16px',
        color: colors.text,
        fontFamily: 'Inter, sans-serif',
        fontSize: font.base,
        boxShadow: shadow.card,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(20px)',
        transition: 'all 0.3s ease',
        pointerEvents: 'auto',
        maxWidth: '360px',
      }}
      role="alert"
    >
      {message}
    </div>
  );
}

export function useToast() {
  const [, setTick] = useState(0);
  return useCallback((message, type) => {
    if (window.__TOAST__) {
      window.__TOAST__(message, type);
    }
    setTick(t => t + 1);
  }, []);
}