/*
 * Dynamic Bandwidth Adaptation
 * Tự động điều chỉnh chất lượng dựa trên bandwidth và latency
 * 
 * Tính năng:
 * - Đo bandwidth real-time
 * - Đo latency/RTT
 * - Tự động điều chỉnh quality/compression
 * - Smooth transitions
 * - Statistics tracking
 */

import * as Log from './util/logging.js';

export class BandwidthMonitor {
    constructor() {
        this.measurements = [];
        this.maxMeasurements = 20;
        this.isMonitoring = false;
        this.monitorInterval = null;
        this.listeners = [];
        
        // Current stats
        this.currentBandwidth = 0; // Mbps
        this.currentLatency = 0;   // ms
        this.currentPacketLoss = 0; // %
        
        // Thresholds
        this.thresholds = {
            excellent: { bandwidth: 10, latency: 50 },
            good: { bandwidth: 5, latency: 100 },
            fair: { bandwidth: 2, latency: 200 },
            poor: { bandwidth: 1, latency: 500 }
        };
    }

    // Bắt đầu monitoring
    start(interval = 5000) {
        if (this.isMonitoring) {
            return;
        }

        this.isMonitoring = true;
        this.monitorInterval = setInterval(() => {
            this.measure();
        }, interval);

        Log.Info('Bandwidth monitoring started');
    }

    // Dừng monitoring
    stop() {
        if (!this.isMonitoring) {
            return;
        }

        this.isMonitoring = false;
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }

        Log.Info('Bandwidth monitoring stopped');
    }

    // Đo bandwidth và latency
    async measure() {
        try {
            const measurement = await this.performMeasurement();
            
            this.measurements.push(measurement);
            if (this.measurements.length > this.maxMeasurements) {
                this.measurements.shift();
            }

            // Calculate averages
            this.currentBandwidth = this.getAverageBandwidth();
            this.currentLatency = this.getAverageLatency();
            this.currentPacketLoss = this.getAveragePacketLoss();

            // Notify listeners
            this.notifyListeners({
                bandwidth: this.currentBandwidth,
                latency: this.currentLatency,
                packetLoss: this.currentPacketLoss,
                quality: this.getQualityLevel()
            });

        } catch (err) {
            Log.Warn('Bandwidth measurement failed:', err);
        }
    }

    // Thực hiện đo lường
    async performMeasurement() {
        const startTime = performance.now();
        
        // Đo latency bằng cách ping một endpoint nhỏ
        const latency = await this.measureLatency();
        
        // Đo bandwidth bằng cách download một file nhỏ
        const bandwidth = await this.measureBandwidth();
        
        const endTime = performance.now();

        return {
            timestamp: Date.now(),
            latency: latency,
            bandwidth: bandwidth,
            packetLoss: 0, // TODO: Implement packet loss detection
            duration: endTime - startTime
        };
    }

    // Đo latency (RTT)
    async measureLatency() {
        const iterations = 3;
        const latencies = [];

        for (let i = 0; i < iterations; i++) {
            const start = performance.now();
            
            try {
                // Ping server bằng cách fetch một endpoint nhỏ
                await fetch(window.location.origin + '/favicon.ico', {
                    method: 'HEAD',
                    cache: 'no-cache'
                });
                
                const end = performance.now();
                latencies.push(end - start);
            } catch (err) {
                Log.Warn('Latency measurement failed:', err);
            }
        }

        // Return median latency
        latencies.sort((a, b) => a - b);
        return latencies[Math.floor(latencies.length / 2)] || 0;
    }

    // Đo bandwidth
    async measureBandwidth() {
        const testSize = 100 * 1024; // 100KB
        const start = performance.now();

        try {
            // Download một file test (hoặc dùng existing resource)
            const response = await fetch(window.location.origin + '/favicon.ico', {
                cache: 'no-cache'
            });
            
            const blob = await response.blob();
            const end = performance.now();
            
            const duration = (end - start) / 1000; // seconds
            const sizeInBits = blob.size * 8;
            const bandwidthBps = sizeInBits / duration;
            const bandwidthMbps = bandwidthBps / (1024 * 1024);

            return bandwidthMbps;

        } catch (err) {
            Log.Warn('Bandwidth measurement failed:', err);
            return 0;
        }
    }

    // Get average bandwidth
    getAverageBandwidth() {
        if (this.measurements.length === 0) return 0;
        
        const sum = this.measurements.reduce((acc, m) => acc + m.bandwidth, 0);
        return sum / this.measurements.length;
    }

    // Get average latency
    getAverageLatency() {
        if (this.measurements.length === 0) return 0;
        
        const sum = this.measurements.reduce((acc, m) => acc + m.latency, 0);
        return sum / this.measurements.length;
    }

    // Get average packet loss
    getAveragePacketLoss() {
        if (this.measurements.length === 0) return 0;
        
        const sum = this.measurements.reduce((acc, m) => acc + m.packetLoss, 0);
        return sum / this.measurements.length;
    }

    // Get quality level
    getQualityLevel() {
        const bw = this.currentBandwidth;
        const lat = this.currentLatency;

        if (bw >= this.thresholds.excellent.bandwidth && 
            lat <= this.thresholds.excellent.latency) {
            return 'excellent';
        } else if (bw >= this.thresholds.good.bandwidth && 
                   lat <= this.thresholds.good.latency) {
            return 'good';
        } else if (bw >= this.thresholds.fair.bandwidth && 
                   lat <= this.thresholds.fair.latency) {
            return 'fair';
        } else {
            return 'poor';
        }
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
    notifyListeners(stats) {
        this.listeners.forEach(callback => {
            try {
                callback(stats);
            } catch (err) {
                Log.Error('Error in bandwidth listener:', err);
            }
        });
    }

    // Get statistics
    getStatistics() {
        return {
            bandwidth: this.currentBandwidth,
            latency: this.currentLatency,
            packetLoss: this.currentPacketLoss,
            quality: this.getQualityLevel(),
            measurements: this.measurements.length
        };
    }
}

