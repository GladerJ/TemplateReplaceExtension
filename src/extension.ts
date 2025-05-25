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
    const libPath = path.join(projectRoot, 'lib');
    const mainPath = path.join(projectRoot, 'main');
    const outputPath = path.join(projectRoot, 'output');

    if (!fs.existsSync(libPath) || !fs.existsSync(mainPath)) {
        throw new Error('项目结构不正确，缺少lib或main目录');
    }

    if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
    }

    const fileName = path.basename(currentFilePath);
    const outputFilePath = path.join(outputPath, fileName);
    const originalContent = fs.readFileSync(currentFilePath, 'utf8');

    const merger = new IncludeMerger(projectRoot);
    const mergedContent = merger.mergeIncludes(originalContent, currentFilePath);

    fs.writeFileSync(outputFilePath, mergedContent);
}

class IncludeMerger {
    private projectRoot: string;
    private libPath: string;
    private fileCache: Map<string, string> = new Map(); // 文件内容缓存
    private processedFiles: Set<string> = new Set(); // 已处理的文件
    private standardIncludes: Set<string> = new Set(); // 标准库包含
    private usingStatements: Set<string> = new Set(); // using语句
    private libContents: string[] = []; // lib文件内容（按依赖顺序）

    constructor(projectRoot: string) {
        this.projectRoot = projectRoot;
        this.libPath = path.join(projectRoot, 'lib');
    }

    mergeIncludes(content: string, filePath: string): string {
        // 重置状态
        this.fileCache.clear();
        this.processedFiles.clear();
        this.standardIncludes.clear();
        this.usingStatements.clear();
        this.libContents = [];

        console.log('Starting merge for:', filePath);

        // 递归处理所有依赖
        this.processFile(content, filePath, []);

        console.log('Standard includes:', Array.from(this.standardIncludes));
        console.log('Using statements:', Array.from(this.usingStatements));
        console.log('Lib contents count:', this.libContents.length);
        console.log('Processed files:', Array.from(this.processedFiles));

        // 构建最终结果
        let result = '';

        // 1. 添加所有标准库包含（去重后）
        const sortedIncludes = Array.from(this.standardIncludes).sort();
        for (const include of sortedIncludes) {
            result += include + '\n';
        }

        if (sortedIncludes.length > 0) {
            result += '\n';
        }

        // 2. 添加所有using语句（去重后）
        const sortedUsing = Array.from(this.usingStatements).sort();
        for (const using of sortedUsing) {
            result += using + '\n';
        }

        if (sortedUsing.length > 0) {
            result += '\n';
        }

        // 3. 添加lib文件内容
        for (let i = 0; i < this.libContents.length; i++) {
            result += this.libContents[i];
            if (i < this.libContents.length - 1) {
                result += '\n';
            }
        }

        if (this.libContents.length > 0) {
            result += '\n';
        }

        // 4. 添加主文件代码内容
        result += '// === Main Code ===\n';
        result += this.extractMainCode(content);

        return result;
    }

    private processFile(content: string, filePath: string, dependencyStack: string[]): void {
        const normalizedPath = path.normalize(filePath);
        
        // 检查循环依赖
        if (dependencyStack.includes(normalizedPath)) {
            throw new Error(`检测到循环依赖: ${dependencyStack.join(' -> ')} -> ${normalizedPath}`);
        }

        // 如果已经处理过，直接返回
        if (this.processedFiles.has(normalizedPath)) {
            return;
        }

        // 使用缓存
        let fileContent = content;
        if (this.fileCache.has(normalizedPath)) {
            fileContent = this.fileCache.get(normalizedPath)!;
        } else if (filePath !== normalizedPath || !content) {
            if (fs.existsSync(normalizedPath)) {
                fileContent = fs.readFileSync(normalizedPath, 'utf8');
                this.fileCache.set(normalizedPath, fileContent);
            } else {
                return;
            }
        }

        this.processedFiles.add(normalizedPath);
        const newStack = [...dependencyStack, normalizedPath];

        const lines = fileContent.split('\n');
        const libDependencies: string[] = [];
        let codeContent = '';

        // 解析文件内容
        for (const line of lines) {
            const trimmed = line.trim();
            
            if (trimmed.startsWith('#include')) {
                if (this.isStandardInclude(trimmed)) {
                    // 标准库包含
                    this.standardIncludes.add(trimmed);
                } else if (this.isLibInclude(trimmed)) {
                    // lib包含 - 添加到依赖列表
                    const libPath = this.resolveLibPath(trimmed, normalizedPath);
                    if (libPath) {
                        libDependencies.push(libPath);
                    }
                }
            } else if (trimmed.startsWith('using ')) {
                // using语句
                this.usingStatements.add(trimmed);
            } else if (trimmed !== '') {
                // 实际代码内容
                codeContent += line + '\n';
            } else {
                // 保留空行（在代码内容中）
                if (codeContent.trim() !== '') {
                    codeContent += '\n';
                }
            }
        }

        // 先递归处理所有依赖
        for (const depPath of libDependencies) {
            this.processFile('', depPath, newStack);
        }

        // 如果是lib文件且有实际内容，添加到结果中
        if (this.isLibFile(normalizedPath) && codeContent.trim()) {
            const relativePath = path.relative(this.projectRoot, normalizedPath);
            let libSection = `// === ${relativePath} ===\n`;
            libSection += codeContent.trim() + '\n';
            this.libContents.push(libSection);
        }
    }

    private isStandardInclude(line: string): boolean {
        return line.includes('<') && line.includes('>');
    }

    private isLibInclude(line: string): boolean {
        if (!line.includes('"')) return false;
        
        // 匹配相对路径的include，但排除绝对路径和当前目录
        const match = line.match(/#include\s+"([^"]+)"/);
        if (!match) return false;
        
        const includePath = match[1];
        // 检查是否是相对路径且指向上级目录
        return includePath.startsWith('../') || includePath.startsWith('..\\');
    }

    private isLibFile(filePath: string): boolean {
        const normalized = path.normalize(filePath);
        const projectNormalized = path.normalize(this.projectRoot);
        const mainNormalized = path.normalize(path.join(this.projectRoot, 'main'));
        
        // 是项目内的文件，但不是main目录下的文件
        return normalized.startsWith(projectNormalized) && !normalized.startsWith(mainNormalized);
    }

    private resolveLibPath(includeLine: string, currentFile: string): string | null {
        const match = includeLine.match(/#include\s+"([^"]+)"/);
        if (!match) return null;

        const relativePath = match[1];
        const currentDir = path.dirname(currentFile);
        const resolvedPath = path.resolve(currentDir, relativePath);
        
        // 检查文件是否存在，并且确实是在项目目录内
        if (fs.existsSync(resolvedPath)) {
            const normalizedResolved = path.normalize(resolvedPath);
            const normalizedProject = path.normalize(this.projectRoot);
            
            // 确保解析的路径在项目根目录内
            if (normalizedResolved.startsWith(normalizedProject)) {
                return normalizedResolved;
            }
        }
        
        return null;
    }

    private extractMainCode(content: string): string {
        const lines = content.split('\n');
        const codeLines: string[] = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('#include') && !trimmed.startsWith('using ')) {
                codeLines.push(line);
            }
        }

        return codeLines.join('\n').trim() + '\n';
    }
}

export function deactivate() {}