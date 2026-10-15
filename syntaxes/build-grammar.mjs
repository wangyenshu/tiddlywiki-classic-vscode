// Generates syntaxes/tiddlywiki-classic.tmLanguage.json.
//
// The rules mirror config.formatters in TiddlyWiki Classic (js/Formatter.js,
// https://github.com/TiddlyWiki/tiddlywiki) plus the MathJax plugin formatter,
// in the same order. TextMate and the TiddlyWiki wikifier resolve overlaps the
// same way: the leftmost match wins, ties go to the rule listed first, and a
// region's end pattern beats a nested rule that starts at the same place.
//
// Reused from VS Code's built-in extensions:
//   - math content:   text.tex#math-content and text.tex.latex (LaTeX Language Basics)
//   - code blocks:    source.js, source.css, text.html.basic
//   - the begin/while technique for fenced code blocks (Markdown Language Basics),
//     so an unbalanced construct in embedded code can never swallow the closing fence.
//
// Run: node syntaxes/build-grammar.mjs

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const r = String.raw;

// --- config.textPrimitives (Config.js) -------------------------------------
const upper = r`[A-Z\x{00C0}-\x{00DE}\x{0150}\x{0170}]`;
const lower = r`[a-z0-9_\-\x{00DF}-\x{00FF}\x{0151}\x{0171}]`;
const anyLetter = r`[A-Za-z0-9_\-\x{00C0}-\x{00DE}\x{00DF}-\x{00FF}\x{0150}\x{0170}\x{0151}\x{0171}]`;
const anyLetterStrict = r`[A-Za-z0-9\x{00C0}-\x{00DE}\x{00DF}-\x{00FF}\x{0150}\x{0170}\x{0151}\x{0171}]`;
// Inside a container that ends at a terminator (''  //  @@  a table cell ...),
// TiddlyWiki searches for nested formatters only in the text *before* that
// terminator (Wikifier.subWikifyTerm truncates the source). Formatters whose
// trigger is the whole construct (WikiWords and bare URLs) therefore cannot
// run past it: "//see http://x.org//" ends the italics inside the URL. The
// guarded variants below reproduce that: no character may start the terminator.
const guard = (term, cls) => (term ? `(?:(?!${term})${cls})` : cls);
const wikiWordIn = (t) =>
  `(?:${guard(t, upper)}+${guard(t, lower)}+${guard(t, upper)}${guard(t, anyLetter)}*|${guard(t, upper)}{2,}${guard(t, lower)}+)`;
