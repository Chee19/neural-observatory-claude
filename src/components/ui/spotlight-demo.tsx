import { Activity, BarChart3, DollarSign } from 'lucide-react';

import { GlowCard } from '@/components/ui/spotlight-card';

const stocks = [
  {
    title: 'Usage Volume',
    icon: Activity,
    metric: '12.4M',
    detail: 'Total context tokens observed',
    image:
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&q=80',
    glowColor: 'blue' as const,
  },
  {
    title: 'Known Cost',
    icon: DollarSign,
    metric: '$432.18',
    detail: 'Estimated covered session spend',
    image:
      'https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=1200&q=80',
    glowColor: 'green' as const,
  },
  {
    title: 'Tool Invocations',
    icon: BarChart3,
    metric: '3,981',
    detail: 'All-time tool call count',
    image:
      'https://images.unsplash.com/photo-1551281044-8b43f4ae2f0c?auto=format&fit=crop&w=1200&q=80',
    glowColor: 'orange' as const,
  },
];

export function SpotlightDemo() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {stocks.map((item) => {
        const Icon = item.icon;

        return (
          <GlowCard key={item.title} glowColor={item.glowColor} customSize className="min-h-56 overflow-hidden">
            <img src={item.image} alt={item.title} className="absolute inset-0 h-full w-full object-cover opacity-20" />
            <div className="relative z-10 flex items-start justify-between">
              <span className="rounded-lg border border-white/20 bg-black/30 p-2 text-white">
                <Icon className="h-4 w-4" />
              </span>
            </div>
            <div className="relative z-10 self-end">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-300">{item.title}</div>
              <div className="mt-1 text-2xl font-bold text-white">{item.metric}</div>
              <div className="mt-1 text-xs text-gray-300">{item.detail}</div>
            </div>
          </GlowCard>
        );
      })}
    </div>
  );
}
