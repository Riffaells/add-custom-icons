import { App, Modal, Notice, Setting, TextComponent, setIcon } from 'obsidian';
import AddCustomIconsPlugin from '../../../main';
import { IconCacheEntry } from '../../types';
import { t } from '../../lang/helpers';

export class IconsBrowserModal extends Modal {
    plugin: AddCustomIconsPlugin;
    private currentBatchIndex = 0;
    private batchSize = 50;
    private filteredEntries: [string, IconCacheEntry][] = [];
    private grid: HTMLElement;
    private scrollAbortController: AbortController | null = null;

    constructor(app: App, plugin: AddCustomIconsPlugin) {
        super(app);
        this.plugin = plugin;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass('icons-browser-modal');

        new Setting(contentEl)
            .setName(t('browser.header'))
            .setHeading();

        const searchContainer = contentEl.createDiv({ 
            cls: 'modal-search-container', 
            attr: { style: 'position: relative; margin-bottom: 12px; border: none;' } 
        });
        
        const searchInput = new TextComponent(searchContainer);
        searchInput.inputEl.addClass('modal-search-input-full-width');
        searchInput.setPlaceholder(t('browser.placeholder'));

        this.grid = contentEl.createDiv({ cls: 'icon-grid' });
        
        // Use AbortController so the listener is guaranteed to be removed
        // when the modal closes, even if onClose is called before the grid is GC'd.
        this.scrollAbortController = new AbortController();
        this.grid.addEventListener('scroll', () => {
            if (this.grid.scrollTop + this.grid.clientHeight >= this.grid.scrollHeight - 100) {
                this.renderNextBatch();
            }
        }, { signal: this.scrollAbortController.signal });

        searchInput.onChange((value) => this.filterIcons(value));
        this.filterIcons();
    }

    private filterIcons(filter: string = ''): void {
        const cache = this.plugin.iconCache;
        const entries = Object.entries(cache).filter(([path]) => path !== '_cacheVersion');
        
        this.filteredEntries = entries.filter((item): item is [string, IconCacheEntry] => {
            const [path, entry] = item;
            if (typeof entry !== 'object' || !entry || !('iconId' in entry)) {
                return false;
            }
            const name = path.split('/').pop()?.toLowerCase() ?? '';
            const id = ((entry as IconCacheEntry).iconId ?? '').toLowerCase();
            const lowerFilter = filter.toLowerCase();
            return name.includes(lowerFilter) || id.includes(lowerFilter);
        });

        this.currentBatchIndex = 0;
        this.grid.empty();
        
        if (this.filteredEntries.length === 0) {
            this.grid.createDiv({ 
                text: t('browser.noIcons'), 
                cls: 'setting-item-description' 
            });
            return;
        }

        this.renderNextBatch();
    }

    private renderNextBatch(): void {
        const start = this.currentBatchIndex * this.batchSize;
        const end = start + this.batchSize;
        const batch = this.filteredEntries.slice(start, end);

        if (batch.length === 0) return;

        batch.forEach(([_path, entry]) => {
            const iconId = entry.iconId;
            const iconItem = this.grid.createDiv({ 
                cls: 'icon-item',
                attr: { 
                    'aria-label': t('browser.clickToCopy'),
                    'title': iconId,
                    'tabindex': '0',
                    'role': 'button',
                }
            });

            iconItem.addEventListener('click', () => {
                void navigator.clipboard.writeText(iconId).then(() => {
                    new Notice(t('browser.copied', { id: iconId }), 2000);
                });
            });

            iconItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void navigator.clipboard.writeText(iconId).then(() => {
                        new Notice(t('browser.copied', { id: iconId }), 2000);
                    });
                }
            });
            
            const preview = iconItem.createDiv({ cls: 'icon-preview' });
            setIcon(preview, iconId);

            const info = iconItem.createDiv({ cls: 'icon-info' });
            info.createDiv({ cls: 'icon-name', text: iconId });
        });

        this.currentBatchIndex++;
    }

    onClose() {
        // Abort the scroll listener — works even if the grid element is already gone.
        this.scrollAbortController?.abort();
        this.scrollAbortController = null;

        const { contentEl } = this;
        contentEl.empty();
    }
}
