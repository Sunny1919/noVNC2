/*
 * Smart Clipboard History
 * Lưu clipboard history vào localStorage
 * 
 * Tính năng:
 * - Lưu 20 clipboard items gần nhất
 * - Search trong history
 * - Pin favorite items
 * - Auto-cleanup old items
 * - Export/Import history
 */

import * as Log from './util/logging.js';

export class ClipboardHistory {
    constructor(maxItems = 20) {
        this.maxItems = maxItems;
        this.storageKey = 'novnc_clipboard_history';
        this.items = [];
        this.pinnedItems = [];
        this.listeners = [];
        
        this.load();
    }

    // Add item to history
    add(text, source = 'unknown') {
        if (!text || typeof text !== 'string') {
            return false;
        }

        // Trim whitespace
        text = text.trim();
        
        if (text.length === 0) {
            return false;
        }

        // Check if already exists (avoid duplicates)
        const existingIndex = this.items.findIndex(item => item.text === text);
        if (existingIndex !== -1) {
            // Move to top
            const item = this.items.splice(existingIndex, 1)[0];
            item.timestamp = Date.now();
            item.count++;
            this.items.unshift(item);
        } else {
            // Add new item
            const item = {
                id: this.generateId(),
                text: text,
                source: source,
                timestamp: Date.now(),
                count: 1,
                pinned: false
            };

            this.items.unshift(item);

            // Remove oldest if exceeds max
            if (this.items.length > this.maxItems) {
                this.items = this.items.slice(0, this.maxItems);
            }
        }

        this.save();
        this.notifyListeners('add', this.items[0]);

        return true;
    }

    // Get all items
    getAll() {
        return [...this.items];
    }

    // Get item by ID
    getById(id) {
        return this.items.find(item => item.id === id);
    }

    // Get recent items
    getRecent(count = 10) {
        return this.items.slice(0, count);
    }

    // Search items
    search(query) {
        if (!query) {
            return this.items;
        }

        query = query.toLowerCase();
        return this.items.filter(item => 
            item.text.toLowerCase().includes(query)
        );
    }

    // Pin item
    pin(id) {
        const item = this.getById(id);
        if (!item) {
            return false;
        }

        item.pinned = true;
        
        // Move to pinned list
        const index = this.items.indexOf(item);
        if (index !== -1) {
            this.items.splice(index, 1);
            this.pinnedItems.push(item);
        }

        this.save();
        this.notifyListeners('pin', item);

        return true;
    }

    // Unpin item
    unpin(id) {
        const item = this.pinnedItems.find(item => item.id === id);
        if (!item) {
            return false;
        }

        item.pinned = false;
        
        // Move back to regular list
        const index = this.pinnedItems.indexOf(item);
        if (index !== -1) {
            this.pinnedItems.splice(index, 1);
            this.items.unshift(item);
        }

        this.save();
        this.notifyListeners('unpin', item);

        return true;
    }

    // Get pinned items
    getPinned() {
        return [...this.pinnedItems];
    }

    // Delete item
    delete(id) {
        let index = this.items.findIndex(item => item.id === id);
        if (index !== -1) {
            const item = this.items.splice(index, 1)[0];
            this.save();
            this.notifyListeners('delete', item);
            return true;
        }

        index = this.pinnedItems.findIndex(item => item.id === id);
        if (index !== -1) {
            const item = this.pinnedItems.splice(index, 1)[0];
            this.save();
            this.notifyListeners('delete', item);
            return true;
        }

        return false;
    }

    // Clear all items
    clear() {
        this.items = [];
        this.save();
        this.notifyListeners('clear', null);
    }

    // Clear non-pinned items
    clearNonPinned() {
        this.items = [];
        this.save();
        this.notifyListeners('clear', null);
    }

    // Save to localStorage
    save() {
        try {
            const data = {
                items: this.items,
                pinnedItems: this.pinnedItems,
                version: 1
            };

            localStorage.setItem(this.storageKey, JSON.stringify(data));
            return true;

        } catch (err) {
            Log.Error('Failed to save clipboard history:', err);
            return false;
        }
    }

    // Load from localStorage
    load() {
        try {
            const data = localStorage.getItem(this.storageKey);
            
            if (!data) {
                return false;
            }

            const parsed = JSON.parse(data);
            
            this.items = parsed.items || [];
            this.pinnedItems = parsed.pinnedItems || [];

            Log.Info(`Loaded ${this.items.length} clipboard items`);
            return true;

        } catch (err) {
            Log.Error('Failed to load clipboard history:', err);
            return false;
        }
    }

