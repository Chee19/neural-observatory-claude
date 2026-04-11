import React, { useEffect, useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';

// ─── Singleton pointer listener (PERF-002) ────────────────────────────────────
// One document-level listener updates all mounted GlowCard refs instead of
// registering a separate handler per card instance.

const _glowCards = new Set<HTMLDivElement>();
let _glowListenerAttached = false;

function _ensureGlowListener() {
  if (_glowListenerAttached) return;
  _glowListenerAttached = true;
  document.addEventListener(
    'pointermove',
    (e: PointerEvent) => {
      const x  = e.clientX.toFixed(2);
      const xp = (e.clientX / window.innerWidth).toFixed(2);
      const y  = e.clientY.toFixed(2);
      const yp = (e.clientY / window.innerHeight).toFixed(2);
      for (const card of _glowCards) {
        card.style.setProperty('--x',  x);
        card.style.setProperty('--xp', xp);
        card.style.setProperty('--y',  y);
        card.style.setProperty('--yp', yp);
      }
    },
    { passive: true },
  );
}

// ─── Singleton style injection (PERF-003) ─────────────────────────────────────
// CSS is injected once into <head> instead of rendering a duplicate <style> tag
// inside every GlowCard instance.

const _GLOW_STYLES = `
  [data-glow]::before,
  [data-glow]::after {
    pointer-events: none;
    content: "";
    position: absolute;
    inset: calc(var(--border-size) * -1);
    border: var(--border-size) solid transparent;
    border-radius: calc(var(--radius) * 1px);
    background-attachment: fixed;
    background-size: calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)));
    background-repeat: no-repeat;
    background-position: 50% 50%;
    mask: linear-gradient(transparent, transparent), linear-gradient(white, white);
    mask-clip: padding-box, border-box;
    mask-composite: intersect;
  }

  [data-glow]::before {
    background-image: radial-gradient(
      calc(var(--spotlight-size) * 0.75) calc(var(--spotlight-size) * 0.75) at
      calc(var(--x, 0) * 1px)
      calc(var(--y, 0) * 1px),
      hsl(var(--hue, 210) calc(var(--saturation, 100) * 1%) calc(var(--lightness, 50) * 1%) / var(--border-spot-opacity, 1)), transparent 100%
    );
    filter: brightness(2);
  }

  [data-glow]::after {
    background-image: radial-gradient(
      calc(var(--spotlight-size) * 0.5) calc(var(--spotlight-size) * 0.5) at
      calc(var(--x, 0) * 1px)
      calc(var(--y, 0) * 1px),
      hsl(0 100% 100% / var(--border-light-opacity, 1)), transparent 100%
    );
  }

  [data-glow] [data-glow] {
    position: absolute;
    inset: 0;
    will-change: filter;
    opacity: var(--outer, 1);
    border-radius: calc(var(--radius) * 1px);
    border-width: calc(var(--border-size) * 20);
    filter: blur(calc(var(--border-size) * 10));
    background: none;
    pointer-events: none;
    border: none;
  }

  [data-glow] > [data-glow]::before {
    inset: -10px;
    border-width: 10px;
  }
`;

let _glowStylesInjected = false;

function _injectGlowStyles() {
  if (_glowStylesInjected) return;
  _glowStylesInjected = true;
  const style = document.createElement('style');
  style.textContent = _GLOW_STYLES;
  document.head.appendChild(style);
}

interface IGlowCardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  glowColor?: 'blue' | 'purple' | 'green' | 'red' | 'orange';
  size?: 'sm' | 'md' | 'lg';
  width?: string | number;
  height?: string | number;
  customSize?: boolean;
}

const glowColorMap = {
  blue: { base: 220, spread: 200 },
  purple: { base: 280, spread: 300 },
  green: { base: 120, spread: 200 },
  red: { base: 0, spread: 200 },
  orange: { base: 30, spread: 200 },
} as const;

const sizeMap = {
  sm: 'w-48 h-64',
  md: 'w-64 h-80',
  lg: 'w-80 h-96',
} as const;

type TGlowStyle = CSSProperties & Record<`--${string}`, string>;

const GlowCard: React.FC<IGlowCardProps> = ({
  children,
  className = '',
  glowColor = 'blue',
  size = 'md',
  width,
  height,
  customSize = false,
  style,
  ...props
}) => {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    _injectGlowStyles();
    _ensureGlowListener();
    const card = cardRef.current;
    if (!card) return;
    _glowCards.add(card);
    return () => { _glowCards.delete(card); };
  }, []);

  const { base, spread } = glowColorMap[glowColor];

  const getSizeClasses = () => {
    if (customSize) {
      return '';
    }

    return sizeMap[size];
  };

  const getInlineStyles = (): TGlowStyle => {
    const baseStyles: TGlowStyle = {
      '--base': String(base),
      '--spread': String(spread),
      '--radius': '14',
      '--border': '3',
      '--backdrop': 'hsl(0 0% 60% / 0.12)',
      '--backup-border': 'var(--backdrop)',
      '--size': '200',
      '--outer': '1',
      '--border-size': 'calc(var(--border, 2) * 1px)',
      '--spotlight-size': 'calc(var(--size, 150) * 1px)',
      '--hue': 'calc(var(--base) + (var(--xp, 0) * var(--spread, 0)))',
      backgroundImage: `radial-gradient(
        var(--spotlight-size) var(--spotlight-size) at
        calc(var(--x, 0) * 1px)
        calc(var(--y, 0) * 1px),
        hsl(var(--hue, 210) calc(var(--saturation, 100) * 1%) calc(var(--lightness, 70) * 1%) / var(--bg-spot-opacity, 0.1)), transparent
      )`,
      backgroundColor: 'var(--backdrop, transparent)',
      backgroundSize: 'calc(100% + (2 * var(--border-size))) calc(100% + (2 * var(--border-size)))',
      backgroundPosition: '50% 50%',
      backgroundAttachment: 'fixed',
      border: 'var(--border-size) solid var(--backup-border)',
      position: 'relative',
      touchAction: 'none',
    };

    if (width !== undefined) {
      baseStyles.width = typeof width === 'number' ? `${width}px` : width;
    }

    if (height !== undefined) {
      baseStyles.height = typeof height === 'number' ? `${height}px` : height;
    }

    return baseStyles;
  };

  const mergedStyles: TGlowStyle = {
    ...getInlineStyles(),
    ...(style ?? {}),
  };

  return (
    <div
      ref={cardRef}
      data-glow
      style={mergedStyles}
      {...props}
      className={`
        ${getSizeClasses()}
        ${!customSize ? 'aspect-[3/4]' : ''}
        rounded-2xl
        relative
        grid
        grid-rows-[1fr_auto]
        shadow-[0_1rem_2rem_-1rem_black]
        p-4
        gap-4
        backdrop-blur-[5px]
        ${className}
      `}
    >
      <div data-glow />
      {children}
    </div>
  );
};

export { GlowCard };
