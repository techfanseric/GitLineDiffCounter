import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { simpleGit, SimpleGit } from 'simple-git';

let statusBarItem: vscode.StatusBarItem;
let git: SimpleGit;

interface FileChange {
    path: string;
    linesAdded: number;
    linesDeleted: number;
    netLines: number;
    status: 'New' | 'Mod' | 'Del';
    totalLines: number;
}

interface LineStats {
    // Working directory (unstaged changes)
    changesLinesAdded: number;
    changesLinesDeleted: number;
    changesFiles: FileChange[];
    
    // Staged changes
    stagedLinesAdded: number;
    stagedLinesDeleted: number;
    stagedFiles: FileChange[];
}

async function getFileTotalLines(filePath: string): Promise<number> {
    try {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
            return 0;
        }
        
        const fullPath = path.join(rootPath, filePath);
        if (!fs.existsSync(fullPath)) {
            return 0;
        }
        
        const content = fs.readFileSync(fullPath, 'utf8');
        return content.split('\n').length;
    } catch (error) {
        return 0;
    }
}

async function getLineStats(): Promise<LineStats | null> {
    try {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
            console.log('No workspace folder found');
            return null;
        }

        git = simpleGit(rootPath);
        
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
            console.log('Not a git repository');
            return null;
        }

        const status = await git.status();
        
        // Get working directory changes
        const workingDiff = await git.diff(['--numstat']);
        const workingLines = workingDiff.trim().split('\n');
        
        let changesLinesAdded = 0;
        let changesLinesDeleted = 0;
        const changesFiles: FileChange[] = [];
        
        for (const line of workingLines) {
            if (line.trim()) {
                const [added, removed, path] = line.split('\t');
                const add = parseInt(added) || 0;
                const del = parseInt(removed) || 0;
                changesLinesAdded += add;
                changesLinesDeleted += del;
                
                // Determine file status
                let fileStatus: 'New' | 'Mod' | 'Del' = 'Mod';
                const statusFile = status.files.find(f => f.path === path);
                if (statusFile) {
                    if (statusFile.working_dir === 'A') {
                        fileStatus = 'New';
                    } else if (statusFile.working_dir === 'D') {
                        fileStatus = 'Del';
                    }
                }
                
                const totalLines = await getFileTotalLines(path);
                
                changesFiles.push({
                    path,
                    linesAdded: add,
                    linesDeleted: del,
                    netLines: add - del,
                    status: fileStatus,
                    totalLines
                });
            }
        }

        // Get staged changes
        const stagedDiff = await git.diff(['--cached', '--numstat']);
        const stagedLines = stagedDiff.trim().split('\n');
        
        let stagedLinesAdded = 0;
        let stagedLinesDeleted = 0;
        const stagedFiles: FileChange[] = [];
        
        for (const line of stagedLines) {
            if (line.trim()) {
                const [added, removed, path] = line.split('\t');
                const add = parseInt(added) || 0;
                const del = parseInt(removed) || 0;
                stagedLinesAdded += add;
                stagedLinesDeleted += del;
                
                // Determine file status
                let fileStatus: 'New' | 'Mod' | 'Del' = 'Mod';
                const statusFile = status.files.find(f => f.path === path);
                if (statusFile) {
                    if (statusFile.index === 'A') {
                        fileStatus = 'New';
                    } else if (statusFile.index === 'D') {
                        fileStatus = 'Del';
                    }
                }
                
                const totalLines = await getFileTotalLines(path);
                
                stagedFiles.push({
                    path,
                    linesAdded: add,
                    linesDeleted: del,
                    netLines: add - del,
                    status: fileStatus,
                    totalLines
                });
            }
        }

        // Sort files by net lines (descending)
        changesFiles.sort((a, b) => b.netLines - a.netLines);
        stagedFiles.sort((a, b) => b.netLines - a.netLines);

        console.log('Line stats:', { changesLinesAdded, changesLinesDeleted, stagedLinesAdded, stagedLinesDeleted });

        return {
            changesLinesAdded,
            changesLinesDeleted,
            changesFiles,
            stagedLinesAdded,
            stagedLinesDeleted,
            stagedFiles
        };
    } catch (error) {
        console.error('Error getting line stats:', error);
        return null;
    }
}

