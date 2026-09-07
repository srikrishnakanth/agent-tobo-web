import { HtmlAdapter } from './html.js';
import { ReactAdapter } from './react.js';
import { NextAdapter } from './nextjs.js';
import { UnsupportedAdapter } from './unsupported.js';

export const ADAPTERS = [new NextAdapter(), new ReactAdapter(), new HtmlAdapter(), new UnsupportedAdapter()];

export function pickAdapter(scan) {
  for (const a of ADAPTERS) if (a.detect(scan)) return a;
  return ADAPTERS[ADAPTERS.length - 1];
}

export function listAdapters() { return ADAPTERS.map((a) => ({ id: a.id, status: a.status })); }
