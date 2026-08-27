/**
 * chartTheme.js — paleta e opções base de gráfico compartilhadas (Chart.js).
 * Lê as cores dos tokens de css/variables.css via getComputedStyle em vez de
 * hex fixos, para os gráficos acompanharem o tema (claro/escuro) e futuras
 * trocas de paleta. Chamar chartColors()/baseChartOptions() a cada render
 * (não cachear o resultado), já que o tema pode mudar em runtime.
 */
import { formatCurrency } from '../utils.js';

export function chartColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) => (cs.getPropertyValue(name).trim() || fallback);
  return {
    accent:       v('--accent', '#3fae7c'),
    accentBright: v('--accent-bright', '#5fcf9a'),
    success:      v('--success', '#2f9d68'),
    danger:       v('--danger', '#d9705a'),
    warning:      v('--warning', '#c9963f'),
    info:         v('--info', '#3b82f6'),
    muted:        v('--muted', '#8ea198'),
    text:         v('--text', '#e7f0ea'),
    border:       v('--border', '#243029'),
    surface2:     v('--surface-2', '#18221e'),
    categorical: [
      v('--accent', '#3fae7c'), v('--info', '#3b82f6'), v('--warning', '#c9963f'),
      v('--danger', '#d9705a'), '#8b5cf6', '#06b6d4', '#f97316', '#e11d48', '#6366f1', '#84cc16',
    ],
  };
}

export function baseChartOptions() {
  const c = chartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: c.muted, font: { size: 12 }, boxWidth: 12, padding: 14 } },
      tooltip: { callbacks: { label: ctx => ' ' + formatCurrency(ctx.raw, 'BRL') } },
    },
    scales: {
      x: { grid: { color: c.border }, ticks: { color: c.muted, font: { size: 11 } } },
      y: {
        grid: { color: c.border },
        ticks: {
          color: c.muted, font: { size: 11 },
          callback: v => 'R$' + (v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v.toFixed(0)),
        },
      },
    },
  };
}
