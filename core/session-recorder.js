/*
 * noVNC: HTML5 VNC client
 * Session Recorder Module
 * Copyright (C) 2024 The noVNC Authors
 * Licensed under MPL 2.0 (see LICENSE.txt)
 *
 * Records VNC sessions for playback
 */

import * as Log from './util/logging.js';

export class SessionRecorder {
    constructor() {
        this._recording = false;
        this._frames = [];
        this._startTime = null;
        this._canvas = null;
        this._mediaRecorder = null;
        this._recordedChunks = [];
        this._stream = null;
    }

    /**
     * Start recording session
     * @param {HTMLCanvasElement} canvas - Canvas to record
     * @param {Object} options - Recording options
     */
    async startRecording(canvas, options = {}) {
        if (this._recording) {
            Log.Warn('Recording already in progress');
            return false;
        }

        try {
            this._canvas = canvas;
            this._frames = [];
            this._recordedChunks = [];
            this._startTime = Date.now();

            // Default options
            const recordOptions = {
                mimeType: options.mimeType || 'video/webm;codecs=vp9',
                videoBitsPerSecond: options.videoBitsPerSecond || 2500000, // 2.5 Mbps
            };

            // Check if mimeType is supported
            if (!MediaRecorder.isTypeSupported(recordOptions.mimeType)) {
                // Fallback to VP8
                recordOptions.mimeType = 'video/webm;codecs=vp8';
                if (!MediaRecorder.isTypeSupported(recordOptions.mimeType)) {
                    // Fallback to default
                    recordOptions.mimeType = 'video/webm';
                }
                Log.Info(`Using fallback codec: ${recordOptions.mimeType}`);
            }

            // Capture canvas stream
            this._stream = canvas.captureStream(30); // 30 FPS

            // Create MediaRecorder
            this._mediaRecorder = new MediaRecorder(this._stream, recordOptions);

            this._mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this._recordedChunks.push(event.data);
                }
            };

            this._mediaRecorder.onerror = (event) => {
                Log.Error('MediaRecorder error:', event.error);
                this.stopRecording();
            };

            // Start recording
            this._mediaRecorder.start(1000); // Collect data every 1 second
            this._recording = true;

            Log.Info('Session recording started');
            return true;

        } catch (err) {
            Log.Error('Failed to start recording:', err);
            this._recording = false;
            return false;
        }
    }

    /**
     * Stop recording session
     */
    stopRecording() {
        if (!this._recording) {
            return null;
        }

        return new Promise((resolve) => {
            this._mediaRecorder.onstop = () => {
                const blob = new Blob(this._recordedChunks, {
                    type: this._mediaRecorder.mimeType
                });

                const duration = Date.now() - this._startTime;

                this._recording = false;
                this._mediaRecorder = null;

                if (this._stream) {
                    this._stream.getTracks().forEach(track => track.stop());
                    this._stream = null;
                }

                Log.Info(`Session recording stopped. Duration: ${duration}ms, Size: ${blob.size} bytes`);

                resolve({
                    blob: blob,
                    duration: duration,
                    frameCount: this._frames.length,
                    mimeType: blob.type
                });
            };

            this._mediaRecorder.stop();
        });
    }

    /**
     * Download recorded session
     * @param {Blob} blob - Recorded video blob
     * @param {string} filename - Output filename
     */
    downloadRecording(blob, filename = 'vnc-session.webm') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        Log.Info(`Recording downloaded as ${filename}`);
    }

    /**
     * Check if recording is in progress
     */
    get isRecording() {
        return this._recording;
    }

    /**
     * Get recording duration in milliseconds
     */
    get duration() {
        if (!this._recording || !this._startTime) {
            return 0;
        }
        return Date.now() - this._startTime;
    }

    /**
     * Format duration as MM:SS
     */
    getFormattedDuration() {
        const duration = this.duration;
        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    }
}

// Singleton instance
let recorderInstance = null;

export function getSessionRecorder() {
    if (!recorderInstance) {
        recorderInstance = new SessionRecorder();
    }
    return recorderInstance;
}
