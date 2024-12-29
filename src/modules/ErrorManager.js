import { ERROR_MESSAGES } from '../config/constants.js';

export class ErrorManager {
    constructor() {
        this.errors = new Map();
        this.errorCount = 0;
        this.maxErrors = 100;
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        
        // Hata kategorileri
        this.errorTypes = {
            NETWORK: 'network',
            VALIDATION: 'validation',
            AUTHENTICATION: 'auth',
            MEDIA: 'media',
            SYSTEM: 'system',
            USER: 'user'
        };
        
        // Hata seviyeleri
        this.errorLevels = {
            INFO: 0,
            WARNING: 1,
            ERROR: 2,
            CRITICAL: 3,
            FATAL: 4
        };
        
        // Hata işleyicileri
        this.errorHandlers = new Map();
        this.setupDefaultHandlers();
    }

    initialize() {
        // Global hata yakalama
        this.setupGlobalErrorHandling();
        
        // Promise hataları
        this.setupPromiseErrorHandling();
        
        // Ağ hataları
        this.setupNetworkErrorHandling();
        
        // Medya hataları
        this.setupMediaErrorHandling();
    }

    setupGlobalErrorHandling() {
        window.onerror = (message, source, lineno, colno, error) => {
            this.handleError({
                type: this.errorTypes.SYSTEM,
                level: this.errorLevels.ERROR,
                message,
                source,
                lineno,
                colno,
                error,
                timestamp: Date.now()
            });
            
            return true; // Hatayı yakala
        };
    }

    setupPromiseErrorHandling() {
        window.onunhandledrejection = (event) => {
            this.handleError({
                type: this.errorTypes.SYSTEM,
                level: this.errorLevels.ERROR,
                message: event.reason,
                error: event.reason,
                timestamp: Date.now()
            });
        };
    }

