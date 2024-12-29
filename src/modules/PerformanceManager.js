export class PerformanceManager {
    constructor() {
        this.metrics = {
            fps: 0,
            memory: {
                jsHeapSizeLimit: 0,
                totalJSHeapSize: 0,
                usedJSHeapSize: 0
            },
            timing: {
                navigationStart: 0,
                loadEventEnd: 0,
                domComplete: 0,
                firstPaint: 0,
                firstContentfulPaint: 0
            },
            resources: new Map(),
            longTasks: [],
            networkRequests: new Map(),
            errors: []
        };
        
        this.thresholds = {
            minFps: 30,
            maxMemoryUsage: 0.9, // 90% of heap limit
            maxLoadTime: 3000,
            maxFirstPaint: 1000,
            maxFirstContentfulPaint: 1500,
            maxLongTaskDuration: 50,
            maxNetworkLatency: 1000
        };

        this.observers = new Set();
        this.isMonitoring = false;
        this.fpsInterval = null;
        this.lastFrameTime = performance.now();
        this.frameCount = 0;

        this.init();
    }

    init() {
        this.setupPerformanceObservers();
        this.setupErrorHandling();
        this.collectInitialMetrics();
    }

    setupPerformanceObservers() {
        // Uzun görevleri izle
        if ('PerformanceObserver' in window) {
            // Uzun görevler
            const longTaskObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    this.metrics.longTasks.push({
                        duration: entry.duration,
                        startTime: entry.startTime,
                        name: entry.name
                    });

                    if (entry.duration > this.thresholds.maxLongTaskDuration) {
                        this.notifyObservers('longTask', {
                            duration: entry.duration,
                            threshold: this.thresholds.maxLongTaskDuration
                        });
                    }
                });
            });

            longTaskObserver.observe({ entryTypes: ['longtask'] });

            // Sayfa yükleme metrikleri
            const navigationObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (entry.entryType === 'navigation') {
                        this.metrics.timing = {
                            navigationStart: entry.startTime,
                            loadEventEnd: entry.loadEventEnd,
                            domComplete: entry.domComplete
                        };

                        if (entry.loadEventEnd > this.thresholds.maxLoadTime) {
                            this.notifyObservers('slowPageLoad', {
                                loadTime: entry.loadEventEnd,
                                threshold: this.thresholds.maxLoadTime
                            });
                    }
                }
            });
            });

            navigationObserver.observe({ entryTypes: ['navigation'] });

            // İlk boya ve içerik boyama
            const paintObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    if (entry.name === 'first-paint') {
                        this.metrics.timing.firstPaint = entry.startTime;
                        
                        if (entry.startTime > this.thresholds.maxFirstPaint) {
                            this.notifyObservers('slowFirstPaint', {
                                time: entry.startTime,
                                threshold: this.thresholds.maxFirstPaint
                            });
                        }
                    }
                    
                    if (entry.name === 'first-contentful-paint') {
                        this.metrics.timing.firstContentfulPaint = entry.startTime;
                        
                        if (entry.startTime > this.thresholds.maxFirstContentfulPaint) {
                            this.notifyObservers('slowFirstContentfulPaint', {
                                time: entry.startTime,
                                threshold: this.thresholds.maxFirstContentfulPaint
                            });
                        }
                    }
                });
            });

            paintObserver.observe({ entryTypes: ['paint'] });

            // Kaynak yükleme
            const resourceObserver = new PerformanceObserver((list) => {
                list.getEntries().forEach((entry) => {
                    this.metrics.resources.set(entry.name, {
                        duration: entry.duration,
                        transferSize: entry.transferSize,
                        encodedBodySize: entry.encodedBodySize,
                        decodedBodySize: entry.decodedBodySize
                    });

                    if (entry.duration > this.thresholds.maxNetworkLatency) {
                        this.notifyObservers('slowResource', {
                            resource: entry.name,
                            duration: entry.duration,
                            threshold: this.thresholds.maxNetworkLatency
                        });
                    }
                });
            });

            resourceObserver.observe({ entryTypes: ['resource'] });
        }
    }

    setupErrorHandling() {
        window.addEventListener('error', (event) => {
            this.metrics.errors.push({
                message: event.message,
                source: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                timestamp: Date.now()
            });

            this.notifyObservers('error', {
                message: event.message,
                source: event.filename
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            this.metrics.errors.push({
                message: event.reason,
                type: 'unhandledrejection',
                timestamp: Date.now()
            });

            this.notifyObservers('unhandledRejection', {
                message: event.reason
            });
        });
    }

    collectInitialMetrics() {
        // Bellek kullanımı
        if (performance.memory) {
            this.metrics.memory = {
                jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                usedJSHeapSize: performance.memory.usedJSHeapSize
            };
        }

        // Sayfa yükleme metrikleri
        const timing = performance.timing;
        this.metrics.timing = {
            navigationStart: timing.navigationStart,
            loadEventEnd: timing.loadEventEnd,
            domComplete: timing.domComplete
        };
    }

    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        this.monitorFPS();
        this.monitorMemory();
        this.monitorNetwork();
    }

    stopMonitoring() {
        this.isMonitoring = false;
        if (this.fpsInterval) {
            cancelAnimationFrame(this.fpsInterval);
            this.fpsInterval = null;
        }
    }

    monitorFPS() {
        const updateFPS = () => {
            const currentTime = performance.now();
            const deltaTime = currentTime - this.lastFrameTime;
            
            this.frameCount++;
            
            // Her saniye FPS'i güncelle
            if (deltaTime >= 1000) {
                this.metrics.fps = Math.round((this.frameCount * 1000) / deltaTime);
                
                if (this.metrics.fps < this.thresholds.minFps) {
                    this.notifyObservers('lowFPS', {
                        fps: this.metrics.fps,
                        threshold: this.thresholds.minFps
                    });
                }
                
                this.frameCount = 0;
                this.lastFrameTime = currentTime;
            }
            
            if (this.isMonitoring) {
                this.fpsInterval = requestAnimationFrame(updateFPS);
            }
        };
        
        this.fpsInterval = requestAnimationFrame(updateFPS);
    }

    monitorMemory() {
        if (performance.memory) {
            setInterval(() => {
                this.metrics.memory = {
                    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                    usedJSHeapSize: performance.memory.usedJSHeapSize
                };

                const memoryUsage = this.metrics.memory.usedJSHeapSize / this.metrics.memory.jsHeapSizeLimit;
                if (memoryUsage > this.thresholds.maxMemoryUsage) {
                    this.notifyObservers('highMemoryUsage', {
                        usage: memoryUsage,
                        threshold: this.thresholds.maxMemoryUsage
                    });
                }
            }, 1000);
        }
    }

    monitorNetwork() {
        if ('connection' in navigator) {
            const connection = navigator.connection;
            
            const updateNetworkInfo = () => {
                this.metrics.networkInfo = {
                    type: connection.effectiveType,
                    downlink: connection.downlink,
                    rtt: connection.rtt,
                    saveData: connection.saveData
                };

                this.notifyObservers('networkChange', this.metrics.networkInfo);
            };

            connection.addEventListener('change', updateNetworkInfo);
            updateNetworkInfo();
        }
    }

    getMetrics() {
        return {
            ...this.metrics,
            timestamp: Date.now()
        };
    }

    getResourceMetrics() {
        return Array.from(this.metrics.resources.entries()).map(([url, metrics]) => ({
            url,
            ...metrics
        }));
    }

    getLongTasks() {
        return [...this.metrics.longTasks];
    }

    getErrors() {
        return [...this.metrics.errors];
    }

    clearMetrics() {
        this.metrics.longTasks = [];
        this.metrics.errors = [];
        this.metrics.resources.clear();
        this.metrics.networkRequests.clear();
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

    updateThresholds(newThresholds) {
        this.thresholds = {
            ...this.thresholds,
            ...newThresholds
        };
    }

    generateReport() {
        const now = Date.now();
        const report = {
            timestamp: now,
            metrics: this.getMetrics(),
            resourceMetrics: this.getResourceMetrics(),
            longTasks: this.getLongTasks(),
            errors: this.getErrors(),
            summary: {
                totalErrors: this.metrics.errors.length,
                totalLongTasks: this.metrics.longTasks.length,
                averageFPS: this.metrics.fps,
                memoryUsage: this.metrics.memory.usedJSHeapSize / this.metrics.memory.jsHeapSizeLimit,
                loadTime: this.metrics.timing.loadEventEnd - this.metrics.timing.navigationStart,
                resourceCount: this.metrics.resources.size
            },
            recommendations: []
        };

        // Performans önerileri
        if (report.summary.averageFPS < this.thresholds.minFps) {
            report.recommendations.push({
                type: 'fps',
                message: 'FPS düşük, animasyonları ve ağır DOM manipülasyonlarını optimize edin'
            });
        }

        if (report.summary.memoryUsage > this.thresholds.maxMemoryUsage) {
            report.recommendations.push({
                type: 'memory',
                message: 'Yüksek bellek kullanımı, bellek sızıntılarını kontrol edin'
            });
        }

        if (report.summary.loadTime > this.thresholds.maxLoadTime) {
            report.recommendations.push({
                type: 'loadTime',
                message: 'Sayfa yükleme süresi çok uzun, kaynakları optimize edin'
            });
        }

        if (report.summary.totalLongTasks > 0) {
            report.recommendations.push({
                type: 'longTasks',
                message: 'Uzun süren görevler tespit edildi, ana iş parçacığını bloke eden işlemleri optimize edin'
            });
        }

        return report;
    }

    async optimizePerformance() {
        const report = this.generateReport();
        const optimizations = [];

        // FPS optimizasyonu
        if (report.summary.averageFPS < this.thresholds.minFps) {
            optimizations.push(this.optimizeFPS());
        }

        // Bellek optimizasyonu
        if (report.summary.memoryUsage > this.thresholds.maxMemoryUsage) {
            optimizations.push(this.optimizeMemory());
        }

        // Yükleme süresi optimizasyonu
        if (report.summary.loadTime > this.thresholds.maxLoadTime) {
            optimizations.push(this.optimizeLoadTime());
        }

        // Uzun görevleri optimize et
        if (report.summary.totalLongTasks > 0) {
            optimizations.push(this.optimizeLongTasks());
        }

        try {
            await Promise.all(optimizations);
            this.notifyObservers('optimizationComplete', {
                success: true,
                optimizations: optimizations.length
            });
        } catch (error) {
            this.notifyObservers('optimizationError', {
                error: error.message
            });
        }
    }

    async optimizeFPS() {
        // Animasyonları optimize et
        const animations = document.getAnimations();
        animations.forEach(animation => {
            if (animation.playbackRate > 1) {
                animation.playbackRate = 1;
            }
        });

        // Ağır DOM işlemlerini throttle et
        this.throttleHeavyOperations();
    }

    async optimizeMemory() {
        // DOM elementlerini temizle
        this.cleanupDOM();

        // Event listener'ları temizle
        this.cleanupEventListeners();

        // Bellek sızıntılarını kontrol et
        this.checkMemoryLeaks();
    }

    async optimizeLoadTime() {
        // Kullanılmayan kaynakları lazy load yap
        this.enableLazyLoading();

        // Kaynakları önbelleğe al
        this.setupCaching();

        // Kritik olmayan kaynakları ertele
        this.deferNonCriticalResources();
    }

    async optimizeLongTasks() {
        // Uzun görevleri web worker'lara taşı
        this.moveToWebWorker();

        // İşlemleri chunk'lara böl
        this.chunkOperations();
    }

    throttleHeavyOperations() {
        // Scroll event'larını throttle et
        this.throttleScrollEvents();

        // Resize event'larını throttle et
        this.throttleResizeEvents();

        // Input event'larını debounce et
        this.debounceInputEvents();
    }

    throttleScrollEvents() {
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    // Scroll işlemlerini yap
                    ticking = false;
                });
                ticking = true;
            }
        });
    }

    throttleResizeEvents() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                // Resize işlemlerini yap
            }, 100);
        });
    }

    debounceInputEvents() {
        const inputs = document.querySelectorAll('input, textarea');
        inputs.forEach(input => {
            let inputTimeout;
            input.addEventListener('input', () => {
                clearTimeout(inputTimeout);
                inputTimeout = setTimeout(() => {
                    // Input işlemlerini yap
                }, 300);
            });
        });
    }

    cleanupDOM() {
        // Görünmeyen elementleri temizle
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    entry.target.remove();
                }
            });
        });

        document.querySelectorAll('.cleanup-candidate').forEach(element => {
            observer.observe(element);
        });
    }

    cleanupEventListeners() {
        // Event listener'ları takip et ve temizle
        const listeners = new WeakMap();
        
        const addListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function(type, listener, options) {
            if (!listeners.has(this)) {
                listeners.set(this, new Map());
            }
            const typeListeners = listeners.get(this);
            if (!typeListeners.has(type)) {
                typeListeners.set(type, new Set());
            }
            typeListeners.get(type).add(listener);
            return addListener.call(this, type, listener, options);
        };
        
        const removeListener = EventTarget.prototype.removeEventListener;
        EventTarget.prototype.removeEventListener = function(type, listener, options) {
            if (listeners.has(this)) {
                const typeListeners = listeners.get(this);
                if (typeListeners.has(type)) {
                    typeListeners.get(type).delete(listener);
                }
            }
            return removeListener.call(this, type, listener, options);
        };
    }

    checkMemoryLeaks() {
        // Döngüsel referansları kontrol et
        const findCircularReferences = (obj, seen = new WeakSet()) => {
            if (obj && typeof obj === 'object') {
                if (seen.has(obj)) return true;
                seen.add(obj);
                return Object.values(obj).some(value => findCircularReferences(value, seen));
            }
            return false;
        };

        // Global nesneleri kontrol et
        const globals = Object.keys(window);
        globals.forEach(key => {
            if (findCircularReferences(window[key])) {
                console.warn(`Possible memory leak detected in global object: ${key}`);
            }
        });
    }

    enableLazyLoading() {
        // Görüntüleri lazy load yap
        document.querySelectorAll('img[data-src]').forEach(img => {
            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        img.src = img.dataset.src;
                        observer.unobserve(img);
                    }
                });
            });
            observer.observe(img);
        });

        // İframe'leri lazy load yap
        document.querySelectorAll('iframe[data-src]').forEach(iframe => {
            const observer = new IntersectionObserver(entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        iframe.src = iframe.dataset.src;
                        observer.unobserve(iframe);
                    }
                });
            });
            observer.observe(iframe);
        });
    }

    setupCaching() {
        // Service Worker kurulumu
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(registration => {
                    console.log('Service Worker registered:', registration);
                })
                .catch(error => {
                    console.error('Service Worker registration failed:', error);
                });
        }
    }

    deferNonCriticalResources() {
        // Kritik olmayan script'leri ertele
        document.querySelectorAll('script[data-defer]').forEach(script => {
            script.setAttribute('defer', '');
        });

        // Kritik olmayan stilleri ertele
        document.querySelectorAll('link[data-defer]').forEach(link => {
            link.setAttribute('media', 'print');
            link.setAttribute('onload', "this.media='all'");
        });
    }

    moveToWebWorker() {
        // Web Worker oluştur
        const worker = new Worker('/js/worker.js');

        // Uzun süren işlemleri worker'a gönder
        this.metrics.longTasks.forEach(task => {
            if (task.duration > this.thresholds.maxLongTaskDuration) {
                worker.postMessage({
                    type: 'longTask',
                    data: task
                });
            }
        });

        // Worker'dan gelen sonuçları işle
        worker.onmessage = (event) => {
            const { type, data } = event.data;
            this.notifyObservers('workerComplete', {
                type,
                data
            });
        };
    }

    chunkOperations() {
        // Büyük işlemleri küçük parçalara böl
        const chunk = (array, size) => {
            const chunks = [];
            for (let i = 0; i < array.length; i += size) {
                chunks.push(array.slice(i, i + size));
            }
            return chunks;
        };

        // İşlemleri zamana yay
        const processChunks = (chunks, callback) => {
            let index = 0;
            
            const process = () => {
                if (index < chunks.length) {
                    requestIdleCallback(() => {
                        callback(chunks[index]);
                        index++;
                        process();
                    });
                }
            };

            process();
        };
    }
}

export default PerformanceManager; 