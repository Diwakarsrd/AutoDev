import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LLMProvider } from '../providers/llmProvider';
import { DebuggerAgent } from '../agents/debuggerAgent';
import { PlannerAgent } from '../agents/plannerAgent';
import { FileUtils } from '../utils/fileUtils';
import { AgentEventBus } from '../utils/eventBus';

// Show native VS Code diff - professional syntax-highlighted view
async function showNativeDiff(
 filePath: string,
 originalContent: string,
 newContent: string,
 title: string
): Promise<boolean> {
 const tmpFile = path.join(os.tmpdir(), `autodev-orig-${path.basename(filePath)}`);
 fs.writeFileSync(tmpFile, originalContent, 'utf-8');
 fs.writeFileSync(filePath, newContent, 'utf-8');
 await vscode.commands.executeCommand(
 'vscode.diff',
 vscode.Uri.file(tmpFile),
 vscode.Uri.file(filePath),
 `AutoDev: ${title}`,
 { preview: true }
 );
 const choice = await vscode.window.showInformationMessage(
 `Apply this change to ${path.basename(filePath)}?`,
 'Apply', 'Revert');
 if (choice !== 'Apply') {
 fs.writeFileSync(filePath, originalContent, 'utf-8');
 try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
 return false;
 }
 try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
 return true;
}

//  Fix & Explain Selection 
export async function fixSelectionCommand(_eventBus: AgentEventBus): Promise<void> {
 const editor = vscode.window.activeTextEditor;
 if (!editor) {
 vscode.window.showErrorMessage('AutoDev: Open a file first');
 return;
 }

  const selection    = editor.selection;
  const hasSelection = !selection.isEmpty;
  const fullFileText = editor.document.getText();
  const selectedCode = hasSelection
    ? editor.document.getText(selection)
    : fullFileText;

  if (!selectedCode.trim()) {
    vscode.window.showWarningMessage('AutoDev: No code to analyse');
    return;
  }

  const language = FileUtils.getLanguage(editor.document.fileName);

  await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'AutoDev: Analysing...' },
    async progress => {
      const llm       = LLMProvider.fromVSCodeConfig();
      const debugger_ = new DebuggerAgent(llm);
      const planner   = new PlannerAgent(llm);
      progress.report({ message: 'Running analysis...' });

      try {
        const startLine = selection.start.line + 1;
        const endLine   = selection.end.line + 1;

        // Tell LLM to return ONLY the fixed selected lines - not the whole file
        const contextForLLM = hasSelection
          ? `Fix ONLY the code between lines ${startLine}-${endLine}. Return ONLY those fixed lines - nothing before or after them.\n\n${selectedCode}`
          : selectedCode;

        const [analysis, explanation] = await Promise.all([
          debugger_.analyzeAndFix(path.basename(editor.document.fileName), contextForLLM, language),
          planner.explainCode(selectedCode, language),
        ]);

        // Show results in output channel
        const channel = vscode.window.createOutputChannel('AutoDev: Analysis');
        channel.clear();
        channel.appendLine('='.repeat(60));
        channel.appendLine(`File:    ${path.basename(editor.document.fileName)}`);
        channel.appendLine(`Mode:    ${hasSelection ? `Selection (lines ${startLine}-${endLine})` : 'Full file'}`);
        channel.appendLine(`Issues:  ${analysis.issueCount}`);
        channel.appendLine(`Summary: ${analysis.summary}`);
        channel.appendLine('='.repeat(60));
        channel.appendLine('');
        channel.appendLine('EXPLANATION');
        channel.appendLine('-'.repeat(40));
        channel.appendLine(explanation);
        channel.show(true);

        if (analysis.hasIssues && analysis.fixedCode) {
          if (hasSelection) {
            // CRITICAL FIX: replace ONLY the selected range, never touch other lines
            const fixedSelection = analysis.fixedCode
              .replace(/^Fix ONLY.*?\n\n/s, '')
              .trimEnd();

            const choice = await vscode.window.showInformationMessage(
              `AutoDev found ${analysis.issueCount} issue(s). Apply fix?`,
              'Apply to Selection', 'Show Diff', 'Cancel'
            );

            if (choice === 'Apply to Selection') {
              // Only replaces the exact selected range - all other lines untouched
              await editor.edit(eb => eb.replace(selection, fixedSelection));
              vscode.window.showInformationMessage('AutoDev: Fix applied to selection only');

            } else if (choice === 'Show Diff') {
              // Build what the full file would look like after the fix
              const beforeSel = fullFileText.substring(0, editor.document.offsetAt(selection.start));
              const afterSel  = fullFileText.substring(editor.document.offsetAt(selection.end));
              const fullFixed = beforeSel + fixedSelection + afterSel;
              const kept = await showNativeDiff(
                editor.document.fileName, fullFileText, fullFixed, `Fix: ${analysis.summary}`
              );
              if (kept) {
                await vscode.commands.executeCommand('workbench.action.revertFile');
                vscode.window.showInformationMessage('AutoDev: Fix applied');
              }
            }

          } else {
            // Full file mode - replace everything
            const kept = await showNativeDiff(
              editor.document.fileName, fullFileText, analysis.fixedCode, `Fix: ${analysis.summary}`
            );
            if (kept) {
              await vscode.commands.executeCommand('workbench.action.revertFile');
              vscode.window.showInformationMessage('AutoDev: Fix applied');
            }
          }
        } else {
          vscode.window.showInformationMessage(
            `AutoDev: No issues found in ${hasSelection ? 'selection' : 'file'}`
          );
        }

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`AutoDev: ${msg}`);
        _eventBus.emit({ type: 'error', message: msg, timestamp: Date.now() });
      }
    }
  );
}