    // Export history
    export() {
        return {
            items: this.items,
            pinnedItems: this.pinnedItems,
            exportDate: new Date().toISOString(),
            version: 1
        };
    }

    // Import history
    import(data) {
        try {
            if (!data || !data.items) {
                throw new Error('Invalid import data');
            }

            this.items = data.items;
            this.pinnedItems = data.pinnedItems || [];

            this.save();
            this.notifyListeners('import', null);

            Log.Info(`Imported ${this.items.length} clipboard items`);
            return true;

        } catch (err) {
            Log.Error('Failed to import clipboard history:', err);
            return false;
        }
    }

    // Get statistics
    getStatistics() {
        return {
            totalItems: this.items.length + this.pinnedItems.length,
            regularItems: this.items.length,
            pinnedItems: this.pinnedItems.length,
            oldestItem: this.items[this.items.length - 1]?.timestamp,
            newestItem: this.items[0]?.timestamp,
            totalSize: this.getTotalSize()
        };
    }

    // Get total size in bytes
    getTotalSize() {
        const allItems = [...this.items, ...this.pinnedItems];
        return allItems.reduce((total, item) => {
            return total + (item.text?.length || 0);
        }, 0);
    }

    // Generate unique ID
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Add listener
    addListener(callback) {
        this.listeners.push(callback);
    }

    // Remove listener
    removeListener(callback) {
        this.listeners = this.listeners.filter(l => l !== callback);
    }

    // Notify listeners
    notifyListeners(action, item) {
        this.listeners.forEach(callback => {
            try {
                callback(action, item);
            } catch (err) {
                Log.Error('Error in clipboard history listener:', err);
            }
        });
    }
}

// Clipboard History UI
export class ClipboardHistoryUI {
    constructor(history) {
        this.history = history;
        this.panel = null;
        this.searchInput = null;
        this.itemsList = null;
        this.isOpen = false;

        this.createUI();
        this.bindEvents();
    }

    createUI() {
        // Create panel
        this.panel = document.createElement('div');
        this.panel.id = 'noVNC_clipboard_history_panel';
        this.panel.className = 'noVNC_panel';
        this.panel.style.cssText = `
            position: fixed;
            right: 20px;
            top: 80px;
            width: 350px;
            max-height: 500px;
            background: white;
            border: 1px solid #ccc;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: none;
            flex-direction: column;
            z-index: 1000;
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            border-bottom: 1px solid #eee;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f5f5f5;
            border-radius: 8px 8px 0 0;
        `;
        header.innerHTML = `
            <h3 style="margin: 0; font-size: 14px; font-weight: 600;">Clipboard History</h3>
            <button id="noVNC_clipboard_history_close" style="
                background: none;
                border: none;
                font-size: 20px;
                cursor: pointer;
                padding: 0;
                width: 24px;
                height: 24px;
            ">×</button>
        `;

        // Search
        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = 'padding: 12px 16px; border-bottom: 1px solid #eee;';
        this.searchInput = document.createElement('input');
        this.searchInput.type = 'text';
        this.searchInput.placeholder = 'Search clipboard...';
        this.searchInput.style.cssText = `
            width: 100%;
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 13px;
        `;
        searchContainer.appendChild(this.searchInput);

        // Items list
        this.itemsList = document.createElement('div');
        this.itemsList.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        `;

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid #eee;
            display: flex;
            gap: 8px;
            background: #f5f5f5;
            border-radius: 0 0 8px 8px;
        `;
        footer.innerHTML = `
            <button id="noVNC_clipboard_history_clear" style="
                flex: 1;
                padding: 8px;
                background: #f44336;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            ">Clear All</button>
            <button id="noVNC_clipboard_history_export" style="
                flex: 1;
                padding: 8px;
                background: #2196F3;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
            ">Export</button>
        `;

        this.panel.appendChild(header);
        this.panel.appendChild(searchContainer);
        this.panel.appendChild(this.itemsList);
        this.panel.appendChild(footer);

        document.body.appendChild(this.panel);
    }