    setupNetworkErrorHandling() {
        window.addEventListener('offline', () => {
            this.handleError({
                type: this.errorTypes.NETWORK,
                level: this.errorLevels.WARNING,
                message: 'İnternet bağlantısı kesildi',
                timestamp: Date.now()
            });
        });
        
        // Fetch API hata yakalama
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            try {
                const response = await originalFetch(...args);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response;
            } catch (error) {
                this.handleNetworkError(error, args[0]);
                throw error;
            }
        };
    }

    setupMediaErrorHandling() {
        document.addEventListener('error', (event) => {
            const target = event.target;
            
            if (target instanceof HTMLMediaElement) {
                this.handleError({
                    type: this.errorTypes.MEDIA,
                    level: this.errorLevels.ERROR,
                    message: `Medya yükleme hatası: ${target.src}`,
                    error: event.error,
                    timestamp: Date.now()
                });
            }
        }, true);
    }

    setupDefaultHandlers() {
        // Ağ hataları için
        this.errorHandlers.set(this.errorTypes.NETWORK, (error) => {
            if (this.shouldRetry(error)) {
                return this.retryRequest(error);
            }
            return this.showNetworkError(error);
        });
        
        // Doğrulama hataları için
        this.errorHandlers.set(this.errorTypes.VALIDATION, (error) => {
            return this.showValidationError(error);
        });
        
        // Kimlik doğrulama hataları için
        this.errorHandlers.set(this.errorTypes.AUTHENTICATION, (error) => {
            return this.handleAuthError(error);
        });
        
        // Medya hataları için
        this.errorHandlers.set(this.errorTypes.MEDIA, (error) => {
            return this.handleMediaError(error);
        });
    }

    handleError(errorData) {
        try {
            // Hata limitini kontrol et
            if (this.errorCount >= this.maxErrors) {
                this.cleanupOldErrors();
            }
            
            // Hatayı kaydet
            const errorId = this.generateErrorId();
            this.errors.set(errorId, {
                ...errorData,
                id: errorId,
                handled: false
            });
            
            this.errorCount++;
            
            // Hata seviyesine göre işle
            if (errorData.level >= this.errorLevels.ERROR) {
                this.processError(errorId);
            }
            
            // Hatayı logla
            this.logError(errorData);
            
            return errorId;
        } catch (error) {
            console.error('Hata işleme hatası:', error);
        }
    }

    processError(errorId) {
        const error = this.errors.get(errorId);
        if (!error || error.handled) return;
        
        try {
            // Özel işleyici var mı kontrol et
            const handler = this.errorHandlers.get(error.type);
            if (handler) {
                handler(error);
            } else {
                // Varsayılan işleyici
                this.defaultErrorHandler(error);
            }
            
            error.handled = true;
            this.errors.set(errorId, error);
        } catch (e) {
            console.error('Hata işleme sırasında hata:', e);
        }
    }

    handleNetworkError(error, url) {
        const errorData = {
            type: this.errorTypes.NETWORK,
            level: this.errorLevels.ERROR,
            message: error.message,
            url,
            timestamp: Date.now()
        };
        
        return this.handleError(errorData);
    }

    handleValidationError(error) {
        const errorData = {
            type: this.errorTypes.VALIDATION,
            level: this.errorLevels.WARNING,
            message: error.message,
            field: error.field,
            value: error.value,
            timestamp: Date.now()
        };
        
        return this.handleError(errorData);
    }

    handleAuthError(error) {
        const errorData = {
            type: this.errorTypes.AUTHENTICATION,
            level: this.errorLevels.ERROR,
            message: error.message,
            timestamp: Date.now()
        };
        
        return this.handleError(errorData);
    }

    handleMediaError(error) {
        const errorData = {
            type: this.errorTypes.MEDIA,
            level: this.errorLevels.ERROR,
            message: error.message,
            mediaElement: error.target,
            timestamp: Date.now()
        };
        
        return this.handleError(errorData);
    }

    shouldRetry(error) {
        // Yeniden deneme sayısını kontrol et
        const retryCount = this.retryAttempts.get(error.id) || 0;
        return retryCount < this.maxRetries && error.type === this.errorTypes.NETWORK;
    }

    async retryRequest(error) {
        const retryCount = (this.retryAttempts.get(error.id) || 0) + 1;
        this.retryAttempts.set(error.id, retryCount);
        
        // Üstel geri çekilme
        const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
        
        try {
            await new Promise(resolve => setTimeout(resolve, delay));
            // İsteği yeniden dene
            const response = await fetch(error.url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            // Başarılı olursa retry sayacını sıfırla
            this.retryAttempts.delete(error.id);
            return response;
        } catch (retryError) {
            if (retryCount >= this.maxRetries) {
                this.handleMaxRetriesExceeded(error);
            }
            throw retryError;
        }
    }

    handleMaxRetriesExceeded(error) {
        this.handleError({
            type: this.errorTypes.NETWORK,
            level: this.errorLevels.CRITICAL,
            message: `Maksimum yeniden deneme sayısına ulaşıldı: ${error.url}`,
            originalError: error,
            timestamp: Date.now()
        });
    }

    showNetworkError(error) {
        // UI bildirimini göster
        if (window.UIManager) {
            window.UIManager.showError(
                `Ağ hatası: ${error.message}. Lütfen bağlantınızı kontrol edin.`
            );
        }
    }

    showValidationError(error) {
        // Form alanında hatayı göster
        if (window.UIManager) {
            window.UIManager.showFieldError(error.field, error.message);
        }
    }

    defaultErrorHandler(error) {
        // Varsayılan hata mesajını göster
        if (window.UIManager) {
            window.UIManager.showError(
                `Bir hata oluştu: ${error.message}`
            );
        }
    }

    generateErrorId() {
        return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    cleanupOldErrors() {
        // En eski hataları temizle
        const errors = Array.from(this.errors.entries());
        errors.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        // İlk %20'yi temizle
        const cleanupCount = Math.floor(this.maxErrors * 0.2);
        errors.slice(0, cleanupCount).forEach(([id]) => {
            this.errors.delete(id);
            this.errorCount--;
        });
    }

    logError(error) {
        // Konsola logla
        console.error(
            `[${new Date(error.timestamp).toISOString()}] ${error.type.toUpperCase()}: ${error.message}`,
            error
        );
        
        // Analitik servise gönder
        this.sendErrorAnalytics(error);
    }

    async sendErrorAnalytics(error) {
        try {
            const analyticsData = {
                type: error.type,
                level: error.level,
                message: error.message,
                timestamp: error.timestamp,
                userAgent: navigator.userAgent,
                url: window.location.href
            };
            
            // Analitik servise gönder
            await fetch('/api/analytics/error', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(analyticsData)
            });
        } catch (error) {
            console.error('Hata analitiği gönderme hatası:', error);
        }
    }

    getErrorStats() {
        const stats = {
            total: this.errorCount,
            byType: {},
            byLevel: {}
        };
        
        this.errors.forEach(error => {
            // Tür bazında istatistik
            stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
            
            // Seviye bazında istatistik
            stats.byLevel[error.level] = (stats.byLevel[error.level] || 0) + 1;
        });
        
        return stats;
    }

    clearErrors() {
        this.errors.clear();
        this.errorCount = 0;
        this.retryAttempts.clear();
    }
} 