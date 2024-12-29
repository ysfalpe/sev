import { ERROR_MESSAGES } from './messages.js';

/**
 * Genel hata yönetimi
 * @param {Error} error - Hata objesi
 * @param {string} type - Hata tipi
 */
export function handleError(error, type) {
    const message = ERROR_MESSAGES[type] || ERROR_MESSAGES.UNKNOWN_ERROR;
    showNotification(message, 'error');
    console.error(error);
}

/**
 * Sistem hatası yönetimi
 * @param {Error} error - Hata objesi
 */
export function handleSystemError(error) {
    const message = ERROR_MESSAGES[error.type] || ERROR_MESSAGES.UNKNOWN_ERROR;
    showSystemNotification(message, 'error');
}

/**
 * Tarayıcı uyumluluk kontrolü
 * @returns {Object} Uyumluluk durumu ve eksik özellikler
 */
export function checkBrowserCompatibility() {
    const requiredFeatures = {
        webrtc: () => !!window.RTCPeerConnection,
        mediaDevices: () => !!navigator.mediaDevices,
        getUserMedia: () => !!navigator.mediaDevices?.getUserMedia,
        webSocket: () => !!window.WebSocket,
        screen: () => !!navigator.mediaDevices?.getDisplayMedia
    };
    
    const missingFeatures = Object.entries(requiredFeatures)
        .filter(([, test]) => !test())
        .map(([feature]) => feature);
    
    if (missingFeatures.length > 0) {
        handleError({
            type: 'BROWSER_ERROR',
            details: missingFeatures
        });
    }
    
    return {
        compatible: missingFeatures.length === 0,
        missingFeatures
    };
}

/**
 * Bildirim gösterme
 * @param {string} message - Bildirim mesajı
 * @param {string} type - Bildirim tipi
 */
function showNotification(message, type = 'info') {
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

/**
 * Sistem bildirimi gösterme
 * @param {string} message - Bildirim mesajı
 * @param {string} type - Bildirim tipi
 */
function showSystemNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `system-notification ${type}`;
    notification.textContent = message;
    
    const container = document.getElementById('system-notification-container');
    if (container) {
        container.appendChild(notification);
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }
} 