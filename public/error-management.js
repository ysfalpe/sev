import { ERROR_MESSAGES } from './messages.js';

/**
 * Hata yönetimi sınıfı
 */
export class ErrorManager {
    constructor() {
        this.errorHandlers = new Map();
        this.setupDefaultHandlers();
    }

    /**
     * Varsayılan hata işleyicilerini ayarlar
     */
    setupDefaultHandlers() {
        this.addHandler('CONNECTION', this.handleConnectionError);
        this.addHandler('MEDIA', this.handleMediaError);
        this.addHandler('PERMISSION', this.handlePermissionError);
        this.addHandler('NETWORK', this.handleNetworkError);
        this.addHandler('PEER', this.handlePeerError);
        this.addHandler('BROWSER', this.handleBrowserError);
    }

    /**
     * Yeni hata işleyici ekler
     * @param {string} type - Hata tipi
     * @param {Function} handler - Hata işleyici fonksiyon
     */
    addHandler(type, handler) {
        this.errorHandlers.set(type, handler);
    }

    /**
     * Hatayı işler
     * @param {Error} error - Hata objesi
     * @param {string} type - Hata tipi
     */
    handleError(error, type) {
        const handler = this.errorHandlers.get(type);
        if (handler) {
            handler(error);
        } else {
            this.handleUnknownError(error);
        }
        this.logError(error, type);
    }

    /**
     * Bağlantı hatasını işler
     * @param {Error} error - Hata objesi
     */
    handleConnectionError(error) {
        this.showNotification(ERROR_MESSAGES.CONNECTION, 'error');
        console.error('Bağlantı hatası:', error);
    }

    /**
     * Medya hatasını işler
     * @param {Error} error - Hata objesi
     */
    handleMediaError(error) {
        this.showNotification(ERROR_MESSAGES.MEDIA, 'error');
        console.error('Medya hatası:', error);
    }

    /**
     * İzin hatasını işler
     * @param {Error} error - Hata objesi
     */
    handlePermissionError(error) {
        this.showNotification(ERROR_MESSAGES.PERMISSION, 'error');
        console.error('İzin hatası:', error);
    }

    /**
     * Ağ hatasını işler
     * @param {Error} error - Hata objesi
     */
    handleNetworkError(error) {
        this.showNotification(ERROR_MESSAGES.NETWORK, 'error');
        console.error('Ağ hatası:', error);
    }

    /**
     * Eşler arası bağlantı hatasını işler
     * @param {Error} error - Hata objesi
     */
    handlePeerError(error) {
        this.showNotification(ERROR_MESSAGES.PEER, 'error');
        console.error('Eşler arası bağlantı hatası:', error);
    }

    /**
     * Tarayıcı uyumluluk hatasını işler
     * @param {Error} error - Hata objesi
     */
    handleBrowserError(error) {
        this.showNotification(ERROR_MESSAGES.BROWSER_ERROR, 'error');
        console.error('Tarayıcı uyumluluk hatası:', error);
    }

    /**
     * Bilinmeyen hatayı işler
     * @param {Error} error - Hata objesi
     */
    handleUnknownError(error) {
        this.showNotification(ERROR_MESSAGES.UNKNOWN, 'error');
        console.error('Bilinmeyen hata:', error);
    }

    /**
     * Hatayı loglar
     * @param {Error} error - Hata objesi
     * @param {string} type - Hata tipi
     */
    logError(error, type) {
        console.error(`[${type}] Hata:`, error);
        // Burada hata loglama servisi entegrasyonu yapılabilir
    }

    /**
     * Bildirim gösterir
     * @param {string} message - Bildirim mesajı
     * @param {string} type - Bildirim tipi
     */
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        const container = document.getElementById('notification-container');
        if (container) {
            container.appendChild(notification);
            setTimeout(() => {
                notification.remove();
            }, 3000);
        }
    }
}

// Singleton instance
export const errorManager = new ErrorManager(); 