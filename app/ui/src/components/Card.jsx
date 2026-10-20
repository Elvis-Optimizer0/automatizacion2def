import { colors, radius, shadow } from '../design-system';

export function Card({ children, className = '', style = {}, ...props }) {
  return (
    <div
      className={className}
      style={{
        backgroundColor: colors.surface1,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.lg,
        boxShadow: shadow.card,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}