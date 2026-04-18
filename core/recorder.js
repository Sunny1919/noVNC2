/*
 * noVNC Canvas Recorder & Screenshot
 * Ghi video và chụp ảnh màn hình từ canvas
 * 
 * Tính năng:
 * - Record video với MediaRecorder API
 * - Screenshot PNG/JPEG
 * - Tự động download
 * - Pause/Resume recording
 */

import * as Log from './util/logging.js';

export class CanvasRecorder {
    constructor(canvas) {
        this.canvas = canvas;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.isPaused = false;
        this.stream = null;
        this.startTime = null;
        this.pausedTime = 0;
        this.lastPauseTime = null;
        
        // Settings
        this.videoFormat = 'video/webm;codecs=vp9'; // hoặc 'video/webm;codecs=vp8'
        this.videoBitsPerSecond = 2500000; // 2.5 Mbps
        this.audioEnabled = false;
    }

    // Kiểm tra browser support
    static isSupported() {
        return !!(navigator.mediaDevices && 
                  navigator.mediaDevices.getUserMedia && 
                  window.MediaRecorder &&
                  HTMLCanvasElement.prototype.captureStream);
    }

    // Bắt đầu recording
    async startRecording(options = {}) {
        if (this.isRecording) {
            Log.Warn('Recording already in progress');
            return false;
        }

        if (!CanvasRecorder.isSupported()) {
            Log.Error('Canvas recording not supported in this browser');
            return false;
        }

        try {
            // Merge options
            const settings = {
                videoFormat: options.videoFormat || this.videoFormat,
                videoBitsPerSecond: options.videoBitsPerSecond || this.videoBitsPerSecond,
                audioEnabled: options.audioEnabled || this.audioEnabled,
                frameRate: options.frameRate || 30
            };

            // Capture stream từ canvas
            this.stream = this.canvas.captureStream(settings.frameRate);
            
            // Thêm audio nếu cần
            if (settings.audioEnabled) {
                try {
                    const audioStream = await navigator.mediaDevices.getUserMedia({ 
                        audio: true 
                    });
                    audioStream.getAudioTracks().forEach(track => {
                        this.stream.addTrack(track);
                    });
                } catch (err) {
                    Log.Warn('Could not capture audio:', err);
                }
            }

            // Tạo MediaRecorder
            const mimeType = this.getSupportedMimeType(settings.videoFormat);
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: mimeType,
                videoBitsPerSecond: settings.videoBitsPerSecond
            });

            // Reset state
            this.recordedChunks = [];
            this.startTime = Date.now();
            this.pausedTime = 0;
            this.lastPauseTime = null;

            // Event handlers
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };

            this.mediaRecorder.onstop = () => {
                this.handleRecordingStop();
            };

            this.mediaRecorder.onerror = (event) => {
                Log.Error('MediaRecorder error:', event.error);
            };

            // Bắt đầu recording
            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            this.isPaused = false;

            Log.Info('Recording started');
            return true;

        } catch (err) {
            Log.Error('Failed to start recording:', err);
            return false;
        }
    }

    // Dừng recording
    stopRecording() {
        if (!this.isRecording) {
            Log.Warn('No recording in progress');
            return false;
        }

        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }

        // Stop all tracks
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        this.isRecording = false;
        this.isPaused = false;

        Log.Info('Recording stopped');
        return true;
    }

    // Pause recording
    pauseRecording() {
        if (!this.isRecording || this.isPaused) {
            return false;
        }

        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.pause();
            this.isPaused = true;
            this.lastPauseTime = Date.now();
            Log.Info('Recording paused');
            return true;
        }

        return false;
    }

    // Resume recording
    resumeRecording() {
        if (!this.isRecording || !this.isPaused) {
            return false;
        }

        if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
            this.mediaRecorder.resume();
            this.isPaused = false;
            
            if (this.lastPauseTime) {
                this.pausedTime += Date.now() - this.lastPauseTime;
                this.lastPauseTime = null;
            }
            
            Log.Info('Recording resumed');
            return true;
        }

        return false;
    }

    // Xử lý khi recording stop
    handleRecordingStop() {
        if (this.recordedChunks.length === 0) {
            Log.Warn('No data recorded');
            return;
        }

        // Tạo blob từ recorded chunks
        const mimeType = this.mediaRecorder.mimeType;
        const blob = new Blob(this.recordedChunks, { type: mimeType });
        
        // Tính thời gian recording
        const duration = Date.now() - this.startTime - this.pausedTime;
        
        Log.Info(`Recording completed: ${blob.size} bytes, ${duration}ms`);

        // Tự động download
        this.downloadVideo(blob, mimeType);
    }

    // Download video
    downloadVideo(blob, mimeType) {
        const url = URL.createObjectURL(blob);
        const extension = mimeType.includes('webm') ? 'webm' : 'mp4';
        const filename = `novnc-recording-${this.getTimestamp()}.${extension}`;

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

        Log.Info(`Video downloaded: ${filename}`);
    }

    // Get supported MIME type
    getSupportedMimeType(preferred) {
        const types = [
            preferred,
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8',
            'video/webm;codecs=h264',
            'video/webm',
            'video/mp4'
        ];

        for (const type of types) {
            if (MediaRecorder.isTypeSupported(type)) {
                return type;
            }
        }

        return types[types.length - 1]; // Fallback
    }

    // Get recording duration
    getDuration() {
        if (!this.startTime) return 0;
        
        let duration = Date.now() - this.startTime - this.pausedTime;
        
        if (this.isPaused && this.lastPauseTime) {
            duration -= (Date.now() - this.lastPauseTime);
        }
        
        return duration;
    }

    // Get recording size (estimated)
    getSize() {
        return this.recordedChunks.reduce((total, chunk) => total + chunk.size, 0);
    }

    // Get timestamp string
    getTimestamp() {
        const now = new Date();
        return now.getFullYear() +
               String(now.getMonth() + 1).padStart(2, '0') +
               String(now.getDate()).padStart(2, '0') + '-' +
               String(now.getHours()).padStart(2, '0') +
               String(now.getMinutes()).padStart(2, '0') +
               String(now.getSeconds()).padStart(2, '0');
    }
}

