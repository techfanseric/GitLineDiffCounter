# Git Line Diff Counter

A VS Code extension that displays git line change statistics in the status bar, showing both staged and unstaged changes with detailed file-by-file breakdown.

## Features

### Status Bar Display
Shows a summary of line changes in the status bar:
- `Staged:+X` - Net lines added/removed in staging area
- `Changes:+Y` - Net lines added/removed in working directory  
- `Total:+Z` - Combined net changes

Example: `$(git-commit) Staged:+2, Changes:+8, Total:+10`

### Detailed Tooltip
Hover over the status bar item to see detailed breakdown:

```
Staged (+2):
  Net:+2 Add:+5 Del:-3 [New] fileA.ts
  Net:+1 Add:+2 Del:-1 [Mod] fileB.js

Changes (+8):
  Net:+8 Add:+10 Del:-2 [New] fileC.py
  Net:+2 Add:+3 Del:-1 [Mod] fileD.txt

Total: Net:+10 Add:+15 Del:-5
```

### File Status Indicators
- `[New]` - Newly added files
- `[Mod]` - Modified files  
- `[Del]` - Deleted files

### Real-time Updates
- Automatically updates when files are modified
- Updates when files are saved
- Manual refresh via command: `Git Line Diff Counter: Refresh`

## Requirements

- VS Code 1.60.0 or higher
- Git repository in the workspace

## Extension Settings

This extension contributes no settings through `package.json`.

## Known Issues

No known issues at this time.

## Release Notes

### 1.0.0
- Initial release
- Display staged and unstaged line changes in status bar
- Detailed tooltip with file-by-file breakdown
- Real-time updates on file changes
- File status detection (New/Mod/Del)
- Support for git repositories

## Development

### Setup
```bash
npm install
```

### Compile
```bash
npm run compile
```

### Watch for Changes
```bash
npm run watch
```

### Debug
- Open the project in VS Code
- Press `F5` to run the extension in a new Extension Development Host window
- Set breakpoints in `src/extension.ts` to debug the extension

### Package Extension
```bash
# Install vsce globally if not already installed
npm install -g @vscode/vsce

# Package the extension
npm run package
```
This will create a `.vsix` file in the project root.

### Install Extension
```bash
# Install the packaged extension
code --install-extension git-line-diff-counter-1.0.0.vsix
```


## Technology Stack

- **TypeScript** - Main language
- **VS Code API** - Extension development
- **Simple Git** - Git operations
- **ESBuild** - Build tool

## File Structure

```
src/
└── extension.ts          # Main extension logic

.vscode/
├── launch.json           # Debug configuration
└── tasks.json            # Build tasks

package.json              # Extension manifest
tsconfig.json            # TypeScript configuration
esbuild.js               # Build script
```

## License

This project is licensed under the MIT License.