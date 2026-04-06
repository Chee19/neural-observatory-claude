import type { MouseEvent } from 'react';
import {
  BarChart3,
  Boxes,
  HomeIcon,
  List,
  Waypoints,
} from 'lucide-react';
import { Dock, DockIcon, DockItem, DockLabel } from '@/components/ui/dock';

const data = [
  {
    title: 'Home',
    href: '#home',
    icon: <HomeIcon className="h-full w-full text-gray-100" />,
  },
  {
    title: 'Claude Inventory',
    href: '#claude-inventory',
    icon: <Boxes className="h-full w-full text-gray-100" />,
  },
  {
    title: 'All-Time Metrics',
    href: '#all-time-metrics',
    icon: <BarChart3 className="h-full w-full text-gray-100" />,
  },
  {
    title: 'Context Usage',
    href: '#context-usage',
    icon: <Waypoints className="h-full w-full text-gray-100" />,
  },
  {
    title: 'Sessions List',
    href: '#sessions-list',
    icon: <List className="h-full w-full text-gray-100" />,
  },
];

function handleNavClick(event: MouseEvent<HTMLAnchorElement>, href: string) {
  const id = href.startsWith('#') ? href.slice(1) : href;
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.history.replaceState(null, '', href);
}

export function LeftNavigationDock() {
  return (
    <div className="fixed left-3 top-1/2 z-[130] -translate-y-1/2">
      <Dock
        orientation="vertical"
        className="border border-white/10 bg-gray-900/35 backdrop-blur-xl"
      >
        {data.map((item) => (
          <DockItem
            key={item.title}
            className="rounded-full border border-white/10 bg-gray-800/65 backdrop-blur"
          >
            <DockLabel className="border-white/15 bg-gray-900 text-gray-100">
              {item.title}
            </DockLabel>
            <DockIcon>
              <a
                href={item.href}
                onClick={(event) => handleNavClick(event, item.href)}
                aria-label={item.title}
                className="flex h-full w-full items-center justify-center rounded-full"
              >
                {item.icon}
              </a>
            </DockIcon>
          </DockItem>
        ))}
      </Dock>
    </div>
  );
}
