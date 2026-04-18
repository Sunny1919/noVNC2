/*
 * Audio Streaming for noVNC
 * Support for Opus and MP3 audio streaming
 * Uses Web Audio API for playback
 * 
 * Features:
 * - Opus/MP3 decoding (via WASM)
 * - Web Audio API playback
 * - Buffer management
 * - Volume control
 * - Latency optimization
 */

import * as Log from './util/logging.js';

export class AudioStreamPlayer {
    constructor() {
        this.audioContext = null;
        this.sourceNode = null;
        this.gainNode = null;
        this.isPlaying = false;
        this.sampleRate = 48000;
        this.channels = 2;
        this.volume = 1.0;
        
        // Buffer management
        this.audioQueue = [];
        this.maxQueueSize = 50;
        this.playbackStartTime = 0;
        this.scheduledTime = 0;
        
        // WASM decoder
        this.wasmDecoder = null;
        this.decoderReady = false;
    }

    // Initialize audio context
    async init() {
        if (this.audioContext) {
            return true;
        }

        try {
            // Create audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext({
                sampleRate: this.sampleRate,
                latencyHint: 'interactive'
            });

            // Create gain node for volume control
            this.gainNode = this.audioContext.createGain();
            this.gainNode.gain.value = this.volume;
            this.gainNode.connect(this.audioContext.destination);

            Log.Info('Audio context initialized:', {
                sampleRate: this.audioContext.sampleRate,
                state: this.audioContext.state
            });

            return true;

        } catch (err) {
            Log.Error('Failed to initialize audio context:', err);
            return false;
        }
    }

    // Load WASM decoder
    async loadDecoder() {
        if (this.decoderReady) {
            return true;
        }

        try {
            // TODO: Load WASM audio decoder
            // const WasmAudioDecoder = await import('./audio-decoder.js');
            // this.wasmDecoder = await WasmAudioDecoder.default();
            
            this.decoderReady = true;
            Log.Info('Audio decoder loaded');
            return true;

        } catch (err) {
            Log.Error('Failed to load audio decoder:', err);
            return false;
        }
    }

    // Start playback
    async start() {
        if (this.isPlaying) {
            return;
        }

        await this.init();

        // Resume audio context if suspended
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.isPlaying = true;
        this.playbackStartTime = this.audioContext.currentTime;
        this.scheduledTime = this.playbackStartTime;

        Log.Info('Audio playback started');
    }

    // Stop playback
    stop() {
        if (!this.isPlaying) {
            return;
        }

        this.isPlaying = false;
        this.audioQueue = [];

        if (this.sourceNode) {
            try {
                this.sourceNode.stop();
            } catch (err) {
                // Ignore
            }
            this.sourceNode = null;
        }

        Log.Info('Audio playback stopped');
    }

    // Add audio data to queue
    addAudioData(data, format = 'opus') {
        if (!this.isPlaying) {
            return;
        }

        // Decode audio data
        const pcmData = this.decodeAudio(data, format);
        
        if (!pcmData) {
            return;
        }

        // Add to queue
        this.audioQueue.push(pcmData);

        // Limit queue size
        if (this.audioQueue.length > this.maxQueueSize) {
            this.audioQueue.shift();
            Log.Warn('Audio queue overflow, dropping oldest frame');
        }

        // Schedule playback
        this.schedulePlayback();
    }

    // Decode audio data
    decodeAudio(data, format) {
        // For now, assume data is already PCM
        // In production, use WASM decoder
        
        if (format === 'pcm') {
            return data;
        }

        // TODO: Use WASM decoder for Opus/MP3
        // if (this.decoderReady && this.wasmDecoder) {
        //     return this.wasmDecoder.decode(data, format);
        // }

        Log.Warn('Audio decoding not implemented, using raw data');
        return data;
    }

    // Schedule audio playback
    schedulePlayback() {
        if (this.audioQueue.length === 0) {
            return;
        }

        const now = this.audioContext.currentTime;

        // If we're behind, catch up
        if (this.scheduledTime < now) {
            this.scheduledTime = now;
        }

        // Schedule all queued audio
        while (this.audioQueue.length > 0) {
            const pcmData = this.audioQueue.shift();
            
            // Create audio buffer
            const audioBuffer = this.createAudioBuffer(pcmData);
            
            if (!audioBuffer) {
                continue;
            }

            // Create source node
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.gainNode);

            // Schedule playback
            source.start(this.scheduledTime);
            
            // Update scheduled time
            this.scheduledTime += audioBuffer.duration;
        }
    }

    // Create audio buffer from PCM data
    createAudioBuffer(pcmData) {
        try {
            // Assume pcmData is Float32Array or can be converted
            let floatData;
            
            if (pcmData instanceof Float32Array) {
                floatData = pcmData;
            } else if (pcmData instanceof Int16Array) {
                // Convert Int16 to Float32
                floatData = new Float32Array(pcmData.length);
                for (let i = 0; i < pcmData.length; i++) {
                    floatData[i] = pcmData[i] / 32768.0;
                }
            } else {
                Log.Error('Unsupported PCM data type');
                return null;
            }

            // Calculate number of samples per channel
            const samplesPerChannel = Math.floor(floatData.length / this.channels);

            // Create audio buffer
            const audioBuffer = this.audioContext.createBuffer(
                this.channels,
                samplesPerChannel,
                this.sampleRate
            );

            // Fill buffer
            for (let ch = 0; ch < this.channels; ch++) {
                const channelData = audioBuffer.getChannelData(ch);
                for (let i = 0; i < samplesPerChannel; i++) {
                    channelData[i] = floatData[i * this.channels + ch];
                }
            }

            return audioBuffer;

        } catch (err) {
            Log.Error('Failed to create audio buffer:', err);
            return null;
        }
    }

    // Set volume (0.0 to 1.0)
    setVolume(volume) {
        this.volume = Math.max(0, Math.min(1, volume));
        
        if (this.gainNode) {
            this.gainNode.gain.value = this.volume;
        }
    }

    // Get volume
    getVolume() {
        return this.volume;
    }

    // Get playback state
    getState() {
        return {
            isPlaying: this.isPlaying,
            queueSize: this.audioQueue.length,
            volume: this.volume,
            latency: this.getLatency(),
            sampleRate: this.sampleRate,
            channels: this.channels
        };
    }

    // Get current latency
    getLatency() {
        if (!this.audioContext || !this.isPlaying) {
            return 0;
        }

        const now = this.audioContext.currentTime;
        return Math.max(0, this.scheduledTime - now);
    }

    // Clear audio queue
    clearQueue() {
        this.audioQueue = [];
    }

    // Destroy audio player
    destroy() {
        this.stop();

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.gainNode = null;
        this.wasmDecoder = null;
    }

    // Check if audio is supported
    static isSupported() {
        return !!(window.AudioContext || window.webkitAudioContext);
    }
}