    bindEvents() {
        // Close button
        document.getElementById('noVNC_clipboard_history_close')
            .addEventListener('click', () => this.close());

        // Search
        this.searchInput.addEventListener('input', (e) => {
            this.renderItems(e.target.value);
        });

        // Clear button
        document.getElementById('noVNC_clipboard_history_clear')
            .addEventListener('click', () => {
                if (confirm('Clear all clipboard history?')) {
                    this.history.clear();
                    this.renderItems();
                }
            });

        // Export button
        document.getElementById('noVNC_clipboard_history_export')
            .addEventListener('click', () => this.exportHistory());

        // Listen to history changes
        this.history.addListener(() => this.renderItems());
    }

    renderItems(searchQuery = '') {
        const items = searchQuery ? 
            this.history.search(searchQuery) : 
            this.history.getAll();

        const pinnedItems = this.history.getPinned();

        this.itemsList.innerHTML = '';

        // Render pinned items
        if (pinnedItems.length > 0) {
            const pinnedHeader = document.createElement('div');
            pinnedHeader.textContent = 'Pinned';
            pinnedHeader.style.cssText = `
                font-size: 11px;
                color: #666;
                margin: 8px 0 4px 0;
                font-weight: 600;
            `;
            this.itemsList.appendChild(pinnedHeader);

            pinnedItems.forEach(item => {
                this.itemsList.appendChild(this.createItemElement(item));
            });
        }

        // Render regular items
        if (items.length > 0) {
            const recentHeader = document.createElement('div');
            recentHeader.textContent = 'Recent';
            recentHeader.style.cssText = `
                font-size: 11px;
                color: #666;
                margin: 8px 0 4px 0;
                font-weight: 600;
            `;
            this.itemsList.appendChild(recentHeader);

            items.forEach(item => {
                this.itemsList.appendChild(this.createItemElement(item));
            });
        }

        if (items.length === 0 && pinnedItems.length === 0) {
            this.itemsList.innerHTML = '<div style="text-align: center; padding: 20px; color: #999;">No clipboard items</div>';
        }
    }

    createItemElement(item) {
        const el = document.createElement('div');
        el.className = 'clipboard-history-item';
        el.style.cssText = `
            padding: 8px;
            margin: 4px 0;
            background: #f9f9f9;
            border: 1px solid #eee;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            position: relative;
        `;

        const preview = item.text.length > 100 ? 
            item.text.substring(0, 100) + '...' : 
            item.text;

        const date = new Date(item.timestamp).toLocaleString();

        el.innerHTML = `
            <div style="white-space: pre-wrap; word-break: break-word;">${this.escapeHtml(preview)}</div>
            <div style="font-size: 10px; color: #999; margin-top: 4px;">
                ${date} • ${item.source}
            </div>
            <div style="position: absolute; top: 8px; right: 8px; display: flex; gap: 4px;">
                <button class="pin-btn" style="
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 16px;
                ">${item.pinned ? '📌' : '📍'}</button>
                <button class="delete-btn" style="
                    background: none;
                    border: none;
                    cursor: pointer;
                    font-size: 16px;
                ">🗑️</button>
            </div>
        `;

        // Click to copy
        el.addEventListener('click', (e) => {
            if (e.target.classList.contains('pin-btn') || 
                e.target.classList.contains('delete-btn')) {
                return;
            }
            this.copyItem(item);
        });

        // Pin button
        el.querySelector('.pin-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.pinned) {
                this.history.unpin(item.id);
            } else {
                this.history.pin(item.id);
            }
        });

        // Delete button
        el.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.history.delete(item.id);
        });

        return el;
    }

    copyItem(item) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(item.text)
                .then(() => {
                    Log.Info('Copied from history');
                    this.showToast('Copied!');
                })
                .catch(err => {
                    Log.Error('Failed to copy:', err);
                });
        }
    }

    exportHistory() {
        const data = this.history.export();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `clipboard-history-${Date.now()}.json`;
        a.click();

        URL.revokeObjectURL(url);
    }

    showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: #323232;
            color: white;
            padding: 12px 24px;
            border-radius: 4px;
            z-index: 10000;
        `;
        document.body.appendChild(toast);

        setTimeout(() => {
            document.body.removeChild(toast);
        }, 2000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    open() {
        this.panel.style.display = 'flex';
        this.isOpen = true;
        this.renderItems();
    }

    close() {
        this.panel.style.display = 'none';
        this.isOpen = false;
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }
}
