import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('acmtemplatetool.mergeIncludes', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('请先打开一个.cpp文件');
            return;
        }

        const currentFile = editor.document.fileName;
        if (!currentFile.endsWith('.cpp')) {
            vscode.window.showErrorMessage('当前文件不是.cpp文件');
            return;
        }

        try {
            await mergeIncludesAndGenerate(currentFile);
            vscode.window.showInformationMessage('代码合并完成！');
        } catch (error: any) {
            vscode.window.showErrorMessage(`合并失败: ${error.message}`);
        }
    });

    context.subscriptions.push(disposable);
}

async function mergeIncludesAndGenerate(currentFilePath: string) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(currentFilePath));
    if (!workspaceFolder) {
        throw new Error('无法找到工作区文件夹');
    }

    const projectRoot = workspaceFolder.uri.fsPath;
    const outputPath = path.join(projectRoot, 'output');

    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
    }

    const fileName = path.basename(currentFilePath);
    const outputFilePath = path.join(outputPath, fileName);
    const originalContent = fs.readFileSync(currentFilePath, 'utf8');

    const merger = new IncludeMerger(projectRoot, currentFilePath);
    const mergedContent = merger.mergeIncludes(originalContent);

    fs.writeFileSync(outputFilePath, mergedContent);
}

class IncludeMerger {
    private projectRoot: string;
    private currentMainFile: string;
    private fileCache: Map<string, string> = new Map();
    private processedFiles: Set<string> = new Set();
    private standardIncludes: Set<string> = new Set();
    private usingStatements: Set<string> = new Set();
    private libContents: string[] = [];

    constructor(projectRoot: string, currentMainFile: string) {
        this.projectRoot = projectRoot;
        this.currentMainFile = path.normalize(currentMainFile);
    }

    mergeIncludes(content: string): string {
        this.fileCache.clear();
        this.processedFiles.clear();
        this.standardIncludes.clear();
        this.usingStatements.clear();
        this.libContents = [];

        this.extractTopLevelDirectives(content);
        const mainCode = this.extractMainCode(content);
        this.processIncludes(content, this.currentMainFile, []);

        let result = '';

        for (const line of Array.from(this.standardIncludes).sort()) {
            result += line + '\n';
        }
        if (this.standardIncludes.size > 0) result += '\n';

        for (const line of Array.from(this.usingStatements).sort()) {
            result += line + '\n';
        }
        if (this.usingStatements.size > 0) result += '\n';

        for (let i = 0; i < this.libContents.length; i++) {
            result += this.libContents[i];
            if (i < this.libContents.length - 1) {
                result += '\n';
            }
        }
        if (this.libContents.length > 0) result += '\n';

        result += '// === Main Code ===\n';
        result += mainCode;

        return result;
    }

    private extractTopLevelDirectives(content: string) {
        const lines = content.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('#include') && this.isStandardInclude(trimmed)) {
                this.standardIncludes.add(trimmed);
            } else if (trimmed.startsWith('using ')) {
                this.usingStatements.add(trimmed);
            }
        }
    }

    private extractMainCode(content: string): string {
        return content
            .split('\n')
            .filter(line => !line.trim().startsWith('#include') && !line.trim().startsWith('using '))
            .join('\n')
            .trim() + '\n';
    }

    private processIncludes(content: string, filePath: string, stack: string[]) {
        const normalizedPath = path.normalize(filePath);

        if (this.processedFiles.has(normalizedPath)) return;
        if (stack.includes(normalizedPath)) {
            throw new Error(`循环依赖：${[...stack, normalizedPath].join(' -> ')}`);
        }

        this.processedFiles.add(normalizedPath);
        stack.push(normalizedPath);

        const lines = content.split('\n');
        const currentDir = path.dirname(normalizedPath);
        let codeBody = '';
        const dependencies: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('#include') && this.isUserInclude(trimmed)) {
                const includePath = this.extractUserIncludePath(trimmed);
                if (!includePath) continue;

                const resolvedPath = path.resolve(currentDir, includePath);
                if (!fs.existsSync(resolvedPath)) continue;

                const realContent = fs.readFileSync(resolvedPath, 'utf8').replace(/^\s*#pragma\s+once\s*$/gm, '');
                dependencies.push(resolvedPath);

                this.processIncludes(realContent, resolvedPath, stack.slice());
            } else if (!trimmed.startsWith('#include') && !trimmed.startsWith('using ') && trimmed !== '') {
                codeBody += line + '\n';
            } else if (codeBody.trim() !== '') {
                codeBody += '\n';
            }
        }

        if (normalizedPath !== this.currentMainFile && codeBody.trim()) {
            const relative = path.relative(this.projectRoot, normalizedPath);
            const section = `// === ${relative.replace(/\\/g, '/')} ===\n` + codeBody.trim() + '\n';
            this.libContents.push(section);
        }
    }

    private isStandardInclude(line: string): boolean {
        return /#include\s*<.*>/.test(line);
    }

    private isUserInclude(line: string): boolean {
        return /#include\s*".*"/.test(line);
    }

    private extractUserIncludePath(line: string): string | null {
        const match = line.match(/#include\s+"([^"]+)"/);
        return match ? match[1] : null;
    }
}

export function deactivate() {}
