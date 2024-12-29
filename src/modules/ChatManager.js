import { ERROR_MESSAGES } from '../config/constants.js';

export class ChatManager {
    constructor() {
        this.messages = [];
        this.isRecording = false;
        this.recorder = null;
        this.recordedChunks = [];
        this.isAutoScrollEnabled = true;
        this.isTranslationEnabled = false;
        this.backgroundBlurEnabled = false;
        this.currentFilter = null;
        this.uploadQueue = new Map();
        this.messageFormatter = new MessageFormatter();
        this.setupEventListeners();
    }

    setupEventListeners() {
        // Mesaj giriş alanı için karakter sayacı
        const messageInput = document.getElementById('message-input');
        const charCount = document.querySelector('.char-count');
        
        messageInput.addEventListener('input', () => {
            const length = messageInput.value.length;
            charCount.textContent = `${length}/1000`;
            charCount.style.color = length > 900 ? 'red' : 'inherit';
        });

        // Dosya yükleme işleyicisi
        const fileInput = document.getElementById('file-input');
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    }

    handleMessageInput(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendMessage();
        }
    }

    async sendMessage() {
        const input = document.getElementById('message-input');
        const message = input.value.trim();
        
        if (!message && this.uploadQueue.size === 0) return;

        try {
            // Metin mesajını gönder
            if (message) {
                await this.sendTextMessage(message);
            }

            // Bekleyen dosyaları gönder
            if (this.uploadQueue.size > 0) {
                await this.processUploadQueue();
            }

            input.value = '';
            document.querySelector('.char-count').textContent = '0/1000';
        } catch (error) {
            this.showError('Mesaj gönderilemedi: ' + error.message);
        }
    }

    async sendTextMessage(text) {
        const message = {
            id: Date.now(),
            type: 'text',
            content: text,
            sender: 'me',
            timestamp: new Date(),
            status: 'sending'
        };

        this.addMessageToUI(message);
        await this.sendToServer(message);
        this.updateMessageStatus(message.id, 'sent');
    }

    async handleFileSelect(event) {
        const files = Array.from(event.target.files);
        const maxSize = 10 * 1024 * 1024; // 10MB limit

        for (const file of files) {
            if (file.size > maxSize) {
                this.showError(`${file.name} boyutu çok büyük. Maksimum 10MB yükleyebilirsiniz.`);
                continue;
            }

            const id = Date.now() + Math.random();
            this.uploadQueue.set(id, {
                file,
                progress: 0,
                status: 'waiting'
            });

            this.showUploadProgress(id, file.name, 0);
        }

        if (this.uploadQueue.size > 0) {
            this.processUploadQueue();
        }
    }

    async processUploadQueue() {
        for (const [id, upload] of this.uploadQueue) {
            try {
                const url = await this.uploadFile(upload.file, (progress) => {
                    this.updateUploadProgress(id, progress);
                });

                await this.sendFileMessage(upload.file, url);
                this.uploadQueue.delete(id);
                this.hideUploadProgress(id);
            } catch (error) {
                this.showError(`${upload.file.name} yüklenemedi: ${error.message}`);
                this.uploadQueue.delete(id);
                this.hideUploadProgress(id);
            }
        }
    }

    async uploadFile(file, onProgress) {
        // Simüle edilmiş dosya yükleme
        return new Promise((resolve) => {
            let progress = 0;
            const interval = setInterval(() => {
                progress += 10;
                onProgress(progress);
                if (progress >= 100) {
                    clearInterval(interval);
                    resolve('https://example.com/uploaded-file.jpg');
                }
            }, 500);
        });
    }

    showUploadProgress(id, filename, progress) {
        const progressContainer = document.getElementById('upload-progress');
        const progressElement = document.createElement('div');
        progressElement.id = `upload-${id}`;
        progressElement.innerHTML = `
            <div class="progress-info">
                <span class="filename">${filename}</span>
                <span class="progress-text">${progress}%</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill" style="width: ${progress}%"></div>
            </div>
        `;
        progressContainer.appendChild(progressElement);
    }

    updateUploadProgress(id, progress) {
        const element = document.getElementById(`upload-${id}`);
        if (element) {
            element.querySelector('.progress-text').textContent = `${progress}%`;
            element.querySelector('.progress-fill').style.width = `${progress}%`;
        }
    }

    hideUploadProgress(id) {
        const element = document.getElementById(`upload-${id}`);
        if (element) {
            element.remove();
        }
    }

    addMessageToUI(message) {
        const messagesContainer = document.getElementById('messages');
        const messageElement = document.createElement('div');
        messageElement.className = `message ${message.sender}`;
        messageElement.id = `message-${message.id}`;

        const timestamp = new Date(message.timestamp).toLocaleTimeString();
        
        messageElement.innerHTML = `
            <div class="message-content">
                ${this.messageFormatter.format(message.content)}
            </div>
            <div class="message-info">
                <span class="message-time">${timestamp}</span>
                <span class="message-status">${message.status}</span>
            </div>
        `;

        messagesContainer.appendChild(messageElement);
        
        if (this.isAutoScrollEnabled) {
            this.scrollToBottom();
        }
    }

    updateMessageStatus(messageId, status) {
        const messageElement = document.getElementById(`message-${messageId}`);
        if (messageElement) {
            const statusElement = messageElement.querySelector('.message-status');
            statusElement.textContent = status;
        }
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('messages');
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    toggleAutoScroll() {
        this.isAutoScrollEnabled = !this.isAutoScrollEnabled;
        if (this.isAutoScrollEnabled) {
            this.scrollToBottom();
        }
    }

    toggleTranslation() {
        this.isTranslationEnabled = !this.isTranslationEnabled;
        // Mevcut mesajları çevir
        if (this.isTranslationEnabled) {
            this.translateMessages();
        } else {
            this.showOriginalMessages();
        }
    }

    async translateMessages() {
        // Çeviri API'si entegrasyonu
    }

    showOriginalMessages() {
        // Orijinal mesajları göster
    }

    // Video kontrolleri
    async toggleBackgroundBlur() {
        this.backgroundBlurEnabled = !this.backgroundBlurEnabled;
        const videoTrack = this.localStream?.getVideoTracks()[0];
        
        if (videoTrack) {
            // TensorFlow.js ile arka plan bulanıklaştırma
        }
    }

    applyFilter(filterName) {
        this.currentFilter = filterName;
        const videoElement = document.getElementById('local-video');
        
        // CSS filtreleri uygula
        const filters = {
            none: '',
            grayscale: 'grayscale(1)',
            sepia: 'sepia(1)',
            vintage: 'sepia(0.5) contrast(1.2)',
            blur: 'blur(3px)'
        };

        videoElement.style.filter = filters[filterName] || '';
    }

    async takeSnapshot() {
        const video = document.getElementById('local-video');
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const context = canvas.getContext('2d');
        context.drawImage(video, 0, 0);
        
        try {
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg'));
            const url = URL.createObjectURL(blob);
            
            // Kullanıcıya indirme seçeneği sun
            const a = document.createElement('a');
            a.href = url;
            a.download = `snapshot-${Date.now()}.jpg`;
            a.click();
            
            URL.revokeObjectURL(url);
        } catch (error) {
            this.showError('Ekran görüntüsü alınamadı: ' + error.message);
        }
    }

    startRecording() {
        if (this.isRecording) return;

        const mediaStream = document.getElementById('local-video').srcObject;
        this.recorder = new MediaRecorder(mediaStream);
        this.recordedChunks = [];

        this.recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        this.recorder.onstop = () => {
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `recording-${Date.now()}.webm`;
            a.click();
            
            URL.revokeObjectURL(url);
        };

        this.recorder.start();
        this.isRecording = true;
        
        // UI güncelleme
        const recordButton = document.querySelector('[onclick="startRecording()"]');
        recordButton.innerHTML = '<i class="fas fa-stop"></i>';
        recordButton.onclick = () => this.stopRecording();
    }

    stopRecording() {
        if (!this.isRecording) return;

        this.recorder.stop();
        this.isRecording = false;
        
        // UI güncelleme
        const recordButton = document.querySelector('[onclick="stopRecording()"]');
        recordButton.innerHTML = '<i class="fas fa-record-vinyl"></i>';
        recordButton.onclick = () => this.startRecording();
    }

    showError(message) {
        // NotificationManager üzerinden hata göster
        window.dispatchEvent(new CustomEvent('showNotification', {
            detail: { message, type: 'error' }
        }));
    }
}

class MessageFormatter {
    format(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Kalın
            .replace(/\*(.*?)\*/g, '<em>$1</em>') // İtalik
            .replace(/`(.*?)`/g, '<code>$1</code>') // Kod
            .replace(/\n/g, '<br>') // Satır sonu
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>'); // Linkler
    }
}

export { ChatManager }; 