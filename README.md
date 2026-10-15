# TiddlyWiki Classic for VS Code

This extension adds syntax highlighting for [TiddlyWiki Classic](https://classic.tiddlywiki.com) wiki text. Formulas written for the MathJax plugin (`\( … \)`, `\[ … \]` and `$$ … $$`) are highlighted with VS Code's built-in LaTeX grammar.

The highlighting follows what TiddlyWiki Classic actually renders. Every rule mirrors one of TiddlyWiki's own formatters, in the same order, and the test suite runs TiddlyWiki's real wikifier on hundreds of tiddlers to check that the editor agrees with it on every character.

## Features

- **Wiki text:** headings, `''bold''`, `//italic//`, `__underline__`, `--strike--`, `^^sup^^`, `~~sub~~` and `{{{code}}}` are all highlighted. So are lists (`*`, `#`, `;`, `:`), quotes (`>` and `<<<`), rules, `[[links]]`, WikiWords, URLs and `[img[…]]` images. The rest of the syntax is covered too:
  - `<<macro params>>`
  - tables, including header, caption, class, colspan and rowspan rows and inline cell styles
  - `/%comments%/`, `"""raw"""`, `<nowiki>`, `<html>` and entities
  - `@@highlight@@`, `@@css:value;styled@@` and `{{class{…}}}`
- **Math (MathJaxPlugin):** formulas are tokenized with VS Code's LaTeX grammar and colored like math in a `.tex` file, with commands, braces, numbers and `\text{…}` distinguished. VS Code reports the language inside a formula as LaTeX. A formula ends at the first closing delimiter, exactly as the plugin's regular expression does, and formulas can span lines.
- **Code blocks:** `//{{{ … //}}}` (plugin code) uses VS Code's JavaScript grammar, `/*{{{*/ … /*}}}*/` (style sheets) its CSS grammar, and `<!--{{{--> … <!--}}}-->` (templates) and `<html>` its HTML grammar. `/*** … ***/` plugin documentation is highlighted as wiki text.
- **Outline and breadcrumbs:** headings are listed in the Outline view, breadcrumbs and *Go to Symbol* (Ctrl+Shift+O). So are bold statement labels such as `''Lemma 1.4.6''`, nested under the heading above them. The label pattern is configurable.
- **Folding:** headings, code blocks, doc comments, `<<<` quotes, multi-line display math, `<html>` and comments can be folded.
- **Editing:**
  - Typing `\(`, `\[`, `<<` or `/%` inserts the matching closer, and so do LaTeX's `\left(`, `\left[`, `\left\{`, `\{` and `\bigl(`-style openers.
  - With text selected, typing `'` twice makes it `''bold''` and typing `/` twice makes it `//italic//`. `_`, `^`, `~` and `@` wrap a selection the same way.
  - Toggle Block Comment inserts `/% … %/`.
  - Word wrap is on by default for this language.

## Install

In VS Code, open the Extensions view, click **…** at the top, choose **Install from VSIX…** and pick `tiddlywiki-classic-0.1.0.vsix`. Or run:

```
code --install-extension tiddlywiki-classic-0.1.0.vsix
```

## Files

Files ending in `.twc` open as TiddlyWiki Classic. For other files, pick **TiddlyWiki Classic** from the language picker in the status bar, or add an association in your settings:

```json
"files.associations": {
  "*.tiddler.txt": "tiddlywiki-classic",
  "**/my-wiki/**/*.tid": "tiddlywiki-classic"
}
```

`.tid` files are not claimed by default, because TiddlyWiki5 uses the same extension with a different syntax. For example, `~~` is strikethrough in TiddlyWiki5 but subscript in Classic.

## Colors

Constructs use the standard TextMate scopes that themes already color, such as `markup.bold`, `markup.heading`, `markup.italic`, `markup.inline.raw` and `comment`. Math is colored like math in LaTeX files. Two TiddlyWiki-specific defaults are added: `@@highlight@@` text is red, and sup/subscripts are italic.

To change a color, add a rule to your settings. For example, this shows `@@…@@` in orange and makes headings larger-looking:

```json
"editor.tokenColorCustomizations": {
  "textMateRules": [
    { "scope": "markup.highlight.tiddlywiki", "settings": { "foreground": "#FF8800" } },
    { "scope": "markup.heading.tiddlywiki", "settings": { "fontStyle": "bold underline" } }
  ]
}
```

Run **Developer: Inspect Editor Tokens and Scopes** on any text to see its scopes. The main ones are:

| Construct | Scope |
|---|---|
| Heading | `markup.heading.tiddlywiki` |
| Bold, italic, underline, strike | `markup.bold.tiddlywiki`, `markup.italic.tiddlywiki`, `markup.underline.tiddlywiki`, `markup.strikethrough.tiddlywiki` |
| Superscript, subscript | `markup.other.superscript.tiddlywiki`, `markup.other.subscript.tiddlywiki` |
| `@@highlight@@`, `@@css;styled@@` | `markup.highlight.tiddlywiki`, `markup.other.styled.tiddlywiki` |
| Inline math, display math | `markup.math.inline.tiddlywiki`, `markup.math.display.tiddlywiki` |
| Math delimiters | `punctuation.definition.math.begin.tiddlywiki`, `…end.tiddlywiki` |
| Link, WikiWord, URL | `meta.link.tiddlywiki`, `markup.underline.link.wikiword.tiddlywiki`, `markup.underline.link.url.tiddlywiki` |
| Macro name | `entity.name.function.macro.tiddlywiki` |
| Table header cell | `markup.bold.table-header.tiddlywiki` |
| Comment, plugin docs | `comment.block.tiddlywiki`, `meta.documentation.tiddlywiki` |

## How closely it matches TiddlyWiki

The test suite loads TiddlyWiki Classic's own `Formatter.js` and `Wikifier.js` plus the MathJax plugin's formatter in a simulated browser. It records which formatter handled each part of a tiddler and compares that with the editor's highlighting, character by character. They agree on every non-blank character of:

- all 223 tiddlers of the TiddlyWiki Classic documentation,
- 23 files of deliberately tricky cases,
- a page of math notes and a real theme style sheet.

Several TiddlyWiki behaviors that look like bugs are therefore reproduced on purpose, so the editor shows what the page will show:

- A URL or WikiWord cannot run past the closing marker of the formatting around it. In `//see http://example.com//`, the italics end at the `//` inside `http://`.
- After a list, a `***/` line is read as a level-3 bullet, so it does not end a `/***` comment.
- A heading or list item with an unclosed `''` stays bold until the next `''`, even on later lines.
- `$x$` is not math. The plugin only knows `\( \)`, `\[ \]` and `$$ $$`.
- A WikiWord directly after a letter or digit (`aWikiWord`) is not a link. `~WikiWord` is never a link.

### Known limitations

- **No closing delimiter at all:** if `\(`, `\[`, `$$`, `/%`, `{{{`, `<html>`, `"""` or `<<` has no closer anywhere later in the tiddler, TiddlyWiki shows it as plain text. The editor keeps it open to the end, because a TextMate grammar cannot look ahead to later lines. This is the same as an unclosed string in a code editor. If a closer exists further down, both agree.
- **WikiWords in plugin tiddlers:** TiddlyWiki does not auto-link WikiWords in tiddlers tagged `systemConfig` or `excludeMissing`. The editor can't see tags, so it always marks them.
- **Plugins:** only the MathJax plugin's syntax is added. Other plugins that add formatters are not recognized.

## Development

```
npm install
npm test               # scope tests, TiddlyWiki comparison and outline/folding tests
npm run test:oracle    # comparison report for every corpus file
npm run build          # regenerate the grammar from syntaxes/build-grammar.mjs
npm run package        # build the .vsix
```

The grammar is generated by `syntaxes/build-grammar.mjs`. Edit that file, not the JSON. To add a regression test, drop a `.twc` file into `test/corpus/`. It is then checked against TiddlyWiki automatically.

`npm run test:e2e` checks the packaged extension in a real VS Code, using [code-server](https://github.com/coder/code-server) (VS Code in the browser) driven by headless Chromium. It installs the `.vsix` and opens `examples/sample.twc`, then records the language mode, the outline and the colors VS Code rendered, and saves screenshots to `test-output/`. It also types into an editor to check auto-closing, wrapping a selection and block comments. Point it at a code-server install first:

```
export CODE_SERVER=/path/to/code-server/out/node/entry.js
npm run package && npm run test:e2e
```

## Publishing to Open VSX

`.github/workflows/publish.yml` publishes the extension to [Open VSX](https://open-vsx.org) whenever you push a version tag. It runs in two jobs:

- **`build`** runs the tests and builds the `.vsix`, with read-only access to the repository.
- **`publish`** sends that `.vsix` to Open VSX and attaches it to a GitHub release.

Publishing uses Open VSX [trusted publishing](https://github.com/eclipse-openvsx/openvsx/wiki/Trusted-Publishing). The `publish` job proves to Open VSX which repository, workflow and environment it is running in, and gets a token that expires in minutes. No access token is stored in GitHub.

### One-time setup

Open VSX only accepts a trusted publisher for an extension that already exists, so the first version is published by hand.

1. Create an [Eclipse Foundation account](https://accounts.eclipse.org/user/register) and enter your GitHub username in its **GitHub Username** field.
2. Sign in at [open-vsx.org](https://open-vsx.org) with GitHub. In your avatar's **Settings**, click **Log in with Eclipse**, then **Show Publisher Agreement**, and click **Agree**.
3. Under **Settings → Access Tokens**, click **Generate New Token**. You only need it for the next two steps.
4. Create your namespace, the name extensions are published under:
   ```
   npx ovsx create-namespace YOUR-NAMESPACE -p YOUR-TOKEN
   ```
5. In `package.json`, change `"publisher": "local"` to `YOUR-NAMESPACE`, with exactly the same capitalization. Commit it. Then publish the first version from your computer:
   ```
   npm ci
   npm run package
   npx ovsx publish tiddlywiki-classic-0.1.0.vsix -p YOUR-TOKEN
   ```
6. On open-vsx.org, go to **Settings → Trusted Publishers**, choose your namespace and **GitHub Actions**, and fill in:
   - **Organization or User name** and **Repository name**: your GitHub repository.
   - **Workflow filename**: `publish.yml`.
   - **Environment name**: `open-vsx`.
7. On GitHub, go to **Settings → Environments → New environment** and name it `open-vsx`. Under **Deployment branches and tags**, choose **Selected branches and tags** and add a tag rule `v*`. Only version tags can then publish. You can also add yourself as a required reviewer, so each release waits for your approval.
8. Delete the access token on open-vsx.org. It isn't needed anymore.

The registration is tied to the repository itself. If you rename or re-create the repository, delete the trusted publisher on open-vsx.org and register it again.

### Releasing

Set a new `"version"` in `package.json` (Open VSX won't accept the same version twice), commit, and push a matching tag:

```
git tag v0.1.1
git push origin v0.1.1
```

The workflow stops if the tag doesn't match the version or the publisher is still `local`. Running the workflow from the **Actions** tab (**Run workflow**) only tests and builds, and keeps the `.vsix` as a downloadable artifact.

The workflow pins `ovsx@1.2.0` in the publish step. If you update `ovsx` in `package.json`, change it there too.

## Credits

- Math, JavaScript, CSS and HTML highlighting are VS Code's built-in grammars (MIT), used at run time.
- `test/vendor-grammars/` holds copies of those grammars for the tests only.
- `test/oracle/tiddlywiki-classic/` holds test-only copies of TiddlyWiki Classic source files (BSD, see the `copyright.txt` there).
- Neither copy is included in the extension package.
