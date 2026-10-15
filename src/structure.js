// Document structure for TiddlyWiki Classic text: headings, labelled
// statements (''Lemma 1.4.6'' ...) and foldable blocks. Pure functions over an
// array of lines, so they can be tested without VS Code.

'use strict';

const DEFAULT_LABELS =
  "^''((?:Definition|Theorem|Lemma|Proposition|Corollary|Remark|Example|Exercise|Conjecture|Notation|Claim|Proof)\\b[^']*?)\\.?''";

// Line-anchored blocks: [start regex, end regex, kind]. Mirrors the block
// formatters in TiddlyWiki Classic and the MathJax plugin.
const BLOCKS = [
  [/^\/\*\*\*$/, /^\*\*\*\/$/, 'comment'],
  [/^<!---$/, /^--->$/, 'comment'],
  [/^\{\{\{$/, /^\}\}\}$/, 'region'],
  [/^\/\/\{\{\{$/, /^\/\/\}\}\}$/, 'region'],
  [/^\/\*\{\{\{\*\/$/, /^\/\*\}\}\}\*\/$/, 'region'],
  [/^<!--\{\{\{-->$/, /^<!--\}\}\}-->$/, 'region'],
  [/^<<<$/, /^<<<$/, 'region'],
];

function headingLevel(line) {
  const m = /^(!{1,6})(.*)$/.exec(line);
  return m ? { level: m[1].length, text: m[2].trim() } : null;
}

const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
  varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'ϕ',
  varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ',
  Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', varPhi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
  infty: '∞', flat: '♭', sharp: '♯', otimes: '⊗', times: '×', to: '→', in: '∈',
};

// Makes inline math readable in the outline: drops delimiters, unwraps font
// commands (\boldsymbol{x} -> x) and shows Greek letters as characters.
function plainMath(text) {
  let s = text.replace(/\\[()[\]]|\$\$/g, '');
  const font = /\\(?:boldsymbol|mathbf|mathrm|mathit|mathcal|mathscr|mathbb|mathfrak|mathsf|text|textit|textbf|operatorname)\{([^{}]*)\}/g;
  for (let i = 0; i < 3 && font.test(s); i++) s = s.replace(font, '$1');
  return s.replace(/\\([A-Za-z]+)/g, (m, name) => GREEK[name] ?? m);
}

// Strips wiki markup from a heading so the outline shows readable text.
function plainText(text) {
  return plainMath(text)
    .replace(/\[\[([^\]|]*?)\|[^\]]*\]\]/g, '$1')
    .replace(/\[\[([^\]]*)\]\]/g, '$1')
    .replace(/''|\/\/|__|\^\^|~~|@@/g, '')
    .replace(/~(?=[A-Z])/g, '')
    .trim();
}

function headings(lines) {
  const out = [];
  lines.forEach((line, i) => {
    const h = headingLevel(line);
    if (h) out.push({ line: i, level: h.level, name: plainText(h.text) || '(empty heading)' });
  });
  return out;
}

function labels(lines, pattern = DEFAULT_LABELS) {
  if (!pattern) return [];
  let re;
  try {
    re = new RegExp(pattern);
  } catch {
    return [];
  }
  const out = [];
  lines.forEach((line, i) => {
    const m = re.exec(line);
    if (m) out.push({ line: i, name: plainText(m[1] ?? m[0]) });
  });
  return out;
}

// Headings nest by level; labels attach to the nearest heading above them.
// Each symbol covers its lines up to the next symbol of the same or a higher level.
function symbolTree(lines, labelPattern) {
  const items = [
    ...headings(lines).map((h) => ({ ...h, kind: 'heading' })),
    ...labels(lines, labelPattern).map((l) => ({ ...l, level: 7, kind: 'label' })),
  ].sort((a, b) => a.line - b.line || a.level - b.level);

  const roots = [];
  const stack = [];
  for (const item of items) {
    const node = { ...item, endLine: lines.length - 1, children: [] };
    while (stack.length && stack[stack.length - 1].level >= node.level) {
      stack.pop().endLine = Math.max(node.line - 1, 0);
    }
    (stack.length ? stack[stack.length - 1].children : roots).push(node);
    stack.push(node);
  }
  // Trim trailing blank lines from each range.
  const trim = (n) => {
    while (n.endLine > n.line && lines[n.endLine].trim() === '') n.endLine--;
    n.children.forEach(trim);
  };
  roots.forEach(trim);
  return roots;
}

function foldingRanges(lines) {
  const ranges = [];

  // Blocks
  for (let i = 0; i < lines.length; i++) {
    for (const [start, end, kind] of BLOCKS) {
      if (!start.test(lines[i])) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (end.test(lines[j])) {
          ranges.push({ start: i, end: j, kind });
          i = start === end ? j : i;
          break;
        }
      }
      break;
    }
  }

  // Multi-line constructs that close on a later line: display math, HTML, comments.
  const spans = [
    [/\\\[/, /\\\]/, 'region'],
    [/\$\$/, /\$\$/, 'region'],
    [/<html>/i, /<\/html>/i, 'region'],
    [/\/%/, /%\//, 'comment'],
  ];
  for (const [open, close, kind] of spans) {
    for (let i = 0; i < lines.length; i++) {
      const m = open.exec(lines[i]);
      if (!m) continue;
      const rest = lines[i].slice(m.index + m[0].length);
      if (close.test(rest)) continue;
      for (let j = i + 1; j < lines.length; j++) {
        if (close.test(lines[j])) {
          if (j > i) ranges.push({ start: i, end: j, kind });
          i = j;
          break;
        }
      }
    }
  }

  // Headings fold up to the next heading of the same or a higher level.
  const hs = headings(lines);
  hs.forEach((h, k) => {
    let end = lines.length - 1;
    for (let n = k + 1; n < hs.length; n++) {
      if (hs[n].level <= h.level) {
        end = hs[n].line - 1;
        break;
      }
    }
    while (end > h.line && lines[end].trim() === '') end--;
    if (end > h.line) ranges.push({ start: h.line, end, kind: 'region' });
  });

  return ranges;
}

module.exports = { DEFAULT_LABELS, headings, labels, symbolTree, foldingRanges, plainText };
