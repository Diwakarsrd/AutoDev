import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { createTwoFilesPatch } from 'diff';

export interface ScannedFile {
 relativePath: string;
 absolutePath: string;
 content: string;
 language: string;
 size: number;
}

const LANGUAGE_MAP: Record<string, string> = {
 ts: 'typescript',
 tsx: 'typescript',
 js: 'javascript',
 jsx: 'javascript',
 py: 'python',
 java: 'java',
 cs: 'csharp',
 cpp: 'cpp',
 c: 'c',
 go: 'go',
 rs: 'rust',
 rb: 'ruby',
 php: 'php',
 swift: 'swift',
 kt: 'kotlin',
 vue: 'vue',
 svelte: 'svelte',
 html: 'html',
 css: 'css',
 scss: 'scss',
 json: 'json',
 yaml: 'yaml',
 yml: 'yaml',
 sh: 'bash',
 bash: 'bash',
 md: 'markdown',
 sql: 'sql',
};

const CODE_EXTENSIONS = new Set(Object.keys(LANGUAGE_MAP));

// Folders that should NEVER be scanned regardless of user settings
const ALWAYS_EXCLUDE = new Set([
  // Python virtual environments and packages
  'venv', '.venv', 'env', 'virtualenv',
  '__pycache__', '.pytest_cache', '.mypy_cache',
  'site-packages', 'dist-packages',
  // Node.js
  'node_modules',
  // Build outputs
  'dist', 'build', 'out', 'bin', 'obj', 'target',
  // Version control
  '.git', '.svn', '.hg',
  // IDE
  '.vscode', '.idea', '.vs',
  // Test/coverage artifacts
  'coverage', 'htmlcov', '.coverage',
  // Framework build dirs
  '.next', '.nuxt', '.svelte-kit',
  // Package caches
  '.npm', '.yarn', '.cargo', '__generated__',
]);

// If any segment of the path contains these, skip the whole subtree
const THIRD_PARTY_SEGMENTS = ['site-packages', 'dist-packages', 'node_modules', '.venv'];

export class FileUtils {
 static getLanguage(filePath: string): string {
 const ext = path.extname(filePath).toLowerCase().replace('.', '');
 return LANGUAGE_MAP[ext] ?? 'plaintext';
 }

 static async scanWorkspace(
 workspaceRoot: string,
 excludePatterns: string[],
 maxFiles: number,
 onProgress?: (msg: string) => void
 ): Promise<ScannedFile[]> {
 const results: ScannedFile[] = [];
 const excludeSet = new Set(excludePatterns);

 const walk = (dir: string): void => {
 if (results.length >= maxFiles) return;

 let entries: fs.Dirent[];
 try {
 entries = fs.readdirSync(dir, { withFileTypes: true });
 } catch {
 return;
 }

 for (const entry of entries) {
 if (results.length >= maxFiles) break;

 const fullPath = path.join(dir, entry.name);
 const relative = path.relative(workspaceRoot, fullPath);
        const parts = relative.split(path.sep);

        // Skip always-excluded system folders (venv, site-packages, node_modules, etc.)
        if (ALWAYS_EXCLUDE.has(entry.name)) continue;

        // Skip if any path segment is a known third-party marker
        if (THIRD_PARTY_SEGMENTS.some(seg => parts.includes(seg))) continue;

        // Skip user-configured excluded patterns
 if (parts.some(p => excludeSet.has(p))) continue;

 // Skip hidden files/dirs (except .env)
 if (entry.name.startsWith('.') && entry.name !== '.env') continue;

 if (entry.isDirectory()) {
 walk(fullPath);
 } else if (entry.isFile()) {
 const ext = path.extname(entry.name).toLowerCase().replace('.', '');
 if (!CODE_EXTENSIONS.has(ext)) continue;

 try {
 const stat = fs.statSync(fullPath);
 if (stat.size > 200_000) continue; // skip files > 200KB

 const content = fs.readFileSync(fullPath, 'utf-8');
 results.push({
 relativePath: relative.replace(/\\/g, '/'),
 absolutePath: fullPath,
 content,
 language: LANGUAGE_MAP[ext] ?? 'plaintext',
 size: stat.size,
 });
 } catch {
 // skip unreadable files
 }
 }
 }
 };

 walk(workspaceRoot);
 onProgress?.(`Scanned ${results.length} files`);
 return results;
 }

 static generateDiff(
 original: string,
 modified: string,
 filePath: string
 ): string {
 return createTwoFilesPatch(
 `a/${filePath}`,
 `b/${filePath}`,
 original,
 modified,
 '',
 '');
 }

 static async applyChange(
 filePath: string,
 newContent: string
 ): Promise<void> {
 fs.mkdirSync(path.dirname(filePath), { recursive: true });
 fs.writeFileSync(filePath, newContent, 'utf-8');
 }

 static buildWorkspaceContext(files: ScannedFile[]): string {
 if (files.length === 0) return 'Empty workspace';

 const lines: string[] = [`Files in workspace (${files.length} total):`];

 // Group by type
 const byLang = new Map<string, string[]>();
 for (const f of files) {
 const arr = byLang.get(f.language) ?? [];
 arr.push(f.relativePath);
 byLang.set(f.language, arr);
 }

 for (const [lang, paths] of byLang) {
 lines.push(`\n${lang}: ${paths.slice(0, 5).join(', ')}${paths.length > 5 ? ` (+${paths.length - 5} more)` : ''}`);
 }

 // Add key file snippets (package.json, README, etc.)
 const keyFiles = ['package.json', 'README.md', 'go.mod', 'Cargo.toml', 'pyproject.toml', 'pom.xml'];
 for (const kf of keyFiles) {
 const found = files.find(f => f.relativePath.endsWith(kf));
 if (found) {
 lines.push(`\n--- ${found.relativePath} (first 30 lines) ---`);
 lines.push(found.content.split('\n').slice(0, 30).join('\n'));
 }
 }

 return lines.join('\n');
 }

 static getWorkspaceRoot(): string | undefined {
 const folders = vscode.workspace.workspaceFolders;
 return folders?.[0]?.uri.fsPath;
 }

 static truncateForContext(content: string, maxChars = 3000): string {
 if (content.length <= maxChars) return content;
 const half = Math.floor(maxChars / 2);
 return `${content.slice(0, half)}\n\n... [truncated ${content.length - maxChars} chars] ...\n\n${content.slice(-half)}`;
 }
}
