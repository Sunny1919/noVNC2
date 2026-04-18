/*
 * Frame Rate Limiter
 * Giới hạn FPS để tránh quá tải bandwidth và CPU
 * 
 * Features:
 * - Configurable max FPS
 * - Frame skipping
 * - Request throttling
 * - Statistics tracking
 */

import * as Log from './util/logging.js';

export class FrameRateLimiter {
    constructor(maxFPS = 30) {
        this.maxFPS = maxFPS;
        this.minFrameInterval = 1000 / maxFPS;
        this.lastFrameTime = 0;
        this.skippedFrames = 0;
        this.processedFrames = 0;
        this.totalFrames = 0;
        
        // Request throttling
        this.maxConcurrentRequests = 2;
        this.activeRequests = 0;
        this.pendingRequests = [];
    }

    // Check if we should process this frame
    shouldProcessFrame() {
        const now = performance.now();
        const elapsed = now - this.lastFrameTime;
        
        this.totalFrames++;
        
        if (elapsed < this.minFrameInterval) {
            this.skippedFrames++;
            return false;
        }
        
        this.lastFrameTime = now;
        this.processedFrames++;
        return true;
    }

    // Throttle async requests (for JPEG decoding, etc.)
    async throttleRequest(requestFn) {
        // If too many active requests, skip this one
        if (this.activeRequests >= this.maxConcurrentRequests) {
            this.skippedFrames++;
            return null;
        }

        this.activeRequests++;
        
        try {
            const result = await requestFn();
            return result;
        } finally {
            this.activeRequests--;
            
            // Process next pending request if any
            if (this.pendingRequests.length > 0) {
                const nextRequest = this.pendingRequests.shift();
                this.throttleRequest(nextRequest);
            }
        }
    }

    // Queue a request for later processing
    queueRequest(requestFn) {
        if (this.pendingRequests.length < 10) {
            this.pendingRequests.push(requestFn);
        }
    }

    // Get statistics
    getStats() {
        const skipRate = this.totalFrames > 0 
            ? (this.skippedFrames / this.totalFrames * 100).toFixed(1)
            : 0;
        
        const actualFPS = this.processedFrames > 0
            ? (1000 / this.minFrameInterval).toFixed(1)
            : 0;

        return {
            maxFPS: this.maxFPS,
            actualFPS: actualFPS,
            totalFrames: this.totalFrames,
            processedFrames: this.processedFrames,
            skippedFrames: this.skippedFrames,
            skipRate: skipRate + '%',
            activeRequests: this.activeRequests,
            pendingRequests: this.pendingRequests.length
        };
    }

    // Reset statistics
    resetStats() {
        this.skippedFrames = 0;
        this.processedFrames = 0;
        this.totalFrames = 0;
    }

    // Set max FPS
    setMaxFPS(fps) {
        this.maxFPS = fps;
        this.minFrameInterval = 1000 / fps;
        Log.Info(`Frame rate limit set to ${fps} FPS`);
    }

    // Set max concurrent requests
    setMaxConcurrentRequests(max) {
        this.maxConcurrentRequests = max;
        Log.Info(`Max concurrent requests set to ${max}`);
    }
}

// Throttled JPEG Decoder Wrapper
export class ThrottledJPEGDecoder {
    constructor(baseDecoder, limiter) {
        this.baseDecoder = baseDecoder;
        this.limiter = limiter;
    }

    decodeRect(x, y, width, height, sock, display, depth) {
        // Check if we should process this frame
        if (!this.limiter.shouldProcessFrame()) {
            // Skip this frame - just consume the data without decoding
            return this._skipFrame(sock);
        }

        // Check concurrent request limit
        if (this.limiter.activeRequests >= this.limiter.maxConcurrentRequests) {
            // Too many active requests, skip this frame
            return this._skipFrame(sock);
        }

        // Process the frame
        this.limiter.activeRequests++;
        try {
            const result = this.baseDecoder.decodeRect(x, y, width, height, sock, display, depth);
            return result;
        } finally {
            this.limiter.activeRequests--;
        }
    }

    _skipFrame(sock) {
        // Consume JPEG data without decoding
        // This prevents buffer overflow
        try {
            // Read and discard JPEG segments
            while (true) {
                if (sock.rQwait("JPEG", 2)) {
                    return false;
                }

                let marker = sock.rQshift8();
                if (marker != 0xFF) {
                    return true; // Invalid marker, assume end
                }
                
                let type = sock.rQshift8();
                
                // End of image
                if (type === 0xD9) {
                    return true;
                }
                
                // No length markers
                if ((type >= 0xD0 && type <= 0xD8) || type == 0x01) {
                    continue;
                }

                if (sock.rQwait("JPEG", 2, 2)) {
                    return false;
                }

                let length = sock.rQshift16();
                if (length < 2) {
                    return true; // Invalid length
                }

                if (sock.rQwait("JPEG", length-2, 4)) {
                    return false;
                }

                // Skip the segment data
                sock.rQskipBytes(length - 2);
                
                // Handle start of scan (0xDA) - need to skip scan data
                if (type === 0xDA) {
                    // Skip until we find next marker (0xFF followed by non-0x00)
                    while (true) {
                        if (sock.rQwait("JPEG", 2)) {
                            return false;
                        }
                        
                        let byte1 = sock.rQshift8();
                        if (byte1 === 0xFF) {
                            let byte2 = sock.rQpeek8();
                            if (byte2 !== 0x00 && !(byte2 >= 0xD0 && byte2 <= 0xD7)) {
                                // Found next marker, put back the 0xFF
                                sock.rQunshift8(byte1);
                                break;
                            }
                            // Skip the 0x00 escape byte
                            if (byte2 === 0x00) {
                                sock.rQshift8();
                            }
                        }
                    }
                }
            }
        } catch (err) {
            Log.Warn('Error skipping JPEG frame:', err);
            return true;
        }
    }
}

// Global frame rate limiter instance
let globalLimiter = null;

export function getFrameRateLimiter(maxFPS = 30) {
    if (!globalLimiter) {
        globalLimiter = new FrameRateLimiter(maxFPS);
    }
    return globalLimiter;
}

export function setGlobalMaxFPS(fps) {
    const limiter = getFrameRateLimiter();
    limiter.setMaxFPS(fps);
}

export function getFrameRateStats() {
    if (!globalLimiter) {
        return null;
    }
    return globalLimiter.getStats();
}

