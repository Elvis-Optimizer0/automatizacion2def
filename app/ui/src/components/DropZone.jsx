import React, { useState, useCallback } from 'react';
import { colors, radius, font, transition } from '../design-system';

export function DropZone({ onDrop, children, accept, ...props }) {
  const [dragOver, setDragOver] = useState(false);
  const [dragCount, setDragCount] = useState(0);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCount((c) => c + 1);
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragCount((c) => c - 1);
    if (dragCount <= 1) setDragOver(false);
  }, [dragCount]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setDragCount(0);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onDrop(files);
    }
  }, [onDrop]);

  const handleClick = useCallback((e) => {
    if (onDrop && !e.target.closest('button, input, a')) {
      const input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;
      input.multiple = true;
      input.style.display = 'none';
      input.onchange = () => {
        const files = Array.from(input.files);
        if (files.length > 0) onDrop(files);
        document.body.removeChild(input);
      };
      document.body.appendChild(input);
      input.click();
    }
  }, [onDrop, accept]);

  const style = {
    border: `2px dashed ${dragOver ? colors.borderHover : colors.border}`,
    borderRadius: radius.lg,
    backgroundColor: dragOver ? colors.accentDim : colors.surface1,
    boxShadow: dragOver ? `0 0 20px ${colors.accentDim}` : 'none',
    padding: '40px 20px',
    textAlign: 'center',
    cursor: 'pointer',
    transition,
    ...props.style,
  };

  return (
    <div
      style={style}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      role="region"
      aria-label="Zona de arrastrar y soltar"
      tabIndex={0}
      {...props}
    >
      {children}
    </div>
  );
}