import { colors, radius, transition } from '../design-system';

export function ProgressBar({ value = 0, fillId = 'progress-fill', ...props }) {
  const clampedValue = Math.max(0, Math.min(100, value));
  return (
    <div
      style={{
        width: '100%',
        height: '8px',
        backgroundColor: colors.surface1,
        borderRadius: radius.sm,
        overflow: 'hidden',
        ...props.style,
      }}
      {...props}
    >
      <div
        id={fillId}
        style={{
          width: `${clampedValue}%`,
          height: '100%',
          backgroundColor: colors.accent,
          borderRadius: radius.sm,
          transition: `width ${transition}`,
        }}
      />
    </div>
  );
}