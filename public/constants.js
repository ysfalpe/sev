// Genel hata mesajları
export const ERROR_MESSAGES = {
    CONNECTION: 'Bağlantı hatası oluştu',
    MEDIA: 'Medya cihazlarına erişim hatası',
    PERMISSION: 'İzin hatası',
    NETWORK: 'Ağ bağlantısı hatası',
    PEER: 'Eşler arası bağlantı hatası',
    UNKNOWN: 'Bilinmeyen bir hata oluştu'
};

// Güvenlik hata mesajları
export const SECURITY_ERROR_MESSAGES = {
    ENCRYPTION: 'Şifreleme hatası',
    CERTIFICATE: 'Sertifika hatası',
    PROTOCOL: 'Protokol hatası'
};

// Diğer sabitler
export const CONNECTION_TIMEOUT = 30000; // 30 saniye
export const MAX_MESSAGE_LENGTH = 1000;
export const PING_INTERVAL = 5000;
export const RECONNECT_ATTEMPTS = 3;
export const RECONNECT_DELAY = 2000;
export const QUALITY_CHECK_INTERVAL = 3000;
export const MESSAGE_RATE_LIMIT = 5; // 5 mesaj/saniye
export const ERROR_REPORT_INTERVAL = 60000; // 1 dakika
export const STORAGE_KEY = 'app_preferences';
export const KEYBOARD_SHORTCUTS = {
    toggleVideo: 'Alt+V',
    toggleAudio: 'Alt+A',
    endChat: 'Alt+E',
    nextPartner: 'Alt+N',
    toggleTheme: 'Alt+T'
}; 