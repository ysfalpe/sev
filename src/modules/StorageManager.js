import { ERROR_MESSAGES } from '../config/constants.js';

export class StorageManager {
    constructor(securityManager) {
        this.securityManager = securityManager;
        this.encryptionKey = null;
        this.storagePrefix = 'secure_';
        this.sensitiveKeys = new Set(['token', 'auth', 'key', 'password', 'secret']);
        this.maxStorageSize = 5 * 1024 * 1024; // 5MB
        this.encryptedStorage = new Map();
        
        // IndexedDB için veritabanı ayarları
        this.dbName = 'secureStorage';
        this.dbVersion = 1;
        this.db = null;
    }

    async initialize() {
        try {
            // Şifreleme anahtarını oluştur veya al
            await this.initializeEncryptionKey();
            
            // IndexedDB'yi başlat
            await this.initializeDatabase();
            
            // Depolama limitlerini kontrol et
            await this.checkStorageLimits();
            
            // Periyodik temizlik zamanlayıcısı
            this.startCleanupTimer();
        } catch (error) {
            console.error('Depolama başlatma hatası:', error);
            throw new Error('Güvenli depolama başlatılamadı');
        }
    }

    async initializeEncryptionKey() {
        try {
            // Mevcut anahtarı kontrol et
            const storedKey = localStorage.getItem('encryptionKey');
            
            if (storedKey) {
                // Anahtarı içe aktar
                const keyData = JSON.parse(storedKey);
                this.encryptionKey = await crypto.subtle.importKey(
                    'jwk',
                    keyData,
                    {
                        name: 'AES-GCM',
                        length: 256
                    },
                    true,
                    ['encrypt', 'decrypt']
                );
            } else {
                // Yeni anahtar oluştur
                this.encryptionKey = await crypto.subtle.generateKey(
                    {
                        name: 'AES-GCM',
                        length: 256
                    },
                    true,
                    ['encrypt', 'decrypt']
                );
                
                // Anahtarı dışa aktar ve sakla
                const exportedKey = await crypto.subtle.exportKey('jwk', this.encryptionKey);
                localStorage.setItem('encryptionKey', JSON.stringify(exportedKey));
            }
        } catch (error) {
            console.error('Şifreleme anahtarı hatası:', error);
            throw error;
        }
    }

