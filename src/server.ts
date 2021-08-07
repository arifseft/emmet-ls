#!/usr/bin/env node

import {
  extract,
  parseMarkup,
  parseStylesheet,
  resolveConfig,
  stringifyMarkup,
  stringifyStylesheet
} from 'emmet';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
  CompletionItem,
  CompletionItemKind,
  createConnection,
  DidChangeConfigurationNotification,
  InitializeParams,
  InitializeResult,
  InsertTextFormat,
  ProposedFeatures,
  TextDocumentPositionParams,
  TextDocuments,
  TextDocumentSyncKind
} from 'vscode-languageserver/node';

let connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
let documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

let hasConfigurationCapability: boolean = false;
let hasWorkspaceFolderCapability: boolean = false;

connection.onInitialize((params: InitializeParams) => {
  let capabilities = params.capabilities;

  // Does the client support the `workspace/configuration` request?
  // If not, we fall back using global settings.
  hasConfigurationCapability = !!(
    capabilities.workspace && !!capabilities.workspace.configuration
  );
  hasWorkspaceFolderCapability = !!(
    capabilities.workspace && !!capabilities.workspace.workspaceFolders
  );

  const result: InitializeResult = {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      // Tell the client that this server supports code completion.
      completionProvider: {
        resolveProvider: true,
      },
    },
  };
  if (hasWorkspaceFolderCapability) {
    result.capabilities.workspace = {
      workspaceFolders: {
        supported: true,
      },
    };
  }
  return result;
});

connection.onInitialized(() => {
  if (hasConfigurationCapability) {
    // Register for all configuration changes.
    connection.client.register(
      DidChangeConfigurationNotification.type,
      undefined
    );
  }
  if (hasWorkspaceFolderCapability) {
    connection.workspace.onDidChangeWorkspaceFolders((_event) => {
      connection.console.log('Workspace folder change event received.');
    });
  }
});

connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    item.insertTextFormat = InsertTextFormat.Snippet;
    return item;
  }
);
connection.onCompletion(
  (_textDocumentPosition: TextDocumentPositionParams): CompletionItem[] => {
    try {
      let docs = documents.get(_textDocumentPosition.textDocument.uri);
      if (!docs) throw 'failed to find document';
      let languageId = docs.languageId;
      let content = docs.getText();
      let linenr = _textDocumentPosition.position.line;
      let line = String(content.split(/\r?\n/g)[linenr]);
      let character = _textDocumentPosition.position.character;
      let extractPosition =
        languageId != 'css'
          ? extract(line, character)
          : extract(line, character, { type: 'stylesheet' });

      if (extractPosition?.abbreviation == undefined) {
        throw 'failed to parse line';
      }

      let left = extractPosition.start;
      let right = extractPosition.start;
      let abbreviation = extractPosition.abbreviation;
      let config = resolveConfig({
        type: languageId != 'css' ? 'markup' : 'stylesheet',
        options: {
          'output.field': (index: number, placeholder: string) =>
            `\$\{${index}${placeholder ? ':' + placeholder : ''}\}`,
      },
      });

      let textResult = languageId != 'css'
        ? stringifyMarkup(parseMarkup(abbreviation, config), config)
        : stringifyStylesheet(parseStylesheet(abbreviation, config), config);

      const range = {
        start: {
          line: linenr,
          character: left,
        },
        end: {
          line: linenr,
          character: right,
        },
      };

      return [
        {
          label: abbreviation,
          detail: abbreviation,
          documentation: textResult,
          textEdit: {
            range,
            newText  : textResult,
          },
          kind: CompletionItemKind.Snippet,
          data: {
            range,
            textResult,
          },
        },
      ];
    } catch (error) {
      connection.console.log(`ERR: ${error}`);
    }

    return [];
  }
);

documents.listen(connection);

connection.listen();
