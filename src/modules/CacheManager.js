export class CacheManager {
    constructor() {
        this.memoryCache = new Map();
        this.storageCache = null;
        this.workerCache = null;
        
        this.config = {
            maxMemoryCacheSize: 100 * 1024 * 1024, // 100MB
            maxStorageCacheSize: 500 * 1024 * 1024, // 500MB
            maxCacheAge: 24 * 60 * 60 * 1000, // 24 saat
            cleanupInterval: 5 * 60 * 1000, // 5 dakika
            compressionThreshold: 1024, // 1KB
            preloadThreshold: 0.8, // %80 kullanım
            priorityLevels: {
                HIGH: 3,
                MEDIUM: 2,
                LOW: 1
            }
        };

        this.stats = {
            hits: 0,
            misses: 0,
            evictions: 0,
            size: 0
        };

        this.initialize();
    }

    async initialize() {
        try {
            // IndexedDB önbelleğini başlat
            this.storageCache = await this.initializeStorageCache();
            
            // Service Worker önbelleğini başlat
            this.workerCache = await this.initializeWorkerCache();
            
            // Periyodik temizleme
            this.startCleanupInterval();
            
            // Performans izleme
            this.setupPerformanceMonitoring();
            
            return true;
        } catch (error) {
            console.error('Cache başlatma hatası:', error);
            return false;
        }
    }

    async initializeStorageCache() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('appCache', 1);
            
            request.onerror = () => reject(request.error);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Ana önbellek deposu
                if (!db.objectStoreNames.contains('cache')) {
                    const store = db.createObjectStore('cache', { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp');
                    store.createIndex('priority', 'priority');
                }
                
                // Metadata deposu
                if (!db.objectStoreNames.contains('metadata')) {
                    db.createObjectStore('metadata', { keyPath: 'key' });
                }
            };
            
            request.onsuccess = () => resolve(request.result);
        });
    }

    async initializeWorkerCache() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('/service-worker.js');
                return registration.active;
            } catch (error) {
                console.error('Service Worker kaydı başarısız:', error);
                return null;
            }
        }
        return null;
    }

    setupPerformanceMonitoring() {
        // Performans gözlemcisi
        if ('PerformanceObserver' in window) {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    if (entry.entryType === 'resource') {
                        this.handleResourceTiming(entry);
                    }
                }
            });
            
            observer.observe({ entryTypes: ['resource'] });
        }
        
        // Memory kullanımı izleme
        if (performance.memory) {
            setInterval(() => {
                const usage = performance.memory.usedJSHeapSize;
                if (usage > this.config.maxMemoryCacheSize * this.config.preloadThreshold) {
                    this.cleanup();
                }
            }, this.config.cleanupInterval);
        }
    }

    async set(key, value, options = {}) {
        const cacheItem = {
            key,
            value,
            timestamp: Date.now(),
            priority: options.priority || this.config.priorityLevels.LOW,
            size: this.calculateSize(value),
            metadata: options.metadata || {}
        };

        try {
            // Boyut kontrolü
            if (this.stats.size + cacheItem.size > this.config.maxMemoryCacheSize) {
                await this.makeSpace(cacheItem.size);
            }

            // Sıkıştırma
            if (cacheItem.size > this.config.compressionThreshold) {
                cacheItem.value = await this.compress(cacheItem.value);
                cacheItem.compressed = true;
            }

            // Memory cache'e kaydet
            this.memoryCache.set(key, cacheItem);
            this.stats.size += cacheItem.size;

            // Storage cache'e kaydet
            await this.setStorageCache(key, cacheItem);

            // Service Worker cache'e kaydet
            if (this.workerCache && options.persistent) {
                await this.setWorkerCache(key, cacheItem);
            }

            return true;
        } catch (error) {
            console.error('Cache set hatası:', error);
            return false;
        }
    }

    async get(key, options = {}) {
        try {
            // Önce memory cache'e bak
            let item = this.memoryCache.get(key);
            
            if (item) {
                this.stats.hits++;
                item.timestamp = Date.now(); // LRU güncelle
                return item.compressed ? await this.decompress(item.value) : item.value;
            }

            // Memory cache'de yoksa storage cache'e bak
            item = await this.getStorageCache(key);
            
            if (item) {
                this.stats.hits++;
                // Memory cache'e geri yükle
                await this.set(key, item.value, {
                    priority: item.priority,
                    metadata: item.metadata
                });
                return item.compressed ? await this.decompress(item.value) : item.value;
            }

            // Son olarak service worker cache'e bak
            if (this.workerCache) {
                item = await this.getWorkerCache(key);
                if (item) {
                    this.stats.hits++;
                    return item;
                }
            }

            this.stats.misses++;
            return null;
        } catch (error) {
            console.error('Cache get hatası:', error);
            return null;
        }
    }

    async delete(key) {
        try {
            // Memory cache'den sil
            const item = this.memoryCache.get(key);
            if (item) {
                this.stats.size -= item.size;
                this.memoryCache.delete(key);
            }

            // Storage cache'den sil
            await this.deleteStorageCache(key);

            // Service Worker cache'den sil
            if (this.workerCache) {
                await this.deleteWorkerCache(key);
            }

            return true;
        } catch (error) {
            console.error('Cache delete hatası:', error);
            return false;
        }
    }

    async clear() {
        try {
            // Memory cache'i temizle
            this.memoryCache.clear();
            this.stats.size = 0;

            // Storage cache'i temizle
            await this.clearStorageCache();

            // Service Worker cache'i temizle
            if (this.workerCache) {
                await this.clearWorkerCache();
            }

            return true;
        } catch (error) {
            console.error('Cache clear hatası:', error);
            return false;
        }
    }

    async makeSpace(requiredSize) {
        const items = Array.from(this.memoryCache.entries())
            .map(([key, value]) => ({ key, ...value }))
            .sort((a, b) => {
                // Önce önceliğe göre sırala
                if (a.priority !== b.priority) {
                    return a.priority - b.priority;
                }
                // Sonra zamana göre sırala (LRU)
                return a.timestamp - b.timestamp;
            });

        let freedSpace = 0;
        for (const item of items) {
            if (freedSpace >= requiredSize) break;
            
            await this.delete(item.key);
            freedSpace += item.size;
            this.stats.evictions++;
        }
    }

    async compress(data) {
        if (typeof data !== 'string') {
            data = JSON.stringify(data);
        }
        
        const blob = new Blob([data]);
        const compressed = await new Response(blob.stream().pipeThrough(new CompressionStream('gzip'))).blob();
        
        return await compressed.arrayBuffer();
    }

    async decompress(data) {
        const blob = new Blob([data]);
        const decompressed = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).blob();
        const text = await decompressed.text();
        
        try {
            return JSON.parse(text);
        } catch {
            return text;
        }
    }

    calculateSize(value) {
        if (typeof value === 'string') {
            return value.length * 2; // UTF-16
        }
        return JSON.stringify(value).length * 2;
    }

    async setStorageCache(key, item) {
        return new Promise((resolve, reject) => {
            const transaction = this.storageCache.transaction('cache', 'readwrite');
            const store = transaction.objectStore('cache');
            
            const request = store.put(item);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getStorageCache(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.storageCache.transaction('cache', 'readonly');
            const store = transaction.objectStore('cache');
            
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async deleteStorageCache(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.storageCache.transaction('cache', 'readwrite');
            const store = transaction.objectStore('cache');
            
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearStorageCache() {
        return new Promise((resolve, reject) => {
            const transaction = this.storageCache.transaction('cache', 'readwrite');
            const store = transaction.objectStore('cache');
            
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async setWorkerCache(key, item) {
        if (!this.workerCache) return;
        
        try {
            const cache = await caches.open('app-cache');
            const response = new Response(JSON.stringify(item));
            await cache.put(key, response);
        } catch (error) {
            console.error('Worker cache set hatası:', error);
        }
    }

    async getWorkerCache(key) {
        if (!this.workerCache) return null;
        
        try {
            const cache = await caches.open('app-cache');
            const response = await cache.match(key);
            if (response) {
                const data = await response.json();
                return data.compressed ? await this.decompress(data.value) : data.value;
            }
        } catch (error) {
            console.error('Worker cache get hatası:', error);
        }
        return null;
    }

    async deleteWorkerCache(key) {
        if (!this.workerCache) return;
        
        try {
            const cache = await caches.open('app-cache');
            await cache.delete(key);
        } catch (error) {
            console.error('Worker cache delete hatası:', error);
        }
    }

    async clearWorkerCache() {
        if (!this.workerCache) return;
        
        try {
            await caches.delete('app-cache');
        } catch (error) {
            console.error('Worker cache clear hatası:', error);
        }
    }

    startCleanupInterval() {
        setInterval(async () => {
            try {
                const now = Date.now();
                const expiredKeys = [];

                // Memory cache temizliği
                for (const [key, item] of this.memoryCache) {
                    if (now - item.timestamp > this.config.maxCacheAge) {
                        expiredKeys.push(key);
                    }
                }

                for (const key of expiredKeys) {
                    await this.delete(key);
                }

                // Storage cache temizliği
                const transaction = this.storageCache.transaction('cache', 'readwrite');
                const store = transaction.objectStore('cache');
                const index = store.index('timestamp');
                
                const range = IDBKeyRange.upperBound(now - this.config.maxCacheAge);
                const request = index.openCursor(range);
                
                request.onsuccess = async (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        await this.delete(cursor.value.key);
                        cursor.continue();
                    }
                };
            } catch (error) {
                console.error('Cache temizleme hatası:', error);
            }
        }, this.config.cleanupInterval);
    }

    handleResourceTiming(entry) {
        // Yavaş kaynakları önbellekle
        if (entry.duration > 1000) { // 1 saniyeden uzun
            this.set(entry.name, {
                url: entry.name,
                type: entry.initiatorType,
                size: entry.transferSize,
                timing: {
                    duration: entry.duration,
                    startTime: entry.startTime
                }
            }, {
                priority: this.config.priorityLevels.HIGH,
                metadata: {
                    cached: true,
                    timestamp: Date.now()
                }
            });
        }
    }

    getStats() {
        return {
            ...this.stats,
            memoryUsage: process.memoryUsage(),
            cacheSize: {
                memory: this.stats.size,
                storage: this.getStorageCacheSize(),
                worker: this.getWorkerCacheSize()
            }
        };
    }

    async getStorageCacheSize() {
        return new Promise((resolve) => {
            const transaction = this.storageCache.transaction('cache', 'readonly');
            const store = transaction.objectStore('cache');
            const request = store.count();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(0);
        });
    }

    async getWorkerCacheSize() {
        if (!this.workerCache) return 0;
        
        try {
            const cache = await caches.open('app-cache');
            const keys = await cache.keys();
            return keys.length;
        } catch {
            return 0;
        }
    }
}

export { CacheManager }; 