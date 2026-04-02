import * as vscode from 'vscode';
import { FormePreviewPanel } from './preview-panel.js';
import { LayoutStore } from './layout-store.js';
import { ComponentTreeProvider } from './component-tree-provider.js';
import { InspectorViewProvider } from './inspector-view-provider.js';

export function activate(context: vscode.ExtensionContext) {
  // One-time welcome message on first install
  const hasShownWelcome = context.globalState.get('forme.welcomeShown');
  if (!hasShownWelcome) {
    context.globalState.update('forme.welcomeShown', true);
    vscode.window.showInformationMessage(
      'Welcome to Forme! Sign up at app.formepdf.com to manage templates, get an API key, and render from your application.',
      'Sign Up',
      'Dismiss',
    ).then(selection => {
      if (selection === 'Sign Up') {
        vscode.env.openExternal(vscode.Uri.parse('https://accounts.formepdf.com/sign-up?redirect_url=https%3A%2F%2Fapp.formepdf.com%2F'));
      }
    });
  }

  const store = new LayoutStore();
  const treeProvider = new ComponentTreeProvider();
  const inspectorProvider = new InspectorViewProvider(context.extensionUri);

  // Register tree webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ComponentTreeProvider.viewType,
      treeProvider,
    ),
  );

  // Register inspector webview
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      InspectorViewProvider.viewType,
      inspectorProvider,
    ),
  );

  // Tree selection → store
  context.subscriptions.push(
    treeProvider.onSelect((path) => {
      const sel = store.resolveElementByPath(path);
      if (sel) {
        store.setSelection(sel);
      }
    }),
  );

  // Tree hover → preview highlight (transient, doesn't change selection)
  context.subscriptions.push(
    treeProvider.onHover((path) => {
      if (path) {
        const sel = store.resolveElementByPath(path);
        FormePreviewPanel.hoverElement(sel);
      } else {
        FormePreviewPanel.hoverElement(null);
      }
    }),
  );

  // Store selection → inspector + preview highlight + tree sync
  context.subscriptions.push(
    store.onSelectionChanged((sel) => {
      inspectorProvider.updateElement(sel);
      FormePreviewPanel.highlightElement(sel);
      treeProvider.selectPath(sel?.path ?? null);
    }),
  );

  // Store layout → tree
  context.subscriptions.push(
    store.onLayoutChanged((layout) => {
      treeProvider.updateLayout(layout);
    }),
  );

  // Preview data content → tree data tab
  context.subscriptions.push(
    FormePreviewPanel.onDataContent((content) => {
      treeProvider.setDataContent(content);
    }),
  );

  // Tree data edit → preview re-render
  context.subscriptions.push(
    treeProvider.onDataChanged(({ data, raw }) => {
      FormePreviewPanel.updateData(data, context, raw);
    }),
  );

  // Track active Forme files for editor title button + auto-open
  updateFormeContext(vscode.window.activeTextEditor);
  maybeAutoOpen(context, vscode.window.activeTextEditor, store);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      updateFormeContext(editor);
      maybeAutoOpen(context, editor, store);
    }),
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('forme.openPreview', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      FormePreviewPanel.createOrShow(context, editor.document.uri, false, store, false);
    }),

    vscode.commands.registerCommand('forme.openPreviewToSide', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      FormePreviewPanel.createOrShow(context, editor.document.uri, true, store, false);
    }),
  );

  context.subscriptions.push(store);
}

export function deactivate() {}

function updateFormeContext(editor: vscode.TextEditor | undefined) {
  const isFormeFile = editor ? detectFormeFile(editor.document) : false;
  vscode.commands.executeCommand('setContext', 'forme.isFormeFile', isFormeFile);
}

function detectFormeFile(doc: vscode.TextDocument): boolean {
  const text = doc.getText();
  if (['typescriptreact', 'javascriptreact'].includes(doc.languageId)) {
    return text.includes('@formepdf/react') || text.includes('formepdf');
  }
  if (doc.languageId === 'python') {
    return text.includes('import formepdf') || text.includes('from formepdf');
  }
  return false;
}

function maybeAutoOpen(
  context: vscode.ExtensionContext,
  editor: vscode.TextEditor | undefined,
  store: LayoutStore,
) {
  if (!editor) return;
  const autoOpen = vscode.workspace
    .getConfiguration('forme')
    .get<boolean>('autoOpen', false);
  if (!autoOpen) return;
  if (!detectFormeFile(editor.document)) return;
  // Always update the preview for the current file (single panel now follows the editor)
  FormePreviewPanel.createOrShow(context, editor.document.uri, true, store, true);
}
