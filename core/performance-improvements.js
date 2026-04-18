/*
 * noVNC Performance Improvements
 * Các cải tiến hiệu suất cho noVNC
 * 
 * Tính năng:
 * - Request Animation Frame optimization
 * - Frame skipping cho 60fps
 * - Debouncing cho các sự kiện chuột
 * - Batch rendering updates
 * - Connection retry logic với exponential backoff
 */

export class PerformanceOptimizer {
    constructor() {
        this.pendingUpdates = [];
        this.isProcessing = false;
        this.rafId = null;
        this.frameSkippingEnabled = true;
        this.targetFps = 60;
        this.lastFrameTime = 0;
    }

    // Batch multiple rendering updates vào một frame với frame skipping
    scheduleUpdate(updateFn, priority = 0) {
        // Nếu frame skipping enabled, chỉ giữ update mới nhất
        if (this.frameSkippingEnabled && this.pendingUpdates.length > 0) {
            // Bỏ qua updates cũ nếu có update mới với priority cao hơn
            this.pendingUpdates = this.pendingUpdates.filter(u => u.priority > priority);
        }

        this.pendingUpdates.push({ fn: updateFn, priority });
        
        if (!this.rafId) {
            this.rafId = requestAnimationFrame((timestamp) => {
                this.processPendingUpdates(timestamp);
            });
        }
    }

    processPendingUpdates(timestamp) {
        if (this.isProcessing) return;
        
        // Check if we should skip this frame (for 60fps)
        const deltaTime = timestamp - this.lastFrameTime;
        const targetFrameTime = 1000 / this.targetFps;
        
        if (deltaTime < targetFrameTime * 0.9) {
            // Too early, reschedule
            this.rafId = requestAnimationFrame((ts) => this.processPendingUpdates(ts));
            return;
        }
        
        this.lastFrameTime = timestamp;
        this.isProcessing = true;
        
        // Sort by priority (higher first)
        const updates = this.pendingUpdates.sort((a, b) => b.priority - a.priority);
        this.pendingUpdates = [];
        
        try {
            updates.forEach(update => update.fn());
        } catch (err) {
            console.error('Error processing updates:', err);
        } finally {
            this.isProcessing = false;
            this.rafId = null;
            
            // If there are more updates, schedule next frame
            if (this.pendingUpdates.length > 0) {
                this.rafId = requestAnimationFrame((ts) => this.processPendingUpdates(ts));
            }
        }
    }

    // Enable/disable frame skipping
    setFrameSkipping(enabled) {
        this.frameSkippingEnabled = enabled;
    }

    // Set target FPS
    setTargetFps(fps) {
        this.targetFps = Math.max(1, Math.min(120, fps));
    }

    // Debounce function để giảm số lần gọi hàm
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Throttle function để giới hạn tần suất gọi hàm
    throttle(func, limit) {
        let inThrottle;
        let lastResult;
        return function(...args) {
            if (!inThrottle) {
                lastResult = func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
            return lastResult;
        };
    }

    // RAF-based throttle (better for animations)
    rafThrottle(func) {
        let rafId = null;
        let lastArgs = null;

        return function(...args) {
            lastArgs = args;
            
            if (rafId === null) {
                rafId = requestAnimationFrame(() => {
                    func.apply(this, lastArgs);
                    rafId = null;
                });
            }
        };
    }
}

// Connection retry với exponential backoff
export class ConnectionRetryManager {
    constructor(maxRetries = 5, baseDelay = 1000) {
        this.maxRetries = maxRetries;
        this.baseDelay = baseDelay;
        this.retryCount = 0;
        this.retryTimeout = null;
    }

    reset() {
        this.retryCount = 0;
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
            this.retryTimeout = null;
        }
    }

    shouldRetry() {
        return this.retryCount < this.maxRetries;
    }

    getNextDelay() {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        return this.baseDelay * Math.pow(2, this.retryCount);
    }

    scheduleRetry(callback) {
        if (!this.shouldRetry()) {
            console.error('Max retries reached');
            return false;
        }

        const delay = this.getNextDelay();
        this.retryCount++;
        
        console.log(`Scheduling retry ${this.retryCount}/${this.maxRetries} in ${delay}ms`);
        
        this.retryTimeout = setTimeout(() => {
            callback();
        }, delay);

        return true;
    }
}

// Image caching để tránh decode lại ảnh nhiều lần
export class ImageCache {
    constructor(maxSize = 50) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.accessOrder = [];
    }

    set(key, value) {
        // LRU cache implementation
        if (this.cache.has(key)) {
            this.accessOrder = this.accessOrder.filter(k => k !== key);
        } else if (this.cache.size >= this.maxSize) {
            const oldest = this.accessOrder.shift();
            this.cache.delete(oldest);
        }

        this.cache.set(key, value);
        this.accessOrder.push(key);
    }

    get(key) {
        if (!this.cache.has(key)) {
            return null;
        }

        // Move to end (most recently used)
        this.accessOrder = this.accessOrder.filter(k => k !== key);
        this.accessOrder.push(key);

        return this.cache.get(key);
    }

    clear() {
        this.cache.clear();
        this.accessOrder = [];
    }
}

// Memory pool để tái sử dụng buffers
export class BufferPool {
    constructor(bufferSize = 1024 * 1024) {
        this.bufferSize = bufferSize;
        this.pool = [];
        this.maxPoolSize = 10;
    }

    acquire() {
        if (this.pool.length > 0) {
            return this.pool.pop();
        }
        return new Uint8Array(this.bufferSize);
    }

    release(buffer) {
        if (this.pool.length < this.maxPoolSize && buffer.length === this.bufferSize) {
            this.pool.push(buffer);
        }
    }

    clear() {
        this.pool = [];
    }
}
