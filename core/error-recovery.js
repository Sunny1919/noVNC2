/*
 * noVNC Error Recovery & Stability Improvements
 * Cải thiện xử lý lỗi và độ ổn định
 * 
 * Tính năng:
 * - Automatic error recovery
 * - Connection health monitoring
 * - Graceful degradation
 * - Error logging và reporting
 */

import * as Log from './util/logging.js';

export class ErrorRecoveryManager {
    constructor(rfb) {
        this.rfb = rfb;
        this.errorCount = 0;
        this.lastErrorTime = null;
        this.errorThreshold = 5; // Số lỗi tối đa trong 1 phút
        this.errorWindow = 60000; // 1 phút
        this.recoveryStrategies = [];
    }

    // Đăng ký các chiến lược recovery
    registerRecoveryStrategy(errorType, strategy) {
        this.recoveryStrategies.push({ errorType, strategy });
    }

    // Xử lý lỗi với recovery tự động
    handleError(error, context = {}) {
        Log.Error(`Error occurred: ${error.message}`, context);

        // Kiểm tra xem có quá nhiều lỗi không
        const now = Date.now();
        if (this.lastErrorTime && (now - this.lastErrorTime) < this.errorWindow) {
            this.errorCount++;
        } else {
            this.errorCount = 1;
        }
        this.lastErrorTime = now;

        if (this.errorCount > this.errorThreshold) {
            Log.Error('Too many errors, stopping recovery attempts');
            return false;
        }

        // Tìm và thực thi recovery strategy phù hợp
        for (const { errorType, strategy } of this.recoveryStrategies) {
            if (error.name === errorType || error.message.includes(errorType)) {
                try {
                    Log.Info(`Attempting recovery strategy for ${errorType}`);
                    strategy(error, context);
                    return true;
                } catch (recoveryError) {
                    Log.Error(`Recovery strategy failed: ${recoveryError.message}`);
                }
            }
        }

        return false;
    }

    reset() {
        this.errorCount = 0;
        this.lastErrorTime = null;
    }
}

// Connection health monitor
export class ConnectionHealthMonitor {
    constructor(rfb) {
        this.rfb = rfb;
        this.pingInterval = null;
        this.lastPingTime = null;
        this.lastPongTime = null;
        this.pingTimeout = 5000; // 5 giây
        this.healthCheckInterval = 10000; // 10 giây
        this.isHealthy = true;
        this.listeners = [];
    }

    start() {
        this.stop(); // Dừng nếu đang chạy

        this.pingInterval = setInterval(() => {
            this.checkHealth();
        }, this.healthCheckInterval);

        Log.Info('Connection health monitoring started');
    }

    stop() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        Log.Info('Connection health monitoring stopped');
    }

    checkHealth() {
        // Kiểm tra xem connection có còn hoạt động không
        const now = Date.now();
        
        if (this.lastPingTime && !this.lastPongTime) {
            const timeSinceLastPing = now - this.lastPingTime;
            if (timeSinceLastPing > this.pingTimeout) {
                this.setHealthStatus(false, 'Ping timeout');
                return;
            }
        }

        // Gửi ping (có thể implement bằng cách gửi một message nhỏ)
        this.lastPingTime = now;
        
        // Giả sử connection healthy nếu không có lỗi
        this.setHealthStatus(true, 'Connection healthy');
    }

    setHealthStatus(isHealthy, reason) {
        if (this.isHealthy !== isHealthy) {
            this.isHealthy = isHealthy;
            Log.Info(`Connection health changed: ${isHealthy ? 'healthy' : 'unhealthy'} - ${reason}`);
            
            // Notify listeners
            this.listeners.forEach(listener => {
                try {
                    listener(isHealthy, reason);
                } catch (err) {
                    Log.Error('Error in health status listener:', err);
                }
            });
        }
    }

    onHealthChange(listener) {
        this.listeners.push(listener);
    }

    removeListener(listener) {
        this.listeners = this.listeners.filter(l => l !== listener);
    }
}

// Graceful degradation manager
export class GracefulDegradationManager {
    constructor(rfb) {
        this.rfb = rfb;
        this.currentQuality = 6; // Default quality
        this.currentCompression = 2; // Default compression
        this.performanceMode = 'normal'; // normal, low, minimal
    }

    // Tự động giảm chất lượng khi gặp vấn đề về hiệu suất
    degradePerformance(reason) {
        Log.Warn(`Degrading performance due to: ${reason}`);

        switch (this.performanceMode) {
            case 'normal':
                this.performanceMode = 'low';
                this.rfb.qualityLevel = 4;
                this.rfb.compressionLevel = 4;
                Log.Info('Switched to low performance mode');
                break;
            case 'low':
                this.performanceMode = 'minimal';
                this.rfb.qualityLevel = 2;
                this.rfb.compressionLevel = 6;
                Log.Info('Switched to minimal performance mode');
                break;
            case 'minimal':
                Log.Warn('Already in minimal performance mode');
                break;
        }
    }

    // Khôi phục chất lượng khi điều kiện tốt hơn
    restorePerformance() {
        if (this.performanceMode !== 'normal') {
            Log.Info('Restoring normal performance mode');
            this.performanceMode = 'normal';
            this.rfb.qualityLevel = this.currentQuality;
            this.rfb.compressionLevel = this.currentCompression;
        }
    }

    // Lưu cài đặt hiện tại
    saveCurrentSettings(quality, compression) {
        this.currentQuality = quality;
        this.currentCompression = compression;
    }
}

// Error logger với structured logging
export class StructuredErrorLogger {
    constructor() {
        this.errors = [];
        this.maxErrors = 100;
    }

    log(error, context = {}) {
        const errorEntry = {
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack,
            name: error.name,
            context: context,
            userAgent: navigator.userAgent,
            url: window.location.href
        };

        this.errors.push(errorEntry);

        // Giới hạn số lượng errors được lưu
        if (this.errors.length > this.maxErrors) {
            this.errors.shift();
        }

        // Log ra console
        Log.Error('Structured error:', errorEntry);

        return errorEntry;
    }

    getErrors(filter = null) {
        if (!filter) {
            return this.errors;
        }

        return this.errors.filter(error => {
            for (const key in filter) {
                if (error[key] !== filter[key]) {
                    return false;
                }
            }
            return true;
        });
    }

    clear() {
        this.errors = [];
    }

    // Export errors để gửi lên server hoặc download
    exportErrors() {
        return JSON.stringify(this.errors, null, 2);
    }
}