// Bandwidth Adapter - Tự động điều chỉnh quality
export class BandwidthAdapter {
    constructor(rfb) {
        this.rfb = rfb;
        this.monitor = new BandwidthMonitor();
        this.isEnabled = false;
        this.currentProfile = null;
        
        // Quality profiles
        this.profiles = {
            excellent: {
                quality: 9,
                compression: 0,
                description: 'Highest quality'
            },
            good: {
                quality: 6,
                compression: 2,
                description: 'High quality'
            },
            fair: {
                quality: 4,
                compression: 4,
                description: 'Medium quality'
            },
            poor: {
                quality: 2,
                compression: 6,
                description: 'Low quality'
            }
        };

        // Bind listener
        this.handleBandwidthChange = this.handleBandwidthChange.bind(this);
    }

    // Enable adaptation
    enable() {
        if (this.isEnabled) {
            return;
        }

        this.isEnabled = true;
        this.monitor.addListener(this.handleBandwidthChange);
        this.monitor.start();

        Log.Info('Bandwidth adaptation enabled');
    }

    // Disable adaptation
    disable() {
        if (!this.isEnabled) {
            return;
        }

        this.isEnabled = false;
        this.monitor.removeListener(this.handleBandwidthChange);
        this.monitor.stop();

        Log.Info('Bandwidth adaptation disabled');
    }

    // Handle bandwidth change
    handleBandwidthChange(stats) {
        const qualityLevel = stats.quality;
        
        if (qualityLevel === this.currentProfile) {
            return; // No change needed
        }

        Log.Info(`Bandwidth changed: ${stats.bandwidth.toFixed(2)} Mbps, ` +
                 `Latency: ${stats.latency.toFixed(0)} ms, ` +
                 `Quality: ${qualityLevel}`);

        this.applyProfile(qualityLevel);
    }

    // Apply quality profile
    applyProfile(profileName) {
        const profile = this.profiles[profileName];
        
        if (!profile) {
            Log.Error('Invalid profile:', profileName);
            return;
        }

        if (!this.rfb) {
            Log.Warn('RFB not available');
            return;
        }

        try {
            // Apply settings
            this.rfb.qualityLevel = profile.quality;
            this.rfb.compressionLevel = profile.compression;
            
            this.currentProfile = profileName;

            Log.Info(`Applied profile: ${profileName} ` +
                     `(Q${profile.quality}, C${profile.compression})`);

            // Dispatch event
            if (typeof CustomEvent !== 'undefined') {
                const event = new CustomEvent('bandwidthprofilechange', {
                    detail: {
                        profile: profileName,
                        quality: profile.quality,
                        compression: profile.compression
                    }
                });
                window.dispatchEvent(event);
            }

        } catch (err) {
            Log.Error('Failed to apply profile:', err);
        }
    }

    // Get current statistics
    getStatistics() {
        return {
            ...this.monitor.getStatistics(),
            currentProfile: this.currentProfile,
            isEnabled: this.isEnabled
        };
    }

    // Set custom profile
    setProfile(name, settings) {
        this.profiles[name] = settings;
    }

    // Get profile
    getProfile(name) {
        return this.profiles[name];
    }
}

// Network Quality Indicator
export class NetworkQualityIndicator {
    constructor(container) {
        this.container = container;
        this.element = null;
        this.createUI();
    }

    createUI() {
        this.element = document.createElement('div');
        this.element.id = 'noVNC_network_indicator';
        this.element.className = 'noVNC_network_indicator';
        this.element.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            padding: 8px 12px;
            background: rgba(0, 0, 0, 0.7);
            color: white;
            border-radius: 4px;
            font-size: 12px;
            z-index: 1000;
            display: none;
        `;

        if (this.container) {
            this.container.appendChild(this.element);
        } else {
            document.body.appendChild(this.element);
        }
    }

    update(stats) {
        if (!this.element) return;

        const quality = stats.quality;
        const colors = {
            excellent: '#4CAF50',
            good: '#8BC34A',
            fair: '#FFC107',
            poor: '#F44336'
        };

        this.element.style.background = colors[quality] || 'rgba(0, 0, 0, 0.7)';
        this.element.style.display = 'block';
        
        this.element.innerHTML = `
            <div style="font-weight: bold;">${quality.toUpperCase()}</div>
            <div style="font-size: 10px; margin-top: 2px;">
                ${stats.bandwidth.toFixed(1)} Mbps | ${stats.latency.toFixed(0)} ms
            </div>
        `;
    }

    hide() {
        if (this.element) {
            this.element.style.display = 'none';
        }
    }

    show() {
        if (this.element) {
            this.element.style.display = 'block';
        }
    }

    destroy() {
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
    }
}
