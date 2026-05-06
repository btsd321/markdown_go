import * as vscode from 'vscode';
import { MarkdownGoEditorProvider } from './editorProvider';
import { logger } from './log/logger';

export function activate(context: vscode.ExtensionContext) {
  logger.init(vscode.window.createOutputChannel('MarkDownGo'));
  logger.info('========================================');
  logger.info('Markdown Go extension is now active!');
  logger.info(`Extension path: ${context.extensionPath}`);
  logger.info('========================================');

  try {
    const disposable = MarkdownGoEditorProvider.register(context);
    context.subscriptions.push(disposable);
    logger.info('CustomTextEditorProvider registered successfully');
  } catch (error) {
    logger.error(`Failed to register CustomTextEditorProvider: ${error instanceof Error ? error.message : String(error)}`);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownGo.openWith', async () => {
      logger.debug('Command: markdownGo.openWith triggered');
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.document.languageId === 'markdown') {
        await vscode.commands.executeCommand(
          'vscode.openWith',
          editor.document.uri,
          'markdownGo.editor'
        );
      } else {
        vscode.window.showInformationMessage('Please open a Markdown file first');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownGo.switchMode', async () => {
      logger.debug('Command: markdownGo.switchMode triggered');
      vscode.window.showInformationMessage('Use the mode selector in the editor');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('markdownGo.switchLanguage', async () => {
      logger.debug('Command: markdownGo.switchLanguage triggered');
      vscode.window.showInformationMessage('Use the language selector in the editor');
    })
  );

  logger.info('All commands registered successfully');
  logger.channel?.show(true);
}

export function deactivate() {
  logger.info('Markdown Go extension is now deactivated');
}