// Screenshot utility
export class CanvasScreenshot {
    constructor(canvas) {
        this.canvas = canvas;
    }

    // Chụp screenshot PNG
    async captureScreenshotPNG(quality = 1.0) {
        return this.captureScreenshot('image/png', quality);
    }

    // Chụp screenshot JPEG
    async captureScreenshotJPEG(quality = 0.92) {
        return this.captureScreenshot('image/jpeg', quality);
    }

    // Chụp screenshot với format tùy chỉnh
    async captureScreenshot(format = 'image/png', quality = 1.0) {
        try {
            // Tạo blob từ canvas
            const blob = await new Promise((resolve, reject) => {
                this.canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create blob'));
                    }
                }, format, quality);
            });

            Log.Info(`Screenshot captured: ${blob.size} bytes`);
            return blob;

        } catch (err) {
            Log.Error('Failed to capture screenshot:', err);
            throw err;
        }
    }

    // Chụp và download screenshot
    async captureAndDownload(format = 'image/png', quality = 1.0) {
        try {
            const blob = await this.captureScreenshot(format, quality);
            this.downloadScreenshot(blob, format);
            return true;
        } catch (err) {
            Log.Error('Failed to capture and download screenshot:', err);
            return false;
        }
    }

    // Download screenshot
    downloadScreenshot(blob, format) {
        const url = URL.createObjectURL(blob);
        const extension = format.includes('png') ? 'png' : 'jpg';
        const filename = `novnc-screenshot-${this.getTimestamp()}.${extension}`;

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

        Log.Info(`Screenshot downloaded: ${filename}`);
    }

    // Copy screenshot to clipboard
    async copyToClipboard(format = 'image/png', quality = 1.0) {
        if (!navigator.clipboard || !navigator.clipboard.write) {
            Log.Error('Clipboard API not supported');
            return false;
        }

        try {
            const blob = await this.captureScreenshot(format, quality);
            
            await navigator.clipboard.write([
                new ClipboardItem({
                    [blob.type]: blob
                })
            ]);

            Log.Info('Screenshot copied to clipboard');
            return true;

        } catch (err) {
            Log.Error('Failed to copy screenshot to clipboard:', err);
            return false;
        }
    }

    // Get data URL
    getDataURL(format = 'image/png', quality = 1.0) {
        return this.canvas.toDataURL(format, quality);
    }

    // Get timestamp string
    getTimestamp() {
        const now = new Date();
        return now.getFullYear() +
               String(now.getMonth() + 1).padStart(2, '0') +
               String(now.getDate()).padStart(2, '0') + '-' +
               String(now.getHours()).padStart(2, '0') +
               String(now.getMinutes()).padStart(2, '0') +
               String(now.getSeconds()).padStart(2, '0');
    }
}

// Recording manager để quản lý nhiều recordings
export class RecordingManager {
    constructor() {
        this.recordings = new Map();
        this.activeRecorder = null;
    }

    // Tạo recorder mới
    createRecorder(canvas, id = 'default') {
        const recorder = new CanvasRecorder(canvas);
        this.recordings.set(id, recorder);
        return recorder;
    }

    // Get recorder
    getRecorder(id = 'default') {
        return this.recordings.get(id);
    }

    // Start recording
    async startRecording(id = 'default', options = {}) {
        const recorder = this.recordings.get(id);
        if (!recorder) {
            Log.Error(`Recorder ${id} not found`);
            return false;
        }

        const success = await recorder.startRecording(options);
        if (success) {
            this.activeRecorder = recorder;
        }
        return success;
    }

    // Stop recording
    stopRecording(id = 'default') {
        const recorder = this.recordings.get(id);
        if (!recorder) {
            Log.Error(`Recorder ${id} not found`);
            return false;
        }

        const success = recorder.stopRecording();
        if (success && this.activeRecorder === recorder) {
            this.activeRecorder = null;
        }
        return success;
    }

    // Stop all recordings
    stopAllRecordings() {
        let count = 0;
        this.recordings.forEach(recorder => {
            if (recorder.isRecording) {
                recorder.stopRecording();
                count++;
            }
        });
        this.activeRecorder = null;
        return count;
    }

    // Get active recorder
    getActiveRecorder() {
        return this.activeRecorder;
    }

    // Check if any recording is active
    isRecording() {
        return this.activeRecorder !== null && this.activeRecorder.isRecording;
    }
}
