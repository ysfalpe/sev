class NetworkManager {
  constructor() {
    this.config = {
      maxRetries: 3,
      retryDelay: 1000,
      timeout: 30000,
      maxConcurrentRequests: 6,
      maxRequestsPerSecond: 10
    };

    this.state = {
      online: navigator.onLine,
      connectionType: this.getConnectionType(),
      activeRequests: new Map(),
      requestQueue: [],
      rateLimiter: {
        tokens: this.config.maxRequestsPerSecond,
        lastRefill: Date.now()
      }
    };

    this.dataChannels = new Map();
    this.observers = new Set();
    this.metrics = {
      totalRequests: 0,
      failedRequests: 0,
      averageLatency: 0,
      totalDataTransferred: 0,
      bandwidthUsage: new Map()
    };

    this.init();
  }

  init() {
    this.setupNetworkListeners();
    this.setupPerformanceMonitoring();
    this.startQueueProcessor();
  }

  setupNetworkListeners() {
    window.addEventListener('online', () => this.handleNetworkStatusChange(true));
    window.addEventListener('offline', () => this.handleNetworkStatusChange(false));

    if ('connection' in navigator) {
      navigator.connection.addEventListener('change', () => {
        this.state.connectionType = this.getConnectionType();
        this.notifyObservers('connectionChange', {
          type: this.state.connectionType,
          online: this.state.online
        });
      });
    }
  }

  setupPerformanceMonitoring() {
    if ('PerformanceObserver' in window) {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'resource') {
            this.updateMetrics(entry);
          }
        });
      });

      observer.observe({ entryTypes: ['resource'] });
    }
  }

  updateMetrics(entry) {
    this.metrics.totalRequests++;
    this.metrics.totalDataTransferred += entry.transferSize || 0;
    
    const latency = entry.duration;
    this.metrics.averageLatency = (this.metrics.averageLatency * (this.metrics.totalRequests - 1) + latency) / this.metrics.totalRequests;

    const timestamp = Math.floor(Date.now() / 1000);
    const currentBandwidth = this.metrics.bandwidthUsage.get(timestamp) || 0;
    this.metrics.bandwidthUsage.set(timestamp, currentBandwidth + (entry.transferSize || 0));

    // Eski bant genişliği verilerini temizle (son 5 dakika)
    const fiveMinutesAgo = timestamp - 300;
    for (const [key] of this.metrics.bandwidthUsage) {
      if (key < fiveMinutesAgo) {
        this.metrics.bandwidthUsage.delete(key);
      }
    }
  }

  getConnectionType() {
    if ('connection' in navigator) {
      const connection = navigator.connection;
      return {
        type: connection.effectiveType,
        downlink: connection.downlink,
        rtt: connection.rtt,
        saveData: connection.saveData
      };
    }
    return { type: 'unknown', downlink: 0, rtt: 0, saveData: false };
  }

  handleNetworkStatusChange(online) {
    this.state.online = online;
    
    if (online) {
      this.retryFailedRequests();
    }

    this.notifyObservers('networkStatus', { online });
  }

  async request(url, options = {}) {
    const requestId = Math.random().toString(36).substring(7);
    const request = {
      id: requestId,
      url,
      options: this.prepareRequestOptions(options),
      retries: 0
    };

    if (this.shouldQueueRequest()) {
      return this.queueRequest(request);
    }

    return this.executeRequest(request);
  }

  prepareRequestOptions(options) {
    return {
      ...options,
      timeout: options.timeout || this.config.timeout,
      headers: {
        ...options.headers,
        'X-Request-ID': Math.random().toString(36).substring(7)
      }
    };
  }

  shouldQueueRequest() {
    return (
      this.state.activeRequests.size >= this.config.maxConcurrentRequests ||
      !this.hasAvailableRateLimit()
    );
  }

  hasAvailableRateLimit() {
    const now = Date.now();
    const timeSinceLastRefill = now - this.state.rateLimiter.lastRefill;
    const refillAmount = Math.floor(timeSinceLastRefill / 1000) * this.config.maxRequestsPerSecond;
    
    this.state.rateLimiter.tokens = Math.min(
      this.config.maxRequestsPerSecond,
      this.state.rateLimiter.tokens + refillAmount
    );
    this.state.rateLimiter.lastRefill = now;

    return this.state.rateLimiter.tokens > 0;
  }

  queueRequest(request) {
    return new Promise((resolve, reject) => {
      this.state.requestQueue.push({
        request,
        resolve,
        reject
      });
    });
  }

  async executeRequest(request) {
    this.state.activeRequests.set(request.id, request);
    this.state.rateLimiter.tokens--;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), request.options.timeout);

      const response = await fetch(request.url, {
        ...request.options,
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      this.state.activeRequests.delete(request.id);
      return response;
    } catch (error) {
      if (request.retries < this.config.maxRetries) {
        return this.retryRequest(request);
      }
      
      this.metrics.failedRequests++;
      this.state.activeRequests.delete(request.id);
      throw error;
    }
  }

  async retryRequest(request) {
    request.retries++;
    await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * request.retries));
    return this.executeRequest(request);
  }

  retryFailedRequests() {
    const failedRequests = Array.from(this.state.activeRequests.values())
      .filter(request => request.retries > 0);

    failedRequests.forEach(request => {
      this.executeRequest(request);
    });
  }

  startQueueProcessor() {
    setInterval(() => {
      if (this.state.requestQueue.length === 0) return;
      
      while (
        this.state.requestQueue.length > 0 &&
        !this.shouldQueueRequest()
      ) {
        const { request, resolve, reject } = this.state.requestQueue.shift();
        this.executeRequest(request).then(resolve).catch(reject);
      }
    }, 100);
  }

  createDataChannel(peerId, options = {}) {
    if (this.dataChannels.has(peerId)) {
      return this.dataChannels.get(peerId);
    }

    const channel = new RTCDataChannel(peerId, {
      ordered: options.ordered !== false,
      maxRetransmits: options.maxRetransmits || 3,
      maxPacketLifeTime: options.maxPacketLifeTime || 1000,
      protocol: options.protocol || 'json'
    });

    this.setupDataChannel(channel, peerId);
    this.dataChannels.set(peerId, channel);

    return channel;
  }

  setupDataChannel(channel, peerId) {
    channel.onopen = () => {
      this.notifyObservers('dataChannelOpen', { peerId });
    };

    channel.onclose = () => {
      this.dataChannels.delete(peerId);
      this.notifyObservers('dataChannelClose', { peerId });
    };

    channel.onerror = (error) => {
      this.notifyObservers('dataChannelError', { peerId, error });
    };

    channel.onmessage = (event) => {
      this.handleDataChannelMessage(event.data, peerId);
    };
  }

  handleDataChannelMessage(data, peerId) {
    try {
      const message = JSON.parse(data);
      this.notifyObservers('dataChannelMessage', { peerId, message });
    } catch (error) {
      console.error('Error parsing data channel message:', error);
    }
  }

  sendViaDataChannel(peerId, data) {
    const channel = this.dataChannels.get(peerId);
    if (!channel || channel.readyState !== 'open') {
      throw new Error(`No open data channel for peer ${peerId}`);
    }

    try {
      const message = JSON.stringify(data);
      channel.send(message);
      return true;
    } catch (error) {
      console.error('Error sending via data channel:', error);
      return false;
    }
  }

  closeDataChannel(peerId) {
    const channel = this.dataChannels.get(peerId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(peerId);
    }
  }

  addObserver(callback) {
    this.observers.add(callback);
  }

  removeObserver(callback) {
    this.observers.delete(callback);
  }

  notifyObservers(event, data) {
    this.observers.forEach(callback => {
      try {
        callback(event, data);
      } catch (error) {
        console.error('Observer notification error:', error);
      }
    });
  }

  getMetrics() {
    return {
      ...this.metrics,
      currentBandwidth: this.calculateCurrentBandwidth(),
      activeRequests: this.state.activeRequests.size,
      queuedRequests: this.state.requestQueue.length,
      connectionType: this.state.connectionType
    };
  }

  calculateCurrentBandwidth() {
    const now = Math.floor(Date.now() / 1000);
    const lastSecond = this.metrics.bandwidthUsage.get(now) || 0;
    return lastSecond * 8; // Convert to bits
  }

  destroy() {
    // Event listener'ları temizle
    window.removeEventListener('online', this.handleNetworkStatusChange);
    window.removeEventListener('offline', this.handleNetworkStatusChange);

    // Data channel'ları kapat
    this.dataChannels.forEach((channel, peerId) => {
      this.closeDataChannel(peerId);
    });

    // Observer'ları temizle
    this.observers.clear();

    // Aktif istekleri iptal et
    this.state.activeRequests.forEach((request) => {
      if (request.controller) {
        request.controller.abort();
      }
    });
  }
}

export default NetworkManager; 