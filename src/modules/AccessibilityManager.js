export class AccessibilityManager {
    constructor() {
        this.settings = {
            highContrast: false,
            largeText: false,
            reducedMotion: false,
            screenReader: false,
            keyboardOnly: false,
            colorBlindMode: 'none' // none, protanopia, deuteranopia, tritanopia
        };

        this.init();
    }

    init() {
        this.loadSettings();
        this.setupEventListeners();
        this.applySettings();
        this.setupKeyboardNavigation();
        this.setupFocusManagement();
        this.setupARIALabels();
    }

    loadSettings() {
        try {
            const savedSettings = localStorage.getItem('accessibility_settings');
            if (savedSettings) {
                this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
            }
        } catch (error) {
            console.error('Error loading accessibility settings:', error);
        }
    }

    saveSettings() {
        try {
            localStorage.setItem('accessibility_settings', JSON.stringify(this.settings));
        } catch (error) {
            console.error('Error saving accessibility settings:', error);
        }
    }

    setupEventListeners() {
        // Sistem ayarları değişikliklerini dinle
        if (window.matchMedia) {
            window.matchMedia('(prefers-color-scheme: dark)').addListener(() => {
                this.updateColorScheme();
            });

            window.matchMedia('(prefers-reduced-motion: reduce)').addListener(() => {
                this.updateMotionPreference();
            });
        }

        // Klavye olaylarını dinle
        document.addEventListener('keydown', (e) => this.handleKeyboardNavigation(e));
        
        // Focus olaylarını dinle
        document.addEventListener('focusin', (e) => this.handleFocusIn(e));
        document.addEventListener('focusout', (e) => this.handleFocusOut(e));
    }

    applySettings() {
        document.documentElement.classList.toggle('high-contrast', this.settings.highContrast);
        document.documentElement.classList.toggle('large-text', this.settings.largeText);
        document.documentElement.classList.toggle('reduced-motion', this.settings.reducedMotion);
        document.documentElement.classList.toggle('keyboard-only', this.settings.keyboardOnly);
        
        if (this.settings.colorBlindMode !== 'none') {
            document.documentElement.setAttribute('data-color-blind-mode', this.settings.colorBlindMode);
        } else {
            document.documentElement.removeAttribute('data-color-blind-mode');
        }

        this.updateARIALabels();
        this.saveSettings();
    }

    setupKeyboardNavigation() {
        // Skip link oluştur
        const skipLink = document.createElement('a');
        skipLink.href = '#main-content';
        skipLink.className = 'skip-link';
        skipLink.textContent = 'Ana içeriğe geç';
        document.body.insertBefore(skipLink, document.body.firstChild);

        // Focus tuzaklarını önle
        this.setupFocusTraps();
    }

    setupFocusTraps() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            const focusableElements = modal.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );

            if (focusableElements.length > 0) {
                const firstFocusable = focusableElements[0];
                const lastFocusable = focusableElements[focusableElements.length - 1];

                modal.addEventListener('keydown', (e) => {
                    if (e.key === 'Tab') {
                        if (e.shiftKey) {
                            if (document.activeElement === firstFocusable) {
                                lastFocusable.focus();
                                e.preventDefault();
                            }
                        } else {
                            if (document.activeElement === lastFocusable) {
                                firstFocusable.focus();
                                e.preventDefault();
                            }
                        }
                    }
                });
            }
        });
    }

    setupFocusManagement() {
        // Focus görünürlüğünü iyileştir
        const style = document.createElement('style');
        style.textContent = `
            *:focus {
                outline: 3px solid #4A90E2 !important;
                outline-offset: 2px !important;
            }
            
            *:focus:not(:focus-visible) {
                outline: none !important;
            }
            
            *:focus-visible {
                outline: 3px solid #4A90E2 !important;
                outline-offset: 2px !important;
            }
        `;
        document.head.appendChild(style);
    }

    setupARIALabels() {
        // Dinamik içerik için live region'lar oluştur
        const notifications = document.createElement('div');
        notifications.setAttribute('role', 'status');
        notifications.setAttribute('aria-live', 'polite');
        notifications.className = 'sr-only';
        document.body.appendChild(notifications);

        const alerts = document.createElement('div');
        alerts.setAttribute('role', 'alert');
        alerts.setAttribute('aria-live', 'assertive');
        alerts.className = 'sr-only';
        document.body.appendChild(alerts);
    }

    updateARIALabels() {
        // Form elemanları için eksik label'ları tamamla
        document.querySelectorAll('input, select, textarea').forEach(element => {
            if (!element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby')) {
                const label = element.closest('label') || document.querySelector(`label[for="${element.id}"]`);
                if (label) {
                    element.setAttribute('aria-label', label.textContent.trim());
                }
            }
        });

        // Butonlar için eksik açıklamaları tamamla
        document.querySelectorAll('button').forEach(button => {
            if (!button.hasAttribute('aria-label') && !button.textContent.trim()) {
                const icon = button.querySelector('i, svg');
                if (icon) {
                    const iconClass = icon.className || icon.getAttribute('data-icon');
                    button.setAttribute('aria-label', this.getIconDescription(iconClass));
                }
            }
        });
    }

    getIconDescription(iconClass) {
        // Icon sınıflarına göre açıklama döndür
        const iconMap = {
            'icon-close': 'Kapat',
            'icon-menu': 'Menü',
            'icon-search': 'Ara',
            'icon-settings': 'Ayarlar'
            // Diğer icon açıklamaları eklenebilir
        };

        for (const [className, description] of Object.entries(iconMap)) {
            if (iconClass.includes(className)) {
                return description;
            }
        }

        return 'Buton';
    }

    handleKeyboardNavigation(event) {
        // Tab tuşu ile gezinme
        if (event.key === 'Tab') {
            document.body.classList.add('keyboard-navigation');
        }

        // Escape tuşu ile modal/popup kapatma
        if (event.key === 'Escape') {
            const modal = document.querySelector('.modal[aria-modal="true"]');
            if (modal) {
                this.closeModal(modal);
            }
        }

        // Alt + 1: Ana içeriğe git
        if (event.altKey && event.key === '1') {
            event.preventDefault();
            const mainContent = document.getElementById('main-content');
            if (mainContent) {
                mainContent.focus();
            }
        }
    }

    handleFocusIn(event) {
        const target = event.target;
        
        // Focus ring'i göster
        target.classList.add('focus-visible');

        // Modal içinde focus kontrolü
        const modal = target.closest('.modal');
        if (modal && modal.getAttribute('aria-modal') === 'true') {
            const focusableElements = modal.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );
            
            if (!Array.from(focusableElements).includes(target)) {
                focusableElements[0].focus();
            }
        }
    }

    handleFocusOut(event) {
        // Focus ring'i kaldır
        event.target.classList.remove('focus-visible');
    }

    closeModal(modal) {
        modal.setAttribute('aria-modal', 'false');
        modal.setAttribute('aria-hidden', 'true');
        
        // Focus'u tetikleyen elemana geri döndür
        const trigger = document.querySelector(`[aria-controls="${modal.id}"]`);
        if (trigger) {
            trigger.focus();
        }
    }

    updateColorScheme() {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.classList.toggle('dark-theme', prefersDark);
    }

    updateMotionPreference() {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        this.settings.reducedMotion = prefersReducedMotion;
        this.applySettings();
    }

    // Ayarları değiştirme metodları
    toggleHighContrast() {
        this.settings.highContrast = !this.settings.highContrast;
        this.applySettings();
    }

    toggleLargeText() {
        this.settings.largeText = !this.settings.largeText;
        this.applySettings();
    }

    toggleReducedMotion() {
        this.settings.reducedMotion = !this.settings.reducedMotion;
        this.applySettings();
    }

    toggleKeyboardOnly() {
        this.settings.keyboardOnly = !this.settings.keyboardOnly;
        this.applySettings();
    }

    setColorBlindMode(mode) {
        this.settings.colorBlindMode = mode;
        this.applySettings();
    }

    // Yardımcı metodlar
    announceMessage(message, type = 'polite') {
        const container = document.querySelector(`[aria-live="${type}"]`);
        if (container) {
            container.textContent = message;
            
            // Mesajı temizle
            setTimeout(() => {
                container.textContent = '';
            }, 3000);
        }
    }

    checkContrast(foreground, background) {
        // Renk kontrastı hesaplama
        const rgb2hex = (rgb) => {
            if (rgb.startsWith('#')) return rgb;
            const values = rgb.match(/\d+/g);
            return `#${values.map(x => parseInt(x).toString(16).padStart(2, '0')).join('')}`;
        };

        const getLuminance = (hex) => {
            const rgb = parseInt(hex.slice(1), 16);
            const r = (rgb >> 16) & 0xff;
            const g = (rgb >> 8) & 0xff;
            const b = (rgb >> 0) & 0xff;
            
            const [rs, gs, bs] = [r / 255, g / 255, b / 255].map(val => {
                return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
            });
            
            return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
        };

        const hex1 = rgb2hex(foreground);
        const hex2 = rgb2hex(background);
        const l1 = getLuminance(hex1);
        const l2 = getLuminance(hex2);
        
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        return ratio;
    }

    validateAccessibility() {
        const issues = [];

        // Alt text kontrolü
        document.querySelectorAll('img').forEach(img => {
            if (!img.hasAttribute('alt')) {
                issues.push({
                    element: img,
                    issue: 'Missing alt text',
                    severity: 'error'
                });
            }
        });

        // Heading hiyerarşisi kontrolü
        let lastHeadingLevel = 0;
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
            const currentLevel = parseInt(heading.tagName.charAt(1));
            if (currentLevel - lastHeadingLevel > 1) {
                issues.push({
                    element: heading,
                    issue: 'Skipped heading level',
                    severity: 'warning'
                });
            }
            lastHeadingLevel = currentLevel;
        });

        // Form label kontrolü
        document.querySelectorAll('input, select, textarea').forEach(field => {
            if (!field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby')) {
                const label = document.querySelector(`label[for="${field.id}"]`);
                if (!label) {
                    issues.push({
                        element: field,
                        issue: 'Missing label',
                        severity: 'error'
                    });
                }
            }
        });

        // Kontrast kontrolü
        document.querySelectorAll('*').forEach(element => {
            const style = window.getComputedStyle(element);
            const foreground = style.color;
            const background = style.backgroundColor;
            
            if (background !== 'rgba(0, 0, 0, 0)') {
                const ratio = this.checkContrast(foreground, background);
                if (ratio < 4.5) {
                    issues.push({
                        element: element,
                        issue: 'Insufficient color contrast',
                        severity: 'warning',
                        details: `Contrast ratio: ${ratio.toFixed(2)}:1`
                    });
                }
            }
        });

        return issues;
    }
}

export default AccessibilityManager; 
export { AccessibilityManager }; 