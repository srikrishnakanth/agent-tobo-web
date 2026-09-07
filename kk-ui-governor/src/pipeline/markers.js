// Marker strings that delimit every governor-injected block inside EXISTING project files.
// Everything the Governor adds to an existing file lives between these markers so that
// (a) the additive-only gate can prove nothing else changed and (b) re-runs are idempotent.
export const MARKER = Object.freeze({
  start: 'kk-ui-governor:start',
  end: 'kk-ui-governor:end',
});

export function wrap(kind, body) {
  switch (kind) {
    case 'html': return `<!-- ${MARKER.start} -->\n${body}\n<!-- ${MARKER.end} -->`;
    case 'css': return `/* ${MARKER.start} */\n${body}\n/* ${MARKER.end} */`;
    case 'js': return `// ${MARKER.start}\n${body}\n// ${MARKER.end}`;
    default: throw new Error(`unknown marker kind ${kind}`);
  }
}

export function hasMarker(content) {
  return String(content).includes(MARKER.start);
}
