import { colors, radius, shadow, font, transition } from '../design-system';
import React from 'react';

export function Chip({ children, active, onClick, id, 'aria-pressed': ariaPressed, type = 'button', ...props }) {
  const style = {
    fontFamily: 'Inter, sans-serif',
    fontSize: font.sm,
    fontWeight: 600,
    padding: '6px 14px',
    borderRadius: radius.sm,
    cursor: onClick ? 'pointer' : 'default',
    transition,
    border: `1px solid ${active ? colors.accent : colors.border}`,
    backgroundColor: active ? colors.accentDim : colors.surface1,
    color: active ? colors.accent : colors.textMuted,
    boxShadow: active ? shadow.glow : 'none',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    userSelect: 'none',
  };

  const Tag = onClick ? 'button' : 'div';
  const buttonProps = onClick ? { type, onClick, 'aria-pressed': ariaPressed ?? active } : {};

  return (
    <Tag
      style={style}
      id={id}
      {...buttonProps}
      {...props}
    >
      {children}
    </Tag>
  );
}