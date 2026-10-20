import { colors, radius, font, transition } from '../design-system';
import React from 'react';

export function Select({ id, value, onChange, children, className = '', style = {}, ...props }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <select
      id={id}
      value={value}
      onChange={onChange}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      className={`export-select ${className}`}
      style={{
        fontFamily: 'Inter, sans-serif',
        fontSize: font.base,
        color: colors.text,
        backgroundColor: colors.surface1,
        border: `1px solid ${focused ? colors.borderHover : colors.border}`,
        borderRadius: radius.md,
        padding: '10px 36px 10px 12px',
        outline: 'none',
        transition,
        boxShadow: focused ? `0 0 0 2px ${colors.accentDim}` : 'none',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='${focused ? '%23dc2828' : '%23f0f0f0'}' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 12px center',
        width: '100%',
        boxSizing: 'border-box',
        cursor: 'pointer',
        ...style,
      }}
      {...props}
    >
      {children}
    </select>
  );
}