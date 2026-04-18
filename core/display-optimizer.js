/*
 * Display Optimizer
 * Wrapper cho Display với frame scheduling và optimization
 */

import * as Log from './util/logging.js';
import { AdaptiveFrameScheduler, FrameBuffer } from './frame-scheduler.js';

export class OptimizedDisplay {
    constructor(display) {
        this.display = display;
        this.scheduler = new AdaptiveFrameScheduler(display);
        this.frameBuffer = null;
        this.useDoubleBuffering = true;
        this.pendingUpdates = [];
        
        // Settings
        this.enableFrameSkipping = true;
        this.targetFps = 60;
        this.maxLatency = 50; // ms
        
        // Statistics
        this.stats = {
            totalUpdates: 0,
            skippedUpdates: 0,
            batchedUpdates: 0
        };

        // Setup callbacks
        this.setupCallbacks();
    }

    // Setup callbacks
    setupCallbacks() {
        this.scheduler.onFrameRendered = (frame, stats) => {
            this.onFrameRendered(frame, stats);
        };

        this.scheduler.onFrameDropped = (frame) => {
            this.onFrameDropped(frame);
        };
    }

    // Initialize
    init() {
        // Create frame buffer if double buffering enabled
        if (this.useDoubleBuffering) {
            this.frameBuffer = new FrameBuffer(
                this.display.width,
                this.display.height
            );
        }

        // Start scheduler
        this.scheduler.start();

        Log.Info('Optimized display initialized');
    }

    // Destroy
    destroy() {
        this.scheduler.stop();
        this.frameBuffer = null;
        this.pendingUpdates = [];
    }

    // Add update to queue
    addUpdate(update) {
        this.stats.totalUpdates++;

        // Batch updates
        this.pendingUpdates.push(update);

        // If frame skipping enabled, batch multiple updates
        if (this.enableFrameSkipping) {
            // Don't add frame immediately, wait for RAF
            return;
        }

        // Add frame immediately
        this.flushUpdates();
    }

    // Flush pending updates
    flushUpdates() {
        if (this.pendingUpdates.length === 0) {
            return;
        }

        // Create frame data
        const frameData = {
            updates: [...this.pendingUpdates],
            timestamp: performance.now()
        };

        // Clear pending updates
        this.pendingUpdates = [];

        // Add to scheduler
        this.scheduler.addFrame(frameData);

        this.stats.batchedUpdates++;
    }

    // Wrapper methods for Display
    blitImage(x, y, width, height, arr, offset) {
        const update = {
            type: 'blit',
            x, y, width, height,
            data: arr,
            offset: offset || 0
        };

        this.addUpdate(update);
    }

    fillRect(x, y, width, height, color) {
        const update = {
            type: 'fill',
            x, y, width, height,
            color
        };

        this.addUpdate(update);
    }

    copyImage(oldX, oldY, newX, newY, w, h) {
        const update = {
            type: 'copy',
            oldX, oldY, newX, newY,
            width: w, height: h
        };

        this.addUpdate(update);
    }

    drawImage(img, x, y) {
        const update = {
            type: 'image',
            image: img,
            x, y
        };

        this.addUpdate(update);
    }

    // Flip display (called by RAF)
    flip() {
        // Flush any pending updates
        this.flushUpdates();

        // Actual flip is handled by scheduler
    }

    // Resize
    resize(width, height) {
        this.display.resize(width, height);

        if (this.frameBuffer) {
            this.frameBuffer.resize(width, height);
        }
    }

    // Callbacks
    onFrameRendered(frame, stats) {
        // Log statistics periodically
        if (stats.totalFrames % 60 === 0) {
            Log.Debug('Frame stats:', {
                fps: stats.fps,
                dropped: stats.droppedFrames,
                queue: stats.queueSize,
                renderTime: stats.renderTime.toFixed(2) + 'ms'
            });
        }
    }

    onFrameDropped(frame) {
        this.stats.skippedUpdates++;
        Log.Debug('Frame dropped:', frame.id);
    }

    // Get statistics
    getStatistics() {
        return {
            ...this.stats,
            scheduler: this.scheduler.getStatistics(),
            skipRate: this.stats.totalUpdates > 0 ?
                (this.stats.skippedUpdates / this.stats.totalUpdates * 100).toFixed(2) + '%' :
                '0%'
        };
    }

    // Enable/disable frame skipping
    setFrameSkipping(enabled) {
        this.enableFrameSkipping = enabled;
        Log.Info(`Frame skipping ${enabled ? 'enabled' : 'disabled'}`);
    }

    // Set target FPS
    setTargetFps(fps) {
        this.targetFps = fps;
        this.scheduler.targetFrameTime = 1000 / fps;
    }

    // Get current FPS
    getCurrentFps() {
        return this.scheduler.stats.fps;
    }
}

// Factory function to wrap existing Display
export function createOptimizedDisplay(display) {
    const optimized = new OptimizedDisplay(display);
    optimized.init();
    return optimized;
}

// Monkey-patch Display methods to use frame scheduler
export function patchDisplay(display) {
    // Save original methods
    const originalBlitImage = display.blitImage.bind(display);
    const originalFillRect = display.fillRect.bind(display);
    const originalCopyImage = display.copyImage.bind(display);
    const originalFlip = display.flip.bind(display);

    // Create scheduler
    const scheduler = new AdaptiveFrameScheduler(display);
    scheduler.start();

    // Pending updates
    let pendingUpdates = [];
    let rafScheduled = false;

    // Flush function
    const flushUpdates = () => {
        rafScheduled = false;

        if (pendingUpdates.length === 0) {
            return;
        }

        // Create frame
        const frameData = {
            updates: [...pendingUpdates],
            timestamp: performance.now()
        };

        pendingUpdates = [];

        // Add to scheduler
        scheduler.addFrame(frameData);
    };

    // Schedule flush
    const scheduleFlush = () => {
        if (!rafScheduled) {
            rafScheduled = true;
            requestAnimationFrame(flushUpdates);
        }
    };

    // Override blitImage
    display.blitImage = function(x, y, width, height, arr, offset, fromQueue) {
        if (fromQueue) {
            // Direct call from queue, use original
            return originalBlitImage(x, y, width, height, arr, offset, fromQueue);
        }

        // Add to pending updates
        pendingUpdates.push({
            type: 'blit',
            x, y, width, height,
            data: new Uint8Array(arr), // Clone data
            offset: offset || 0
        });

        scheduleFlush();
    };

    // Override fillRect
    display.fillRect = function(x, y, width, height, color, fromQueue) {
        if (fromQueue) {
            return originalFillRect(x, y, width, height, color, fromQueue);
        }

        pendingUpdates.push({
            type: 'fill',
            x, y, width, height, color
        });

        scheduleFlush();
    };

    // Override copyImage
    display.copyImage = function(oldX, oldY, newX, newY, w, h, fromQueue) {
        if (fromQueue) {
            return originalCopyImage(oldX, oldY, newX, newY, w, h, fromQueue);
        }

        pendingUpdates.push({
            type: 'copy',
            oldX, oldY, newX, newY,
            width: w, height: h
        });

        scheduleFlush();
    };

    // Override flip
    display.flip = function(fromQueue) {
        if (fromQueue) {
            return originalFlip(fromQueue);
        }

        // Flush pending updates
        flushUpdates();
    };

    // Add scheduler reference
    display._frameScheduler = scheduler;

    // Add method to get stats
    display.getFrameStats = function() {
        return scheduler.getStatistics();
    };

    Log.Info('Display patched with frame scheduler');

    return display;
}
