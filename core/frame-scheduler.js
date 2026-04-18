/*
 * Frame Scheduler with Frame Skipping
 * Đảm bảo rendering luôn đạt 60fps với requestAnimationFrame
 * 
 * Tính năng:
 * - Frame skipping khi có frame mới
 * - RAF-based rendering (60fps)
 * - VSync synchronization
 * - Frame timing statistics
 * - Adaptive frame dropping
 */

import * as Log from './util/logging.js';

export class FrameScheduler {
    constructor(display) {
        this.display = display;
        this.isRunning = false;
        this.rafId = null;
        
        // Frame queue
        this.frameQueue = [];
        this.maxQueueSize = 3; // Giữ tối đa 3 frames
        this.currentFrame = null;
        
        // Timing
        this.lastFrameTime = 0;
        this.targetFrameTime = 1000 / 60; // 60fps = 16.67ms
        this.frameCount = 0;
        this.droppedFrames = 0;
        this.lastFpsUpdate = 0;
        this.currentFps = 0;
        
        // Statistics
        this.stats = {
            fps: 0,
            droppedFrames: 0,
            queueSize: 0,
            renderTime: 0,
            totalFrames: 0
        };
        
        // Callbacks
        this.onFrameRendered = null;
        this.onFrameDropped = null;
    }

    // Start scheduler
    start() {
        if (this.isRunning) {
            return;
        }

        this.isRunning = true;
        this.lastFrameTime = performance.now();
        this.lastFpsUpdate = this.lastFrameTime;
        this.frameCount = 0;
        this.droppedFrames = 0;

        this.scheduleNextFrame();
        Log.Info('Frame scheduler started');
    }

    // Stop scheduler
    stop() {
        if (!this.isRunning) {
            return;
        }

        this.isRunning = false;
        
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }

        this.frameQueue = [];
        this.currentFrame = null;

        Log.Info('Frame scheduler stopped');
    }

    // Schedule next frame
    scheduleNextFrame() {
        if (!this.isRunning) {
            return;
        }

        this.rafId = requestAnimationFrame((timestamp) => {
            this.renderFrame(timestamp);
            this.scheduleNextFrame();
        });
    }

    // Add frame to queue
    addFrame(frameData) {
        if (!this.isRunning) {
            return false;
        }

        // Frame skipping: Nếu queue đầy, bỏ frame cũ nhất
        if (this.frameQueue.length >= this.maxQueueSize) {
            const dropped = this.frameQueue.shift();
            this.droppedFrames++;
            
            if (this.onFrameDropped) {
                this.onFrameDropped(dropped);
            }
            
            Log.Debug('Frame dropped, queue full');
        }

        // Add new frame
        this.frameQueue.push({
            data: frameData,
            timestamp: performance.now(),
            id: this.stats.totalFrames++
        });

        return true;
    }

    // Render frame
    renderFrame(timestamp) {
        const startTime = performance.now();

        // Calculate delta time
        const deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;

        // Update FPS counter
        this.frameCount++;
        if (timestamp - this.lastFpsUpdate >= 1000) {
            this.currentFps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = timestamp;
        }

        // Get next frame from queue
        if (this.frameQueue.length > 0) {
            // Frame skipping: Nếu có nhiều frames, chỉ lấy frame mới nhất
            if (this.frameQueue.length > 1) {
                // Drop all but the last frame
                const framesToDrop = this.frameQueue.length - 1;
                this.droppedFrames += framesToDrop;
                
                for (let i = 0; i < framesToDrop; i++) {
                    const dropped = this.frameQueue.shift();
                    if (this.onFrameDropped) {
                        this.onFrameDropped(dropped);
                    }
                }
                
                Log.Debug(`Skipped ${framesToDrop} frames to catch up`);
            }

            this.currentFrame = this.frameQueue.shift();
            
            // Render frame
            this.drawFrame(this.currentFrame);
        }

        // Calculate render time
        const renderTime = performance.now() - startTime;

        // Update statistics
        this.stats.fps = this.currentFps;
        this.stats.droppedFrames = this.droppedFrames;
        this.stats.queueSize = this.frameQueue.length;
        this.stats.renderTime = renderTime;

        // Callback
        if (this.onFrameRendered && this.currentFrame) {
            this.onFrameRendered(this.currentFrame, this.stats);
        }
    }

    // Draw frame to display
    drawFrame(frame) {
        if (!frame || !frame.data) {
            return;
        }

        try {
            // Actual drawing depends on frame data structure
            // This is a placeholder - implement based on your needs
            
            if (frame.data.imageData) {
                // Draw ImageData
                this.display.drawImage(frame.data.imageData, 
                                      frame.data.x || 0, 
                                      frame.data.y || 0);
            } else if (frame.data.updates) {
                // Draw multiple updates
                frame.data.updates.forEach(update => {
                    this.display.blitImage(
                        update.x, update.y,
                        update.width, update.height,
                        update.data, 0
                    );
                });
            }

            // Flip display
            this.display.flip();

        } catch (err) {
            Log.Error('Failed to draw frame:', err);
        }
    }

    // Get statistics
    getStatistics() {
        return {
            ...this.stats,
            queueSize: this.frameQueue.length,
            isRunning: this.isRunning,
            targetFps: 60,
            dropRate: this.stats.totalFrames > 0 ? 
                (this.droppedFrames / this.stats.totalFrames * 100).toFixed(2) + '%' : 
                '0%'
        };
    }

    // Set max queue size
    setMaxQueueSize(size) {
        this.maxQueueSize = Math.max(1, size);
    }

    // Clear queue
    clearQueue() {
        this.frameQueue = [];
    }

    // Reset statistics
    resetStatistics() {
        this.frameCount = 0;
        this.droppedFrames = 0;
        this.stats.totalFrames = 0;
        this.stats.droppedFrames = 0;
    }
}

