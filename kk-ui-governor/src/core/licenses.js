// SPDX license policy for the Design Vault. Only redistribution-compatible licenses are allowed
// into the vault and into generated candidates. Everything else is rejected at manifest time and
// again at the safety gate (defense in depth).
export const LICENSE_POLICY = Object.freeze({
  allowed: {
    'MIT': { notice: true, copyleft: false },
    'Apache-2.0': { notice: true, copyleft: false, requiresNoticeFile: true },
    'BSD-2-Clause': { notice: true, copyleft: false },
    'BSD-3-Clause': { notice: true, copyleft: false },
    'ISC': { notice: true, copyleft: false },
    '0BSD': { notice: false, copyleft: false },
    'OFL-1.1': { notice: true, copyleft: false, fontsOnly: true },
    'CC0-1.0': { notice: false, copyleft: false },
    'Unlicense': { notice: false, copyleft: false },
    'CC-BY-4.0': { notice: true, copyleft: false, attribution: true },
    'MPL-2.0': { notice: true, copyleft: 'file', keepSourceAvailable: true },
    'Zlib': { notice: true, copyleft: false },
  },
  denied: {
    'GPL-2.0-only': 'strong copyleft; incompatible with redistribution inside arbitrary projects',
    'GPL-2.0-or-later': 'strong copyleft',
    'GPL-3.0-only': 'strong copyleft',
    'GPL-3.0-or-later': 'strong copyleft',
    'AGPL-3.0-only': 'network copyleft',
    'AGPL-3.0-or-later': 'network copyleft',
    'LGPL-2.1-only': 'weak copyleft; ambiguous once CSS/JS is bundled',
    'LGPL-3.0-only': 'weak copyleft; ambiguous once CSS/JS is bundled',
    'CC-BY-NC-4.0': 'non-commercial restriction',
    'CC-BY-NC-SA-4.0': 'non-commercial + share-alike',
    'CC-BY-SA-4.0': 'share-alike (viral) restriction',
    'SSPL-1.0': 'not OSI approved; service restriction',
    'BUSL-1.1': 'source-available, not open source',
    'Proprietary': 'commercial license; cannot be redistributed',
    'UNKNOWN': 'unknown license; cannot verify redistribution rights',
  },
});

export function normalizeSpdx(id) {
  if (!id) return 'UNKNOWN';
  const s = String(id).trim();
  const map = { 'MIT License': 'MIT', 'Apache 2.0': 'Apache-2.0', 'Apache-2': 'Apache-2.0', 'BSD': 'BSD-3-Clause', 'OFL': 'OFL-1.1', 'SIL OFL 1.1': 'OFL-1.1', 'CC0': 'CC0-1.0', 'GPL-3.0': 'GPL-3.0-only', 'GPL-2.0': 'GPL-2.0-only', 'AGPL-3.0': 'AGPL-3.0-only', 'LGPL-2.1': 'LGPL-2.1-only', 'LGPL-3.0': 'LGPL-3.0-only' };
  return map[s] || s;
}

export function isAllowedLicense(id) {
  return Object.prototype.hasOwnProperty.call(LICENSE_POLICY.allowed, normalizeSpdx(id));
}

export function licenseVerdict(id) {
  const n = normalizeSpdx(id);
  if (LICENSE_POLICY.allowed[n]) return { ok: true, id: n, rule: LICENSE_POLICY.allowed[n] };
  if (LICENSE_POLICY.denied[n]) return { ok: false, id: n, reason: LICENSE_POLICY.denied[n] };
  return { ok: false, id: n, reason: 'license not on the allow-list; treated as incompatible until reviewed' };
}

/** Heuristic identification of a license text. Composite files (e.g. "ISC AND MIT") resolve to the
 *  license that appears FIRST, which is the primary license of the source. */
export function detectLicenseFromText(text) {
  const t = (text || '').replace(/\s+/g, ' ').toLowerCase();
  if (!t) return 'UNKNOWN';
  const patterns = [
    ['Apache-2.0', /apache license[^]*?version 2\.0/],
    ['AGPL-3.0-only', /gnu affero general public license/],
    ['LGPL-3.0-only', /gnu lesser general public license[^]*?version 3/],
    ['LGPL-2.1-only', /gnu lesser general public license/],
    ['GPL-3.0-only', /gnu general public license[^]*?version 3/],
    ['GPL-2.0-only', /gnu general public license/],
    ['OFL-1.1', /sil open font license|open font license/],
    ['MPL-2.0', /mozilla public license[^]*?2\.0/],
    ['CC-BY-NC-4.0', /creative commons[^]*?noncommercial/],
    ['CC0-1.0', /cc0|public domain dedication/],
    ['ISC', /permission to use, copy, modify, and\/or distribute this software for any purpose with or without fee/],
    ['MIT', /permission is hereby granted, free of charge[^]*?without restriction/],
    ['BSD-3-Clause', /redistribution and use in source and binary forms[^]*?neither the name/],
    ['BSD-2-Clause', /redistribution and use in source and binary forms/],
    ['Unlicense', /this is free and unencumbered software released into the public domain/],
  ];
  let best = null;
  for (const [id, re] of patterns) {
    const m = re.exec(t);
    if (m && (best === null || m.index < best.index)) best = { id, index: m.index };
  }
  if (best && best.id === 'BSD-2-Clause') { /* 3-clause already preferred by position tie */ }
  return best ? best.id : 'UNKNOWN';
}
