import * as vscode from 'vscode';
import * as path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';

let statusBarItem: vscode.StatusBarItem;
let git: SimpleGit;

interface FileChange {
    path: string;
    linesAdded: number;
    linesDeleted: number;
    netLines: number;
    status: 'New' | 'Mod' | 'Del';
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
                
                changesFiles.push({
                    path,
                    linesAdded: add,
                    linesDeleted: del,
                    netLines: add - del,
                    status: fileStatus
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
                
                stagedFiles.push({
                    path,
                    linesAdded: add,
                    linesDeleted: del,
                    netLines: add - del,
                    status: fileStatus
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
        
        if (stagedNetLines !== 0) {
            text += `Staged:${stagedNetLines >= 0 ? '+' : ''}${stagedNetLines}`;
        }
        
        if (changesNetLines !== 0) {
            if (stagedNetLines !== 0) text += ', ';
            text += `Changes:${changesNetLines >= 0 ? '+' : ''}${changesNetLines}`;
        }
        
        if (stagedNetLines === 0 && changesNetLines === 0) {
            text += 'Clean';
        } else {
            text += `, Total:${totalNetLines >= 0 ? '+' : ''}${totalNetLines}`;
        }

        statusBarItem.text = text;
        
        // Generate detailed tooltip with simple line format
        const stagedTooltip = [`Staged (${stagedNetLines >= 0 ? '+' : ''}${stagedNetLines}):`];
        
        // Add file rows
        for (const file of stats.stagedFiles) {
            const fileName = path.basename(file.path);
            stagedTooltip.push(`  Net:${file.netLines >= 0 ? '+' : ''}${file.netLines} (+${file.linesAdded}${file.linesDeleted >= 0 ? '-' : ''}${file.linesDeleted}) [${file.status}] ${fileName}`);
        }

        const changesTooltip = [`\nChanges (${changesNetLines >= 0 ? '+' : ''}${changesNetLines}):`];
        
        // Add file rows
        for (const file of stats.changesFiles) {
            const fileName = path.basename(file.path);
            changesTooltip.push(`  Net:${file.netLines >= 0 ? '+' : ''}${file.netLines} (+${file.linesAdded}${file.linesDeleted >= 0 ? '-' : ''}${file.linesDeleted}) [${file.status}] ${fileName}`);
        }

        const totalAdd = stats.stagedLinesAdded + stats.changesLinesAdded;
        const totalDel = stats.stagedLinesDeleted + stats.changesLinesDeleted;
        const totalTooltip = [`\nTotal: Net:${totalNetLines >= 0 ? '+' : ''}${totalNetLines} Add:+${totalAdd} Del:${totalDel >= 0 ? '-' : ''}${totalDel}`];

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