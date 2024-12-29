class HelpManager {
    constructor() {
        this.helpContent = new Map();
        this.activeTooltips = new Map();
        this.activeGuides = new Set();
        this.tourSteps = new Map();
        this.observers = new Set();
        this.settings = {
            tooltipDelay: 500,
            tooltipDuration: 3000,
            showTooltips: true,
            showGuidelines: true,
            enableTours: true,
            autoShowHelp: true
        };

        this.init();
    }

    init() {
        this.setupStyles();
        this.loadHelpContent();
        this.setupEventListeners();
    }

    setupStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .help-tooltip {
                position: absolute;
                background: #333;
                color: white;
                padding: 8px 12px;
                border-radius: 4px;
                font-size: 14px;
                z-index: 10000;
                max-width: 250px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2);
                transition: opacity 0.2s;
                pointer-events: none;
            }

            .help-tooltip::before {
                content: '';
                position: absolute;
                border: 6px solid transparent;
            }

            .help-tooltip.top::before {
                border-top-color: #333;
                bottom: -12px;
                left: 50%;
                transform: translateX(-50%);
            }

            .help-tooltip.bottom::before {
                border-bottom-color: #333;
                top: -12px;
                left: 50%;
                transform: translateX(-50%);
            }

            .help-tooltip.left::before {
                border-left-color: #333;
                right: -12px;
                top: 50%;
                transform: translateY(-50%);
            }

            .help-tooltip.right::before {
                border-right-color: #333;
                left: -12px;
                top: 50%;
                transform: translateY(-50%);
            }

            .help-overlay {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(0,0,0,0.5);
                z-index: 9999;
                display: flex;
                align-items: center;
                justify-content: center;
            }

            .help-modal {
                background: white;
                border-radius: 8px;
                padding: 24px;
                max-width: 600px;
                width: 90%;
                max-height: 80vh;
                overflow-y: auto;
                position: relative;
            }

            .help-modal-close {
                position: absolute;
                top: 16px;
                right: 16px;
                background: none;
                border: none;
                font-size: 24px;
                cursor: pointer;
                color: #666;
            }

            .help-modal-close:hover {
                color: #333;
            }

            .help-highlight {
                position: relative;
                z-index: 10000;
                box-shadow: 0 0 0 4px rgba(66, 153, 225, 0.6);
                border-radius: 4px;
            }

            .help-guide {
                position: fixed;
                background: white;
                border-radius: 8px;
                padding: 16px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                max-width: 300px;
                z-index: 10001;
            }

            .help-guide-buttons {
                display: flex;
                justify-content: space-between;
                margin-top: 16px;
            }

            .help-guide-button {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                background: #eee;
            }

            .help-guide-button.primary {
                background: #4299e1;
                color: white;
            }

            .help-guide-progress {
                display: flex;
                justify-content: center;
                margin-top: 12px;
                gap: 4px;
            }

            .help-guide-dot {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background: #ddd;
            }

            .help-guide-dot.active {
                background: #4299e1;
            }
        `;
        document.head.appendChild(style);
    }

    async loadHelpContent() {
        try {
            const response = await fetch('/help/content.json');
            if (!response.ok) throw new Error('Help content could not be loaded');
            
            const content = await response.json();
            Object.entries(content).forEach(([key, value]) => {
                this.helpContent.set(key, value);
            });
        } catch (error) {
            console.error('Help content loading error:', error);
        }
    }

    setupEventListeners() {
        // Tooltip event listeners
        document.addEventListener('mouseover', (e) => {
            const target = e.target.closest('[data-help]');
            if (target && this.settings.showTooltips) {
                this.showTooltip(target);
            }
        });

        document.addEventListener('mouseout', (e) => {
            const target = e.target.closest('[data-help]');
            if (target) {
                this.hideTooltip(target);
            }
        });

        // Klavye kısayolları
        document.addEventListener('keydown', (e) => {
            // F1 tuşu ile yardım modalını aç
            if (e.key === 'F1') {
                e.preventDefault();
                this.showHelpModal();
            }

            // ESC tuşu ile aktif yardım öğelerini kapat
            if (e.key === 'Escape') {
                this.hideAllHelp();
            }
        });

        // Pencere boyutu değiştiğinde tooltip pozisyonlarını güncelle
        window.addEventListener('resize', this.throttle(() => {
            this.updateTooltipPositions();
        }, 100));

        // Sayfa kaydırıldığında tooltip pozisyonlarını güncelle
        window.addEventListener('scroll', this.throttle(() => {
            this.updateTooltipPositions();
        }, 100));
    }

    showTooltip(element) {
        if (this.activeTooltips.has(element)) return;

        const helpKey = element.getAttribute('data-help');
        const content = this.helpContent.get(helpKey);
        if (!content) return;

        const tooltip = document.createElement('div');
        tooltip.className = 'help-tooltip';
        tooltip.textContent = content;

        document.body.appendChild(tooltip);
        this.activeTooltips.set(element, tooltip);

        // Tooltip pozisyonunu ayarla
        this.positionTooltip(element, tooltip);

        // Otomatik gizleme
        if (this.settings.tooltipDuration > 0) {
            setTimeout(() => {
                this.hideTooltip(element);
            }, this.settings.tooltipDuration);
        }
    }

    hideTooltip(element) {
        const tooltip = this.activeTooltips.get(element);
        if (tooltip) {
            tooltip.remove();
            this.activeTooltips.delete(element);
        }
    }

    positionTooltip(element, tooltip) {
        const elementRect = element.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        let top, left;
        let position = 'top';

        // Yukarıda yeterli alan var mı?
        if (elementRect.top > tooltipRect.height + 10) {
            top = elementRect.top + scrollTop - tooltipRect.height - 10;
            left = elementRect.left + scrollLeft + (elementRect.width - tooltipRect.width) / 2;
        }
        // Aşağıda yeterli alan var mı?
        else if (window.innerHeight - elementRect.bottom > tooltipRect.height + 10) {
            top = elementRect.bottom + scrollTop + 10;
            left = elementRect.left + scrollLeft + (elementRect.width - tooltipRect.width) / 2;
            position = 'bottom';
        }
        // Sağda yeterli alan var mı?
        else if (window.innerWidth - elementRect.right > tooltipRect.width + 10) {
            top = elementRect.top + scrollTop;
            left = elementRect.right + scrollLeft + 10;
            position = 'right';
        }
        // Sol tarafa yerleştir
        else {
            top = elementRect.top + scrollTop;
            left = elementRect.left + scrollLeft - tooltipRect.width - 10;
            position = 'left';
        }

        // Ekran sınırlarını kontrol et
        if (left < 0) left = 10;
        if (left + tooltipRect.width > window.innerWidth) {
            left = window.innerWidth - tooltipRect.width - 10;
        }
        if (top < 0) top = 10;
        if (top + tooltipRect.height > document.documentElement.scrollHeight) {
            top = document.documentElement.scrollHeight - tooltipRect.height - 10;
        }

        tooltip.style.top = `${top}px`;
        tooltip.style.left = `${left}px`;
        tooltip.className = `help-tooltip ${position}`;
    }

    updateTooltipPositions() {
        this.activeTooltips.forEach((tooltip, element) => {
            this.positionTooltip(element, tooltip);
        });
    }

    showHelpModal(topic = 'general') {
        const content = this.helpContent.get(topic);
        if (!content) return;

        const overlay = document.createElement('div');
        overlay.className = 'help-overlay';

        const modal = document.createElement('div');
        modal.className = 'help-modal';
        modal.innerHTML = `
            <button class="help-modal-close">&times;</button>
            <h2>${content.title}</h2>
            <div class="help-modal-content">${content.body}</div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Event listeners
        const closeButton = modal.querySelector('.help-modal-close');
        closeButton.addEventListener('click', () => overlay.remove());

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
    }

    startTour(tourId) {
        if (!this.settings.enableTours) return;

        const tour = this.tourSteps.get(tourId);
        if (!tour) return;

        let currentStep = 0;

        const showStep = () => {
            const step = tour[currentStep];
            if (!step) return;

            const element = document.querySelector(step.selector);
            if (!element) return;

            // Highlight element
            element.classList.add('help-highlight');

            // Create guide
            const guide = document.createElement('div');
            guide.className = 'help-guide';
            guide.innerHTML = `
                <div class="help-guide-content">
                    <h3>${step.title}</h3>
                    <p>${step.content}</p>
                </div>
                <div class="help-guide-buttons">
                    ${currentStep > 0 ? '<button class="help-guide-button" data-action="prev">Önceki</button>' : ''}
                    <button class="help-guide-button primary" data-action="next">
                        ${currentStep === tour.length - 1 ? 'Bitir' : 'Sonraki'}
                    </button>
                </div>
                <div class="help-guide-progress">
                    ${tour.map((_, index) => `
                        <div class="help-guide-dot ${index === currentStep ? 'active' : ''}"></div>
                    `).join('')}
                </div>
            `;

            document.body.appendChild(guide);
            this.activeGuides.add(guide);

            // Position guide
            this.positionGuide(element, guide);

            // Event listeners
            guide.querySelector('[data-action="next"]').addEventListener('click', () => {
                element.classList.remove('help-highlight');
                guide.remove();
                this.activeGuides.delete(guide);

                if (currentStep < tour.length - 1) {
                    currentStep++;
                    showStep();
                }
            });

            const prevButton = guide.querySelector('[data-action="prev"]');
            if (prevButton) {
                prevButton.addEventListener('click', () => {
                    element.classList.remove('help-highlight');
                    guide.remove();
                    this.activeGuides.delete(guide);

                    if (currentStep > 0) {
                        currentStep--;
                        showStep();
                    }
                });
            }
        };

        showStep();
    }

    positionGuide(element, guide) {
        const elementRect = element.getBoundingClientRect();
        const guideRect = guide.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

        let top, left;

        // Guide'ı elementin altına yerleştir
        if (window.innerHeight - elementRect.bottom > guideRect.height + 20) {
            top = elementRect.bottom + scrollTop + 10;
            left = elementRect.left + scrollLeft;
        }
        // Üstüne yerleştir
        else if (elementRect.top > guideRect.height + 20) {
            top = elementRect.top + scrollTop - guideRect.height - 10;
            left = elementRect.left + scrollLeft;
        }
        // Sağına yerleştir
        else if (window.innerWidth - elementRect.right > guideRect.width + 20) {
            top = elementRect.top + scrollTop;
            left = elementRect.right + scrollLeft + 10;
        }
        // Soluna yerleştir
        else {
            top = elementRect.top + scrollTop;
            left = elementRect.left + scrollLeft - guideRect.width - 10;
        }

        // Ekran sınırlarını kontrol et
        if (left < 0) left = 10;
        if (left + guideRect.width > window.innerWidth) {
            left = window.innerWidth - guideRect.width - 10;
        }
        if (top < 0) top = 10;
        if (top + guideRect.height > document.documentElement.scrollHeight) {
            top = document.documentElement.scrollHeight - guideRect.height - 10;
        }

        guide.style.top = `${top}px`;
        guide.style.left = `${left}px`;
    }

    hideAllHelp() {
        // Tooltipları kapat
        this.activeTooltips.forEach((tooltip, element) => {
            this.hideTooltip(element);
        });

        // Aktif rehberleri kapat
        this.activeGuides.forEach(guide => {
            guide.remove();
        });
        this.activeGuides.clear();

        // Highlight'ları kaldır
        document.querySelectorAll('.help-highlight').forEach(element => {
            element.classList.remove('help-highlight');
        });

        // Help modalını kapat
        const overlay = document.querySelector('.help-overlay');
        if (overlay) overlay.remove();
    }

    addHelpContent(key, content) {
        this.helpContent.set(key, content);
    }

    removeHelpContent(key) {
        this.helpContent.delete(key);
    }

    addTour(tourId, steps) {
        this.tourSteps.set(tourId, steps);
    }

    removeTour(tourId) {
        this.tourSteps.delete(tourId);
    }

    updateSettings(newSettings) {
        this.settings = {
            ...this.settings,
            ...newSettings
        };

        // Ayarlar değiştiğinde observers'ları bilgilendir
        this.notifyObservers('settingsChanged', this.settings);
    }

    addObserver(callback) {
        this.observers.add(callback);
    }

    removeObserver(callback) {
        this.observers.delete(callback);
    }

    notifyObservers(event, data) {
        this.observers.forEach(callback => {
            try {
                callback(event, data);
            } catch (error) {
                console.error('Observer notification error:', error);
            }
        });
    }

    throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }
}

export default HelpManager; 