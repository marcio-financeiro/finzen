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
    accent:       v('--accent', '#c9814a'),
    accentBright: v('--accent-bright', '#dba36c'),
    success:      v('--success', '#c9814a'),
    danger:       v('--danger', '#b8455f'),
    warning:      v('--warning', '#c9963f'),
    info:         v('--info', '#9b7086'),
    muted:        v('--muted', '#a68e8a'),
    text:         v('--text', '#f3e9e6'),
    border:       v('--border', '#4a3438'),
    surface2:     v('--surface-2', '#402e33'),
    categorical: [
      v('--accent', '#c9814a'), v('--info', '#9b7086'), v('--warning', '#c9963f'),
      v('--danger', '#b8455f'), '#8a9a5b', '#5f8a8a', '#c2703f', '#7a5a72', '#a68e4a', '#b97a6a',
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
