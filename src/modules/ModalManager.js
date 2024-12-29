export class ModalManager {
    constructor() {
        this.activeModals = new Set();
        this.modalStack = [];
        this.backdropStack = [];
        this.focusHistory = [];
        this.zIndexBase = 1000;
        this.animationDuration = 300;
        this.escapeKeyEnabled = true;
        this.backdropClickEnabled = true;
        this.focusTrapEnabled = true;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupStyles();
    }

    setupEventListeners() {
        // Escape tuşu ile modal kapatma
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.escapeKeyEnabled && this.modalStack.length > 0) {
                this.closeTopModal();
            }
        });

        // Backdrop tıklaması ile modal kapatma
        document.addEventListener('click', (e) => {
            if (this.backdropClickEnabled && e.target.classList.contains('modal-backdrop')) {
                const modalId = e.target.getAttribute('data-modal-id');
                const modal = document.getElementById(modalId);
                if (modal && !modal.hasAttribute('data-static')) {
                    this.closeModal(modal);
                }
            }
        });

        // Focus yönetimi
        document.addEventListener('focusin', (e) => {
            if (this.focusTrapEnabled && this.modalStack.length > 0) {
                const topModal = this.modalStack[this.modalStack.length - 1];
                if (!topModal.contains(e.target)) {
                    this.focusFirstElement(topModal);
                }
            }
        });
    }

    setupStyles() {
        // Modal stilleri
        const style = document.createElement('style');
        style.textContent = `
            .modal {
                display: none;
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
                z-index: ${this.zIndexBase + 1};
                opacity: 0;
                transition: opacity ${this.animationDuration}ms ease;
            }

            .modal.show {
                display: block;
                opacity: 1;
            }

            .modal-backdrop {
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.5);
                z-index: ${this.zIndexBase};
                opacity: 0;
                transition: opacity ${this.animationDuration}ms ease;
            }

            .modal-backdrop.show {
                display: block;
                opacity: 1;
            }

            .modal-header {
                padding: 1rem;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
                align-items: center;
            }

            .modal-body {
                padding: 1rem;
                max-height: calc(100vh - 200px);
                overflow-y: auto;
            }

            .modal-footer {
                padding: 1rem;
                border-top: 1px solid #eee;
                display: flex;
                justify-content: flex-end;
                gap: 0.5rem;
            }

            .modal-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                padding: 0.5rem;
                color: #666;
            }

            .modal-close:hover {
                color: #000;
            }

            @media (max-width: 768px) {
                .modal {
                    width: 90% !important;
                    max-height: 90vh;
                }
            }
        `;
        document.head.appendChild(style);
    }

    createModal(options = {}) {
        const {
            id = `modal-${Date.now()}`,
            title = '',
            content = '',
            size = 'medium',
            closable = true,
            static = false,
            onClose = null,
            onOpen = null,
            buttons = []
        } = options;

        // Modal container
        const modal = document.createElement('div');
        modal.id = id;
        modal.className = 'modal';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', `${id}-title`);
        
        if (static) {
            modal.setAttribute('data-static', 'true');
        }

        // Modal boyutu
        const sizes = {
            small: '300px',
            medium: '500px',
            large: '800px'
        };
        modal.style.width = sizes[size] || sizes.medium;

        // Modal içeriği
        modal.innerHTML = `
            <div class="modal-header">
                <h2 id="${id}-title">${title}</h2>
                ${closable ? '<button class="modal-close" aria-label="Kapat">&times;</button>' : ''}
            </div>
            <div class="modal-body">${content}</div>
            <div class="modal-footer">
                ${buttons.map(btn => `
                    <button type="button" class="btn ${btn.class || ''}" data-action="${btn.action || ''}">${btn.text}</button>
                `).join('')}
            </div>
        `;

        // Event listeners
        if (closable) {
            modal.querySelector('.modal-close').addEventListener('click', () => {
                this.closeModal(modal);
            });
        }

        // Button event listeners
        buttons.forEach(btn => {
            const button = modal.querySelector(`[data-action="${btn.action}"]`);
            if (button && btn.handler) {
                button.addEventListener('click', (e) => btn.handler(e, modal));
            }
        });

        // Callback'leri sakla
        if (onClose) modal.addEventListener('modalClose', onClose);
        if (onOpen) modal.addEventListener('modalOpen', onOpen);

        document.body.appendChild(modal);
        return modal;
    }

    openModal(modal) {
        if (!(modal instanceof HTMLElement)) {
            throw new Error('Modal must be a DOM element');
        }

        // Backdrop oluştur
        const backdrop = document.createElement('div');
        backdrop.className = 'modal-backdrop';
        backdrop.setAttribute('data-modal-id', modal.id);
        document.body.appendChild(backdrop);

        // Z-index'leri ayarla
        const zIndex = this.zIndexBase + (this.modalStack.length * 2);
        backdrop.style.zIndex = zIndex;
        modal.style.zIndex = zIndex + 1;

        // Stack'e ekle
        this.modalStack.push(modal);
        this.backdropStack.push(backdrop);
        this.activeModals.add(modal.id);

        // Scroll'u devre dışı bırak
        if (this.modalStack.length === 1) {
            document.body.style.overflow = 'hidden';
        }

        // Focus'u kaydet ve modal'a taşı
        this.focusHistory.push(document.activeElement);
        
        // Görünürlüğü ayarla
        requestAnimationFrame(() => {
            backdrop.classList.add('show');
            modal.classList.add('show');
            this.focusFirstElement(modal);
        });

        // Open event'ini tetikle
        modal.dispatchEvent(new CustomEvent('modalOpen'));
    }

    closeModal(modal) {
        if (!(modal instanceof HTMLElement)) {
            throw new Error('Modal must be a DOM element');
        }

        const modalIndex = this.modalStack.indexOf(modal);
        if (modalIndex === -1) return;

        const backdrop = this.backdropStack[modalIndex];

        // Animasyonlu kapanış
        modal.classList.remove('show');
        backdrop.classList.remove('show');

        setTimeout(() => {
            // Stack'ten kaldır
            this.modalStack.splice(modalIndex, 1);
            this.backdropStack.splice(modalIndex, 1);
            this.activeModals.delete(modal.id);

            // DOM'dan kaldır
            backdrop.remove();
            
            // Scroll'u geri aç
            if (this.modalStack.length === 0) {
                document.body.style.overflow = '';
            }

            // Focus'u geri getir
            const previousFocus = this.focusHistory.pop();
            if (previousFocus) {
                previousFocus.focus();
            }

            // Close event'ini tetikle
            modal.dispatchEvent(new CustomEvent('modalClose'));
        }, this.animationDuration);
    }

    closeTopModal() {
        if (this.modalStack.length > 0) {
            const topModal = this.modalStack[this.modalStack.length - 1];
            this.closeModal(topModal);
        }
    }

    closeAllModals() {
        [...this.modalStack].forEach(modal => {
            this.closeModal(modal);
        });
    }

    updateModal(modal, options = {}) {
        const {
            title,
            content,
            buttons,
            size
        } = options;

        if (title) {
            const titleElement = modal.querySelector(`#${modal.id}-title`);
            if (titleElement) titleElement.textContent = title;
        }

        if (content) {
            const bodyElement = modal.querySelector('.modal-body');
            if (bodyElement) bodyElement.innerHTML = content;
        }

        if (buttons) {
            const footerElement = modal.querySelector('.modal-footer');
            if (footerElement) {
                footerElement.innerHTML = buttons.map(btn => `
                    <button type="button" class="btn ${btn.class || ''}" data-action="${btn.action || ''}">${btn.text}</button>
                `).join('');

                buttons.forEach(btn => {
                    const button = footerElement.querySelector(`[data-action="${btn.action}"]`);
                    if (button && btn.handler) {
                        button.addEventListener('click', (e) => btn.handler(e, modal));
                    }
                });
            }
        }

        if (size) {
            const sizes = {
                small: '300px',
                medium: '500px',
                large: '800px'
            };
            modal.style.width = sizes[size] || sizes.medium;
        }
    }

    focusFirstElement(modal) {
        // Focuslanabilir elementleri bul
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        // İlk elementi focusla
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        } else {
            modal.focus();
        }
    }

    isModalOpen(modalId) {
        return this.activeModals.has(modalId);
    }

    getTopModal() {
        return this.modalStack[this.modalStack.length - 1] || null;
    }

    setEscapeKeyEnabled(enabled) {
        this.escapeKeyEnabled = enabled;
    }

    setBackdropClickEnabled(enabled) {
        this.backdropClickEnabled = enabled;
    }

    setFocusTrapEnabled(enabled) {
        this.focusTrapEnabled = enabled;
    }
}

export default ModalManager; 
export { ModalManager }; 