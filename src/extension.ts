import * as vscode from 'vscode';
import { MarkdownGoEditorProvider } from './editorProvider';

export function activate(context: vscode.ExtensionContext) {
  console.log('Markdown Go extension is now active');

  // 注册自定义编辑器
  context.subscriptions.push(
    MarkdownGoEditorProvider.register(context)
  );

  // 注册命令
  context.subscriptions.push(
    vscode.commands.registerCommand('markdownGo.openWith', async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          editor.document.uri,
          'markdownGo.editor'
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownGo.switchMode', async () => {
      // 模式切换由 Webview 内部处理，这里只是占位
      vscode.window.showInformationMessage('Use the mode selector in the editor');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownGo.switchLanguage', async () => {
      // 语言切换由 Webview 内部处理，这里只是占位
      vscode.window.showInformationMessage('Use the language selector in the editor');
    })
  );
}

export function deactivate() {
  console.log('Markdown Go extension is now deactivated');
}
