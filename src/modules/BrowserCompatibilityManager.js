export class BrowserCompatibilityManager {
    constructor() {
        this.browser = this.detectBrowser();
        this.features = new Map();
        this.polyfills = new Map();
        this.workarounds = new Map();
        
        this.config = {
            minVersions: {
                chrome: 80,
                firefox: 75,
                safari: 13,
                edge: 80,
                opera: 67
            },
            requiredFeatures: [
                'WebRTC',
                'WebSocket',
                'IndexedDB',
                'ServiceWorker',
                'MediaDevices',
                'Permissions',
                'Stream'
            ],
            fallbacks: {
                webrtc: 'ws',
                indexeddb: 'localstorage',
                serviceworker: 'xhr',
                mediadevices: 'flash'
            }
        };

        this.initialize();
    }

    detectBrowser() {
        const ua = navigator.userAgent;
        let browser = {
            name: 'unknown',
            version: 0,
            engine: 'unknown',
            os: this.detectOS(),
            mobile: /Mobile|Android|iOS/.test(ua)
        };

        // Chrome
        if (/Chrome/.test(ua) && !/Chromium|Edge/.test(ua)) {
            browser.name = 'chrome';
            browser.engine = 'blink';
            browser.version = parseInt(ua.match(/Chrome\/(\d+)/)[1], 10);
        }
        // Firefox
        else if (/Firefox/.test(ua)) {
            browser.name = 'firefox';
            browser.engine = 'gecko';
            browser.version = parseInt(ua.match(/Firefox\/(\d+)/)[1], 10);
        }
        // Safari
        else if (/Safari/.test(ua) && !/Chrome/.test(ua)) {
            browser.name = 'safari';
            browser.engine = 'webkit';
            browser.version = parseInt(ua.match(/Version\/(\d+)/)[1], 10);
        }
        // Edge (Chromium)
        else if (/Edg/.test(ua)) {
            browser.name = 'edge';
            browser.engine = 'blink';
            browser.version = parseInt(ua.match(/Edg\/(\d+)/)[1], 10);
        }
        // Opera
        else if (/OPR/.test(ua)) {
            browser.name = 'opera';
            browser.engine = 'blink';
            browser.version = parseInt(ua.match(/OPR\/(\d+)/)[1], 10);
        }

        return browser;
    }

    detectOS() {
        const platform = navigator.platform;
        const ua = navigator.userAgent;

        if (platform.includes('Win')) return 'windows';
        if (platform.includes('Mac')) return 'macos';
        if (platform.includes('Linux')) return 'linux';
        if (/Android/.test(ua)) return 'android';
        if (/iOS|iPhone|iPad|iPod/.test(ua)) return 'ios';
        
        return 'unknown';
    }

    async initialize() {
        await this.detectFeatures();
        this.loadPolyfills();
        this.applyWorkarounds();
        this.setupEventListeners();
        this.checkCompatibility();
    }

    async detectFeatures() {
        // WebRTC desteği
        this.features.set('WebRTC', {
            supported: !!(window.RTCPeerConnection && window.RTCSessionDescription),
            version: this.detectWebRTCVersion()
        });

        // WebSocket desteği
        this.features.set('WebSocket', {
            supported: 'WebSocket' in window,
            version: this.detectWebSocketVersion()
        });

        // IndexedDB desteği
        this.features.set('IndexedDB', {
            supported: 'indexedDB' in window,
            version: this.detectIndexedDBVersion()
        });

        // Service Worker desteği
        this.features.set('ServiceWorker', {
            supported: 'serviceWorker' in navigator,
            version: this.detectServiceWorkerVersion()
        });

        // MediaDevices desteği
        this.features.set('MediaDevices', {
            supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            version: this.detectMediaDevicesVersion()
        });

        // Permissions API desteği
        this.features.set('Permissions', {
            supported: 'permissions' in navigator,
            version: this.detectPermissionsVersion()
        });

        // Stream API desteği
        this.features.set('Stream', {
            supported: !!(window.ReadableStream && window.WritableStream),
            version: this.detectStreamVersion()
        });
    }

    loadPolyfills() {
        // WebRTC Polyfill
        if (!this.features.get('WebRTC').supported) {
            this.polyfills.set('WebRTC', this.loadWebRTCPolyfill());
        }

        // IndexedDB Polyfill
        if (!this.features.get('IndexedDB').supported) {
            this.polyfills.set('IndexedDB', this.loadIndexedDBPolyfill());
        }

        // Stream API Polyfill
        if (!this.features.get('Stream').supported) {
            this.polyfills.set('Stream', this.loadStreamPolyfill());
        }
    }

    applyWorkarounds() {
        // Safari WebRTC workarounds
        if (this.browser.name === 'safari') {
            this.applySafariWebRTCWorkarounds();
        }

        // Firefox IndexedDB workarounds
        if (this.browser.name === 'firefox') {
            this.applyFirefoxIndexedDBWorkarounds();
        }

        // iOS Safari MediaDevices workarounds
        if (this.browser.name === 'safari' && this.browser.os === 'ios') {
            this.applyIOSMediaDevicesWorkarounds();
        }
    }

    setupEventListeners() {
        // Tarayıcı özelliklerindeki değişiklikleri izle
        if ('permissions' in navigator) {
            navigator.permissions.onchange = () => {
                this.detectFeatures();
            };
        }

        // Bağlantı durumunu izle
        if ('connection' in navigator) {
            navigator.connection.onchange = () => {
                this.handleConnectionChange();
            };
        }

        // Tarayıcı depolama durumunu izle
        if ('storage' in navigator) {
            navigator.storage.onquotachange = () => {
                this.handleStorageQuotaChange();
            };
        }
    }

    checkCompatibility() {
        const issues = [];

        // Tarayıcı sürüm kontrolü
        const minVersion = this.config.minVersions[this.browser.name];
        if (minVersion && this.browser.version < minVersion) {
            issues.push({
                type: 'browser_version',
                message: `Tarayıcı sürümü çok eski (${this.browser.version} < ${minVersion})`,
                critical: true
            });
        }

        // Gerekli özelliklerin kontrolü
        for (const feature of this.config.requiredFeatures) {
            const support = this.features.get(feature);
            if (!support || !support.supported) {
                issues.push({
                    type: 'missing_feature',
                    feature: feature,
                    message: `${feature} özelliği desteklenmiyor`,
                    critical: !this.config.fallbacks[feature.toLowerCase()]
                });
            }
        }

        // Bilinen sorunların kontrolü
        if (this.browser.name === 'safari' && this.browser.version < 15) {
            issues.push({
                type: 'known_issue',
                message: 'Safari WebRTC sorunları',
                critical: false
            });
        }

        return {
            compatible: issues.filter(i => i.critical).length === 0,
            issues: issues
        };
    }

    applySafariWebRTCWorkarounds() {
        // Plan-B'den Unified-Plan'a geçiş
        if (window.RTCPeerConnection) {
            const origCreateOffer = RTCPeerConnection.prototype.createOffer;
            RTCPeerConnection.prototype.createOffer = function(options) {
                if (options && options.offerToReceiveAudio !== undefined) {
                    delete options.offerToReceiveAudio;
                }
                if (options && options.offerToReceiveVideo !== undefined) {
                    delete options.offerToReceiveVideo;
                }
                return origCreateOffer.apply(this, arguments);
            };
        }
    }

    applyFirefoxIndexedDBWorkarounds() {
        // Firefox'ta IndexedDB transaction timeout sorunu
        if ('indexedDB' in window) {
            const origTransaction = IDBDatabase.prototype.transaction;
            IDBDatabase.prototype.transaction = function(...args) {
                const tx = origTransaction.apply(this, args);
                tx.addEventListener('timeout', () => {
                    console.warn('IndexedDB transaction timeout');
                });
                return tx;
            };
        }
    }

    applyIOSMediaDevicesWorkarounds() {
        // iOS'ta getUserMedia sonrası ses sorunu
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            const origGetUserMedia = navigator.mediaDevices.getUserMedia;
            navigator.mediaDevices.getUserMedia = async function(constraints) {
                const stream = await origGetUserMedia.apply(this, arguments);
                if (constraints.audio) {
                    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const source = audioContext.createMediaStreamSource(stream);
                    const destination = audioContext.createMediaStreamDestination();
                    source.connect(destination);
                }
                return stream;
            };
        }
    }

    handleConnectionChange() {
        const connection = navigator.connection;
        const networkType = connection.effectiveType;
        const downlink = connection.downlink;

        // Bağlantı durumuna göre ayarları optimize et
        if (networkType === '4g' && downlink > 1) {
            this.setHighQualityMode();
        } else {
            this.setLowQualityMode();
        }
    }

    handleStorageQuotaChange() {
        navigator.storage.estimate().then(estimate => {
            const usagePercent = (estimate.usage / estimate.quota) * 100;
            if (usagePercent > 90) {
                this.cleanupStorage();
            }
        });
    }

    setHighQualityMode() {
        // Yüksek kalite ayarları
        if (window.mediaManager) {
            window.mediaManager.setVideoQuality('high');
        }
    }

    setLowQualityMode() {
        // Düşük kalite ayarları
        if (window.mediaManager) {
            window.mediaManager.setVideoQuality('low');
        }
    }

    async cleanupStorage() {
        if ('caches' in window) {
            const keys = await caches.keys();
            for (const key of keys) {
                await caches.delete(key);
            }
        }

        if ('indexedDB' in window) {
            const dbs = await window.indexedDB.databases();
            for (const db of dbs) {
                window.indexedDB.deleteDatabase(db.name);
            }
        }

        localStorage.clear();
        sessionStorage.clear();
    }

    getFeatureSupport(feature) {
        return this.features.get(feature) || { supported: false, version: 0 };
    }

    getBrowserInfo() {
        return {
            name: this.browser.name,
            version: this.browser.version,
            engine: this.browser.engine,
            os: this.browser.os,
            mobile: this.browser.mobile,
            features: Object.fromEntries(this.features),
            compatibility: this.checkCompatibility()
        };
    }

    detectWebRTCVersion() {
        if (!window.RTCPeerConnection) return 0;
        if ('addTransceiver' in RTCPeerConnection.prototype) return 1.3;
        if ('getSenders' in RTCPeerConnection.prototype) return 1.2;
        if ('getStats' in RTCPeerConnection.prototype) return 1.1;
        return 1.0;
    }

    detectWebSocketVersion() {
        if (!window.WebSocket) return 0;
        if ('binaryType' in WebSocket.prototype) return 1.1;
        return 1.0;
    }

    detectIndexedDBVersion() {
        if (!window.indexedDB) return 0;
        if ('getAll' in IDBObjectStore.prototype) return 2.0;
        return 1.0;
    }

    detectServiceWorkerVersion() {
        if (!navigator.serviceWorker) return 0;
        if ('navigationPreload' in ServiceWorkerRegistration.prototype) return 2.0;
        return 1.0;
    }

    detectMediaDevicesVersion() {
        if (!navigator.mediaDevices) return 0;
        if ('getDisplayMedia' in navigator.mediaDevices) return 2.0;
        if ('getUserMedia' in navigator.mediaDevices) return 1.0;
        return 0;
    }

    detectPermissionsVersion() {
        if (!navigator.permissions) return 0;
        if ('query' in navigator.permissions) return 1.0;
        return 0;
    }

    detectStreamVersion() {
        if (!window.ReadableStream) return 0;
        if ('pipeThrough' in ReadableStream.prototype) return 2.0;
        return 1.0;
    }
}

export { BrowserCompatibilityManager }; 