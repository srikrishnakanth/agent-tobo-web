// KK-UI-GOVERNOR generated (modern / landing) — dependency-free design system component. Safe to edit; re-runs replace files that keep this header.
import React from 'react';
export type KkPoint = { label: string; value: number };
export type KkChartProps = { data: KkPoint[]; title: string; kind?: 'bar' | 'line'; height?: number; formatValue?: (v: number) => string };
/** Dependency-free SVG bar/line chart with an accessible data table fallback. */
export function KkChart({ data, title, kind = 'bar', height = 200, formatValue = (v) => String(v) }: KkChartProps) {
  const w = 600, h = height, pad = 28;
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = data.length ? (w - pad * 2) / data.length : 0;
  const pts = data.map((d, i) => [pad + i * bw + bw / 2, h - pad - (d.value / max) * (h - pad * 2)]);
  return (
    <figure style={{ margin: 0 }}>
      <svg className="kk-chart" viewBox={'0 0 ' + w + ' ' + h} role="img" aria-labelledby="kk-chart-title" preserveAspectRatio="xMidYMid meet">
        <title id="kk-chart-title">{title}</title>
        <line className="kk-chart__axis" x1={pad} y1={h - pad} x2={w - pad} y2={h - pad} />
        {kind === 'bar' ? data.map((d, i) => <rect key={d.label} className="kk-chart__bar" x={pad + i * bw + bw * 0.15} y={pts[i][1]} width={bw * 0.7} height={h - pad - pts[i][1]} rx={3}><title>{d.label + ': ' + formatValue(d.value)}</title></rect>)
          : <><polygon className="kk-chart__area" points={[[pad, h - pad], ...pts, [w - pad, h - pad]].map((p) => p.join(',')).join(' ')} /><polyline className="kk-chart__line" points={pts.map((p) => p.join(',')).join(' ')} /></>}
        {data.map((d, i) => <text key={d.label} className="kk-chart__label" x={pts[i][0]} y={h - pad + 16} textAnchor="middle">{d.label}</text>)}
      </svg>
      <figcaption className="kk-help">{title}</figcaption>
      <table className="kk-table" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}><caption>{title}</caption><tbody>{data.map((d) => <tr key={d.label}><th scope="row">{d.label}</th><td>{formatValue(d.value)}</td></tr>)}</tbody></table>
    </figure>
  );
}
export default KkChart;
