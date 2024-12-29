import { ERROR_MESSAGES } from '../config/constants.js';

export class UIManager {
    constructor() {
        this.themeSettings = {
            isDark: window.matchMedia('(prefers-color-scheme: dark)').matches,
            customTheme: localStorage.getItem('customTheme'),
            animations: true,
            highContrast: false
        };

        this.breakpoints = {
            mobile: 480,
            tablet: 768,
            desktop: 1024,
            widescreen: 1200
        };

        this.animationSettings = {
            duration: 300,
            easing: 'ease-in-out',
            enabled: true
        };

        this.observers = new Set();
        this.mediaQueries = new Map();
        this.elementCache = new Map();
        this.mutationObserver = null;
        this.resizeObserver = null;
        this.intersectionObserver = null;
        
        this.init();
    }

    init() {
        this.setupThemeDetection();
        this.setupMediaQueries();
        this.setupObservers();
        this.setupEventListeners();
        this.applyInitialTheme();
    }

    setupThemeDetection() {
        const darkModeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        darkModeMediaQuery.addListener((e) => {
            if (!this.themeSettings.customTheme) {
                this.themeSettings.isDark = e.matches;
                this.applyTheme();
            }
        });
    }

    setupMediaQueries() {
        Object.entries(this.breakpoints).forEach(([key, value]) => {
            const query = window.matchMedia(`(min-width: ${value}px)`);
            this.mediaQueries.set(key, query);
            query.addListener((e) => this.handleBreakpointChange(key, e.matches));
        });
    }

