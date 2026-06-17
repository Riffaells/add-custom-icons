import { App, TFolder, TextComponent, normalizePath } from 'obsidian';
import { AbstractInputSuggest } from 'obsidian';

/**
 * Autocomplete component for folder path selection in Obsidian vault.
 * Provides fuzzy search and displays folder hierarchy.
 */
export class FolderSuggest extends AbstractInputSuggest<string> {
    private textComponent: TextComponent;
    private onChange?: () => void;
    /** Cached list of folders to avoid repeated vault traversal */
    private cachedFolders: string[] | null = null;

    constructor(app: App, textComponent: TextComponent, onChange?: () => void) {
        super(app, textComponent.inputEl);
        this.textComponent = textComponent;
        this.onChange = onChange;
    }

    /** Filters and sorts folders based on user input */
    getSuggestions(inputStr: string): string[] {
        const lowerCaseInput = inputStr.toLowerCase().trim();
        const folders = this.getCachedFolders();

        if (lowerCaseInput === '') {
            return folders.slice(0, 8);
        }

        const filtered = folders.filter(folder => 
            folder.toLowerCase().includes(lowerCaseInput)
        );

        filtered.sort((a, b) => {
            const aLower = a.toLowerCase();
            const bLower = b.toLowerCase();
            
            if (aLower === lowerCaseInput) return -1;
            if (bLower === lowerCaseInput) return 1;
            if (aLower.startsWith(lowerCaseInput) && !bLower.startsWith(lowerCaseInput)) return -1;
            if (!aLower.startsWith(lowerCaseInput) && bLower.startsWith(lowerCaseInput)) return 1;
            
            return a.length - b.length || a.localeCompare(b);
        });

        return filtered.slice(0, 15);
    }

    /** Returns cached folder list or builds it on first call */
    private getCachedFolders(): string[] {
        if (!this.cachedFolders) {
            this.cachedFolders = this.getAllFolders();
        }
        return this.cachedFolders;
    }

    /** Renders suggestion with folder name and full path */
    renderSuggestion(folder: string, el: HTMLElement): void {
        // Use normalizePath to ensure consistent separators before splitting
        const normalized = normalizePath(folder);
        const parts = normalized.split('/').filter(p => p.length > 0);
        const folderName = parts[parts.length - 1] ?? normalized;
        
        el.empty();
        
        el.createEl('div', { 
            cls: 'suggestion-title',
            text: folderName 
        });
        
        if (parts.length > 1) {
            el.createEl('div', { 
                cls: 'suggestion-note',
                text: normalized
            });
        }
    }

    /** Sets selected folder value and triggers onChange callback */
    selectSuggestion(folder: string): void {
        this.textComponent.setValue(folder);
        this.onChange?.();
    }

    /** Recursively collects all non-system folders from vault */
    private getAllFolders(): string[] {
        const folders: string[] = [];
        const root = this.app.vault.getRoot();

        const collectFolders = (folder: TFolder) => {
            for (const child of folder.children) {
                if (!(child instanceof TFolder)) continue;
                
                const path = child.path;
                
                if (path.startsWith('.obsidian') || path.startsWith('.trash') || path.startsWith('.git')) {
                    continue;
                }
                
                folders.push(path);
                collectFolders(child);
            }
        };

        collectFolders(root);

        folders.sort((a, b) => {
            const depthA = (a.match(/\//g) || []).length;
            const depthB = (b.match(/\//g) || []).length;
            if (depthA !== depthB) return depthA - depthB;
            return a.localeCompare(b);
        });

        return folders;
    }
}
