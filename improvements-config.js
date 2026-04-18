/*
 * noVNC Improvements Configuration
 * File cấu hình cho các tính năng cải tiến
 */

export const ImprovementsConfig = {
    // Clipboard Settings
    clipboard: {
        // Bật/tắt tự động đồng bộ clipboard
        autoSync: true,
        
        // Tần suất kiểm tra clipboard (ms)
        syncInterval: 1000,
        
        // Hiển thị thông báo khi sync thành công
        showNotifications: true,
        
        // Timeout cho clipboard operations (ms)
        timeout: 5000,
        
        // Sử dụng fallback method nếu Clipboard API không khả dụng
        useFallback: true,
        
        // Chỉ sync khi window được focus
        syncOnFocusOnly: true
    },

    // Performance Settings
    performance: {
        // Bật/tắt RAF batching
        useRAFBatching: true,
        
        // Số updates tối đa trong một batch
        maxBatchSize: 50,
        
        // Bật/tắt image caching
        useImageCache: true,
        
        // Kích thước cache (số lượng images)
        imageCacheSize: 50,
        
        // Bật/tắt buffer pooling
        useBufferPool: true,
        
        // Kích thước buffer pool
        bufferPoolSize: 10,
        
        // Kích thước mỗi buffer (bytes)
        bufferSize: 1024 * 1024, // 1MB
        
        // Mouse move throttle delay (ms)
        mouseMoveDelay: 16, // ~60fps
        
        // Resize debounce delay (ms)
        resizeDebounceDelay: 250
    },

    // Error Recovery Settings
    errorRecovery: {
        // Bật/tắt automatic error recovery
        enabled: true,
        
        // Số lỗi tối đa trong error window
        errorThreshold: 5,
        
        // Error window (ms)
        errorWindow: 60000, // 1 phút
        
        // Bật/tắt connection retry
        enableRetry: true,
        
        // Số lần retry tối đa
        maxRetries: 5,
        
        // Base delay cho retry (ms)
        retryBaseDelay: 1000,
        
        // Sử dụng exponential backoff
        useExponentialBackoff: true
    },

    // Connection Health Monitoring
    healthMonitoring: {
        // Bật/tắt health monitoring
        enabled: true,
        
        // Tần suất kiểm tra (ms)
        checkInterval: 10000, // 10 giây
        
        // Ping timeout (ms)
        pingTimeout: 5000,
        
        // Tự động reconnect khi unhealthy
        autoReconnect: true
    },

    // Graceful Degradation
    degradation: {
        // Bật/tắt automatic degradation
        enabled: true,
        
        // Quality levels cho các modes
        qualityLevels: {
            normal: 6,
            low: 4,
            minimal: 2
        },
        
        // Compression levels cho các modes
        compressionLevels: {
            normal: 2,
            low: 4,
            minimal: 6
        },
        
        // Tự động restore khi điều kiện tốt hơn
        autoRestore: true,
        
        // Thời gian chờ trước khi restore (ms)
        restoreDelay: 30000 // 30 giây
    },

    // Logging Settings
    logging: {
        // Bật/tắt structured logging
        enabled: true,
        
        // Số lượng errors tối đa được lưu
        maxErrors: 100,
        
        // Log level: 'error', 'warn', 'info', 'debug'
        level: 'info',
        
        // Tự động export errors khi đạt max
        autoExport: false,
        
        // Include stack traces
        includeStackTraces: true
    },

    // UI Settings
    ui: {
        // Hiển thị performance metrics
        showPerformanceMetrics: false,
        
        // Hiển thị connection status
        showConnectionStatus: true,
        
        // Notification duration (ms)
        notificationDuration: 2000,
        
        // Animation duration (ms)
        animationDuration: 300
    },

    // Advanced Settings
    advanced: {
        // Sử dụng Web Workers cho heavy operations
        useWebWorkers: false,
        
        // Sử dụng OffscreenCanvas nếu có
        useOffscreenCanvas: false,
        
        // Enable experimental features
        experimentalFeatures: false,
        
        // Debug mode
        debugMode: false
    }
};

// Helper functions để get/set config
export class ConfigManager {
    constructor(config = ImprovementsConfig) {
        this.config = config;
        this.listeners = new Map();
    }

    // Get config value
    get(path) {
        const keys = path.split('.');
        let value = this.config;
        
        for (const key of keys) {
            if (value && typeof value === 'object' && key in value) {
                value = value[key];
            } else {
                return undefined;
            }
        }
        
        return value;
    }

    // Set config value
    set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let obj = this.config;
        
        for (const key of keys) {
            if (!(key in obj)) {
                obj[key] = {};
            }
            obj = obj[key];
        }
        
        const oldValue = obj[lastKey];
        obj[lastKey] = value;
        
        // Notify listeners
        this.notifyListeners(path, value, oldValue);
        
        return true;
    }

    // Watch for config changes
    watch(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, []);
        }
        this.listeners.get(path).push(callback);
    }

    // Unwatch config changes
    unwatch(path, callback) {
        if (this.listeners.has(path)) {
            const callbacks = this.listeners.get(path);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    // Notify listeners
    notifyListeners(path, newValue, oldValue) {
        if (this.listeners.has(path)) {
            this.listeners.get(path).forEach(callback => {
                try {
                    callback(newValue, oldValue, path);
                } catch (err) {
                    console.error('Error in config listener:', err);
                }
            });
        }
    }

    // Load config from localStorage
    loadFromStorage(key = 'novnc_improvements_config') {
        try {
            const stored = localStorage.getItem(key);
            if (stored) {
                const parsed = JSON.parse(stored);
                this.config = { ...this.config, ...parsed };
                return true;
            }
        } catch (err) {
            console.error('Failed to load config from storage:', err);
        }
        return false;
    }

    // Save config to localStorage
    saveToStorage(key = 'novnc_improvements_config') {
        try {
            localStorage.setItem(key, JSON.stringify(this.config));
            return true;
        } catch (err) {
            console.error('Failed to save config to storage:', err);
            return false;
        }
    }

    // Reset to defaults
    reset() {
        this.config = JSON.parse(JSON.stringify(ImprovementsConfig));
        this.notifyListeners('*', this.config, null);
    }

    // Export config as JSON
    export() {
        return JSON.stringify(this.config, null, 2);
    }

    // Import config from JSON
    import(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            this.config = { ...ImprovementsConfig, ...parsed };
            this.notifyListeners('*', this.config, null);
            return true;
        } catch (err) {
            console.error('Failed to import config:', err);
            return false;
        }
    }
}

// Create default instance
export const configManager = new ConfigManager();

// Example usage:
/*
import { configManager } from './improvements-config.js';

// Get config value
const autoSync = configManager.get('clipboard.autoSync');

// Set config value
configManager.set('clipboard.autoSync', false);

// Watch for changes
configManager.watch('clipboard.autoSync', (newValue, oldValue) => {
    console.log(`autoSync changed from ${oldValue} to ${newValue}`);
});

// Save to localStorage
configManager.saveToStorage();

// Load from localStorage
configManager.loadFromStorage();
*/
