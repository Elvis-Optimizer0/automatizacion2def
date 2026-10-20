import { colors, font } from '../design-system';

export function SectionHeader({ title, subtitle, children, ...props }) {
  return (
    <div style={{ marginBottom: '24px', ...props.style }} {...props}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: subtitle ? '4px' : 0,
        }}
      >
        <div
          style={{
            width: '4px',
            height: '28px',
            backgroundColor: colors.accent,
            borderRadius: '2px',
          }}
        />
        <h2
          style={{
            margin: 0,
            fontFamily: 'Inter, sans-serif',
            fontSize: font.xl,
            fontWeight: 700,
            color: colors.text,
            letterSpacing: '-0.02em',
          }}
        >
          {title}
        </h2>
      </div>
      {subtitle && (
        <p style={{ margin: '0 0 0 20px', fontFamily: 'Inter, sans-serif', fontSize: font.sm, color: colors.textMuted }}>
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}