function updateStatusBar() {
    getLineStats().then(stats => {
        if (!stats) {
            statusBarItem.text = '$(git-commit) Git: No repo';
            statusBarItem.tooltip = 'No git repository found';
            return;
        }

        const changesNetLines = stats.changesLinesAdded - stats.changesLinesDeleted;
        const stagedNetLines = stats.stagedLinesAdded - stats.stagedLinesDeleted;
        const totalNetLines = changesNetLines + stagedNetLines;

        let text = '$(git-commit) ';
        
        const totalAdd = stats.stagedLinesAdded + stats.changesLinesAdded;
        const totalDel = stats.stagedLinesDeleted + stats.changesLinesDeleted;
        
        // Check if only one area has changes
        const hasStaged = stagedNetLines !== 0;
        const hasChanges = changesNetLines !== 0;
        const singleArea = (hasStaged && !hasChanges) || (!hasStaged && hasChanges);
        
        if (singleArea) {
            // Single area: show total with add/del format
            const areaNetLines = hasStaged ? stagedNetLines : changesNetLines;
            const areaAdd = hasStaged ? stats.stagedLinesAdded : stats.changesLinesAdded;
            const areaDel = hasStaged ? stats.stagedLinesDeleted : stats.changesLinesDeleted;
            
            if (hasStaged) {
                text += `${areaNetLines >= 0 ? '+' : ''}${areaNetLines} (+${areaAdd}-${areaDel})`;
            } else {
                text += `${areaNetLines >= 0 ? '+' : ''}${areaNetLines} (+${areaAdd}-${areaDel})`;
            }
        } else {
            // Multiple areas: show each area with add/del format
            if (stagedNetLines !== 0) {
                text += `Staged:${stagedNetLines >= 0 ? '+' : ''}${stagedNetLines} (+${stats.stagedLinesAdded}-${stats.stagedLinesDeleted})`;
            }
            
            if (changesNetLines !== 0) {
                if (stagedNetLines !== 0) text += ', ';
                text += `Changes:${changesNetLines >= 0 ? '+' : ''}${changesNetLines} (+${stats.changesLinesAdded}-${stats.changesLinesDeleted})`;
            }
            
            if (stagedNetLines !== 0 || changesNetLines !== 0) {
                text += `, Total:${totalNetLines >= 0 ? '+' : ''}${totalNetLines} (+${totalAdd}-${totalDel})`;
            }
        }
        
        if (stagedNetLines === 0 && changesNetLines === 0) {
            text += 'Clean';
        }

        statusBarItem.text = text;
        
        // Generate detailed tooltip with new format
        const stagedTooltip = [`Staged: ${stagedNetLines >= 0 ? '+' : ''}${stagedNetLines} (+${stats.stagedLinesAdded}-${stats.stagedLinesDeleted})`];
        
        // Add file rows
        for (const file of stats.stagedFiles) {
            const fileName = path.basename(file.path);
            stagedTooltip.push(`  ${file.netLines >= 0 ? '+' : ''}${file.netLines} (+${file.linesAdded}-${file.linesDeleted})=${file.totalLines} [${file.status}] ${fileName}`);
        }

        const changesTooltip = [`\nChanges: ${changesNetLines >= 0 ? '+' : ''}${changesNetLines} (+${stats.changesLinesAdded}-${stats.changesLinesDeleted})`];
        
        // Add file rows
        for (const file of stats.changesFiles) {
            const fileName = path.basename(file.path);
            changesTooltip.push(`  ${file.netLines >= 0 ? '+' : ''}${file.netLines} (+${file.linesAdded}-${file.linesDeleted})=${file.totalLines} [${file.status}] ${fileName}`);
        }

        const totalTooltip = [`\nTotal: ${totalNetLines >= 0 ? '+' : ''}${totalNetLines} (+${totalAdd}-${totalDel})`];

        statusBarItem.tooltip = [...stagedTooltip, ...changesTooltip, ...totalTooltip].join('\n');
    });
}

export function activate(context: vscode.ExtensionContext) {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'git-line-diff-counter.refresh';
    statusBarItem.show();
    
    context.subscriptions.push(statusBarItem);
    
    const refreshCommand = vscode.commands.registerCommand('git-line-diff-counter.refresh', () => {
        updateStatusBar();
    });
    context.subscriptions.push(refreshCommand);
    
    updateStatusBar();
    
    const disposable = vscode.workspace.onDidChangeTextDocument(() => {
        updateStatusBar();
    });
    context.subscriptions.push(disposable);
    
    const gitChangeDisposable = vscode.workspace.onDidSaveTextDocument(() => {
        updateStatusBar();
    });
    context.subscriptions.push(gitChangeDisposable);
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}