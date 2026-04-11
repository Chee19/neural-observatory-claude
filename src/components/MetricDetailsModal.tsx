import { useEffect } from 'react';
import type { IMetricBreakdownItem } from '../types';

export interface IMetricDetailsModalProps {
  isOpen: boolean;
  title: string;
  subtitle: string;
  totalLabel: string;
  totalValue: string;
  items: IMetricBreakdownItem[];
  onClose: () => void;
}

export function MetricDetailsModal({
  isOpen,
  title,
  subtitle,
  totalLabel,
  totalValue,
  items,
  onClose,
}: IMetricDetailsModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black bg-opacity-60 p-5" onClick={onClose} role="presentation">
      <div
        className="max-h-screen w-full max-w-4xl overflow-auto rounded-xl border border-gray-700 bg-gray-900 p-4"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="m-0 text-base font-semibold text-gray-100">{title}</h3>
            <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-100"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-700 px-3 py-2">
          <span className="text-xs uppercase tracking-wide text-gray-400">{totalLabel}</span>
          <strong className="text-lg text-gray-100">{totalValue}</strong>
        </div>

        {items.length > 0 ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Name</th>
                  <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Count</th>
                  <th className="border-b border-gray-700 px-2 py-2 text-left text-xs uppercase tracking-wide text-gray-300">Share</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.name}>
                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{item.name}</td>
                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{new Intl.NumberFormat().format(item.count)}</td>
                    <td className="border-b border-gray-700 px-2 py-2 text-gray-100">{item.pct.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-gray-400">No breakdown entries available for this metric yet.</p>
        )}
      </div>
    </div>
  );
}
