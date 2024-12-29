// Hata mesajları
export const ERROR_MESSAGES = {
    // Genel hatalar
    CONNECTION: 'Bağlantı hatası oluştu',
    MEDIA: 'Medya cihazlarına erişim hatası',
    PERMISSION: 'İzin hatası',
    NETWORK: 'Ağ bağlantısı hatası',
    PEER: 'Eşler arası bağlantı hatası',
    UNKNOWN: 'Bilinmeyen bir hata oluştu',
    
    // Sistem hataları
    NETWORK_ERROR: 'Ağ bağlantısı hatası',
    MEDIA_ERROR: 'Medya erişim hatası',
    PERMISSION_ERROR: 'İzin hatası',
    BROWSER_ERROR: 'Tarayıcı uyumsuzluğu',
    PEER_ERROR: 'Bağlantı hatası',
    ROOM_ERROR: 'Oda erişim hatası',
    AUTH_ERROR: 'Kimlik doğrulama hatası',
    UNKNOWN_ERROR: 'Bilinmeyen hata'
};

// İzin grubu mesajları
export const PERMISSION_GROUP_MESSAGES = {
    chat: 'Sohbet İzinleri',
    media: 'Medya İzinleri',
    room: 'Oda İzinleri',
    user: 'Kullanıcı İzinleri',
    system: 'Sistem İzinleri'
};

// Kalite mesajları
export const QUALITY_MESSAGES = {
    excellent: 'Mükemmel',
    good: 'İyi',
    fair: 'Orta',
    poor: 'Zayıf',
    bad: 'Kötü'
};

// Güvenlik mesajları
export const SECURITY_MESSAGES = {
    ENCRYPTION: 'Şifreleme hatası',
    CERTIFICATE: 'Sertifika hatası',
    PROTOCOL: 'Protokol hatası'
}; 