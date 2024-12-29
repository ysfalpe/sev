export class FormManager {
    constructor() {
        this.forms = new Map();
        this.validators = new Map();
        this.errorMessages = new Map();
        this.customValidators = new Map();
        
        this.init();
    }

    init() {
        this.setupDefaultValidators();
        this.setupDefaultErrorMessages();
        this.setupFormListeners();
    }

    setupDefaultValidators() {
        // Email validasyonu
        this.addValidator('email', (value) => {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
        });

        // Telefon validasyonu
        this.addValidator('phone', (value) => {
            return /^\+?[\d\s-]{8,}$/.test(value);
        });

        // URL validasyonu
        this.addValidator('url', (value) => {
            try {
                new URL(value);
                return true;
            } catch {
                return false;
            }
        });

        // Şifre validasyonu
        this.addValidator('password', (value) => {
            return /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/.test(value);
        });

        // Sayı validasyonu
        this.addValidator('number', (value) => {
            return !isNaN(value) && value !== '';
        });

        // Zorunlu alan validasyonu
        this.addValidator('required', (value) => {
            return value !== null && value !== undefined && value.trim() !== '';
        });
    }

    setupDefaultErrorMessages() {
        this.errorMessages.set('email', 'Geçerli bir email adresi giriniz');
        this.errorMessages.set('phone', 'Geçerli bir telefon numarası giriniz');
        this.errorMessages.set('url', 'Geçerli bir URL giriniz');
        this.errorMessages.set('password', 'Şifre en az 8 karakter uzunluğunda olmalı ve en az bir harf ve bir rakam içermelidir');
        this.errorMessages.set('number', 'Geçerli bir sayı giriniz');
        this.errorMessages.set('required', 'Bu alan zorunludur');
    }

    setupFormListeners() {
        document.addEventListener('submit', (e) => {
            if (e.target.tagName === 'FORM') {
                this.handleFormSubmit(e);
            }
        });

        document.addEventListener('input', (e) => {
            if (e.target.form) {
                this.handleInputChange(e);
            }
        });

        document.addEventListener('focusout', (e) => {
            if (e.target.form) {
                this.handleInputBlur(e);
            }
        });
    }

    addValidator(name, validator) {
        this.validators.set(name, validator);
    }

    addErrorMessage(validatorName, message) {
        this.errorMessages.set(validatorName, message);
    }

    registerForm(form, options = {}) {
        const formConfig = {
            validateOnInput: options.validateOnInput ?? true,
            validateOnBlur: options.validateOnBlur ?? true,
            validateOnSubmit: options.validateOnSubmit ?? true,
            customValidators: options.customValidators ?? {},
            onSuccess: options.onSuccess,
            onError: options.onError,
            fields: new Map()
        };

        // Form alanlarını yapılandır
        Array.from(form.elements).forEach(element => {
            if (element.name) {
                formConfig.fields.set(element.name, {
                    validators: this.getFieldValidators(element),
                    pristine: true,
                    valid: true,
                    errors: []
                });
            }
        });

        this.forms.set(form, formConfig);
    }

    getFieldValidators(element) {
        const validators = [];

        // HTML5 validasyonları
        if (element.required) validators.push('required');
        if (element.type === 'email') validators.push('email');
        if (element.type === 'url') validators.push('url');
        if (element.type === 'tel') validators.push('phone');
        if (element.type === 'number') validators.push('number');

        // Data attribute validasyonları
        if (element.dataset.validate) {
            validators.push(...element.dataset.validate.split(' '));
        }

        return validators;
    }

    handleFormSubmit(event) {
        const form = event.target;
        const config = this.forms.get(form);

        if (!config || !config.validateOnSubmit) return;

        event.preventDefault();

        const isValid = this.validateForm(form);
        
        if (isValid) {
            if (config.onSuccess) {
                config.onSuccess(this.getFormData(form));
            }
        } else {
            if (config.onError) {
                config.onError(this.getFormErrors(form));
            }
            this.focusFirstInvalidField(form);
        }
    }

    handleInputChange(event) {
        const input = event.target;
        const form = input.form;
        const config = this.forms.get(form);

        if (!config || !config.validateOnInput) return;

        const field = config.fields.get(input.name);
        if (field) {
            field.pristine = false;
            this.validateField(input);
        }
    }

    handleInputBlur(event) {
        const input = event.target;
        const form = input.form;
        const config = this.forms.get(form);

        if (!config || !config.validateOnBlur) return;

        const field = config.fields.get(input.name);
        if (field) {
            field.pristine = false;
            this.validateField(input);
        }
    }

    validateForm(form) {
        const config = this.forms.get(form);
        if (!config) return true;

        let isValid = true;
        const elements = Array.from(form.elements);

        elements.forEach(element => {
            if (element.name) {
                const fieldValid = this.validateField(element);
                isValid = isValid && fieldValid;
            }
        });

        return isValid;
    }

    validateField(input) {
        const form = input.form;
        const config = this.forms.get(form);
        const field = config.fields.get(input.name);

        if (!field) return true;

        const value = input.value;
        const errors = [];

        // Validatörleri çalıştır
        field.validators.forEach(validatorName => {
            const validator = this.validators.get(validatorName) || 
                             config.customValidators[validatorName];

            if (validator && !validator(value, input)) {
                errors.push(this.errorMessages.get(validatorName) || `${validatorName} validasyonu başarısız`);
            }
        });

        // Alanın durumunu güncelle
        field.valid = errors.length === 0;
        field.errors = errors;

        // UI'ı güncelle
        this.updateFieldUI(input, field);

        return field.valid;
    }

    updateFieldUI(input, field) {
        // CSS sınıflarını güncelle
        input.classList.toggle('is-invalid', !field.valid);
        input.classList.toggle('is-valid', field.valid && !field.pristine);

        // Error mesajlarını göster/gizle
        let errorContainer = input.nextElementSibling;
        if (!errorContainer || !errorContainer.classList.contains('invalid-feedback')) {
            errorContainer = document.createElement('div');
            errorContainer.className = 'invalid-feedback';
            input.parentNode.insertBefore(errorContainer, input.nextSibling);
        }

        errorContainer.textContent = field.errors.join(', ');
        errorContainer.style.display = field.valid ? 'none' : 'block';

        // ARIA attributelerini güncelle
        input.setAttribute('aria-invalid', !field.valid);
        if (field.errors.length > 0) {
            input.setAttribute('aria-errormessage', field.errors[0]);
        } else {
            input.removeAttribute('aria-errormessage');
        }
    }

    getFormData(form) {
        const formData = new FormData(form);
        const data = {};

        for (const [key, value] of formData.entries()) {
            if (data[key]) {
                if (!Array.isArray(data[key])) {
                    data[key] = [data[key]];
                }
                data[key].push(value);
            } else {
                data[key] = value;
            }
        }

        return data;
    }

    getFormErrors(form) {
        const config = this.forms.get(form);
        const errors = {};

        for (const [fieldName, field] of config.fields.entries()) {
            if (!field.valid) {
                errors[fieldName] = field.errors;
            }
        }

        return errors;
    }

    focusFirstInvalidField(form) {
        const config = this.forms.get(form);
        
        for (const [fieldName, field] of config.fields.entries()) {
            if (!field.valid) {
                const element = form.elements[fieldName];
                if (element) {
                    element.focus();
                    break;
                }
            }
        }
    }

    reset(form) {
        const config = this.forms.get(form);
        if (!config) return;

        form.reset();

        // Tüm alanları sıfırla
        config.fields.forEach((field, fieldName) => {
            field.pristine = true;
            field.valid = true;
            field.errors = [];

            const element = form.elements[fieldName];
            if (element) {
                element.classList.remove('is-valid', 'is-invalid');
                element.removeAttribute('aria-invalid');
                element.removeAttribute('aria-errormessage');

                const errorContainer = element.nextElementSibling;
                if (errorContainer?.classList.contains('invalid-feedback')) {
                    errorContainer.style.display = 'none';
                    errorContainer.textContent = '';
                }
            }
        });
    }

    destroy(form) {
        this.forms.delete(form);
    }
}

export default FormManager; 