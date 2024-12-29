import io from 'socket.io-client';

export class SocketManager {
    constructor() {
        this.socket = null;
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.messageQueue = new Map();
        this.eventHandlers = new Map();
        
        this.config = {
            maxReconnectAttempts: 5,
            reconnectInterval: 2000,
            pingTimeout: 5000,
            pingInterval: 10000,
            messageTimeout: 5000,
            maxQueueSize: 100,
            rateLimits: {
                message: { count: 5, timeWindow: 5000 }, // 5 mesaj / 5 saniye
                search: { count: 2, timeWindow: 10000 }, // 2 arama / 10 saniye
                connection: { count: 3, timeWindow: 60000 } // 3 bağlantı / 1 dakika
            }
        };

        this.stats = {
            messagesSent: 0,
            messagesReceived: 0,
            reconnections: 0,
            errors: 0,
            latency: 0
        };

        this.setupHeartbeat();
    }

    async connect(url) {
        if (this.isConnecting) return;
        this.isConnecting = true;

        try {
            this.socket = io(url, {
                reconnection: false, // Manuel reconnect kullanacağız
                timeout: this.config.pingTimeout,
                transports: ['websocket', 'polling'],
                query: {
                    clientVersion: '1.0.0',
                    deviceType: 'web'
                }
            });

            this.setupEventListeners();
            await this.waitForConnection();
            
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            
            return true;
        } catch (error) {
            this.isConnecting = false;
            this.handleConnectionError(error);
            return false;
        }
    }

    setupEventListeners() {
        this.socket.on('connect', () => {
            console.log('Socket.IO bağlantısı kuruldu');
            this.processMessageQueue();
            this.emit('connected');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Socket.IO bağlantısı kesildi:', reason);
            this.handleDisconnect(reason);
        });

        this.socket.on('error', (error) => {
            console.error('Socket.IO hatası:', error);
            this.handleError(error);
        });

        this.socket.on('connect_error', (error) => {
            console.error('Socket.IO bağlantı hatası:', error);
            this.handleConnectionError(error);
        });

        // Özel event handler'ları
        this.socket.on('message', (data) => this.handleIncomingMessage(data));
        this.socket.on('user_joined', (data) => this.handleUserJoined(data));
        this.socket.on('user_left', (data) => this.handleUserLeft(data));
        this.socket.on('typing', (data) => this.handleTyping(data));
        this.socket.on('match_found', (data) => this.handleMatchFound(data));
    }

    setupHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.socket.connected) {
                const start = Date.now();
                this.socket.emit('ping');
                
                this.socket.once('pong', () => {
                    this.stats.latency = Date.now() - start;
                    this.emit('latencyUpdate', this.stats.latency);
                });
            }
        }, this.config.pingInterval);
    }

    waitForConnection() {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Bağlantı zaman aşımı'));
            }, this.config.pingTimeout);

            this.socket.once('connect', () => {
                clearTimeout(timeout);
                resolve();
            });
        });
    }

    async reconnect() {
        if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
            this.handleMaxReconnectAttemptsReached();
            return false;
        }

        this.reconnectAttempts++;
        this.stats.reconnections++;
        
        console.log(`Yeniden bağlanma denemesi: ${this.reconnectAttempts}`);
        
        await new Promise(resolve => setTimeout(resolve, this.config.reconnectInterval));
        return this.connect(this.socket.io.uri);
    }

    async send(event, data, options = {}) {
        if (!this.socket?.connected) {
            if (options.queue) {
                return this.queueMessage(event, data);
            }
            throw new Error('Socket bağlı değil');
        }

        if (!this.checkRateLimit(event)) {
            throw new Error('Rate limit aşıldı');
        }

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Mesaj zaman aşımı'));
            }, options.timeout || this.config.messageTimeout);

            this.socket.emit(event, data, (response) => {
                clearTimeout(timeout);
                this.stats.messagesSent++;
                resolve(response);
            });
        });
    }

    queueMessage(event, data) {
        if (this.messageQueue.size >= this.config.maxQueueSize) {
            throw new Error('Mesaj kuyruğu dolu');
        }

        const id = Date.now().toString();
        this.messageQueue.set(id, { event, data, timestamp: Date.now() });
        return id;
    }

    async processMessageQueue() {
        for (const [id, message] of this.messageQueue) {
            try {
                await this.send(message.event, message.data);
                this.messageQueue.delete(id);
            } catch (error) {
                console.error('Kuyruk mesajı gönderilemedi:', error);
                // Eski mesajları temizle
                if (Date.now() - message.timestamp > 5 * 60 * 1000) {
                    this.messageQueue.delete(id);
                }
            }
        }
    }

    checkRateLimit(event) {
        const limit = this.config.rateLimits[event];
        if (!limit) return true;

        const now = Date.now();
        const key = `${event}_timestamps`;
        
        if (!this[key]) {
            this[key] = [];
        }

        // Zaman penceresi dışındaki timestamps'leri temizle
        this[key] = this[key].filter(time => now - time < limit.timeWindow);

        // Rate limit kontrolü
        if (this[key].length >= limit.count) {
            return false;
        }

        this[key].push(now);
        return true;
    }

    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
    }

    off(event, handler) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).delete(handler);
        }
    }

    emit(event, data = null) {
        if (this.eventHandlers.has(event)) {
            this.eventHandlers.get(event).forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Event handler hatası (${event}):`, error);
                }
            });
        }
    }

    handleIncomingMessage(data) {
        this.stats.messagesReceived++;
        this.emit('message', data);
    }

    handleUserJoined(data) {
        this.emit('userJoined', data);
    }

    handleUserLeft(data) {
        this.emit('userLeft', data);
    }

    handleTyping(data) {
        this.emit('typing', data);
    }

    handleMatchFound(data) {
        this.emit('matchFound', data);
    }

    handleDisconnect(reason) {
        this.stopHeartbeat();
        
        if (reason === 'io server disconnect') {
            // Sunucu tarafından kapatıldı, yeniden bağlanma yapma
            this.emit('disconnected', { reason, reconnecting: false });
        } else {
            // Diğer sebeplerle bağlantı koptu, yeniden bağlanmayı dene
            this.emit('disconnected', { reason, reconnecting: true });
            this.reconnect();
        }
    }

    handleConnectionError(error) {
        this.stats.errors++;
        this.emit('error', {
            type: 'connection',
            error: error.message
        });
    }

    handleError(error) {
        this.stats.errors++;
        this.emit('error', {
            type: 'socket',
            error: error.message
        });
    }

    handleMaxReconnectAttemptsReached() {
        this.emit('maxReconnectAttemptsReached');
        this.cleanup();
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.socket?.connected) {
                const start = Date.now();
                this.socket.emit('ping');
                
                this.socket.once('pong', () => {
                    this.stats.latency = Date.now() - start;
                });
            }
        }, this.config.pingInterval);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    getStats() {
        return {
            ...this.stats,
            queueSize: this.messageQueue.size,
            connected: this.socket?.connected || false,
            reconnectAttempts: this.reconnectAttempts
        };
    }

    cleanup() {
        this.stopHeartbeat();
        this.messageQueue.clear();
        this.eventHandlers.clear();
        
        if (this.socket) {
            this.socket.removeAllListeners();
            this.socket.close();
            this.socket = null;
        }
        
        this.reconnectAttempts = 0;
        this.isConnecting = false;
    }
}

export { SocketManager }; 