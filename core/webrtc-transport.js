/*
 * WebRTC Transport for noVNC
 * Alternative to WebSocket for lower latency and better performance
 * 
 * Features:
 * - Lower latency than WebSocket
 * - Better bandwidth utilization
 * - Built-in congestion control
 * - NAT traversal support
 */

import * as Log from './util/logging.js';

export class WebRTCTransport {
    constructor() {
        this.peerConnection = null;
        this.dataChannel = null;
        this.isConnected = false;
        this.messageHandlers = new Map();
        
        // Configuration
        this.config = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        // Stats
        this.stats = {
            bytesSent: 0,
            bytesReceived: 0,
            packetsLost: 0,
            rtt: 0
        };
    }

    // Initialize WebRTC connection
    async connect(signalingUrl) {
        try {
            Log.Info('Initializing WebRTC connection...');
            
            // Create peer connection
            this.peerConnection = new RTCPeerConnection(this.config);
            
            // Setup event handlers
            this.peerConnection.onicecandidate = this._handleICECandidate.bind(this);
            this.peerConnection.oniceconnectionstatechange = this._handleICEStateChange.bind(this);
            this.peerConnection.ondatachannel = this._handleDataChannel.bind(this);
            
            // Create data channel
            this.dataChannel = this.peerConnection.createDataChannel('vnc', {
                ordered: true,
                maxRetransmits: 3
            });
            
            this._setupDataChannel(this.dataChannel);
            
            // Create offer
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            
            // Send offer to signaling server
            const answer = await this._signaling(signalingUrl, offer);
            
            // Set remote description
            await this.peerConnection.setRemoteDescription(answer);
            
            Log.Info('WebRTC connection established');
            return true;
            
        } catch (err) {
            Log.Error('Failed to establish WebRTC connection:', err);
            return false;
        }
    }

    // Send data through WebRTC
    send(data) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            Log.Warn('Data channel not ready');
            return false;
        }

        try {
            this.dataChannel.send(data);
            this.stats.bytesSent += data.byteLength || data.length;
            return true;
        } catch (err) {
            Log.Error('Failed to send data:', err);
            return false;
        }
    }

    // Close connection
    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }

        this.isConnected = false;
        Log.Info('WebRTC connection closed');
    }

    // Register message handler
    on(event, handler) {
        if (!this.messageHandlers.has(event)) {
            this.messageHandlers.set(event, []);
        }
        this.messageHandlers.get(event).push(handler);
    }

    // Emit event
    _emit(event, data) {
        const handlers = this.messageHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => handler(data));
        }
    }

    // Setup data channel
    _setupDataChannel(channel) {
        channel.binaryType = 'arraybuffer';
        
        channel.onopen = () => {
            Log.Info('Data channel opened');
            this.isConnected = true;
            this._emit('open', {});
        };
        
        channel.onclose = () => {
            Log.Info('Data channel closed');
            this.isConnected = false;
            this._emit('close', {});
        };
        
        channel.onerror = (err) => {
            Log.Error('Data channel error:', err);
            this._emit('error', err);
        };
        
        channel.onmessage = (event) => {
            this.stats.bytesReceived += event.data.byteLength || event.data.length;
            this._emit('message', event.data);
        };
    }

    // Handle ICE candidate
    _handleICECandidate(event) {
        if (event.candidate) {
            Log.Debug('ICE candidate:', event.candidate);
            // Send to signaling server
        }
    }

    // Handle ICE connection state change
    _handleICEStateChange() {
        const state = this.peerConnection.iceConnectionState;
        Log.Info('ICE connection state:', state);
        
        if (state === 'failed' || state === 'disconnected') {
            this._emit('close', {});
        }
    }

    // Handle incoming data channel
    _handleDataChannel(event) {
        Log.Info('Received data channel');
        this.dataChannel = event.channel;
        this._setupDataChannel(this.dataChannel);
    }

    // Signaling (exchange SDP)
    async _signaling(url, offer) {
        // This is a placeholder - actual implementation depends on signaling server
        // For now, return a mock answer
        
        Log.Warn('WebRTC signaling not implemented - using mock');
        
        // In production, this would:
        // 1. Send offer to signaling server
        // 2. Receive answer from signaling server
        // 3. Exchange ICE candidates
        
        return {
            type: 'answer',
            sdp: 'mock-sdp'
        };
    }

    // Get connection statistics
    async getStats() {
        if (!this.peerConnection) {
            return this.stats;
        }

        try {
            const stats = await this.peerConnection.getStats();
            
            stats.forEach(report => {
                if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                    this.stats.rtt = report.currentRoundTripTime * 1000; // Convert to ms
                }
                
                if (report.type === 'inbound-rtp') {
                    this.stats.packetsLost = report.packetsLost || 0;
                }
            });
            
            return this.stats;
        } catch (err) {
            Log.Error('Failed to get stats:', err);
            return this.stats;
        }
    }

    // Check if WebRTC is supported
    static isSupported() {
        return typeof RTCPeerConnection !== 'undefined';
    }
}

