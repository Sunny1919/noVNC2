/*
 * noVNC: HTML5 VNC client
 * Real-time Video Upscaling Module
 * Copyright (C) 2024 The noVNC Authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * Provides real-time upscaling algorithms for low-resolution VNC streams
 */

import * as Log from './util/logging.js';

export class Upscaler {
    constructor() {
        this._algorithm = 'none';
        this._canvas = null;
        this._ctx = null;
        this._wasmModule = null;
        this._enabled = false;
    }

    /**
     * Initialize upscaler with algorithm
     * @param {string} algorithm - 'none', 'bilinear', 'bicubic', 'fsr'
     */
    async init(algorithm) {
        this._algorithm = algorithm;
        this._enabled = algorithm !== 'none';

        if (!this._enabled) {
            return true;
        }

        // Create offscreen canvas for processing
        this._canvas = document.createElement('canvas');
        this._ctx = this._canvas.getContext('2d', { willReadFrequently: true });

        // Load WASM module for advanced algorithms
        if (algorithm === 'bicubic' || algorithm === 'fsr') {
            try {
                await this._loadWasmModule();
            } catch (err) {
                Log.Warn('Failed to load upscaling WASM module, falling back to bilinear:', err);
                this._algorithm = 'bilinear';
            }
        }

        Log.Info(`Upscaler initialized with algorithm: ${this._algorithm}`);
        return true;
    }

    /**
     * Upscale image data
     * @param {ImageData} sourceData - Source image data
     * @param {number} targetWidth - Target width
     * @param {number} targetHeight - Target height
     * @returns {ImageData} Upscaled image data
     */
    upscale(sourceData, targetWidth, targetHeight) {
        if (!this._enabled || !sourceData) {
            return sourceData;
        }

        const sourceWidth = sourceData.width;
        const sourceHeight = sourceData.height;

        // No upscaling needed if dimensions match
        if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
            return sourceData;
        }

        // Resize canvas to target dimensions
        this._canvas.width = targetWidth;
        this._canvas.height = targetHeight;

        switch (this._algorithm) {
            case 'bilinear':
                return this._bilinearUpscale(sourceData, targetWidth, targetHeight);
            case 'bicubic':
                return this._bicubicUpscale(sourceData, targetWidth, targetHeight);
            case 'fsr':
                return this._fsrUpscale(sourceData, targetWidth, targetHeight);
            default:
                return sourceData;
        }
    }

    /**
     * Bilinear interpolation upscaling (fast, GPU-accelerated via canvas)
     */
    _bilinearUpscale(sourceData, targetWidth, targetHeight) {
        // Use canvas built-in bilinear interpolation (GPU-accelerated)
        this._ctx.imageSmoothingEnabled = true;
        this._ctx.imageSmoothingQuality = 'high';

        // Draw source to temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sourceData.width;
        tempCanvas.height = sourceData.height;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.putImageData(sourceData, 0, 0);

        // Scale to target size
        this._ctx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);

        return this._ctx.getImageData(0, 0, targetWidth, targetHeight);
    }

    /**
     * Bicubic interpolation upscaling (better quality, slower)
     */
    _bicubicUpscale(sourceData, targetWidth, targetHeight) {
        if (this._wasmModule && this._wasmModule.bicubicUpscale) {
            // Use WASM implementation for performance
            try {
                return this._wasmModule.bicubicUpscale(sourceData, targetWidth, targetHeight);
            } catch (err) {
                Log.Warn('WASM bicubic upscale failed, falling back to bilinear:', err);
            }
        }

        // Fallback to bilinear if WASM not available
        return this._bilinearUpscale(sourceData, targetWidth, targetHeight);
    }

    /**
     * FSR (FidelityFX Super Resolution) upscaling (best quality)
     */
    _fsrUpscale(sourceData, targetWidth, targetHeight) {
        if (this._wasmModule && this._wasmModule.fsrUpscale) {
            // Use WASM implementation of FSR
            try {
                return this._wasmModule.fsrUpscale(sourceData, targetWidth, targetHeight);
            } catch (err) {
                Log.Warn('WASM FSR upscale failed, falling back to bicubic:', err);
            }
        }

        // Fallback to bicubic
        return this._bicubicUpscale(sourceData, targetWidth, targetHeight);
    }

    /**
     * Load WASM module for advanced upscaling
     */
    async _loadWasmModule() {
        // Placeholder for WASM module loading
        // In production, this would load a compiled WASM module
        Log.Info('WASM upscaling module not yet implemented, using fallback');
        this._wasmModule = null;
    }

    /**
     * Check if upscaling is enabled
     */
    get enabled() {
        return this._enabled;
    }

    /**
     * Get current algorithm
     */
    get algorithm() {
        return this._algorithm;
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this._canvas = null;
        this._ctx = null;
        this._wasmModule = null;
        this._enabled = false;
    }
}

// Singleton instance
let upscalerInstance = null;

export function getUpscaler() {
    if (!upscalerInstance) {
        upscalerInstance = new Upscaler();
    }
    return upscalerInstance;
}