//  Refactor Current File 
export async function refactorFileCommand(_eventBus: AgentEventBus): Promise<void> {
 const editor = vscode.window.activeTextEditor;
 if (!editor) {
 vscode.window.showErrorMessage('AutoDev: Open a file first');
 return;
 }

 const goals = await vscode.window.showQuickPick(
 [
 { label: 'Performance', description: 'Optimize speed and memory usage', picked: true },
 { label: ' Readability', description: 'Improve naming, structure, comments', picked: true },
 { label: 'Security', description: 'Fix security vulnerabilities', picked: false },
 { label: 'Clean code', description: 'Remove duplication, simplify logic', picked: false },
 { label: 'Modern syntax', description: 'Use latest language features', picked: false },
 ],
 { canPickMany: true, placeHolder: 'Select refactoring goals' }
 );

 if (!goals || goals.length === 0) return;

 const code = editor.document.getText();
 const language = FileUtils.getLanguage(editor.document.fileName);
 const goalLabels = goals.map(g => g.label.replace(/^[^\s]+ /, ''));

 await vscode.window.withProgress(
 { location: vscode.ProgressLocation.Notification, title: 'AutoDev: Refactoring...' },
 async progress => {
 progress.report({ message: `Refactoring for: ${goalLabels.join(', ')}` });

 try {
 const llm = LLMProvider.fromVSCodeConfig();
 const debugger_ = new DebuggerAgent(llm);

 
 const result = await debugger_.refactorCode(code, language, goalLabels, _token => {
 
 });

 // Show diff and apply option
 // Show changes list in output channel
 const chan = vscode.window.createOutputChannel('AutoDev: Refactor');
 chan.appendLine('Changes made:');
 result.changes.forEach((c, i) => chan.appendLine(`${i + 1}. ${c}`));
 chan.show(true);

 // Native VS Code diff for refactored code
 const filePath = editor.document.fileName;
 const kept = await showNativeDiff(filePath, code, result.refactoredCode, 'Refactoring');
 if (kept) {
 await vscode.commands.executeCommand('workbench.action.revertFile');
 vscode.window.showInformationMessage('AutoDev: Refactoring applied');
 }
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 vscode.window.showErrorMessage(`AutoDev: ${msg}`);
 }
 }
 );
}

//  Generate Tests 
export async function generateTestsCommand(_eventBus: AgentEventBus): Promise<void> {
 const editor = vscode.window.activeTextEditor;
 if (!editor) {
 vscode.window.showErrorMessage('AutoDev: Open a file first');
 return;
 }

 const code = editor.document.getText();
 const language = FileUtils.getLanguage(editor.document.fileName);

 await vscode.window.withProgress(
 { location: vscode.ProgressLocation.Notification, title: 'AutoDev: Writing Tests...' },
 async progress => {
 progress.report({ message: 'Generating comprehensive test suite...' });

 try {
 const llm = LLMProvider.fromVSCodeConfig();
 const debugger_ = new DebuggerAgent(llm);

 const testCode = await debugger_.generateTests(code, language);

 // Create a test file alongside the original
 const originalPath = editor.document.uri.fsPath;
 const ext = originalPath.split('.').pop() ?? 'ts';
 const testPath = originalPath.replace(`.${ext}`, `.test.${ext}`);

 const testUri = vscode.Uri.file(testPath);
 const wsEdit = new vscode.WorkspaceEdit();

 const exists = await vscode.workspace.fs.stat(testUri).then(() => true, () => false);
 if (exists) {
 wsEdit.replace(
 testUri,
 new vscode.Range(new vscode.Position(0, 0), new vscode.Position(99999, 0)),
 testCode
 );
 } else {
 wsEdit.createFile(testUri, { overwrite: true });
 wsEdit.insert(testUri, new vscode.Position(0, 0), testCode);
 }

 await vscode.workspace.applyEdit(wsEdit);
 await vscode.window.showTextDocument(testUri);

 vscode.window.showInformationMessage('AutoDev: Tests generated');
 } catch (err) {
 const msg = err instanceof Error ? err.message : String(err);
 vscode.window.showErrorMessage(`AutoDev: ${msg}`);
 }
 }
 );
}

