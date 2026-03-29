import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { LLMProvider } from '../providers/llmProvider';
import { DebuggerAgent } from '../agents/debuggerAgent';
import { FileUtils } from '../utils/fileUtils';
import { FileChange } from '../types';
import { AgentEventBus } from '../utils/eventBus';

// Show native VS Code diff between original and fixed content
async function showNativeDiff(
 filePath: string,
 originalContent: string,
 newContent: string,
 label: string
): Promise<boolean> {
 // Write original to a temp file
 const tmpDir = os.tmpdir();
 const tmpFile = path.join(tmpDir, `autodev-original-${path.basename(filePath)}`);
 fs.writeFileSync(tmpFile, originalContent, 'utf-8');

 const originalUri = vscode.Uri.file(tmpFile);
 const modifiedUri = vscode.Uri.file(filePath);

 // Write new content to actual file first so VS Code diff can read it
 const actualPath = filePath;
 const existing = fs.existsSync(actualPath) ? fs.readFileSync(actualPath, 'utf-8') : '';
 fs.writeFileSync(actualPath, newContent, 'utf-8');

 await vscode.commands.executeCommand(
 'vscode.diff',
 originalUri,
 modifiedUri,
 `AutoDev Fix: ${path.basename(filePath)} - ${label}`,
 { preview: true }
 );

 // Ask user to confirm
 const choice = await vscode.window.showInformationMessage(
 `Apply this fix to ${path.basename(filePath)}?`,
 'Keep Fix', 'Revert');

 if (choice !== 'Keep Fix') {
 // Revert file back to original
 fs.writeFileSync(actualPath, existing, 'utf-8');
 fs.unlinkSync(tmpFile);
 return false;
 }

 fs.unlinkSync(tmpFile);
 return true;
}

export async function fixProjectCommand(eventBus: AgentEventBus): Promise<void> {
 const workspaceRoot = FileUtils.getWorkspaceRoot();
 if (!workspaceRoot) {
 vscode.window.showErrorMessage('AutoDev: Open a workspace folder first');
 return;
 }

 const config = vscode.workspace.getConfiguration('autodev');
 const excludePatterns: string[] = config.get('excludePatterns', []);
 const maxFiles: number = config.get('maxFilesPerScan', 50);
 const showDiff: boolean = config.get('showDiffBeforeApply', true);

 // Confirm with user
 const confirm = await vscode.window.showInformationMessage(
 `AutoDev will scan up to ${maxFiles} files and fix all issues. Continue?`,
 { modal: true },
 'Fix Project',
 'Cancel');
 if (confirm !== 'Fix Project') return;

 await vscode.window.withProgress(
 {
 location: vscode.ProgressLocation.Notification,
 title: 'AutoDev: Fixing Project',
 cancellable: true,
 },
 async (progress, token) => {
 const llm = LLMProvider.fromVSCodeConfig();
 const debugger_ = new DebuggerAgent(llm);
 const allChanges: FileChange[] = [];
 let filesFixed = 0;

 const emit = (msg: string) => {
 progress.report({ message: msg });
 eventBus.emit({ type: 'progress', message: msg, timestamp: Date.now() });
 };

 emit('Scanning workspace...');

 const files = await FileUtils.scanWorkspace(
 workspaceRoot,
 excludePatterns,
 maxFiles,
 emit
 );

 emit(`Found ${files.length} files. Analysing...`);

      const rateLimitDelay = (ms: number) => new Promise(r => setTimeout(r, ms));

 for (let i = 0; i < files.length; i++) {
 if (token.isCancellationRequested) {
 emit('Cancelled by user');
 break;
 }

 const file = files[i];
 emit(`[${i + 1}/${files.length}] ${file.relativePath}`);

        // Small delay between requests to avoid rate limits
        if (i > 0) await rateLimitDelay(400);

 try {
 const result = await debugger_.analyzeAndFix(
 file.relativePath,
 FileUtils.truncateForContext(file.content, 4000),
 file.language
 );

 if (result.hasIssues && result.fixedCode) {
 filesFixed++;

 if (showDiff) {
 const change: FileChange = {
 filePath: file.relativePath,
 originalContent: file.content,
 newContent: result.fixedCode,
 changeType: 'modified',
 summary: result.summary,
 };
 allChanges.push(change);
 } else {
 // Apply immediately
 await FileUtils.applyChange(file.absolutePath, result.fixedCode);
            const issueWord = result.issueCount === 1 ? '1 issue' : `${result.issueCount} issues`;
            emit(`Fixed: ${file.relativePath} - ${issueWord} - ${result.summary}`);
 }
 }
 } catch (err) {
 emit(` [Warning] Skipped ${file.relativePath}: ${err instanceof Error ? err.message : String(err)}`);
 }
 }

 if (allChanges.length === 0 && !showDiff) {
 vscode.window.showInformationMessage(`AutoDev: Project scan complete. ${filesFixed} file(s) already clean.`);
 return;
 }

 if (showDiff && allChanges.length > 0) {
 // Show native VS Code diff for each changed file - syntax highlighted, professional
 let applied = 0;
 for (const change of allChanges) {
 const fullPath = path.join(workspaceRoot, change.filePath);
 const kept = await showNativeDiff(fullPath, change.originalContent, change.newContent, change.summary);
 if (kept) applied++;
 }
 if (applied > 0) {
 vscode.window.showInformationMessage(`AutoDev: Applied fixes to ${applied}/${allChanges.length} file(s)`);
 } else {
 vscode.window.showInformationMessage('AutoDev: No fixes applied');
 }
 } else if (filesFixed > 0) {
 vscode.window.showInformationMessage(
 `AutoDev: Fixed ${filesFixed} file(s) out of ${files.length} scanned`
 );
 } else {
 vscode.window.showInformationMessage(
 `AutoDev: All ${files.length} files look clean!`
 );
 }
 }
 );
}