    async initializeDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => {
                reject(new Error('Veritabanı açılamadı'));
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Şifreli veri deposu
                if (!db.objectStoreNames.contains('encryptedData')) {
                    const store = db.createObjectStore('encryptedData', { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    async setItem(key, value, options = {}) {
        try {
            // Hassas veri kontrolü
            if (this.isSensitiveKey(key)) {
                if (!options.allowSensitive) {
                    throw new Error('Hassas veri güvenli olmayan şekilde saklanamaz');
                }
                value = await this.encryptData(value);
            }
            
            // Boyut kontrolü
            const size = this.calculateSize(value);
            if (size > this.maxStorageSize) {
                throw new Error('Depolama boyutu limiti aşıldı');
            }
            
            // Veriyi şifrele ve sakla
            const encryptedData = {
                id: this.storagePrefix + key,
                value: await this.encryptData(value),
                timestamp: Date.now(),
                metadata: {
                    size,
                    type: typeof value,
                    encrypted: true
                }
            };
            
            await this.saveToDatabase(encryptedData);
            
            // Güvenlik logu
            this.securityManager.logSecurityEvent(
                'Veri güvenli şekilde depolandı',
                this.securityManager.LOG_LEVELS.INFO,
                { key, size }
            );
            
            return true;
        } catch (error) {
            console.error('Veri depolama hatası:', error);
            throw error;
        }
    }

    async getItem(key) {
        try {
            const data = await this.getFromDatabase(this.storagePrefix + key);
            
            if (!data) return null;
            
            // Veriyi çöz
            const decryptedValue = await this.decryptData(data.value);
            
            // Erişim logu
            this.securityManager.logSecurityEvent(
                'Veriye erişildi',
                this.securityManager.LOG_LEVELS.INFO,
                { key }
            );
            
            return decryptedValue;
        } catch (error) {
            console.error('Veri okuma hatası:', error);
            throw error;
        }
    }

    async removeItem(key) {
        try {
            await this.removeFromDatabase(this.storagePrefix + key);
            
            // Silme logu
            this.securityManager.logSecurityEvent(
                'Veri silindi',
                this.securityManager.LOG_LEVELS.INFO,
                { key }
            );
            
            return true;
        } catch (error) {
            console.error('Veri silme hatası:', error);
            throw error;
        }
    }

    async encryptData(data) {
        try {
            // Veriyi string'e çevir
            const jsonData = JSON.stringify(data);
            const encodedData = new TextEncoder().encode(jsonData);
            
            // IV oluştur
            const iv = crypto.getRandomValues(new Uint8Array(12));
            
            // Veriyi şifrele
            const encryptedData = await crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                this.encryptionKey,
                encodedData
            );
            
            // IV ve şifreli veriyi birleştir
            const encryptedArray = new Uint8Array(iv.length + encryptedData.byteLength);
            encryptedArray.set(iv);
            encryptedArray.set(new Uint8Array(encryptedData), iv.length);
            
            // Base64'e çevir
            return btoa(String.fromCharCode.apply(null, encryptedArray));
        } catch (error) {
            console.error('Şifreleme hatası:', error);
            throw error;
        }
    }

    async decryptData(encryptedData) {
        try {
            // Base64'ten çevir
            const encryptedArray = new Uint8Array(
                atob(encryptedData).split('').map(char => char.charCodeAt(0))
            );
            
            // IV ve şifreli veriyi ayır
            const iv = encryptedArray.slice(0, 12);
            const data = encryptedArray.slice(12);
            
            // Veriyi çöz
            const decryptedData = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                this.encryptionKey,
                data
            );
            
            // JSON'a çevir
            const decodedData = new TextDecoder().decode(decryptedData);
            return JSON.parse(decodedData);
        } catch (error) {
            console.error('Şifre çözme hatası:', error);
            throw error;
        }
    }

    async saveToDatabase(data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['encryptedData'], 'readwrite');
            const store = transaction.objectStore('encryptedData');
            
            const request = store.put(data);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error('Veritabanına yazma hatası'));
        });
    }

    async getFromDatabase(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['encryptedData'], 'readonly');
            const store = transaction.objectStore('encryptedData');
            
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(new Error('Veritabanından okuma hatası'));
        });
    }

    async removeFromDatabase(key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['encryptedData'], 'readwrite');
            const store = transaction.objectStore('encryptedData');
            
            const request = store.delete(key);
            
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(new Error('Veritabanından silme hatası'));
        });
    }

    isSensitiveKey(key) {
        return this.sensitiveKeys.has(key.toLowerCase()) || 
               Array.from(this.sensitiveKeys).some(sensitive => 
                   key.toLowerCase().includes(sensitive)
               );
    }

    calculateSize(data) {
        const str = typeof data === 'string' ? data : JSON.stringify(data);
        return new Blob([str]).size;
    }

    async checkStorageLimits() {
        try {
            const transaction = this.db.transaction(['encryptedData'], 'readonly');
            const store = transaction.objectStore('encryptedData');
            const index = store.index('timestamp');
            
            const request = index.openCursor();
            let totalSize = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    totalSize += cursor.value.metadata.size;
                    cursor.continue();
                } else {
                    if (totalSize > this.maxStorageSize) {
                        this.cleanupOldData();
                    }
                }
            };
        } catch (error) {
            console.error('Depolama limit kontrolü hatası:', error);
        }
    }

    async cleanupOldData() {
        try {
            const transaction = this.db.transaction(['encryptedData'], 'readwrite');
            const store = transaction.objectStore('encryptedData');
            const index = store.index('timestamp');
            
            // En eski verileri sil
            const request = index.openCursor();
            let deletedSize = 0;
            
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor && deletedSize < this.maxStorageSize * 0.2) {
                    deletedSize += cursor.value.metadata.size;
                    store.delete(cursor.value.id);
                    cursor.continue();
                }
            };
        } catch (error) {
            console.error('Veri temizleme hatası:', error);
        }
    }

    startCleanupTimer() {
        // Her 6 saatte bir temizlik yap
        setInterval(() => {
            this.checkStorageLimits();
        }, 21600000);
    }

    async clear() {
        try {
            const transaction = this.db.transaction(['encryptedData'], 'readwrite');
            const store = transaction.objectStore('encryptedData');
            
            await store.clear();
            
            // Temizlik logu
            this.securityManager.logSecurityEvent(
                'Tüm veriler temizlendi',
                this.securityManager.LOG_LEVELS.INFO
            );
            
            return true;
        } catch (error) {
            console.error('Veri temizleme hatası:', error);
            throw error;
        }
    }
} 