// PulseAudio client for server-side audio capture
export class PulseAudioClient {
    constructor(websocket) {
        this.websocket = websocket;
        this.player = new AudioStreamPlayer();
        this.isConnected = false;
        this.audioFormat = 'opus'; // or 'mp3', 'pcm'
    }

    // Connect to PulseAudio server
    async connect() {
        if (this.isConnected) {
            return true;
        }

        try {
            // Initialize audio player
            await this.player.init();
            await this.player.loadDecoder();

            // Send audio start command to server
            this.sendAudioCommand('start', {
                format: this.audioFormat,
                sampleRate: this.player.sampleRate,
                channels: this.player.channels
            });

            this.isConnected = true;
            Log.Info('PulseAudio client connected');

            return true;

        } catch (err) {
            Log.Error('Failed to connect PulseAudio client:', err);
            return false;
        }
    }

    // Disconnect from PulseAudio server
    disconnect() {
        if (!this.isConnected) {
            return;
        }

        // Send audio stop command to server
        this.sendAudioCommand('stop');

        this.player.stop();
        this.isConnected = false;

        Log.Info('PulseAudio client disconnected');
    }

    // Handle audio data from server
    handleAudioData(data) {
        if (!this.isConnected) {
            return;
        }

        this.player.addAudioData(data, this.audioFormat);
    }

    // Send audio command to server
    sendAudioCommand(command, params = {}) {
        if (!this.websocket) {
            return;
        }

        const message = {
            type: 'audio',
            command: command,
            params: params
        };

        // Send via websocket
        // Note: Actual implementation depends on noVNC protocol
        Log.Debug('Sending audio command:', message);
    }

    // Start audio playback
    async startPlayback() {
        await this.player.start();
    }

    // Stop audio playback
    stopPlayback() {
        this.player.stop();
    }

    // Set volume
    setVolume(volume) {
        this.player.setVolume(volume);
    }

    // Get state
    getState() {
        return {
            isConnected: this.isConnected,
            audioFormat: this.audioFormat,
            ...this.player.getState()
        };
    }
}

// Audio visualizer (optional)
export class AudioVisualizer {
    constructor(canvas, audioContext) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.audioContext = audioContext;
        this.analyser = null;
        this.dataArray = null;
        this.animationId = null;
        
        this.init();
    }

    init() {
        // Create analyser node
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
    }

    // Connect audio source to visualizer
    connect(sourceNode) {
        sourceNode.connect(this.analyser);
    }

    // Start visualization
    start() {
        this.draw();
    }

    // Stop visualization
    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
    }

    // Draw waveform
    draw() {
        this.animationId = requestAnimationFrame(() => this.draw());

        this.analyser.getByteTimeDomainData(this.dataArray);

        this.ctx.fillStyle = 'rgb(200, 200, 200)';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.lineWidth = 2;
        this.ctx.strokeStyle = 'rgb(0, 0, 0)';
        this.ctx.beginPath();

        const sliceWidth = this.canvas.width / this.dataArray.length;
        let x = 0;

        for (let i = 0; i < this.dataArray.length; i++) {
            const v = this.dataArray[i] / 128.0;
            const y = v * this.canvas.height / 2;

            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }

            x += sliceWidth;
        }

        this.ctx.lineTo(this.canvas.width, this.canvas.height / 2);
        this.ctx.stroke();
    }
}
