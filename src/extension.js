'use strict';

const vscode = require('vscode');
const { symbolTree, foldingRanges, DEFAULT_LABELS } = require('./structure');

const LANGUAGE = 'tiddlywiki-classic';

function linesOf(document) {
  const lines = [];
  for (let i = 0; i < document.lineCount; i++) lines.push(document.lineAt(i).text);
  return lines;
}

function labelPattern() {
  const value = vscode.workspace.getConfiguration('tiddlywikiClassic').get('outline.labelPattern');
  return typeof value === 'string' ? value : DEFAULT_LABELS;
}

function activate(context) {
  const selector = { language: LANGUAGE };

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(selector, {
      provideDocumentSymbols(document) {
        const toSymbol = (node) => {
          const range = new vscode.Range(node.line, 0, node.endLine, document.lineAt(node.endLine).text.length);
          const selection = document.lineAt(node.line).range;
          const kind = node.kind === 'heading' ? vscode.SymbolKind.String : vscode.SymbolKind.Function;
          const symbol = new vscode.DocumentSymbol(node.name, '', kind, range, selection);
          symbol.children = node.children.map(toSymbol);
          return symbol;
        };
        return symbolTree(linesOf(document), labelPattern()).map(toSymbol);
      },
    }),

    vscode.languages.registerFoldingRangeProvider(selector, {
      provideFoldingRanges(document) {
        return foldingRanges(linesOf(document)).map(
          (r) =>
            new vscode.FoldingRange(
              r.start,
              r.end,
              r.kind === 'comment' ? vscode.FoldingRangeKind.Comment : vscode.FoldingRangeKind.Region
            )
        );
      },
    })
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