    setupObservers() {
        // Mutation Observer
        this.mutationObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    this.handleDOMChanges(mutation.target);
                } else if (mutation.type === 'attributes') {
                    this.handleAttributeChanges(mutation.target, mutation.attributeName);
                }
            });
        });

        this.mutationObserver.observe(document.body, {
            childList: true,
            attributes: true,
            subtree: true,
            attributeFilter: ['class', 'style']
        });

        // Resize Observer
        this.resizeObserver = new ResizeObserver((entries) => {
            entries.forEach((entry) => {
                this.handleElementResize(entry.target, entry.contentRect);
            });
        });

        // Intersection Observer
        this.intersectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                this.handleElementVisibility(entry.target, entry.isIntersecting);
            });
        }, {
            threshold: [0, 0.5, 1]
        });
    }

    setupEventListeners() {
        window.addEventListener('resize', this.debounce(() => {
            this.handleWindowResize();
        }, 250));

        window.addEventListener('scroll', this.throttle(() => {
            this.handleScroll();
        }, 100));

        document.addEventListener('visibilitychange', () => {
            this.handleVisibilityChange();
        });
    }

    applyInitialTheme() {
        const root = document.documentElement;
        const theme = this.themeSettings.customTheme || (this.themeSettings.isDark ? 'dark' : 'light');
        
        root.setAttribute('data-theme', theme);
        this.updateThemeColors(theme);
    }

    updateThemeColors(theme) {
        const colors = this.getThemeColors(theme);
        const root = document.documentElement;

        Object.entries(colors).forEach(([key, value]) => {
            root.style.setProperty(`--${key}`, value);
        });
    }

    getThemeColors(theme) {
        const colors = {
            dark: {
                'background-primary': '#1a1a1a',
                'background-secondary': '#2d2d2d',
                'text-primary': '#ffffff',
                'text-secondary': '#b3b3b3',
                'accent-primary': '#007bff',
                'accent-secondary': '#6c757d',
                'border-color': '#404040',
                'shadow-color': 'rgba(0, 0, 0, 0.3)'
            },
            light: {
                'background-primary': '#ffffff',
                'background-secondary': '#f8f9fa',
                'text-primary': '#212529',
                'text-secondary': '#6c757d',
                'accent-primary': '#007bff',
                'accent-secondary': '#6c757d',
                'border-color': '#dee2e6',
                'shadow-color': 'rgba(0, 0, 0, 0.1)'
            }
        };

        return colors[theme] || colors.light;
    }

    setTheme(theme) {
        this.themeSettings.customTheme = theme;
        localStorage.setItem('customTheme', theme);
        this.applyTheme();
    }

    toggleTheme() {
        const newTheme = this.themeSettings.isDark ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

    applyTheme() {
        const root = document.documentElement;
        const theme = this.themeSettings.customTheme || (this.themeSettings.isDark ? 'dark' : 'light');
        
        // Tema değişimi animasyonu
        if (this.animationSettings.enabled) {
            root.style.transition = `background-color ${this.animationSettings.duration}ms ${this.animationSettings.easing}`;
        }

        root.setAttribute('data-theme', theme);
        this.updateThemeColors(theme);
        this.notifyObservers('themeChange', { theme });
    }

    setHighContrast(enabled) {
        this.themeSettings.highContrast = enabled;
        const root = document.documentElement;
        
        if (enabled) {
            root.classList.add('high-contrast');
        } else {
            root.classList.remove('high-contrast');
        }

        this.notifyObservers('contrastChange', { highContrast: enabled });
    }

    setAnimations(enabled) {
        this.animationSettings.enabled = enabled;
        const root = document.documentElement;
        
        if (enabled) {
            root.classList.remove('reduce-motion');
        } else {
            root.classList.add('reduce-motion');
        }

        this.notifyObservers('animationChange', { enabled });
    }

    handleBreakpointChange(breakpoint, matches) {
        this.notifyObservers('breakpointChange', {
            breakpoint,
            matches,
            currentBreakpoints: this.getCurrentBreakpoints()
        });
    }

    getCurrentBreakpoints() {
        const active = {};
        this.mediaQueries.forEach((query, key) => {
            active[key] = query.matches;
        });
        return active;
    }

    handleDOMChanges(target) {
        // Yeni eklenen elementlere tema uygula
        this.applyThemeToElement(target);
        
        // Performans optimizasyonları
        this.optimizeNewElements(target);
        
        this.notifyObservers('domChange', { target });
    }

    handleAttributeChanges(target, attributeName) {
        if (attributeName === 'class' || attributeName === 'style') {
            this.applyThemeToElement(target);
        }
        
        this.notifyObservers('attributeChange', { target, attributeName });
    }

    handleElementResize(element, contentRect) {
        this.notifyObservers('elementResize', { element, contentRect });
    }

    handleElementVisibility(element, isVisible) {
        if (isVisible) {
            this.optimizeVisibleElement(element);
        }
        
        this.notifyObservers('elementVisibility', { element, isVisible });
    }

    handleWindowResize() {
        this.notifyObservers('windowResize', {
            width: window.innerWidth,
            height: window.innerHeight,
            breakpoints: this.getCurrentBreakpoints()
        });
    }

    handleScroll() {
        const scrollPosition = {
            x: window.scrollX,
            y: window.scrollY,
            direction: this.getScrollDirection()
        };
        
        this.notifyObservers('scroll', scrollPosition);
    }

    handleVisibilityChange() {
        const isVisible = document.visibilityState === 'visible';
        this.notifyObservers('visibilityChange', { isVisible });
    }

    applyThemeToElement(element) {
        if (!element) return;

        const theme = this.themeSettings.customTheme || (this.themeSettings.isDark ? 'dark' : 'light');
        const colors = this.getThemeColors(theme);

        // Tema renkleri için CSS değişkenlerini güncelle
        Object.entries(colors).forEach(([key, value]) => {
            element.style.setProperty(`--${key}`, value);
        });

        // Alt elementlere de uygula
        element.querySelectorAll('*').forEach(child => {
            Object.entries(colors).forEach(([key, value]) => {
                child.style.setProperty(`--${key}`, value);
            });
        });
    }

    optimizeNewElements(element) {
        // Görüntüleri optimize et
        element.querySelectorAll('img').forEach(img => {
            if (!img.loading) {
                img.loading = 'lazy';
            }
            
            if (img.src && !img.srcset) {
                this.generateResponsiveImages(img);
            }
        });

        // Video elementlerini optimize et
        element.querySelectorAll('video').forEach(video => {
            video.addEventListener('loadstart', () => {
                this.optimizeVideoPlayback(video);
            });
        });

        // Form elementlerini optimize et
        element.querySelectorAll('form').forEach(form => {
            this.setupFormValidation(form);
        });
    }

    optimizeVisibleElement(element) {
        // Görünür olan elementleri optimize et
        if (element.tagName === 'IMG' && !element.complete) {
            this.prioritizeImageLoading(element);
        }

        if (element.tagName === 'VIDEO' && element.paused) {
            this.prepareVideoPlayback(element);
        }
    }

    generateResponsiveImages(img) {
        if (!img.src) return;

        const breakpoints = Object.values(this.breakpoints);
        const srcset = breakpoints.map(width => {
            return `${img.src}?w=${width} ${width}w`;
        }).join(', ');

        img.srcset = srcset;
        img.sizes = '(max-width: 480px) 100vw, (max-width: 768px) 50vw, 33vw';
    }

    optimizeVideoPlayback(video) {
        // Video kalitesini cihaz ve bağlantıya göre ayarla
        if ('connection' in navigator) {
            const connection = navigator.connection;
            
            if (connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g') {
                video.setAttribute('data-quality', 'low');
            } else if (connection.effectiveType === '3g') {
                video.setAttribute('data-quality', 'medium');
            } else {
                video.setAttribute('data-quality', 'high');
            }
        }
    }

    setupFormValidation(form) {
        const inputs = form.querySelectorAll('input, textarea, select');
        
        inputs.forEach(input => {
            input.addEventListener('invalid', (event) => {
                event.preventDefault();
                this.showInputError(input);
            });

            input.addEventListener('input', () => {
                this.clearInputError(input);
            });
        });
    }

    showInputError(input) {
        const errorElement = document.createElement('div');
        errorElement.className = 'input-error';
        errorElement.textContent = input.validationMessage;
        
        input.classList.add('error');
        input.parentNode.appendChild(errorElement);
    }

    clearInputError(input) {
        input.classList.remove('error');
        const errorElement = input.parentNode.querySelector('.input-error');
        if (errorElement) {
            errorElement.remove();
        }
    }

    prioritizeImageLoading(img) {
        img.loading = 'eager';
        if (img.getAttribute('data-src')) {
            img.src = img.getAttribute('data-src');
        }
    }

    prepareVideoPlayback(video) {
        if (!video.preload || video.preload === 'none') {
            video.preload = 'metadata';
        }
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

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    throttle(func, limit) {
        let inThrottle;
        return function executedFunction(...args) {
            if (!inThrottle) {
                func(...args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    getScrollDirection() {
        const currentScroll = window.scrollY;
        const direction = currentScroll > this.lastScroll ? 'down' : 'up';
        this.lastScroll = currentScroll;
        return direction;
    }

    destroy() {
        // Event listener'ları temizle
        window.removeEventListener('resize', this.handleWindowResize);
        window.removeEventListener('scroll', this.handleScroll);
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);

        // Observer'ları temizle
        this.mutationObserver?.disconnect();
        this.resizeObserver?.disconnect();
        this.intersectionObserver?.disconnect();

        // Media query listener'ları temizle
        this.mediaQueries.forEach(query => {
            query.removeListener && query.removeListener();
        });

        // Observer'ları temizle
        this.observers.clear();
    }
}

export default UIManager; 