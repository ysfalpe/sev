import { ERROR_MESSAGES } from '../config/constants.js';

export class WebSocketManager {
    constructor(securityManager) {
        this.securityManager = securityManager;
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.heartbeatInterval = null;
        this.messageQueue = new Map();
        this.pendingMessages = new Set();
        
        // Güvenlik ayarları
        this.rateLimits = {
            message: { count: 0, lastReset: Date.now(), max: 50, window: 10000 }, // 10 saniye
            bytes: { count: 0, lastReset: Date.now(), max: 1024 * 1024, window: 60000 } // 1MB/dakika
        };
        
        // Mesaj doğrulama için
        this.messageCounter = 0;
        this.lastMessageId = null;
        this.pendingAcks = new Map();
        this.ackTimeout = 5000;
    }

    async connect(url) {
        try {
            // URL güvenlik kontrolü
            if (!this.validateUrl(url)) {
                throw new Error('Geçersiz WebSocket URL');
            }
            
            // Bağlantı güvenliği için token al
            const connectionToken = await this.getConnectionToken();
            
            // Güvenli WebSocket bağlantısı kur
            this.socket = new WebSocket(url);
            this.socket.binaryType = 'arraybuffer';
            
            // Bağlantı olaylarını dinle
            this.setupEventListeners();
            
            // Heartbeat başlat
            this.startHeartbeat();
            
            // Rate limit sayaçlarını sıfırla
            this.resetRateLimits();
            
            return new Promise((resolve, reject) => {
                this.socket.onopen = () => {
                    // Bağlantı doğrulaması yap
                    this.authenticate(connectionToken)
                        .then(() => resolve(true))
                        .catch(reject);
                };
                
                this.socket.onerror = (error) => {
                    reject(new Error('WebSocket bağlantı hatası'));
                };
                
                // Bağlantı zaman aşımı
                setTimeout(() => {
                    if (this.socket.readyState !== WebSocket.OPEN) {
                        reject(new Error('Bağlantı zaman aşımı'));
                    }
                }, 10000);
            });
        } catch (error) {
            console.error('WebSocket bağlantı hatası:', error);
            throw error;
        }
    }

    async getConnectionToken() {
        try {
            const response = await fetch('/api/ws/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': this.securityManager.csrfToken
                }
            });
            
            if (!response.ok) {
                throw new Error('Token alınamadı');
            }
            