// WebRTC-compatible Websock wrapper
export class WebRTCWebsock {
    constructor() {
        this.transport = new WebRTCTransport();
        this._eventHandlers = {};
        this._rQbuffer = new Uint8Array(0);
        this._rQi = 0;
    }

    // Connect using WebRTC
    async connectWebRTC(signalingUrl) {
        // Setup event handlers
        this.transport.on('open', () => {
            if (this._eventHandlers.open) {
                this._eventHandlers.open();
            }
        });
        
        this.transport.on('close', (e) => {
            if (this._eventHandlers.close) {
                this._eventHandlers.close(e);
            }
        });
        
        this.transport.on('error', (e) => {
            if (this._eventHandlers.error) {
                this._eventHandlers.error(e);
            }
        });
        
        this.transport.on('message', (data) => {
            this._handleMessage(data);
        });
        
        return await this.transport.connect(signalingUrl);
    }

    // Handle incoming message
    _handleMessage(data) {
        // Append to receive queue
        const newBuffer = new Uint8Array(this._rQbuffer.length - this._rQi + data.byteLength);
        newBuffer.set(this._rQbuffer.subarray(this._rQi));
        newBuffer.set(new Uint8Array(data), this._rQbuffer.length - this._rQi);
        
        this._rQbuffer = newBuffer;
        this._rQi = 0;
        
        // Notify message handler
        if (this._eventHandlers.message) {
            this._eventHandlers.message();
        }
    }

    // Send data
    send(data) {
        return this.transport.send(data);
    }

    // Close connection
    close() {
        this.transport.close();
    }

    // Register event handler
    on(event, handler) {
        this._eventHandlers[event] = handler;
    }

    // Remove event handler
    off(event) {
        delete this._eventHandlers[event];
    }

    // Websock-compatible methods for RFB
    rQwait(name, len, offset = 0) {
        const available = this._rQbuffer.length - this._rQi - offset;
        return available < len;
    }

    rQshift8() {
        return this._rQbuffer[this._rQi++];
    }

    rQshift16() {
        const value = (this._rQbuffer[this._rQi] << 8) | this._rQbuffer[this._rQi + 1];
        this._rQi += 2;
        return value;
    }

    rQshift32() {
        const value = (this._rQbuffer[this._rQi] << 24) |
                     (this._rQbuffer[this._rQi + 1] << 16) |
                     (this._rQbuffer[this._rQi + 2] << 8) |
                     this._rQbuffer[this._rQi + 3];
        this._rQi += 4;
        return value;
    }

    rQshiftBytes(len) {
        const bytes = this._rQbuffer.subarray(this._rQi, this._rQi + len);
        this._rQi += len;
        return bytes;
    }

    rQpeekBytes(len) {
        return this._rQbuffer.subarray(this._rQi, this._rQi + len);
    }

    rQskipBytes(len) {
        this._rQi += len;
    }

    get readyState() {
        return this.transport.isConnected ? 'open' : 'closed';
    }

    // Get statistics
    async getStats() {
        return await this.transport.getStats();
    }
}

