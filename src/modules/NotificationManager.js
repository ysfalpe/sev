export class NotificationManager {
    constructor() {
        this.notifications = [];
        this.container = null;
        this.maxNotifications = 5;
        this.defaultDuration = 5000;
        this.position = 'top-right';
        this.spacing = 10;
        this.zIndex = 9999;
        this.sounds = {
            success: '/assets/sounds/success.mp3',
            error: '/assets/sounds/error.mp3',
            warning: '/assets/sounds/warning.mp3',
            info: '/assets/sounds/info.mp3'
        };
        
        this.init();
    }

    init() {
        this.createContainer();
        this.setupStyles();
        this.setupSoundEffects();
    }

    createContainer() {
        this.container = document.createElement('div');
        this.container.className = 'notification-container';
        this.container.setAttribute('role', 'alert');
        this.container.setAttribute('aria-live', 'polite');
        document.body.appendChild(this.container);
    }

    setupStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .notification-container {
                position: fixed;
                z-index: ${this.zIndex};
                display: flex;
                flex-direction: column;
                gap: ${this.spacing}px;
                max-width: 100%;
                pointer-events: none;
            }

            .notification-container.top-right {
                top: 20px;
                right: 20px;
            }

            .notification-container.top-left {
                top: 20px;
                left: 20px;
            }

            .notification-container.bottom-right {
                bottom: 20px;
                right: 20px;
            }

            .notification-container.bottom-left {
                bottom: 20px;
                left: 20px;
            }

            .notification {
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                padding: 16px;
                margin: 0;
                max-width: 350px;
                pointer-events: auto;
                display: flex;
                align-items: flex-start;
                gap: 12px;
                transform: translateX(120%);
                transition: transform 0.3s ease;
                position: relative;
                overflow: hidden;
            }

            .notification.show {
                transform: translateX(0);
            }

            .notification.success {
                border-left: 4px solid #4CAF50;
            }

            .notification.error {
                border-left: 4px solid #f44336;
            }

            .notification.warning {
                border-left: 4px solid #ff9800;
            }

            .notification.info {
                border-left: 4px solid #2196F3;
            }

            .notification-icon {
                width: 24px;
                height: 24px;
                flex-shrink: 0;
            }

            .notification-content {
                flex-grow: 1;
            }

            .notification-title {
                margin: 0 0 4px;
                font-weight: 600;
                font-size: 16px;
                line-height: 1.4;
            }

            .notification-message {
                margin: 0;
                font-size: 14px;
                line-height: 1.4;
                color: #666;
            }

            .notification-close {
                background: none;
                border: none;
                padding: 4px;
                cursor: pointer;
                color: #999;
                font-size: 18px;
                line-height: 1;
                transition: color 0.2s;
            }

            .notification-close:hover {
                color: #333;
            }

            .notification-progress {
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                height: 3px;
                background: rgba(0, 0, 0, 0.1);
            }

            .notification-progress-bar {
                height: 100%;
                background: currentColor;
                transition: width linear;
            }

            @media (max-width: 480px) {
                .notification-container {
                    left: 16px;
                    right: 16px;
                }

                .notification {
                    width: 100%;
                    max-width: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    setupSoundEffects() {
        this.audioElements = {};
        Object.entries(this.sounds).forEach(([type, src]) => {
            const audio = new Audio(src);
            audio.volume = 0.5;
            this.audioElements[type] = audio;
        });
    }

    show(options = {}) {
        const {
            type = 'info',
            title = '',
            message = '',
            duration = this.defaultDuration,
            closable = true,
            progress = true,
            sound = true,
            icon = true
        } = options;

        // Maksimum bildirim sayısı kontrolü
        if (this.notifications.length >= this.maxNotifications) {
            this.notifications[0].close();
        }

        // Bildirim elementi oluştur
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.setAttribute('role', 'alert');

        // İkon
        let iconHtml = '';
        if (icon) {
            iconHtml = this.getIconHtml(type);
        }

        // İçerik
        notification.innerHTML = `
            ${iconHtml}
            <div class="notification-content">
                ${title ? `<h4 class="notification-title">${title}</h4>` : ''}
                <p class="notification-message">${message}</p>
            </div>
            ${closable ? '<button class="notification-close" aria-label="Kapat">&times;</button>' : ''}
            ${progress ? '<div class="notification-progress"><div class="notification-progress-bar"></div></div>' : ''}
        `;

        // Event listeners
        if (closable) {
            const closeButton = notification.querySelector('.notification-close');
            closeButton.addEventListener('click', () => this.close(notification));
        }

        // Container'a ekle
        this.container.appendChild(notification);

        // Animasyon için timeout
        setTimeout(() => {
            notification.classList.add('show');
        }, 50);

        // Progress bar
        let progressBar = null;
        if (progress && duration > 0) {
            progressBar = notification.querySelector('.notification-progress-bar');
            progressBar.style.width = '100%';
            progressBar.style.transition = `width ${duration}ms linear`;
            setTimeout(() => {
                progressBar.style.width = '0%';
            }, 50);
        }

        // Ses efekti
        if (sound && this.audioElements[type]) {
            this.audioElements[type].play().catch(() => {
                // Ses çalma hatası - sessiz devam et
            });
        }

        // Otomatik kapatma
        let timeoutId = null;
        if (duration > 0) {
            timeoutId = setTimeout(() => {
                this.close(notification);
            }, duration);
        }

        // Bildirim objesini kaydet
        const notificationObject = {
            element: notification,
            close: () => this.close(notification),
            timeoutId
        };

        this.notifications.push(notificationObject);

        return notificationObject;
    }

    success(message, options = {}) {
        return this.show({
            type: 'success',
            message,
            ...options
        });
    }

    error(message, options = {}) {
        return this.show({
            type: 'error',
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

    close(notification) {
        const index = this.notifications.findIndex(n => n.element === notification);
        if (index === -1) return;

        const notificationObject = this.notifications[index];

        // Timeout'u temizle
        if (notificationObject.timeoutId) {
            clearTimeout(notificationObject.timeoutId);
        }

        // Animasyonlu kapanış
        notification.classList.remove('show');
        
        setTimeout(() => {
            notification.remove();
            this.notifications.splice(index, 1);
        }, 300);
    }

    closeAll() {
        this.notifications.forEach(notification => {
            this.close(notification.element);
        });
    }

    setPosition(position) {
        this.position = position;
        this.container.className = `notification-container ${position}`;
    }

    setMaxNotifications(max) {
        this.maxNotifications = max;
    }

    setDefaultDuration(duration) {
        this.defaultDuration = duration;
    }

    setSoundEnabled(enabled) {
        Object.values(this.audioElements).forEach(audio => {
            audio.muted = !enabled;
        });
    }

    getIconHtml(type) {
        const icons = {
            success: `
                <svg class="notification-icon" viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2">
                    <path d="M20 6L9 17l-5-5"/>
                </svg>
            `,
            error: `
                <svg class="notification-icon" viewBox="0 0 24 24" fill="none" stroke="#f44336" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M15 9l-6 6M9 9l6 6"/>
                </svg>
            `,
            warning: `
                <svg class="notification-icon" viewBox="0 0 24 24" fill="none" stroke="#ff9800" stroke-width="2">
                    <path d="M12 9v4M12 17h.01"/>
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                </svg>
            `,
            info: `
                <svg class="notification-icon" viewBox="0 0 24 24" fill="none" stroke="#2196F3" stroke-width="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 16v-4M12 8h.01"/>
                </svg>
            `
        };

        return icons[type] || '';
    }
}

export default NotificationManager; 