            const data = await response.json();
            return data.token;
        } catch (error) {
            console.error('Token alma hatası:', error);
            throw error;
        }
    }

    setupEventListeners() {
        this.socket.onmessage = (event) => this.handleMessage(event);
        this.socket.onclose = (event) => this.handleClose(event);
        this.socket.onerror = (error) => this.handleError(error);
        
        // Ping-pong için özel mesaj dinleyicisi
        this.on('ping', () => this.send('pong'));
    }

    async handleMessage(event) {
        try {
            // Binary mesajı çöz
            const message = await this.decodeMessage(event.data);
            
            // Mesaj doğrulaması
            if (!this.validateMessage(message)) {
                throw new Error('Geçersiz mesaj formatı');
            }
            
            // ACK gönder
            if (message.id) {
                this.sendAck(message.id);
            }
            
            // Mesajı işle
            this.processMessage(message);
            
        } catch (error) {
            console.error('Mesaj işleme hatası:', error);
            this.securityManager.logSecurityEvent(
                'Geçersiz mesaj alındı',
                this.securityManager.LOG_LEVELS.WARN,
                { error: error.message }
            );
        }
    }

    async decodeMessage(data) {
        if (data instanceof ArrayBuffer) {
            // Binary mesajı çöz
            const decoder = new TextDecoder();
            const text = decoder.decode(data);
            return JSON.parse(text);
        }
        return JSON.parse(data);
    }

    validateMessage(message) {
        // Temel mesaj yapısı kontrolü
        if (!message || typeof message !== 'object') {
            return false;
        }
        
        // Zorunlu alanlar
        if (!message.type || !message.timestamp) {
            return false;
        }
        
        // Zaman damgası kontrolü
        const messageTime = new Date(message.timestamp).getTime();
        const now = Date.now();
        if (Math.abs(now - messageTime) > 30000) { // 30 saniye
            return false;
        }
        
        // Mesaj sırası kontrolü
        if (message.id && message.id <= this.lastMessageId) {
            return false;
        }
        
        return true;
    }

    async send(type, data = {}) {
        try {
            if (!this.isConnected()) {
                throw new Error('WebSocket bağlantısı yok');
            }
            
            // Rate limit kontrolü
            if (!this.checkRateLimit('message')) {
                throw new Error('Mesaj gönderme limiti aşıldı');
            }
            
            // Mesaj hazırla
            const message = {
                id: ++this.messageCounter,
                type,
                data,
                timestamp: Date.now()
            };
            
            // Mesajı şifrele ve gönder
            const encodedMessage = await this.encodeMessage(message);
            
            // Boyut kontrolü
            if (!this.checkRateLimit('bytes', encodedMessage.byteLength)) {
                throw new Error('Veri transfer limiti aşıldı');
            }
            
            // Mesajı gönder ve ACK bekle
            await this.sendWithAck(encodedMessage, message.id);
            
            return true;
        } catch (error) {
            console.error('Mesaj gönderme hatası:', error);
            throw error;
        }
    }

    async encodeMessage(message) {
        // Mesajı JSON'a çevir
        const jsonStr = JSON.stringify(message);
        
        // Binary formata çevir
        const encoder = new TextEncoder();
        return encoder.encode(jsonStr);
    }

    async sendWithAck(data, messageId) {
        return new Promise((resolve, reject) => {
            // Mesajı gönder
            this.socket.send(data);
            
            // ACK bekleme
            this.pendingAcks.set(messageId, {
                resolve,
                reject,
                timeout: setTimeout(() => {
                    this.pendingAcks.delete(messageId);
                    reject(new Error('ACK zaman aşımı'));
                }, this.ackTimeout)
            });
        });
    }

    sendAck(messageId) {
        this.send('ack', { messageId });
    }

    handleAck(messageId) {
        const pending = this.pendingAcks.get(messageId);
        if (pending) {
            clearTimeout(pending.timeout);
            pending.resolve(true);
            this.pendingAcks.delete(messageId);
        }
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected()) {
                this.send('ping')
                    .catch(error => {
                        console.error('Heartbeat hatası:', error);
                        this.reconnect();
                    });
            }
        }, 30000); // 30 saniye
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    async reconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.handleFatalError('Maksimum yeniden bağlanma denemesi aşıldı');
            return;
        }
        
        this.reconnectAttempts++;
        
        try {
            await new Promise(resolve => setTimeout(resolve, this.reconnectDelay));
            await this.connect(this.socket.url);
            
            this.reconnectAttempts = 0;
            console.log('Yeniden bağlantı başarılı');
        } catch (error) {
            console.error('Yeniden bağlantı hatası:', error);
            this.reconnect();
        }
    }

    handleClose(event) {
        this.stopHeartbeat();
        
        if (!event.wasClean) {
            this.reconnect();
        }
        
        this.securityManager.logSecurityEvent(
            'WebSocket bağlantısı kapandı',
            this.securityManager.LOG_LEVELS.INFO,
            { code: event.code, reason: event.reason }
        );
    }

    handleError(error) {
        console.error('WebSocket hatası:', error);
        
        this.securityManager.logSecurityEvent(
            'WebSocket hatası',
            this.securityManager.LOG_LEVELS.ERROR,
            { error: error.message }
        );
    }

    handleFatalError(message) {
        this.securityManager.logSecurityEvent(
            'Kritik WebSocket hatası',
            this.securityManager.LOG_LEVELS.CRITICAL,
            { message }
        );
        
        this.disconnect();
    }

    checkRateLimit(type, size = 1) {
        const limit = this.rateLimits[type];
        const now = Date.now();
        
        // Zaman penceresi kontrolü
        if (now - limit.lastReset > limit.window) {
            limit.count = 0;
            limit.lastReset = now;
        }
        
        // Limit kontrolü
        if (limit.count + size > limit.max) {
            return false;
        }
        
        limit.count += size;
        return true;
    }

    resetRateLimits() {
        const now = Date.now();
        Object.values(this.rateLimits).forEach(limit => {
            limit.count = 0;
            limit.lastReset = now;
        });
    }

    validateUrl(url) {
        try {
            const parsedUrl = new URL(url);
            return parsedUrl.protocol === 'wss:' || parsedUrl.protocol === 'ws:';
        } catch {
            return false;
        }
    }

    isConnected() {
        return this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    disconnect() {
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        
        this.stopHeartbeat();
        this.resetRateLimits();
        this.pendingAcks.clear();
        this.messageQueue.clear();
        this.pendingMessages.clear();
    }

    on(type, callback) {
        if (!this.messageQueue.has(type)) {
            this.messageQueue.set(type, new Set());
        }
        this.messageQueue.get(type).add(callback);
    }

    off(type, callback) {
        if (this.messageQueue.has(type)) {
            this.messageQueue.get(type).delete(callback);
        }
    }

    processMessage(message) {
        const handlers = this.messageQueue.get(message.type);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(message.data);
                } catch (error) {
                    console.error('Mesaj işleme hatası:', error);
                }
            });
        }
    }
} 