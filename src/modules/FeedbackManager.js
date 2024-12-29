export class FeedbackManager {
    constructor() {
        this.notifications = [];
        this.maxNotifications = 5;
        this.defaultDuration = 5000;
        
        this.templates = {
            error: {
                icon: 'error',
                className: 'notification-error',
                duration: 7000,
                sound: 'error.mp3'
            },
            success: {
                icon: 'check',
                className: 'notification-success',
                duration: 4000,
                sound: 'success.mp3'
            },
            warning: {
                icon: 'warning',
                className: 'notification-warning',
                duration: 6000,
                sound: 'warning.mp3'
            },
            info: {
                icon: 'info',
                className: 'notification-info',
                duration: 5000,
                sound: 'info.mp3'
            },
            loading: {
                icon: 'loading',
                className: 'notification-loading',
                duration: null,
                sound: null
            }
        };

        this.errorMessages = {
            network: {
                title: 'Bağlantı Hatası',
                message: 'İnternet bağlantınızı kontrol edip tekrar deneyin.',
                action: 'Tekrar Dene'
            },
            validation: {
                title: 'Geçersiz Giriş',
                message: 'Lütfen girdiğiniz bilgileri kontrol edin.',
                action: 'Düzelt'
            },
            auth: {
                title: 'Oturum Hatası',
                message: 'Oturumunuz sonlanmış. Lütfen tekrar giriş yapın.',
                action: 'Giriş Yap'
            },
            permission: {
                title: 'Yetkisiz İşlem',
                message: 'Bu işlem için yetkiniz bulunmuyor.',
                action: 'Ana Sayfa'
            },
            server: {
                title: 'Sunucu Hatası',
                message: 'Bir sorun oluştu. Lütfen daha sonra tekrar deneyin.',
                action: 'Tamam'
            }
        };

        this.initialize();
    }

    initialize() {
        this.createNotificationContainer();
        this.setupSoundEffects();
        this.setupKeyboardShortcuts();
        this.setupProgressTracking();
    }

    createNotificationContainer() {
        this.container = document.createElement('div');
        this.container.id = 'notification-container';
        this.container.setAttribute('role', 'alert');
        this.container.setAttribute('aria-live', 'polite');
        document.body.appendChild(this.container);
    }

    setupSoundEffects() {
        this.sounds = {};
        Object.entries(this.templates).forEach(([type, template]) => {
            if (template.sound) {
                this.sounds[type] = new Audio(`/assets/sounds/${template.sound}`);
                this.sounds[type].load();
            }
        });
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Escape tuşu ile tüm bildirimleri kapat
            if (e.key === 'Escape') {
                this.clearAll();
            }
        });
    }

    setupProgressTracking() {
        this.progressElements = new Map();
        this.activeOperations = new Map();
    }

    show(options) {
        const {
            type = 'info',
            title,
            message,
            duration = this.templates[type].duration || this.defaultDuration,
            action,
            autoClose = true,
            sound = true,
            progress = false
        } = options;

        // Maksimum bildirim sayısını kontrol et
        if (this.notifications.length >= this.maxNotifications) {
            this.notifications.shift();
            const firstNotification = this.container.firstChild;
            if (firstNotification) {
                this.animateOut(firstNotification).then(() => {
                    this.container.removeChild(firstNotification);
                });
            }
        }

        const notification = this.createNotificationElement({
            type,
            title,
            message,
            action,
            progress
        });

        // Bildirimi göster
        this.container.appendChild(notification);
        this.notifications.push(notification);

        // Animasyon ve ses efekti
        this.animateIn(notification);
        if (sound && this.sounds[type]) {
            this.sounds[type].play().catch(() => {});
        }

        // Otomatik kapatma
        if (autoClose && duration) {
            setTimeout(() => {
                this.close(notification);
            }, duration);
        }

        return notification;
    }

    createNotificationElement({ type, title, message, action, progress }) {
        const template = this.templates[type];
        const notification = document.createElement('div');
        
        notification.className = `notification ${template.className}`;
        notification.setAttribute('role', 'alert');
        
        // İkon
        const icon = document.createElement('div');
        icon.className = 'notification-icon';
        icon.innerHTML = this.getIconSVG(template.icon);
        notification.appendChild(icon);
        
        // İçerik
        const content = document.createElement('div');
        content.className = 'notification-content';
        
        if (title) {
            const titleElement = document.createElement('div');
            titleElement.className = 'notification-title';
            titleElement.textContent = title;
            content.appendChild(titleElement);
        }
        
        if (message) {
            const messageElement = document.createElement('div');
            messageElement.className = 'notification-message';
            messageElement.textContent = message;
            content.appendChild(messageElement);
        }
        
        notification.appendChild(content);
        
        // Aksiyon butonu
        if (action) {
            const button = document.createElement('button');
            button.className = 'notification-action';
            button.textContent = action.text;
            button.onclick = action.callback;
            notification.appendChild(button);
        }
        
        // İlerleme çubuğu
        if (progress) {
            const progressBar = document.createElement('div');
            progressBar.className = 'notification-progress';
            const progressInner = document.createElement('div');
            progressInner.className = 'notification-progress-inner';
            progressBar.appendChild(progressInner);
            notification.appendChild(progressBar);
            this.progressElements.set(notification, progressInner);
        }
        
        // Kapatma butonu
        const closeButton = document.createElement('button');
        closeButton.className = 'notification-close';
        closeButton.setAttribute('aria-label', 'Bildirimi kapat');
        closeButton.innerHTML = '×';
        closeButton.onclick = () => this.close(notification);
        notification.appendChild(closeButton);
        
        return notification;
    }

    updateProgress(notification, progress) {
        const progressElement = this.progressElements.get(notification);
        if (progressElement) {
            progressElement.style.width = `${Math.min(100, Math.max(0, progress))}%`;
        }
    }

    startOperation(id, options = {}) {
        const notification = this.show({
            type: 'loading',
            ...options,
            progress: true,
            autoClose: false
        });
        
        this.activeOperations.set(id, notification);
        return notification;
    }

    updateOperation(id, progress, message) {
        const notification = this.activeOperations.get(id);
        if (notification) {
            this.updateProgress(notification, progress);
            if (message) {
                notification.querySelector('.notification-message').textContent = message;
            }
        }
    }

    finishOperation(id, options = {}) {
        const notification = this.activeOperations.get(id);
        if (notification) {
            this.activeOperations.delete(id);
            this.close(notification);
            
            if (options.showSuccess) {
                this.show({
                    type: 'success',
                    ...options
                });
            }
        }
    }

    error(error, options = {}) {
        const template = this.errorMessages[error.code] || this.errorMessages.server;
        
        return this.show({
            type: 'error',
            title: template.title,
            message: error.message || template.message,
            action: options.action || {
                text: template.action,
                callback: options.onAction
            },
            ...options
        });
    }

    success(message, options = {}) {
        return this.show({
            type: 'success',
            message,
            ...options
        });
    }

    warning(message, options = {}) {
        return this.show({
            type: 'warning',
            message,
            ...options
        });
    }

    info(message, options = {}) {
        return this.show({
            type: 'info',
            message,
            ...options
        });
    }

    loading(message, options = {}) {
        return this.show({
            type: 'loading',
            message,
            autoClose: false,
            ...options
        });
    }

    close(notification) {
        const index = this.notifications.indexOf(notification);
        if (index > -1) {
            this.notifications.splice(index, 1);
            this.animateOut(notification).then(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            });
        }
    }

    clearAll() {
        this.notifications.forEach(notification => {
            this.close(notification);
        });
    }

    animateIn(element) {
        return element.animate([
            { opacity: 0, transform: 'translateX(100%)' },
            { opacity: 1, transform: 'translateX(0)' }
        ], {
            duration: 300,
            easing: 'ease-out'
        }).finished;
    }

    animateOut(element) {
        return element.animate([
            { opacity: 1, transform: 'translateX(0)' },
            { opacity: 0, transform: 'translateX(100%)' }
        ], {
            duration: 300,
            easing: 'ease-in'
        }).finished;
    }

    getIconSVG(icon) {
        const icons = {
            error: '<svg>...</svg>',
            success: '<svg>...</svg>',
            warning: '<svg>...</svg>',
            info: '<svg>...</svg>',
            loading: '<svg>...</svg>'
        };
        return icons[icon] || '';
    }
}

export { FeedbackManager }; 