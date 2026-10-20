import { colors, radius, shadow, font, transition } from '../design-system';

const baseStyle = {
  fontFamily: 'Inter, sans-serif',
  fontSize: font.base,
  fontWeight: 600,
  borderRadius: radius.md,
  padding: '10px 20px',
  cursor: 'pointer',
  transition,
  outline: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
};

export function Button({ children, variant = 'primary', disabled, onClick, ...props }) {
  const styles = {
    primary: {
      ...baseStyle,
      backgroundColor: colors.accentDim,
      border: `1px solid ${colors.accent}`,
      color: colors.text,
      boxShadow: disabled ? 'none' : '0 0 0 transparent',
    },
    secondary: {
      ...baseStyle,
      backgroundColor: 'transparent',
      border: `1px solid ${colors.border}`,
      color: colors.text,
    },
    ghost: {
      ...baseStyle,
      backgroundColor: 'transparent',
      border: 'none',
      color: colors.textMuted,
    },
  };

  const style = styles[variant] || styles.primary;

  if (disabled) {
    style.opacity = 0.4;
    style.cursor = 'not-allowed';
    style.transform = 'none';
  }

  const handleMouseEnter = (e) => {
    if (disabled) return;
    if (variant === 'primary') {
      e.target.style.transform = 'translateY(-1px)';
      e.target.style.boxShadow = shadow.glow;
      e.target.style.borderColor = colors.borderHover;
    } else if (variant === 'secondary') {
      e.target.style.transform = 'translateY(-1px)';
      e.target.style.borderColor = colors.borderHover;
    }
  };

  const handleMouseLeave = (e) => {
    if (disabled) return;
    e.target.style.transform = 'translateY(0)';
    e.target.style.boxShadow = variant === 'primary' ? '0 0 0 transparent' : 'none';
    e.target.style.borderColor = variant === 'primary' ? colors.accent : colors.border;
  };

  return (
    <button
      style={style}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}