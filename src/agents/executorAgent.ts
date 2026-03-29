import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { AgentPlan, PlanStep, FileChange, AgentResult } from '../types';
import { TerminalUtils } from '../utils/terminalUtils';

export class ExecutorAgent {
  private filesChanged: FileChange[] = [];

  constructor(private workspaceRoot: string) {}

  async executePlan(
    plan: AgentPlan,
    onProgress: (msg: string) => void
  ): Promise<AgentResult> {
    this.filesChanged = [];

    onProgress(`Executor Agent: Starting ${plan.steps.length} steps...`);

    for (const step of plan.steps) {
      try {
        await this.executeStep(step, onProgress);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        onProgress(`[FAILED] Step ${step.stepNumber}: ${errMsg}`);
        return {
          taskId: Date.now().toString(),
          success: false,
          filesChanged: this.filesChanged,
          error: `Step ${step.stepNumber} (${step.action}: ${step.target}) failed: ${errMsg}`,
        };
      }
    }

    onProgress(`Done: ${this.filesChanged.length} file(s) changed.`);

    return {
      taskId: Date.now().toString(),
      success: true,
      filesChanged: this.filesChanged,
      output: `Executed ${plan.steps.length} steps successfully`,
    };
  }

  private async executeStep(step: PlanStep, onProgress: (msg: string) => void): Promise<void> {
    onProgress(`Step ${step.stepNumber}: ${step.description}`);

    switch (step.action) {
      case 'create_file':
        await this.createFile(step, onProgress);
        break;
      case 'modify_file':
        await this.modifyFile(step, onProgress);
        break;
      case 'delete_file':
        await this.deleteFile(step, onProgress);
        break;
      case 'run_command':
        await this.runCommand(step, onProgress);
        break;
      case 'install_package':
        await this.installPackage(step, onProgress);
        break;
      default:
        onProgress(`[SKIP] Unknown action: ${(step as PlanStep).action}`);
    }
  }

  private async createFile(step: PlanStep, onProgress: (msg: string) => void): Promise<void> {
    if (!step.code && step.action === 'create_file') {
      onProgress(`[SKIP] No code for file: ${step.target}`);
      return;
    }

    const filePath = path.join(this.workspaceRoot, step.target);
    const dir = path.dirname(filePath);

    // Create directory tree if needed
    fs.mkdirSync(dir, { recursive: true });

    const originalContent = fs.existsSync(filePath)
      ? fs.readFileSync(filePath, 'utf-8')
      : '';
    const isNew = !fs.existsSync(filePath);

    fs.writeFileSync(filePath, step.code ?? '', 'utf-8');

    this.filesChanged.push({
      filePath: step.target,
      originalContent,
      newContent: step.code ?? '',
      changeType: isNew ? 'created' : 'modified',
      summary: step.description,
    });

    onProgress(`  ${isNew ? '[CREATED]' : '[MODIFIED]'} ${step.target}`);

    // Open the file in VS Code
    const uri = vscode.Uri.file(filePath);
    await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: true });
  }

  private async modifyFile(step: PlanStep, onProgress: (msg: string) => void): Promise<void> {
    // modifyFile is the same as createFile (overwrite with new content)
    await this.createFile(step, onProgress);
  }

  private async deleteFile(step: PlanStep, onProgress: (msg: string) => void): Promise<void> {
    const filePath = path.join(this.workspaceRoot, step.target);

    if (!fs.existsSync(filePath)) {
      onProgress(`  [SKIP] File not found: ${step.target}`);
      return;
    }

    const originalContent = fs.readFileSync(filePath, 'utf-8');
    fs.unlinkSync(filePath);

    this.filesChanged.push({
      filePath: step.target,
      originalContent,
      newContent: '',
      changeType: 'deleted',
      summary: step.description,
    });

    onProgress(`  [DELETED] ${step.target}`);
  }

  private async runCommand(step: PlanStep, onProgress: (msg: string) => void): Promise<void> {
    if (!step.command) {
      onProgress(`  [SKIP] No command specified`);
      return;
    }

    onProgress(`  [RUN] ${step.command}`);
    await TerminalUtils.runInTerminal(step.command, this.workspaceRoot, `AutoDev: ${step.description}`);
  }

  private async installPackage(step: PlanStep, onProgress: (msg: string) => void): Promise<void> {
    const pkgManager = this.detectPackageManager();
    const installCmd = step.command ?? `${pkgManager} install ${step.target}`;

    onProgress(`  [INSTALL] ${step.target} via ${pkgManager}`);
    await TerminalUtils.runInTerminal(installCmd, this.workspaceRoot, `AutoDev: Install ${step.target}`);
  }

  private detectPackageManager(): string {
    if (fs.existsSync(path.join(this.workspaceRoot, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(this.workspaceRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(this.workspaceRoot, 'bun.lockb'))) return 'bun';
    return 'npm';
  }
}