const urlIn = (t) => {
  const not = t ? `(?!${t})` : '';
  // "\b" at the end of the truncated text is true after a word character
  const truncatedEnd = t ? `|(?<=\\w)(?=${t})` : '';
  return `(?:file|http|https|mailto|ftp|irc|news|data):${guard(t, `[^\\s'"]`)}+(?:${not}/|\\b|${not}\\[|${not}\\]${truncatedEnd})`;
};
const wikiWord = wikiWordIn(null);
// config.textPrimitives.cssLookahead: "name(value):" or "name:value;"
const cssDecl = `(?:${anyLetter}+\\([^\\)\\|\\n]+\\):|${anyLetter}+:[^;\\|\\n]+;)`;

const S = 'tiddlywiki';
const sc = (...names) => names.map((n) => `${n}.${S}`).join(' ');

const inlineCss = {
  patterns: [
    {
      match: `(${anyLetter}+)(\\()([^\\)\\|\\n]+)(\\):)`,
      captures: {
        1: { name: 'support.type.property-name.css' },
        2: { name: 'punctuation.section.function.begin.css' },
        3: { name: 'support.constant.property-value.css' },
        4: { name: 'punctuation.section.function.end.css' },
      },
    },
    {
      match: `(${anyLetter}+)(:)([^;\\|\\n]+)(;)`,
      captures: {
        1: { name: 'support.type.property-name.css' },
        2: { name: 'punctuation.separator.key-value.css' },
        3: { name: 'support.constant.property-value.css' },
        4: { name: 'punctuation.terminator.rule.css' },
      },
    },
  ],
};

// --- MathJax plugin formatter: \( \), \[ \], $$ $$ ----------------------------
// The plugin's lookahead is non-greedy, so a formula ends at the first closing
// delimiter. Math content is tokenized with VS Code's LaTeX grammar. Each line
// of a formula is tokenized on its own (captures with patterns), which keeps an
// unbalanced \begin or % comment inside the formula from swallowing the closing
// delimiter, exactly as the plugin's regex would behave.
const mathContent = {
  name: `markup.math.content.${S}`,
  patterns: [{ include: 'text.tex#math-content' }, { include: 'text.tex.latex' }],
};

function mathRules(key, open, close, kind) {
  const regionName = `markup.math.${kind}.${S} support.class.math.block.tex`;
  const begin = { name: `punctuation.definition.math.begin.${S}` };
  const end = { name: `punctuation.definition.math.end.${S}` };
  return {
    [`math-${key}-line`]: {
      name: regionName,
      match: `(${open})(.*?)(${close})`,
      captures: { 1: begin, 2: mathContent, 3: end },
    },
    [`math-${key}-multiline`]: {
      name: regionName,
      begin: `(${open})(?!.*?${close})`,
      beginCaptures: { 1: begin },
      end: `(${close})`,
      endCaptures: { 1: end },
      patterns: [{ match: `(?:(?!${close}).)+`, captures: { 0: mathContent } }],
    },
  };
}

// --- code blocks (monospacedByLine) ------------------------------------------
function fencedBlock(open, close, kind, embeddedScope, include) {
  const rule = {
    name: `markup.raw.block.${kind}.${S}`,
    begin: `^(${open})$`,
    beginCaptures: { 1: { name: `punctuation.definition.raw.begin.${S}` } },
    end: `^(${close})$`,
    endCaptures: { 1: { name: `punctuation.definition.raw.end.${S}` } },
  };
  if (embeddedScope && !include) rule.contentName = embeddedScope;
  if (include) {
    // Same structure as fenced_code_block_* in VS Code's Markdown grammar.
    rule.patterns = [
      {
        begin: r`(^|\G)`,
        while: `(^|\\G)(?!${close}$)`,
        contentName: embeddedScope,
        patterns: [{ include }],
      },
    ];
  }
  return rule;
}

const listRule = (lastChar, kind) => ({
  name: `markup.list.${kind}.${S}`,
  begin: `^([*#;:]*${lastChar})(?![*#;:])`,
  beginCaptures: {
    1: { name: `punctuation.definition.list.begin.${S} punctuation.definition.list.begin.markdown` },
  },
  end: '$',
  patterns: [{ include: '#wikitext' }],
});

const charFormat = (open, close, name, key) => ({
  name,
  begin: open,
  beginCaptures: { 0: { name: `punctuation.definition.format.begin.${S}` } },
  end: close,
  endCaptures: { 0: { name: `punctuation.definition.format.end.${S}` } },
  patterns: [{ include: `#wikitext--${key}` }],
});

// wikiLink: ~?WikiWord; a WikiWord right after a letter is plain text
function wikiLinkRule(term) {
  const word = wikiWordIn(term);
  return {
    patterns: [
      {
        match: `(${guard(term, '~')})${word}`,
        captures: { 1: { name: `constant.character.escape.${S}` } },
      },
      { match: `(?<=${anyLetterStrict})${word}` },
      { name: `markup.underline.link.wikiword.${S} string.other.link.title.${S}`, match: word },
    ],
  };
}

function urlLinkRule(term) {
  return { name: `markup.underline.link.url.${S}`, match: urlIn(term) };
}

// A table row; cells end before " *|". A cell starting with "!" (after any
// inline CSS and spaces) is a header cell, as is every cell of an |h row.
function tableRow(begin, headerRow) {
  const sep = { name: `punctuation.separator.table.${S}` };
  const headerContent = `markup.bold.table-header.${S}`;
  const cell = (bang) => ({
    name: `meta.table.cell.${S}`,
    begin: `(\\|)((?:${cssDecl})*)(\\x20*)${bang ? '(!)' : ''}`,
    beginCaptures: {
      1: sep,
      2: inlineCss,
      ...(bang ? { 4: { name: `punctuation.definition.table.header.${S}` } } : {}),
    },
    end: r`(?=\x20*\|)`,
    ...(bang || headerRow ? { contentName: headerContent } : {}),
    patterns: inner('cell'),
  });
  return {
    name: `meta.table.row.${S}`,
    begin,
    end: r`(\|)([fh]?)$`,
    endCaptures: { 1: sep, 2: { name: `keyword.other.table-row-type.${S}` } },
    patterns: [
      {
        // ">" merges with the cell on the right, "~" with the cell above
        match: r`(\|)([>~])(?=\|)`,
        captures: { 1: sep, 2: { name: `keyword.operator.table-span.${S}` } },
      },
      cell(true),
      cell(false),
    ],
  };
}

// Terminators of the containers whose content is wikified up to a marker on
// the same or a later line (see subWikifyTerm calls in Formatter.js).
// Line-terminated containers (headings, list items, quote lines) need no
// variant: a single-line match cannot run past the end of the line anyway.
const terminators = {
  bold: "''",
  italic: '//',
  underline: '__',
  sup: r`\^\^`,
  sub: '~~',
  strike: '--',
  highlight: '@@',
  'class-wrapper': r`\}\}\}`,
  cell: r`\x20*\|`,
  caption: r`\|[fhck]?$`,
};
const inner = (key) => [{ include: `#wikitext--${key}` }];

const repository = {
  // The order of this list is the order of config.formatters.
  wikitext: {
    patterns: [
      { include: '#table' },
      { include: '#heading' },
      { include: '#list' },
      { include: '#quote-block' },
      { include: '#quote-line' },
      { include: '#rule' },
      { include: '#monospaced-block' },
      { include: '#wikify-comment' },
      { include: '#macro' },
      { include: '#pretty-link' },
      { include: '#wiki-link' },
      { include: '#url-link' },
      { include: '#image' },
      { include: '#html' },
      { include: '#comment' },
      { include: '#character-format' },
      { include: '#custom-format' },
      { include: '#line-break' },
      { include: '#raw-text' },
      { include: '#html-entity' },
      { include: '#math' },
      { include: '#embedded-grammar-dependencies' },
    ],
  },

  // vscode-textmate only loads an embedded grammar when it is reachable through
  // "patterns" (it does not look inside "captures"). This rule never matches; it
  // exists so that VS Code loads the LaTeX and HTML grammars used in captures.
  'embedded-grammar-dependencies': {
    begin: '(?!)',
    end: '(?!)',
    patterns: [
      { include: 'text.tex#math-content' },
      { include: 'text.tex.latex' },
      { include: 'text.html.basic' },
    ],
  },

  // table: "^\|(?:[^\n]*)\|(?:[fhck]?)$"
  table: {
    patterns: [
      {
        // class row: |className|k
        name: `meta.table.class-row.${S}`,
        match: r`^(\|)([^\n]*)(\|)(k)$`,
        captures: {
          1: { name: `punctuation.separator.table.${S}` },
          2: { name: `entity.other.attribute-name.class.${S}` },
          3: { name: `punctuation.separator.table.${S}` },
          4: { name: `keyword.other.table-row-type.${S}` },
        },
      },
      {
        // caption row: |caption|c  (wikified as a whole, no cells)
        name: `meta.table.caption.${S}`,
        begin: r`^(\|)(?=[^\n]*\|c$)`,
        beginCaptures: { 1: { name: `punctuation.separator.table.${S}` } },
        end: r`(\|)([fhck]?)$`,
        endCaptures: {
          1: { name: `punctuation.separator.table.${S}` },
          2: { name: `keyword.other.table-row-type.${S}` },
        },
        patterns: inner('caption'),
      },
      // |h rows are a <thead>: every cell is a header cell
      tableRow(r`^(?=\|[^\n]*\|h$)`, true),
      tableRow(r`^(?=\|[^\n]*\|f?$)`, false),
    ],
  },

  // heading: "^!{1,6}", ends at the newline
  heading: {
    name: `markup.heading.${S}`,
    begin: '^(!{1,6})',
    beginCaptures: {
      1: { name: `punctuation.definition.heading.${S} punctuation.definition.heading.markdown` },
    },
    end: '$',
    contentName: `entity.name.section.${S}`,
    patterns: [{ include: '#wikitext' }],
  },

  // list: "^(?:[\*#;:]+)", the last marker character decides the item type
  // TiddlyWiki's list formatter keeps reading item lines for as long as they
  // start with * # ; or :, so consecutive items form one block. This matters for
  // plugin documentation: after a list, a "***/" line is read as a level-3 item
  // and does not close the /*** comment.
  list: {
    name: `meta.list.${S}`,
    begin: '^(?=[*#;:])',
    end: '^(?![*#;:])',
    patterns: [
      listRule(r`\*`, 'unnumbered'),
      listRule('#', 'numbered'),
      listRule(';', 'definition.term'),
      listRule(':', 'definition.description'),
    ],
  },

  // quoteByBlock: "^<<<\n" ... "^<<<"
  'quote-block': {
    name: `markup.quote.block.${S}`,
    begin: '^(<<<)$',
    beginCaptures: { 1: { name: `punctuation.definition.quote.begin.${S} punctuation.definition.quote.begin.markdown` } },
    end: '^(<<<)$',
    endCaptures: { 1: { name: `punctuation.definition.quote.end.${S} punctuation.definition.quote.begin.markdown` } },
    patterns: [{ include: '#wikitext' }],
  },

  // quoteByLine: "^>+"
  'quote-line': {
    name: `markup.quote.${S}`,
    begin: '^(>+)',
    beginCaptures: { 1: { name: `punctuation.definition.quote.begin.${S} punctuation.definition.quote.begin.markdown` } },
    end: '$',
    patterns: [{ include: '#wikitext' }],
  },

  // rule: "^----+$\n?|<hr ?/?>\n?"
  rule: {
    name: `meta.separator.${S}`,
    match: '^----+$|<hr ?/?>',
  },

  // monospacedByLine: {{{, //{{{ (plugin JS), /*{{{*/ (CSS), <!--{{{--> (HTML templates)
  'monospaced-block': {
    patterns: [
      fencedBlock(r`/\*\{\{\{\*/`, r`/\*\}\}\}\*/`, 'css', 'meta.embedded.block.css', 'source.css'),
      fencedBlock(r`\{\{\{`, r`\}\}\}`, 'plain', `markup.inline.raw.block.${S}`),
      fencedBlock(r`//\{\{\{`, r`//\}\}\}`, 'javascript', 'meta.embedded.block.javascript', 'source.js'),
      fencedBlock(r`<!--\{\{\{-->`, r`<!--\}\}\}-->`, 'html', 'meta.embedded.block.html', 'text.html.basic'),
    ],
  },

  // wikifyComment: "/***" ... "***/" and "<!---" ... "--->"; the inside is wikified
  'wikify-comment': {
    patterns: [
      {
        name: `meta.documentation.${S}`,
        begin: r`^(/\*\*\*)$`,
        beginCaptures: { 1: { name: `comment.block.documentation.${S} punctuation.definition.comment.begin.${S}` } },
        end: r`^(\*\*\*/)$`,
        endCaptures: { 1: { name: `comment.block.documentation.${S} punctuation.definition.comment.end.${S}` } },
        patterns: [{ include: '#wikitext' }],
      },
      {
        name: `meta.documentation.${S}`,
        begin: '^(<!---)$',
        beginCaptures: { 1: { name: `comment.block.documentation.${S} punctuation.definition.comment.begin.${S}` } },
        end: '^(--->)$',
        endCaptures: { 1: { name: `comment.block.documentation.${S} punctuation.definition.comment.end.${S}` } },
        patterns: [{ include: '#wikitext' }],
      },
    ],
  },

  // macro: <<name params>>, params may span lines; ">>" always ends it
  macro: {
    patterns: [
      {
        name: `meta.macro.${S}`,
        begin: r`(<<)([^>\s]+)`,
        beginCaptures: {
          1: { name: `punctuation.definition.macro.begin.${S}` },
          2: { name: `entity.name.function.macro.${S}` },
        },
        end: '(>>)',
        endCaptures: { 1: { name: `punctuation.definition.macro.end.${S}` } },
        patterns: [{ include: '#macro-params' }],
      },
      {
        // "<<" not followed by a macro name is dropped from the rendered tiddler
        name: `invalid.illegal.macro.${S}`,
        match: r`<<(?=[\s>]|$)`,
      },
    ],
  },
  'macro-params': {
    patterns: [
      {
        match: r`([^\s:"'\[\]{}>]+)(:)`,
        captures: {
          1: { name: `variable.parameter.${S}` },
          2: { name: `punctuation.separator.key-value.${S}` },
        },
      },
      { name: `string.quoted.double.${S}`, begin: '"', end: '"|(?=>>)' },
      { name: `string.quoted.single.${S}`, begin: "'", end: "'|(?=>>)" },
      { name: `string.quoted.other.brackets.${S}`, begin: r`\[\[`, end: r`\]\]|(?=>>)` },
      { name: `meta.embedded.expression.${S} string.interpolated.${S}`, begin: r`\{\{`, end: r`\}\}|(?=>>)` },
    ],
  },

  // prettyLink: /\[\[(.*?)(?:\|(~)?(.*?))?\]\]/ (single line)
  'pretty-link': {
    patterns: [
      {
        name: `meta.link.${S}`,
        match: r`(\[\[)((?:(?!\]\])[^|])*?)(\|)(~)?(.*?)(\]\])`,
        captures: {
          1: { name: `punctuation.definition.link.begin.${S}` },
          2: { name: `string.other.link.title.${S}` },
          3: { name: `punctuation.separator.link.${S}` },
          4: { name: `constant.character.escape.${S}` },
          5: { name: `markup.underline.link.${S}` },
          6: { name: `punctuation.definition.link.end.${S}` },
        },
      },
      {
        name: `meta.link.${S}`,
        match: r`(\[\[)(.*?)(\]\])`,
        captures: {
          1: { name: `punctuation.definition.link.begin.${S}` },
          2: { name: `string.other.link.title.${S} markup.underline.link.${S}` },
          3: { name: `punctuation.definition.link.end.${S}` },
        },
      },
      {
        // TiddlyWiki drops a "[[" that has no "]]" on the same line
        name: `invalid.illegal.unclosed-link.${S}`,
        match: r`\[\[`,
      },
    ],
  },

  'wiki-link': wikiLinkRule(null),
  'url-link': urlLinkRule(null),

  // image: [img[src]], [<img[...]], [>img[...]], [img[tooltip|src][link]]
  image: {
    name: `meta.image.${S}`,
    match: r`(\[)(<?)(>?)([Ii][Mm][Gg])(\[)(?:([^|\]]+)(\|))?([^\[\]|]+)(\])(?:(\[)([^\]]*)(\]))?(\])`,
    captures: {
      1: { name: `punctuation.definition.image.begin.${S}` },
      2: { name: `keyword.operator.float.${S}` },
      3: { name: `keyword.operator.float.${S}` },
      4: { name: `keyword.other.image.${S}` },
      5: { name: `punctuation.definition.image.begin.${S}` },
      6: { name: `string.other.link.description.${S}` },
      7: { name: `punctuation.separator.link.${S}` },
      8: { name: `markup.underline.link.image.${S}` },
      9: { name: `punctuation.definition.image.end.${S}` },
      10: { name: `punctuation.definition.link.begin.${S}` },
      11: { name: `markup.underline.link.${S}` },
      12: { name: `punctuation.definition.link.end.${S}` },
      13: { name: `punctuation.definition.image.end.${S}` },
    },
  },

  // html: <html> ... </html>, non-greedy, may span lines
  html: {
    patterns: [
      {
        name: `meta.html.${S}`,
        match: r`((?i:<html>))(.*?)((?i:</html>))`,
        captures: {
          1: { name: `punctuation.definition.html.begin.${S} entity.name.tag.${S}` },
          2: { name: 'meta.embedded.block.html', patterns: [{ include: 'text.html.basic' }] },
          3: { name: `punctuation.definition.html.end.${S} entity.name.tag.${S}` },
        },
      },
      {
        name: `meta.html.${S}`,
        begin: r`((?i:<html>))(?!.*?(?i:</html>))`,
        beginCaptures: { 1: { name: `punctuation.definition.html.begin.${S} entity.name.tag.${S}` } },
        end: r`((?i:</html>))`,
        endCaptures: { 1: { name: `punctuation.definition.html.end.${S} entity.name.tag.${S}` } },
        patterns: [
          {
            match: r`(?:(?!(?i:</html>)).)+`,
            captures: { 0: { name: 'meta.embedded.block.html', patterns: [{ include: 'text.html.basic' }] } },
          },
        ],
      },
    ],
  },

  // commentByBlock: /% ... %/
  comment: {
    name: `comment.block.${S}`,
    begin: '/%',
    beginCaptures: { 0: { name: `punctuation.definition.comment.begin.${S}` } },
    end: '%/',
    endCaptures: { 0: { name: `punctuation.definition.comment.end.${S}` } },
  },

  // characterFormat: "''|//|__|\^\^|~~|--(?!\s|$)|\{\{\{"
  'character-format': {
    patterns: [
      charFormat("''", "''", sc('markup.bold'), 'bold'),
      charFormat('//', '//', sc('markup.italic'), 'italic'),
      charFormat('__', '__', sc('markup.underline'), 'underline'),
      charFormat(r`\^\^`, r`\^\^`, sc('markup.other.superscript'), 'sup'),
      charFormat('~~', '~~', sc('markup.other.subscript'), 'sub'),
      charFormat(r`--(?!\s|$)`, '--', sc('markup.strikethrough'), 'strike'),
      {
        name: `markup.inline.raw.${S}`,
        begin: r`\{\{\{`,
        beginCaptures: { 0: { name: `punctuation.definition.raw.begin.${S}` } },
        end: r`\}\}\}`,
        endCaptures: { 0: { name: `punctuation.definition.raw.end.${S}` } },
      },
    ],
  },

  // customFormat: @@css;text@@, @@highlight@@, {{className{text}}}
  'custom-format': {
    patterns: [
      {
        name: `markup.other.styled.${S}`,
        begin: `(@@)((?:${cssDecl})+)`,
        beginCaptures: {
          1: { name: `punctuation.definition.format.begin.${S}` },
          2: inlineCss,
        },
        end: '@@',
        endCaptures: { 0: { name: `punctuation.definition.format.end.${S}` } },
        patterns: inner('highlight'),
      },
      {
        // TiddlyWiki gives this span the class "marked"
        name: `markup.highlight.${S}`,
        begin: '@@',
        beginCaptures: { 0: { name: `punctuation.definition.format.begin.${S}` } },
        end: '@@',
        endCaptures: { 0: { name: `punctuation.definition.format.end.${S}` } },
        patterns: inner('highlight'),
      },
      {
        name: `meta.class-wrapper.${S}`,
        begin: r`(\{\{)\s*(\w+[\s\w-]*?)\s*(\{)`,
        beginCaptures: {
          1: { name: `punctuation.definition.class.begin.${S}` },
          2: { name: `entity.other.attribute-name.class.${S}` },
          3: { name: `punctuation.definition.class.begin.${S}` },
        },
        end: r`\}\}\}`,
        endCaptures: { 0: { name: `punctuation.definition.class.end.${S}` } },
        patterns: inner('class-wrapper'),
      },
    ],
  },

  'line-break': {
    match: '(<)(br)( ?/?)(>)',
    captures: {
      1: { name: `punctuation.definition.tag.begin.${S}` },
      2: { name: `entity.name.tag.${S}` },
      3: { name: `punctuation.definition.tag.end.${S}` },
      4: { name: `punctuation.definition.tag.end.${S}` },
    },
  },

  // rawText: """...""" or <nowiki>...</nowiki>
  'raw-text': {
    name: `markup.other.nowiki.${S}`,
    begin: '"""|<nowiki>',
    beginCaptures: { 0: { name: `punctuation.definition.nowiki.begin.${S}` } },
    end: '"""|</nowiki>',
    endCaptures: { 0: { name: `punctuation.definition.nowiki.end.${S}` } },
  },

  'html-entity': {
    name: `constant.character.entity.${S}`,
    match: '&#?[a-zA-Z0-9]{2,8};',
  },

  math: {
    patterns: [
      { include: '#math-display-line' },
      { include: '#math-display-multiline' },
      { include: '#math-dollar-line' },
      { include: '#math-dollar-multiline' },
      { include: '#math-inline-line' },
      { include: '#math-inline-multiline' },
    ],
  },
  ...mathRules('display', r`\\\[`, r`\\\]`, 'display'),
  ...mathRules('dollar', r`\$\$`, r`\$\$`, 'display'),
  ...mathRules('inline', r`\\\(`, r`\\\)`, 'inline'),
};

// wikitext--<container>: the same formatter list, with the WikiWord and URL
// rules replaced by variants that stop before the container's terminator.
for (const [key, term] of Object.entries(terminators)) {
  repository[`wiki-link--${key}`] = wikiLinkRule(term);
  repository[`url-link--${key}`] = urlLinkRule(term);
  repository[`wikitext--${key}`] = {
    patterns: repository.wikitext.patterns.map((p) =>
      p.include === '#wiki-link' || p.include === '#url-link' ? { include: `${p.include}--${key}` } : p
    ),
  };
}

const grammar = {
  $schema: 'https://raw.githubusercontent.com/martinring/tmlanguage/master/tmlanguage.json',
  information_for_contributors: [
    'This file is generated by syntaxes/build-grammar.mjs. Edit that file instead.',
  ],
  name: 'TiddlyWiki Classic',
  scopeName: 'text.tiddlywiki.classic',
  patterns: [{ include: '#wikitext' }],
  repository,
};

const out = join(dirname(fileURLToPath(import.meta.url)), 'tiddlywiki-classic.tmLanguage.json');
writeFileSync(out, JSON.stringify(grammar, null, '\t') + '\n');
console.log('wrote', out);