// Advanced Frame Scheduler with adaptive dropping
export class AdaptiveFrameScheduler extends FrameScheduler {
    constructor(display) {
        super(display);
        
        // Adaptive settings
        this.adaptiveMode = true;
        this.targetLatency = 50; // ms
        this.minQueueSize = 1;
        this.maxQueueSize = 5;
        
        // Performance tracking
        this.recentRenderTimes = [];
        this.maxRecentSamples = 30;
    }

    // Add frame with adaptive logic
    addFrame(frameData) {
        if (!this.isRunning) {
            return false;
        }

        // Calculate current latency
        const now = performance.now();
        const latency = this.frameQueue.length > 0 ? 
            now - this.frameQueue[0].timestamp : 0;

        // Adaptive queue size adjustment
        if (this.adaptiveMode) {
            if (latency > this.targetLatency * 2) {
                // Too much latency, reduce queue size
                this.maxQueueSize = Math.max(this.minQueueSize, this.maxQueueSize - 1);
                Log.Debug(`Reduced queue size to ${this.maxQueueSize}`);
            } else if (latency < this.targetLatency / 2 && 
                       this.maxQueueSize < 5) {
                // Low latency, can increase queue size
                this.maxQueueSize++;
                Log.Debug(`Increased queue size to ${this.maxQueueSize}`);
            }
        }

        // Frame skipping with priority
        if (this.frameQueue.length >= this.maxQueueSize) {
            // Drop oldest frame
            const dropped = this.frameQueue.shift();
            this.droppedFrames++;
            
            if (this.onFrameDropped) {
                this.onFrameDropped(dropped);
            }
        }

        // Add frame
        this.frameQueue.push({
            data: frameData,
            timestamp: now,
            id: this.stats.totalFrames++,
            priority: frameData.priority || 0
        });

        return true;
    }

    // Render with adaptive logic
    renderFrame(timestamp) {
        const startTime = performance.now();

        // Calculate delta time
        const deltaTime = timestamp - this.lastFrameTime;
        this.lastFrameTime = timestamp;

        // Update FPS
        this.frameCount++;
        if (timestamp - this.lastFpsUpdate >= 1000) {
            this.currentFps = this.frameCount;
            this.frameCount = 0;
            this.lastFpsUpdate = timestamp;
        }

        // Adaptive frame skipping
        if (this.frameQueue.length > 0) {
            // Calculate how many frames to skip
            const framesToSkip = this.calculateFramesToSkip();
            
            if (framesToSkip > 0) {
                for (let i = 0; i < framesToSkip && this.frameQueue.length > 1; i++) {
                    const dropped = this.frameQueue.shift();
                    this.droppedFrames++;
                    
                    if (this.onFrameDropped) {
                        this.onFrameDropped(dropped);
                    }
                }
                
                if (framesToSkip > 0) {
                    Log.Debug(`Adaptively skipped ${framesToSkip} frames`);
                }
            }

            // Render next frame
            this.currentFrame = this.frameQueue.shift();
            this.drawFrame(this.currentFrame);
        }

        // Track render time
        const renderTime = performance.now() - startTime;
        this.recentRenderTimes.push(renderTime);
        
        if (this.recentRenderTimes.length > this.maxRecentSamples) {
            this.recentRenderTimes.shift();
        }

        // Update stats
        this.stats.fps = this.currentFps;
        this.stats.droppedFrames = this.droppedFrames;
        this.stats.queueSize = this.frameQueue.length;
        this.stats.renderTime = renderTime;

        // Callback
        if (this.onFrameRendered && this.currentFrame) {
            this.onFrameRendered(this.currentFrame, this.stats);
        }
    }

