import { colors, radius, font } from '../design-system';

export function Badge({ children, className = '', ...props }) {
  const number = children;
  return (
    <span
      className={`badge-component ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '24px',
        height: '24px',
        padding: '0 8px',
        fontFamily: 'Inter, sans-serif',
        fontSize: font.sm,
        fontWeight: 700,
        color: '#fff',
        backgroundColor: colors.accent,
        borderRadius: radius.sm,
        ...props.style,
      }}
      data-badge={number}
      aria-label={number}
      {...props}
    />
  );
}