# Git Line Diff Counter

A VS Code extension that displays git line change statistics in the status bar, showing both staged and unstaged changes with detailed file-by-file breakdown.

## Features

### Status Bar Display
Shows a summary of line changes in the status bar:
- **Single area**: `+10 (+15-5)` - Shows net changes with add/delete breakdown
- **Multiple areas**: `Staged:+2 (+5-3), Changes:+8 (+10-2), Total:+10 (+15-5)` - Shows each area with add/delete breakdown
- **Clean**: `Clean` - No changes

Examples:
- `$(git-commit) +10 (+15-5)` (single area with changes)
- `$(git-commit) Staged:+2 (+5-3), Changes:+8 (+10-2), Total:+10 (+15-5)` (multiple areas)

### Detailed Tooltip
Hover over the status bar item to see detailed breakdown:

```
Staged: +2 (+5-3)
  +2 (+5-3)=150 [New] fileA.ts
  +1 (+2-1)=200 [Mod] fileB.js

Changes: +8 (+10-2)
  +8 (+10-2)=300 [New] fileC.py
  +2 (+3-1)=180 [Mod] fileD.txt

Total: +10 (+15-5)
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

### 0.0.3
- Enhanced status bar display with add/delete breakdown format
- Improved tooltip format with file total line count  
- Removed "Net:" prefix from file entries for cleaner display
- Single area shows simplified format: `+10 (+15-5)`
- File entries now show total line count: `+2 (+5-3)=150 [New] fileA.ts`
- All areas display consistent add/delete breakdown format

### 0.0.2
- Simplified tooltip format: `Add:+X Del:-Y` → `(+X-Y)`
- Show file names only instead of full paths in tooltip
- Sort files by net line changes (descending order: +999 to -999)
- Updated version to 0.0.2

### 0.0.1
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
code --install-extension git-line-diff-counter-0.0.1.vsix
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