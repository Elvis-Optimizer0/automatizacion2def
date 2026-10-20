import React from 'react';
import { colors, radius, font, transition } from '../design-system';

const baseStyle = {
  fontFamily: 'Inter, sans-serif',
  fontSize: font.base,
  color: colors.text,
  backgroundColor: colors.surface1,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.md,
  padding: '10px 12px',
  outline: 'none',
  transition,
  caretColor: colors.accent,
  width: '100%',
  boxSizing: 'border-box',
};

export function Input({ onFocus, onBlur, ...props }) {
  const [focused, setFocused] = React.useState(false);
  const style = {
    ...baseStyle,
    borderColor: focused ? colors.borderHover : colors.border,
    boxShadow: focused ? `0 0 0 2px ${colors.accentDim}` : 'none',
  };
  return (
    <input
      style={style}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      {...props}
    />
  );
}

export function Textarea({ onFocus, onBlur, ...props }) {
  const [focused, setFocused] = React.useState(false);
  const style = {
    ...baseStyle,
    borderColor: focused ? colors.borderHover : colors.border,
    boxShadow: focused ? `0 0 0 2px ${colors.accentDim}` : 'none',
    resize: 'vertical',
    minHeight: '80px',
    fontFamily: 'Inter, sans-serif',
  };
  return (
    <textarea
      style={style}
      onFocus={(e) => { setFocused(true); onFocus?.(e); }}
      onBlur={(e) => { setFocused(false); onBlur?.(e); }}
      {...props}
    />
  );
}