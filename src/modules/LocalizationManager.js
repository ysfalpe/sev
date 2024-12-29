export class LocalizationManager {
    constructor() {
        this.currentLocale = 'tr';
        this.fallbackLocale = 'en';
        this.translations = new Map();
        this.loadedLocales = new Set();
        this.observers = new Set();
        this.dateTimeFormatter = null;
        this.numberFormatter = null;
        this.pluralRules = null;
        
        this.init();
    }

    async init() {
        // Tarayıcı dilini al
        const browserLocale = navigator.language.split('-')[0];
        
        // Desteklenen dilleri kontrol et
        if (this.isLocaleSupported(browserLocale)) {
            this.currentLocale = browserLocale;
        }

        // Formatters'ı başlat
        this.initializeFormatters();
        
        // Varsayılan dili yükle
        await this.loadLocale(this.currentLocale);
    }

    isLocaleSupported(locale) {
        return ['tr', 'en', 'de', 'fr', 'es'].includes(locale);
    }

    initializeFormatters() {
        try {
            // Tarih formatı
            this.dateTimeFormatter = new Intl.DateTimeFormat(this.currentLocale, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });

            // Sayı formatı
            this.numberFormatter = new Intl.NumberFormat(this.currentLocale, {
                style: 'decimal',
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            });

            // Çoğul kuralları
            this.pluralRules = new Intl.PluralRules(this.currentLocale);
        } catch (error) {
            console.error('Formatlayıcı başlatma hatası:', error);
        }
    }

    async loadLocale(locale) {
        if (this.loadedLocales.has(locale)) {
            return;
        }

        try {
            const response = await fetch(`/locales/${locale}.json`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const translations = await response.json();
            this.translations.set(locale, this.flattenTranslations(translations));
            this.loadedLocales.add(locale);
            
            // Yeni dil yüklendiğinde observers'ları bilgilendir
            if (locale === this.currentLocale) {
                this.notifyObservers();
            }
        } catch (error) {
            console.error(`${locale} dili yüklenirken hata:`, error);
            
            // Yedek dile geç
            if (locale !== this.fallbackLocale) {
                await this.loadLocale(this.fallbackLocale);
            }
        }
    }

    flattenTranslations(obj, prefix = '') {
        const flattened = new Map();
        
        for (const [key, value] of Object.entries(obj)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                const nested = this.flattenTranslations(value, fullKey);
                for (const [nestedKey, nestedValue] of nested) {
                    flattened.set(nestedKey, nestedValue);
                }
            } else {
                flattened.set(fullKey, value);
            }
        }
        
        return flattened;
    }

    async setLocale(locale) {
        if (!this.isLocaleSupported(locale)) {
            console.warn(`Desteklenmeyen dil: ${locale}`);
            return false;
        }

        if (!this.loadedLocales.has(locale)) {
            await this.loadLocale(locale);
        }

        this.currentLocale = locale;
        this.initializeFormatters();
        this.notifyObservers();
        
        // Dil tercihini kaydet
        this.saveLocalePreference(locale);
        
        return true;
    }

    saveLocalePreference(locale) {
        try {
            localStorage.setItem('preferredLocale', locale);
        } catch (error) {
            console.warn('Dil tercihi kaydedilemedi:', error);
        }
    }

    loadLocalePreference() {
        try {
            return localStorage.getItem('preferredLocale');
        } catch (error) {
            console.warn('Dil tercihi yüklenemedi:', error);
            return null;
        }
    }

    translate(key, params = {}) {
        // Mevcut dilde çeviriyi bul
        let translation = this.translations.get(this.currentLocale)?.get(key);
        
        // Mevcut dilde çeviri yoksa yedek dile bak
        if (!translation && this.currentLocale !== this.fallbackLocale) {
            translation = this.translations.get(this.fallbackLocale)?.get(key);
        }
        
        // Çeviri bulunamadıysa anahtarı döndür
        if (!translation) {
            console.warn(`Çeviri bulunamadı: ${key}`);
            return key;
        }
        
        // Parametreleri değiştir
        return this.interpolate(translation, params);
    }

    interpolate(text, params) {
        return text.replace(/\{(\w+)\}/g, (match, key) => {
            if (params.hasOwnProperty(key)) {
                return String(params[key]);
            }
            console.warn(`Parametre bulunamadı: ${key}`);
            return match;
        });
    }

    translatePlural(key, count, params = {}) {
        const pluralForm = this.pluralRules.select(count);
        const pluralKey = `${key}.${pluralForm}`;
        
        return this.translate(pluralKey, { ...params, count });
    }

    formatDate(date, options = {}) {
        try {
            if (typeof date === 'string') {
                date = new Date(date);
            }
            
            const formatter = new Intl.DateTimeFormat(this.currentLocale, options);
            return formatter.format(date);
        } catch (error) {
            console.error('Tarih formatlama hatası:', error);
            return date.toString();
        }
    }

    formatNumber(number, options = {}) {
        try {
            const formatter = new Intl.NumberFormat(this.currentLocale, options);
            return formatter.format(number);
        } catch (error) {
            console.error('Sayı formatlama hatası:', error);
            return number.toString();
        }
    }

    formatCurrency(amount, currency = 'TRY') {
        try {
            const formatter = new Intl.NumberFormat(this.currentLocale, {
                style: 'currency',
                currency
            });
            return formatter.format(amount);
        } catch (error) {
            console.error('Para birimi formatlama hatası:', error);
            return `${amount} ${currency}`;
        }
    }

    formatRelativeTime(date) {
        try {
            const now = new Date();
            const diff = date - now;
            const seconds = Math.floor(Math.abs(diff) / 1000);
            
            const formatter = new Intl.RelativeTimeFormat(this.currentLocale, {
                numeric: 'auto'
            });
            
            if (seconds < 60) {
                return formatter.format(Math.floor(diff / 1000), 'second');
            } else if (seconds < 3600) {
                return formatter.format(Math.floor(diff / 60000), 'minute');
            } else if (seconds < 86400) {
                return formatter.format(Math.floor(diff / 3600000), 'hour');
            } else {
                return formatter.format(Math.floor(diff / 86400000), 'day');
            }
        } catch (error) {
            console.error('Göreceli zaman formatlama hatası:', error);
            return date.toLocaleString(this.currentLocale);
        }
    }

    addObserver(callback) {
        this.observers.add(callback);
    }

    removeObserver(callback) {
        this.observers.delete(callback);
    }

    notifyObservers() {
        for (const callback of this.observers) {
            try {
                callback(this.currentLocale);
            } catch (error) {
                console.error('Observer bilgilendirme hatası:', error);
            }
        }
    }

    // DOM elementlerini çevir
    translateElement(element) {
        // data-i18n özniteliği olan elementleri bul
        const elements = element.querySelectorAll('[data-i18n]');
        
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n');
            const params = {};
            
            // data-i18n-params özniteliğinden parametreleri al
            const paramsAttr = el.getAttribute('data-i18n-params');
            if (paramsAttr) {
                try {
                    Object.assign(params, JSON.parse(paramsAttr));
                } catch (error) {
                    console.warn('Parametre ayrıştırma hatası:', error);
                }
            }
            
            // Çeviriyi uygula
            const translation = this.translate(key, params);
            
            // HTML içeriği varsa ve güvenli olarak işaretlenmişse
            if (el.hasAttribute('data-i18n-html')) {
                el.innerHTML = translation;
            } else {
                el.textContent = translation;
            }
            
            // Placeholder özniteliği
            if (el.hasAttribute('data-i18n-placeholder')) {
                el.placeholder = translation;
            }
            
            // Title özniteliği
            if (el.hasAttribute('data-i18n-title')) {
                el.title = translation;
            }
            
            // Alt özniteliği
            if (el.hasAttribute('data-i18n-alt')) {
                el.alt = translation;
            }
        });
    }

    // Tüm sayfayı çevir
    translatePage() {
        this.translateElement(document.body);
    }

    // Dil değişikliğini dinle ve sayfayı otomatik çevir
    observeLanguageChange() {
        this.addObserver(() => {
            this.translatePage();
        });
    }

    // Dil listesini al
    getAvailableLocales() {
        return Array.from(this.loadedLocales);
    }

    // Mevcut dili al
    getCurrentLocale() {
        return this.currentLocale;
    }

    // Yedek dili al
    getFallbackLocale() {
        return this.fallbackLocale;
    }

    // Dil yönünü al (RTL/LTR)
    getTextDirection() {
        return ['ar', 'he', 'fa'].includes(this.currentLocale) ? 'rtl' : 'ltr';
    }
}

export default LocalizationManager; 