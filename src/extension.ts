import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { simpleGit, SimpleGit } from 'simple-git';

let statusBarItem: vscode.StatusBarItem;
let git: SimpleGit;
let updateTimeout: NodeJS.Timeout | null = null;

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
    
    // Error handling
    error?: 'NO_WORKSPACE' | 'NO_REPO';
}

async function getFileTotalLines(filePath: string): Promise<number> {
    try {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
            return 0;
        }
        
        const fullPath = path.join(rootPath, filePath);
        if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            return content.split('\n').length;
        } else {
            // File doesn't exist, try to get it from git history
            return await getDeletedFileLinesFromGit(filePath);
        }
    } catch (error) {
        return 0;
    }
}

async function getDeletedFileLinesFromGit(filePath: string): Promise<number> {
    try {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
            return 0;
        }

        const git = simpleGit(rootPath);
        
        // Try to get the file content from HEAD (last commit)
        const showResult = await git.show(['HEAD:' + filePath]);
        return showResult.split('\n').length;
    } catch (error) {
        // If file doesn't exist in HEAD, try to find it in the git history
        try {
            const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            if (!rootPath) {
                return 0;
            }

            const git = simpleGit(rootPath);
            
            // Use git log to find the last commit that contained this file
            const logResult = await git.log([
                '--pretty=format:%H',
                '--follow',
                '--',
                filePath
            ]);
            
            if (logResult.all && logResult.all.length > 0) {
                const lastCommitHash = logResult.all[0].hash;
                const showResult = await git.show([lastCommitHash + ':' + filePath]);
                return showResult.split('\n').length;
            }
            
            return 0;
        } catch (innerError) {
            return 0;
        }
    }
}

async function getLineStats(): Promise<LineStats | null> {
    try {
        const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!rootPath) {
            console.log('No workspace folder found');
            return {
                changesLinesAdded: 0,
                changesLinesDeleted: 0,
                changesFiles: [],
                stagedLinesAdded: 0,
                stagedLinesDeleted: 0,
                stagedFiles: [],
                error: 'NO_WORKSPACE'
            };
        }

        git = simpleGit(rootPath);
        
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
            console.log('Not a git repository');
            return {
                changesLinesAdded: 0,
                changesLinesDeleted: 0,
                changesFiles: [],
                stagedLinesAdded: 0,
                stagedLinesDeleted: 0,
                stagedFiles: [],
                error: 'NO_REPO'
            };
        }

        // Get working directory changes
        const workingDiff = await git.diff(['--numstat']);
        
        // Get status after diff to ensure we have the latest state
        const status = await git.status();
        const workingLines = workingDiff.trim().split('\n');
        
        let changesLinesAdded = 0;
        let changesLinesDeleted = 0;
        const changesFiles: FileChange[] = [];
        
        // Process files from git diff
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
        
        // Process untracked new files
        const untrackedFiles = status.files.filter(f => f.working_dir === '?');
        for (const file of untrackedFiles) {
            const totalLines = await getFileTotalLines(file.path);
            changesLinesAdded += totalLines;
            
            changesFiles.push({
                path: file.path,
                linesAdded: totalLines,
                linesDeleted: 0,
                netLines: totalLines,
                status: 'New',
                totalLines
            });
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
    // Clear any existing timeout to prevent too frequent updates
    if (updateTimeout) {
        clearTimeout(updateTimeout);
    }
    
    // Debounce updates to prevent overwhelming the system
    updateTimeout = setTimeout(() => {
        getLineStats().then(stats => {
            if (!stats) {
                statusBarItem.text = '$(git-commit) Git: Error';
                statusBarItem.tooltip = 'Error getting git status';
                return;
            }
            
            if (stats.error === 'NO_WORKSPACE') {
                statusBarItem.text = '$(git-commit) Git: No workspace';
                statusBarItem.tooltip = 'No workspace folder found';
                return;
            }
            
            if (stats.error === 'NO_REPO') {
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
        }).catch(error => {
            console.error('Error updating status bar:', error);
            statusBarItem.text = '$(git-commit) Git: Error';
            statusBarItem.tooltip = 'Error updating git status';
        });
    }, 500); // 500ms debounce
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
    
    // Watch for file creation, deletion, and rename
    const fileSystemWatcher = vscode.workspace.createFileSystemWatcher('**/*', false, false, false);
    fileSystemWatcher.onDidCreate(() => {
        updateStatusBar();
    });
    fileSystemWatcher.onDidDelete(() => {
        updateStatusBar();
    });
    fileSystemWatcher.onDidChange(() => {
        updateStatusBar();
    });
    context.subscriptions.push(fileSystemWatcher);
    
    // Watch for git index changes (add, remove, move files between stages)
    const gitApi = vscode.extensions.getExtension('vscode.git')?.exports;
    if (gitApi) {
        const gitModel = gitApi.getAPI(1);
        if (gitModel) {
            gitModel.onDidChangeState(() => {
                updateStatusBar();
            });
            gitModel.onDidOpenRepository(() => {
                updateStatusBar();
            });
            gitModel.onDidCloseRepository(() => {
                updateStatusBar();
            });
        }
    }
    
    // Watch for terminal command execution (for git commands)
    const terminalWatcher = vscode.window.onDidCloseTerminal((terminal) => {
        // Check if terminal was running git commands
        if (terminal.name.includes('git') || terminal.name.includes('Git')) {
            setTimeout(() => {
                updateStatusBar();
            }, 100); // Small delay to let git operations complete
        }
    });
    context.subscriptions.push(terminalWatcher);
    
    // Watch for workspace configuration changes
    const configWatcher = vscode.workspace.onDidChangeConfiguration(() => {
        updateStatusBar();
    });
    context.subscriptions.push(configWatcher);
    
    // Watch for text document open/close
    const docOpenWatcher = vscode.workspace.onDidOpenTextDocument(() => {
        updateStatusBar();
    });
    context.subscriptions.push(docOpenWatcher);
    
    const docCloseWatcher = vscode.workspace.onDidCloseTextDocument(() => {
        updateStatusBar();
    });
    context.subscriptions.push(docCloseWatcher);
}

export function deactivate() {
    if (statusBarItem) {
        statusBarItem.dispose();
    }
}