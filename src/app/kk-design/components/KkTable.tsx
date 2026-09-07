// KK-UI-GOVERNOR generated (premium / landing) — dependency-free design system component. Safe to edit; re-runs replace files that keep this header.
import React from 'react';
export type KkColumn<Row> = { key: keyof Row & string; header: React.ReactNode; numeric?: boolean; wrap?: boolean; render?: (row: Row) => React.ReactNode };
export type KkTableProps<Row> = { columns: KkColumn<Row>[]; rows: Row[]; caption?: React.ReactNode; rowKey?: (row: Row, i: number) => React.Key };
export function KkTable<Row extends Record<string, any>>({ columns, rows, caption, rowKey }: KkTableProps<Row>) {
  return (
    <div className="kk-table-wrap" role="region" aria-label={typeof caption === 'string' ? caption : 'Data table'} tabIndex={0}>
      <table className="kk-table">
        {caption ? <caption className="kk-help" style={{ textAlign: 'left', padding: '8px 12px' }}>{caption}</caption> : null}
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={[c.numeric ? 'kk-num' : '', c.wrap ? 'kk-wrap' : ''].filter(Boolean).join(' ') || undefined}>{c.header}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={rowKey ? rowKey(r, i) : i}>{columns.map((c) => <td key={c.key} className={[c.numeric ? 'kk-num' : '', c.wrap ? 'kk-wrap' : ''].filter(Boolean).join(' ') || undefined}>{c.render ? c.render(r) : String(r[c.key] ?? '')}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
export default KkTable;
