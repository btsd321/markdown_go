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
    vscode.commands.registerCommand(
      'markdownGo.openWith',
      async (uriArg?: vscode.Uri, uris?: vscode.Uri[]) => {
        logger.debug('Command: markdownGo.openWith triggered');
        // 资源管理器右键时 VS Code 会传入 (uri, uris)；命令面板/编辑器标题没有参数
        const targets: vscode.Uri[] = [];
        if (uris && uris.length) targets.push(...uris);
        else if (uriArg) targets.push(uriArg);
        else if (vscode.window.activeTextEditor) {
          targets.push(vscode.window.activeTextEditor.document.uri);
        }
        const mdTargets = targets.filter((u) => /\.mdx?$|\.md$/i.test(u.fsPath));
        if (mdTargets.length === 0) {
          vscode.window.showInformationMessage('Please open a Markdown file first');
          return;
        }
        for (const u of mdTargets) {
          await vscode.commands.executeCommand('vscode.openWith', u, 'markdownGo.editor');
        }
      },
    ),
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