    // Calculate how many frames to skip
    calculateFramesToSkip() {
        if (this.frameQueue.length <= 1) {
            return 0;
        }

        // Calculate average render time
        const avgRenderTime = this.recentRenderTimes.length > 0 ?
            this.recentRenderTimes.reduce((a, b) => a + b, 0) / this.recentRenderTimes.length :
            this.targetFrameTime;

        // Calculate latency
        const now = performance.now();
        const latency = now - this.frameQueue[0].timestamp;

        // If latency is too high, skip frames
        if (latency > this.targetLatency) {
            // Skip enough frames to get back to target latency
            const framesToSkip = Math.floor(
                (latency - this.targetLatency) / this.targetFrameTime
            );
            
            return Math.min(framesToSkip, this.frameQueue.length - 1);
        }

        // If render time is too high, skip frames
        if (avgRenderTime > this.targetFrameTime * 1.5) {
            return Math.min(1, this.frameQueue.length - 1);
        }

        return 0;
    }

    // Get average render time
    getAverageRenderTime() {
        if (this.recentRenderTimes.length === 0) {
            return 0;
        }

        return this.recentRenderTimes.reduce((a, b) => a + b, 0) / 
               this.recentRenderTimes.length;
    }

    // Enable/disable adaptive mode
    setAdaptiveMode(enabled) {
        this.adaptiveMode = enabled;
        Log.Info(`Adaptive mode ${enabled ? 'enabled' : 'disabled'}`);
    }
}

// VSync-aware renderer
export class VSyncRenderer {
    constructor(display) {
        this.display = display;
        this.scheduler = new AdaptiveFrameScheduler(display);
        this.isVSyncEnabled = true;
        this.lastVSyncTime = 0;
        this.vsyncInterval = 16.67; // 60Hz
    }

    // Start rendering
    start() {
        this.scheduler.start();
    }

    // Stop rendering
    stop() {
        this.scheduler.stop();
    }

    // Add frame with VSync awareness
    addFrame(frameData) {
        if (!this.isVSyncEnabled) {
            return this.scheduler.addFrame(frameData);
        }

        const now = performance.now();
        const timeSinceLastVSync = now - this.lastVSyncTime;

        // Only add frame if we're close to VSync
        if (timeSinceLastVSync >= this.vsyncInterval * 0.8) {
            this.lastVSyncTime = now;
            return this.scheduler.addFrame(frameData);
        }

        // Skip frame if too early
        return false;
    }

    // Get statistics
    getStatistics() {
        return {
            ...this.scheduler.getStatistics(),
            vsyncEnabled: this.isVSyncEnabled,
            vsyncInterval: this.vsyncInterval
        };
    }

    // Enable/disable VSync
    setVSync(enabled) {
        this.isVSyncEnabled = enabled;
        Log.Info(`VSync ${enabled ? 'enabled' : 'disabled'}`);
    }
}

// Frame buffer for double buffering
export class FrameBuffer {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.frontBuffer = null;
        this.backBuffer = null;
        this.isSwapping = false;
        
        this.createBuffers();
    }

    createBuffers() {
        // Create canvas buffers
        this.frontBuffer = document.createElement('canvas');
        this.frontBuffer.width = this.width;
        this.frontBuffer.height = this.height;
        
        this.backBuffer = document.createElement('canvas');
        this.backBuffer.width = this.width;
        this.backBuffer.height = this.height;
    }

    // Get back buffer for drawing
    getBackBuffer() {
        return this.backBuffer;
    }

    // Get front buffer for display
    getFrontBuffer() {
        return this.frontBuffer;
    }

    // Swap buffers
    swap() {
        if (this.isSwapping) {
            return false;
        }

        this.isSwapping = true;
        
        // Swap references
        const temp = this.frontBuffer;
        this.frontBuffer = this.backBuffer;
        this.backBuffer = temp;
        
        this.isSwapping = false;
        return true;
    }

    // Resize buffers
    resize(width, height) {
        this.width = width;
        this.height = height;
        
        this.frontBuffer.width = width;
        this.frontBuffer.height = height;
        this.backBuffer.width = width;
        this.backBuffer.height = height;
    }

    // Clear buffer
    clear(buffer = 'back') {
        const canvas = buffer === 'back' ? this.backBuffer : this.frontBuffer;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, this.width, this.height);
    }
}
