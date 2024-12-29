export class InteractionManager {
    constructor() {
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.lastTap = 0;
        this.doubleTapDelay = 300;
        this.longPressDelay = 500;
        this.swipeThreshold = 50;
        this.pressTimer = null;
        this.activeGestures = new Set();
        this.gestureCallbacks = new Map();
        this.interactionHistory = [];
        this.maxHistoryLength = 50;
        
        this.init();
    }

    init() {
        this.setupTouchListeners();
        this.setupMouseListeners();
        this.setupKeyboardListeners();
        this.setupFeedback();
    }

    setupTouchListeners() {
        document.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: true });
        document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: true });
        document.addEventListener('touchend', (e) => this.handleTouchEnd(e));
        document.addEventListener('touchcancel', () => this.resetTouchState());
    }

    setupMouseListeners() {
        document.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        document.addEventListener('click', (e) => this.handleClick(e));
        document.addEventListener('dblclick', (e) => this.handleDoubleClick(e));
    }

    setupKeyboardListeners() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
    }

    setupFeedback() {
        // Ses efektleri için Audio nesneleri
        this.sounds = {
            tap: new Audio('/assets/sounds/tap.mp3'),
            success: new Audio('/assets/sounds/success.mp3'),
            error: new Audio('/assets/sounds/error.mp3')
        };

        // Ses seviyesini ayarla
        Object.values(this.sounds).forEach(sound => {
            sound.volume = 0.5;
        });

        // Haptic feedback için
        this.hasVibration = 'vibrate' in navigator;
    }

    handleTouchStart(event) {
        const touch = event.touches[0];
        this.touchStartX = touch.clientX;
        this.touchStartY = touch.clientY;
        
        // Long press için timer başlat
        this.pressTimer = setTimeout(() => {
            this.handleLongPress(event);
        }, this.longPressDelay);

        this.logInteraction('touchstart', {
            x: this.touchStartX,
            y: this.touchStartY,
            timestamp: Date.now()
        });
    }

    handleTouchMove(event) {
        if (!this.touchStartX || !this.touchStartY) return;

        const touch = event.touches[0];
        const deltaX = touch.clientX - this.touchStartX;
        const deltaY = touch.clientY - this.touchStartY;

        // Swipe detection
        if (Math.abs(deltaX) > this.swipeThreshold || Math.abs(deltaY) > this.swipeThreshold) {
            clearTimeout(this.pressTimer); // Long press'i iptal et
            this.handleSwipe(deltaX, deltaY);
        }

        this.logInteraction('touchmove', {
            deltaX,
            deltaY,
            timestamp: Date.now()
        });
    }

    handleTouchEnd(event) {
        clearTimeout(this.pressTimer);

        const now = Date.now();
        const timeSinceLastTap = now - this.lastTap;

        if (timeSinceLastTap < this.doubleTapDelay) {
            this.handleDoubleTap(event);
            this.lastTap = 0;
        } else {
            this.lastTap = now;
        }

        this.logInteraction('touchend', {
            timestamp: now
        });

        this.resetTouchState();
    }

    handleMouseDown(event) {
        this.isMouseDown = true;
        this.mouseStartX = event.clientX;
        this.mouseStartY = event.clientY;

        this.logInteraction('mousedown', {
            x: event.clientX,
            y: event.clientY,
            timestamp: Date.now()
        });
    }

    handleMouseMove(event) {
        if (!this.isMouseDown) return;

        const deltaX = event.clientX - this.mouseStartX;
        const deltaY = event.clientY - this.mouseStartY;

        this.logInteraction('mousemove', {
            deltaX,
            deltaY,
            timestamp: Date.now()
        });
    }

    handleMouseUp(event) {
        this.isMouseDown = false;

        this.logInteraction('mouseup', {
            x: event.clientX,
            y: event.clientY,
            timestamp: Date.now()
        });
    }

    handleClick(event) {
        // Tıklama geri bildirimi
        this.provideFeedback('tap');

        const target = event.target;
        const actionType = target.dataset.action;

        if (actionType) {
            this.handleAction(actionType, target);
        }

        this.logInteraction('click', {
            target: target.tagName,
            action: actionType,
            timestamp: Date.now()
        });
    }

    handleDoubleClick(event) {
        this.provideFeedback('tap');

        const target = event.target;
        if (target.dataset.doubleClickAction) {
            this.handleAction(target.dataset.doubleClickAction, target);
        }

        this.logInteraction('doubleclick', {
            target: target.tagName,
            timestamp: Date.now()
        });
    }

    handleKeyDown(event) {
        const target = event.target;
        
        // Enter veya Space tuşları için tıklama benzeri davranış
        if (event.key === 'Enter' || event.key === ' ') {
            if (target.dataset.action) {
                event.preventDefault();
                this.handleAction(target.dataset.action, target);
            }
        }

        this.logInteraction('keydown', {
            key: event.key,
            target: target.tagName,
            timestamp: Date.now()
        });
    }

    handleKeyUp(event) {
        this.logInteraction('keyup', {
            key: event.key,
            target: event.target.tagName,
            timestamp: Date.now()
        });
    }

    handleSwipe(deltaX, deltaY) {
        let direction;
        if (Math.abs(deltaX) > Math.abs(deltaY)) {
            direction = deltaX > 0 ? 'right' : 'left';
        } else {
            direction = deltaY > 0 ? 'down' : 'up';
        }

        const swipeEvent = new CustomEvent('swipe', {
            detail: { direction, deltaX, deltaY }
        });
        document.dispatchEvent(swipeEvent);

        this.logInteraction('swipe', {
            direction,
            deltaX,
            deltaY,
            timestamp: Date.now()
        });
    }

    handleLongPress(event) {
        const target = event.target;
        
        if (target.dataset.longPressAction) {
            this.handleAction(target.dataset.longPressAction, target);
        }

        const longPressEvent = new CustomEvent('longpress', {
            detail: { target }
        });
        document.dispatchEvent(longPressEvent);

        this.provideFeedback('longpress');

        this.logInteraction('longpress', {
            target: target.tagName,
            timestamp: Date.now()
        });
    }

    handleDoubleTap(event) {
        const target = event.target;
        
        if (target.dataset.doubleTapAction) {
            this.handleAction(target.dataset.doubleTapAction, target);
        }

        this.provideFeedback('doubletap');

        this.logInteraction('doubletap', {
            target: target.tagName,
            timestamp: Date.now()
        });
    }

    handleAction(actionType, target) {
        // Önceden tanımlanmış aksiyonları çalıştır
        const actions = {
            toggle: () => {
                target.classList.toggle('active');
                this.provideFeedback('success');
            },
            submit: () => {
                const form = target.closest('form');
                if (form) {
                    form.submit();
                    this.provideFeedback('success');
                }
            },
            delete: () => {
                if (confirm('Bu öğeyi silmek istediğinizden emin misiniz?')) {
                    target.remove();
                    this.provideFeedback('success');
                } else {
                    this.provideFeedback('error');
                }
            },
            // Diğer aksiyonlar eklenebilir
        };

        if (actions[actionType]) {
            actions[actionType]();
        }
    }

    provideFeedback(type) {
        // Ses geri bildirimi
        if (this.sounds[type]) {
            this.sounds[type].play().catch(() => {
                // Ses çalma hatası - sessiz devam et
            });
        }

        // Haptic feedback
        if (this.hasVibration) {
            switch (type) {
                case 'tap':
                    navigator.vibrate(10);
                    break;
                case 'doubletap':
                    navigator.vibrate([10, 50, 10]);
                    break;
                case 'longpress':
                    navigator.vibrate(50);
                    break;
                case 'success':
                    navigator.vibrate([10, 50, 10, 50, 10]);
                    break;
                case 'error':
                    navigator.vibrate([50, 100, 50]);
                    break;
            }
        }

        // Visual feedback
        const target = document.activeElement;
        if (target) {
            target.classList.add('interaction-feedback');
            setTimeout(() => {
                target.classList.remove('interaction-feedback');
            }, 200);
        }
    }

    registerGesture(name, callback) {
        this.gestureCallbacks.set(name, callback);
        this.activeGestures.add(name);
    }

    unregisterGesture(name) {
        this.gestureCallbacks.delete(name);
        this.activeGestures.delete(name);
    }

    logInteraction(type, data) {
        this.interactionHistory.push({
            type,
            data,
            timestamp: Date.now()
        });

        // Geçmiş uzunluğunu kontrol et
        if (this.interactionHistory.length > this.maxHistoryLength) {
            this.interactionHistory.shift();
        }
    }

    getInteractionHistory() {
        return [...this.interactionHistory];
    }

    clearInteractionHistory() {
        this.interactionHistory = [];
    }

    resetTouchState() {
        this.touchStartX = 0;
        this.touchStartY = 0;
        clearTimeout(this.pressTimer);
    }

    // Yardımcı metodlar
    isTouch() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    isMouse() {
        return matchMedia('(pointer:fine)').matches;
    }

    getDeviceOrientation() {
        return window.orientation || window.screen.orientation.angle;
    }

    // Analiz metodları
    getInteractionStats() {
        const stats = {
            totalInteractions: this.interactionHistory.length,
            typeBreakdown: {},
            averageInterval: 0,
            mostFrequentTarget: null
        };

        if (this.interactionHistory.length === 0) return stats;

        // Etkileşim tiplerini say
        this.interactionHistory.forEach(interaction => {
            stats.typeBreakdown[interaction.type] = (stats.typeBreakdown[interaction.type] || 0) + 1;
        });

        // Ortalama etkileşim aralığını hesapla
        let totalInterval = 0;
        for (let i = 1; i < this.interactionHistory.length; i++) {
            totalInterval += this.interactionHistory[i].timestamp - this.interactionHistory[i-1].timestamp;
        }
        stats.averageInterval = totalInterval / (this.interactionHistory.length - 1);

        // En sık etkileşime girilen hedefi bul
        const targetCounts = {};
        this.interactionHistory.forEach(interaction => {
            if (interaction.data.target) {
                targetCounts[interaction.data.target] = (targetCounts[interaction.data.target] || 0) + 1;
            }
        });

        stats.mostFrequentTarget = Object.entries(targetCounts)
            .sort(([,a], [,b]) => b - a)[0]?.[0] || null;

        return stats;
    }
}

export default InteractionManager; 