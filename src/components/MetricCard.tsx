import type { KeyboardEvent, ReactNode } from 'react';
import { GlowCard } from '@/components/ui/spotlight-card';

export interface MetricCardProps {
  label: string;
  value: string;
  hint?: string;
  onClick?: () => void;
  right?: ReactNode;
}

export function MetricCard({ label, value, hint, onClick, right }: MetricCardProps) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-xl md:text-2xl font-extrabold leading-tight  text-gray-100 break-words">
          {value}
        </div>
        {right}
      </div>
      <div className="mt-1 text-xs font-bold uppercase tracking-wider text-gray-300">{label}</div>
      {hint ? <div className="mt-1 text-xs text-gray-400">{hint}</div> : null}
    </>
  );

  if (!onClick) {
    return <div className="min-w-0 rounded-xl border border-gray-700 bg-gray-800 p-3.5">{content}</div>;
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick();
    }
  };

  return (
    <GlowCard
      glowColor="green"
      customSize
      onClick={onClick}
      className="min-w-0 rounded-xl border border-gray-700 bg-gray-800 p-3.5 text-left transition hover:-translate-y-px hover:border-green-400 cursor-pointer"
      role="button"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      {content}
    </GlowCard>
  );
}
