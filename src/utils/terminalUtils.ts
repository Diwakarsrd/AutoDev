import * as vscode from 'vscode';
import { exec } from 'child_process';

export class TerminalUtils {
  private static terminals: Map<string, vscode.Terminal> = new Map();

  static async runInTerminal(
    command: string,
    cwd: string,
    terminalName = 'AutoDev'
  ): Promise<void> {
    let terminal = this.terminals.get(terminalName);

    // Reuse existing terminal or create a new one
    if (!terminal || terminal.exitStatus !== undefined) {
      terminal = vscode.window.createTerminal({
        name: terminalName,
        cwd,
      });
      this.terminals.set(terminalName, terminal);
    }

    terminal.show(true);
    terminal.sendText(command);

    // Give the command time to start
    await new Promise(r => setTimeout(r, 500));
  }

  static async runAndWait(
    command: string,
    cwd: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise(resolve => {
      exec(command, { cwd, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        resolve({
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          exitCode: err?.code ?? 0,
        });
      });
    });
  }

  static disposeAll(): void {
    for (const terminal of this.terminals.values()) {
      try { terminal.dispose(); } catch { /* ignore */ }
    }
    this.terminals.clear();
  }
}
