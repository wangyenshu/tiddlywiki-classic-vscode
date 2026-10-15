# TiddlyWiki Classic for VS Code

Syntax highlighting for [TiddlyWiki Classic](https://classic.tiddlywiki.com) wiki text, including MathJax formulas (`\( \)`, `\[ \]`, `$$ $$`) as used by the MathJaxPlugin.

## Features

- **Wiki text:** every TiddlyWiki Classic formatter is highlighted:
  - headings, `''bold''`, `//italic//`, `__underline__`, `--strike--`, `^^sup^^`, `~~sub~~`, `{{{code}}}`
  - lists, `>` and `<<<` quotes, rules
  - `[[links]]`, WikiWords, URLs, `[img[…]]`
  - `<<macros>>`, tables, `/%comments%/`, `"""raw"""`, `<nowiki>`, `<html>`, entities
  - `@@…@@`, `{{class{…}}}`
- **Math:** formula content uses VS Code's built-in LaTeX grammar. A formula ends at the first closing delimiter, as in the MathJaxPlugin.
- **Code blocks:** `//{{{ //}}}` uses the JavaScript grammar, `/*{{{*/ /*}}}*/` CSS, and `<!--{{{--> <!--}}}-->` and `<html>` HTML. `/*** ***/` content is highlighted as wiki text.
- **Outline:** headings, plus labels such as `''Lemma 1.4.6''` nested under them. Shown in the Outline view, breadcrumbs and Go to Symbol.
- **Folding:** headings, code blocks, doc comments, `<<<` quotes, multi-line display math, `<html>` and comments.
- **Editing:**
  - Auto-closes `\(`, `\[`, `<<`, `/%`, `\left(`, `\left[`, `\left\{`, `\{` and the `\bigl(` family.
  - Wraps a selection when you type `'`, `/`, `_`, `^`, `~` or `@`: typing `'` twice gives `''bold''`.
  - Toggle Block Comment inserts `/% %/`.

## Install

Download `tiddlywiki-classic-<version>.vsix` from the GitHub release, then:

```
code --install-extension tiddlywiki-classic-<version>.vsix
```

or Extensions view → **…** → **Install from VSIX…**

## Files

`.tid` files open as TiddlyWiki Classic. For other files, use the language picker in the status bar.

If a TiddlyWiki5 extension is also installed, it may claim `.tid` too. To force this one:

```json
"files.associations": { "*.tid": "tiddlywiki-classic" }
```

## Settings

| Setting | Default | Description |
|---|---|---|
| `tiddlywikiClassic.outline.labelPattern` | matches `''Definition …''`, `''Theorem …''`, `''Lemma …''`, `''Proposition …''`, `''Corollary …''`, `''Remark …''`, `''Example …''`, `''Exercise …''`, `''Conjecture …''`, `''Notation …''`, `''Claim …''`, `''Proof …''` | Regular expression for outline labels. Group 1 is the displayed name. Empty string: headings only. |

The extension also sets these defaults: word wrap on for this language, `@@…@@` text red (`#E5484D`), and sup/subscripts in italic.

## Colors

Tokens use standard TextMate scopes, so any theme applies. To override a color:

```json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    { "scope": "markup.highlight.tiddlywiki", "settings": { "foreground": "#FF8800" } }
  ]
}
```

| Construct | Scope |
|---|---|
| Heading | `markup.heading.tiddlywiki` |
| Bold / italic / underline / strike | `markup.bold.tiddlywiki` / `markup.italic.tiddlywiki` / `markup.underline.tiddlywiki` / `markup.strikethrough.tiddlywiki` |
| Sup / sub | `markup.other.superscript.tiddlywiki` / `markup.other.subscript.tiddlywiki` |
| `@@highlight@@` / `@@css;styled@@` | `markup.highlight.tiddlywiki` / `markup.other.styled.tiddlywiki` |
| Inline / display math | `markup.math.inline.tiddlywiki` / `markup.math.display.tiddlywiki` |
| Link / WikiWord / URL | `meta.link.tiddlywiki` / `markup.underline.link.wikiword.tiddlywiki` / `markup.underline.link.url.tiddlywiki` |
| Macro name | `entity.name.function.macro.tiddlywiki` |
| Table header cell | `markup.bold.table-header.tiddlywiki` |
| Comment / plugin docs | `comment.block.tiddlywiki` / `meta.documentation.tiddlywiki` |

**Developer: Inspect Editor Tokens and Scopes** shows the scopes at the cursor.

## Accuracy

The tests run TiddlyWiki Classic 2.10.2's own `Formatter.js` and `Wikifier.js`, plus the MathJaxPlugin formatter, and compare the result with the grammar character by character. They match on all 248 test files: the 223 TiddlyWiki Classic documentation tiddlers, 23 edge-case files and 2 real tiddlers.

TiddlyWiki behaviors reproduced:

- A URL or WikiWord ends at the enclosing format's closing marker. In `//see http://x.org//`, the italics end inside `http://`.
- After a list, `***/` is a level-3 list item and does not close `/***`.
- An unclosed `''` (or another format) continues onto later lines until the next one.
- `$…$` is not math.
- `aWikiWord` is not a link. `~WikiWord` is not a link.

## Limitations

- **Missing closer:** if `\(`, `\[`, `$$`, `/%`, `{{{`, `<html>`, `"""` or `<<` has no closer anywhere after it, TiddlyWiki renders plain text, but the grammar highlights to the end of the file.
- **WikiWords in plugin tiddlers:** TiddlyWiki does not link WikiWords in tiddlers tagged `systemConfig` or `excludeMissing`. The grammar cannot see tags.
- **Other plugins:** formatters added by plugins other than the MathJaxPlugin are not recognized.

## Development

```
npm install
npm test              # scope tests, TiddlyWiki comparison, outline/folding tests
npm run test:oracle   # comparison report per corpus file
npm run build         # regenerate syntaxes/tiddlywiki-classic.tmLanguage.json
npm run package       # build the .vsix
```

- **Grammar:** generated by `syntaxes/build-grammar.mjs`. Edit that file, not the JSON.
- **New test cases:** add a file to `test/corpus/`; it is checked against TiddlyWiki automatically. Test files must end in `.twc`.
- **End-to-end tests:** install the `.vsix` into [code-server](https://github.com/coder/code-server) and check rendering, outline and editing in Chromium. They need `CODE_SERVER` set:

```
CODE_SERVER=/path/to/code-server/out/node/entry.js npm run test:e2e
```

## Releases

`.github/workflows/publish.yml` runs when a `v*` tag is pushed. It runs the tests, builds `tiddlywiki-classic-<version>.vsix`, and attaches it to the GitHub release.

- **Creating a release in the GitHub web UI** with a new `v*` tag also triggers it.
- **Manual runs** (Actions → **Run workflow**) only build. The `.vsix` is kept as a workflow artifact.

To release:

```
# set "version" in package.json, commit
git tag v0.1.1 && git push origin v0.1.1
```

The workflow fails if the tag does not match `version`.

## Licenses

- **Extension:** MIT.
- **Embedded grammars:** LaTeX, JavaScript, CSS and HTML highlighting use VS Code's built-in grammars (MIT) at run time.
- **Test-only copies:** `test/vendor-grammars/` (VS Code grammars, MIT) and `test/oracle/tiddlywiki-classic/` (TiddlyWiki Classic, BSD; see `copyright.txt`). Neither is included in the `.vsix`.
