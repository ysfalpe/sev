import { errorManager } from '../error-management.js';

/**
 * Tarayıcı uyumluluğunu kontrol eder
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
        errorManager.handleError({
            type: 'BROWSER',
            details: missingFeatures
        }, 'BROWSER');
    }
    
    return {
        compatible: missingFeatures.length === 0,
        missingFeatures
    };
}

/**
 * Medya cihazlarını kontrol eder
 * @returns {Promise<boolean>} Medya cihazlarının kullanılabilirlik durumu
 */
export async function checkMediaDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasAudioInput = devices.some(device => device.kind === 'audioinput');
        const hasVideoInput = devices.some(device => device.kind === 'videoinput');
        
        if (!hasAudioInput || !hasVideoInput) {
            throw new Error('Gerekli medya cihazları bulunamadı');
        }
        
        return true;
    } catch (error) {
        errorManager.handleError(error, 'MEDIA');
        return false;
    }
}

/**
 * Ekran paylaşımı özelliğini kontrol eder
 * @returns {Promise<boolean>} Ekran paylaşımı özelliğinin kullanılabilirlik durumu
 */
export async function checkScreenShare() {
    try {
        if (!navigator.mediaDevices?.getDisplayMedia) {
            throw new Error('Ekran paylaşımı özelliği desteklenmiyor');
        }
        return true;
    } catch (error) {
        errorManager.handleError(error, 'SCREEN_SHARE');
        return false;
    }
} 