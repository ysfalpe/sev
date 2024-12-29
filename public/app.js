import { MediaManager } from '../src/modules/MediaManager.js';
import { WebRTCManager } from '../src/modules/WebRTCManager.js';
import { ChatManager } from '../src/modules/ChatManager.js';
import { SecurityManager } from '../src/modules/SecurityManager.js';
import { NotificationManager } from '../src/modules/NotificationManager.js';

class App {
    constructor() {
        this.mediaManager = new MediaManager();
        this.securityManager = new SecurityManager();
        this.notificationManager = new NotificationManager();
        this.webRTCManager = new WebRTCManager(this.mediaManager);
        this.chatManager = new ChatManager();
        
        this.currentScreen = 'welcome';
        this.isInitialized = false;
        this.isSearching = false;
        
        this.setupEventListeners();
    }

    async initialize() {
        try {
            // Medya yöneticisini başlat
            await this.mediaManager.initialize();
            
            // Socket.io bağlantısını kur
            this.setupSocketConnection();
            
            this.isInitialized = true;
            return true;
        } catch (error) {
            console.error('Uygulama başlatma hatası:', error);
            this.notificationManager.showError('Uygulama başlatılamadı: ' + error.message);
            return false;
        }
    }

    setupEventListeners() {
        // Başlat düğmesi
        const startButton = document.getElementById('startChatBtn');
        if (startButton) {
            startButton.addEventListener('click', () => this.startChat());
        }

        // Tema değiştirme
        const themeToggle = document.querySelector('.theme-toggle button');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => this.toggleTheme());
        }

        // Medya kontrolleri
        document.getElementById('video-toggle')?.addEventListener('click', () => this.toggleVideo());
        document.getElementById('audio-toggle')?.addEventListener('click', () => this.toggleAudio());
        document.getElementById('screen-share')?.addEventListener('click', () => this.toggleScreenShare());

        // Cihaz seçimi
        document.getElementById('camera-select')?.addEventListener('change', (e) => this.switchCamera(e.target.value));
        document.getElementById('microphone-select')?.addEventListener('change', (e) => this.switchMicrophone(e.target.value));

        // Kalite ayarı
        document.getElementById('quality-select')?.addEventListener('change', (e) => this.setVideoQuality(e.target.value));

        // Sohbet kontrolleri
        document.getElementById('message-input')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.chatManager.sendMessage();
            }
        });

        // Yaş doğrulama
        const ageVerification = document.getElementById('ageVerification');
        const termsVerification = document.getElementById('termsVerification');
        if (ageVerification && termsVerification) {
            ageVerification.addEventListener('change', () => this.updateStartButton());
            termsVerification.addEventListener('change', () => this.updateStartButton());
        }
    }

    updateStartButton() {
        const startButton = document.getElementById('startChatBtn');
        const ageVerified = document.getElementById('ageVerification').checked;
        const termsAccepted = document.getElementById('termsVerification').checked;
        
        if (startButton) {
            startButton.disabled = !(ageVerified && termsAccepted);
        }
    }

    setupSocketConnection() {
        this.socket = io('/', {
            transports: ['websocket'],
            upgrade: false
        });

        this.socket.on('connect', () => {
            console.log('Socket.io bağlantısı kuruldu');
            this.notificationManager.showSuccess('Sunucuya bağlanıldı');
        });

        this.socket.on('disconnect', () => {
            console.log('Socket.io bağlantısı kesildi');
            this.notificationManager.showError('Sunucu bağlantısı kesildi');
        });

        this.socket.on('match', async (data) => {
            await this.handleMatch(data);
        });

        this.socket.on('offer', async (offer) => {
            await this.webRTCManager.handleOffer(offer);
        });

        this.socket.on('answer', async (answer) => {
            await this.webRTCManager.handleAnswer(answer);
        });

        this.socket.on('ice-candidate', async (candidate) => {
            await this.webRTCManager.handleIceCandidate(candidate);
        });
    }

    async startChat() {
        if (!this.isInitialized) {
            await this.initialize();
        }

        try {
            // Medya izinlerini al
            const stream = await this.mediaManager.getLocalStream();
            
            // Video elementine bağla
            const localVideo = document.getElementById('local-video');
            if (localVideo) {
                localVideo.srcObject = stream;
            }

            // WebRTC bağlantısını başlat
            await this.webRTCManager.initialize(stream, true);

            // Eşleşme aramaya başla
            this.startSearching();

            // Ekranı değiştir
            this.switchScreen('waiting');
        } catch (error) {
            console.error('Sohbet başlatma hatası:', error);
            this.notificationManager.showError('Sohbet başlatılamadı: ' + error.message);
        }
    }

    startSearching() {
        if (this.isSearching) return;

        this.isSearching = true;
        this.socket.emit('search');

        // Bekleme süresini başlat
        this.startWaitingTimer();
    }

    startWaitingTimer() {
        let seconds = 0;
        const timerElement = document.getElementById('waiting-time');
        
        this.waitingTimer = setInterval(() => {
            seconds++;
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = seconds % 60;
            if (timerElement) {
                timerElement.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
            }
        }, 1000);
    }

    async handleMatch(data) {
        this.isSearching = false;
        clearInterval(this.waitingTimer);

        try {
            // WebRTC bağlantısını kur
            await this.webRTCManager.initialize(this.mediaManager.localStream, false);
            
            // Ekranı değiştir
            this.switchScreen('chat');
            
            this.notificationManager.showSuccess('Eşleşme bulundu!');
        } catch (error) {
            console.error('Eşleşme hatası:', error);
            this.notificationManager.showError('Eşleşme başarısız: ' + error.message);
            this.endChat();
        }
    }

    switchScreen(screenId) {
        const screens = ['welcome', 'waiting', 'chat'];
        screens.forEach(screen => {
            const element = document.getElementById(`${screen}-screen`);
            if (element) {
                element.classList.toggle('active', screen === screenId);
            }
        });
        this.currentScreen = screenId;
    }

    async toggleVideo() {
        const enabled = this.mediaManager.toggleVideo();
        const button = document.getElementById('video-toggle');
        if (button) {
            button.innerHTML = `<i class="fas fa-video${enabled ? '' : '-slash'}"></i>`;
        }
    }

    async toggleAudio() {
        const enabled = this.mediaManager.toggleAudio();
        const button = document.getElementById('audio-toggle');
        if (button) {
            button.innerHTML = `<i class="fas fa-microphone${enabled ? '' : '-slash'}"></i>`;
        }
    }

    async toggleScreenShare() {
        try {
            if (!this.mediaManager.isScreenSharing) {
                const stream = await this.mediaManager.startScreenShare();
                const videoTrack = stream.getVideoTracks()[0];
                
                // WebRTC üzerinden gönder
                const sender = this.webRTCManager.peer?.getSenders()
                    .find(s => s.track?.kind === 'video');
                
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                }
                
                document.getElementById('screen-share')?.classList.add('active');
            } else {
                this.mediaManager.stopScreenShare();
                
                // Kamera görüntüsüne geri dön
                const videoTrack = this.mediaManager.localStream.getVideoTracks()[0];
                const sender = this.webRTCManager.peer?.getSenders()
                    .find(s => s.track?.kind === 'video');
                
                if (sender) {
                    await sender.replaceTrack(videoTrack);
                }
                
                document.getElementById('screen-share')?.classList.remove('active');
            }
        } catch (error) {
            console.error('Ekran paylaşımı hatası:', error);
            this.notificationManager.showError('Ekran paylaşımı başarısız: ' + error.message);
        }
    }

    async switchCamera(deviceId) {
        try {
            await this.mediaManager.switchCamera(deviceId);
        } catch (error) {
            console.error('Kamera değiştirme hatası:', error);
            this.notificationManager.showError('Kamera değiştirilemedi: ' + error.message);
        }
    }

    async switchMicrophone(deviceId) {
        try {
            await this.mediaManager.switchMicrophone(deviceId);
        } catch (error) {
            console.error('Mikrofon değiştirme hatası:', error);
            this.notificationManager.showError('Mikrofon değiştirilemedi: ' + error.message);
        }
    }

    setVideoQuality(quality) {
        const constraints = {
            low: { width: 640, height: 480, frameRate: 15 },
            medium: { width: 1280, height: 720, frameRate: 30 },
            high: { width: 1920, height: 1080, frameRate: 30 }
        };

        if (this.mediaManager.localStream) {
            const videoTrack = this.mediaManager.localStream.getVideoTracks()[0];
            if (videoTrack) {
                videoTrack.applyConstraints({
                    width: constraints[quality].width,
                    height: constraints[quality].height,
                    frameRate: constraints[quality].frameRate
                }).catch(error => {
                    console.error('Video kalitesi ayarlama hatası:', error);
                    this.notificationManager.showError('Video kalitesi ayarlanamadı');
                });
            }
        }
    }

    toggleTheme() {
        const body = document.body;
        const isDark = body.classList.contains('dark-theme');
        
        body.classList.remove(isDark ? 'dark-theme' : 'light-theme');
        body.classList.add(isDark ? 'light-theme' : 'dark-theme');
        
        const button = document.querySelector('.theme-toggle i');
        if (button) {
            button.className = `fas fa-${isDark ? 'sun' : 'moon'}`;
        }
        
        localStorage.setItem('theme', isDark ? 'light' : 'dark');
    }

    reportUser() {
        const reportModal = document.getElementById('report-modal');
        if (reportModal) {
            reportModal.classList.add('show');
        }
    }

    async submitReport() {
        const reason = document.getElementById('report-reason').value;
        const details = document.getElementById('report-details').value;

        if (!reason) {
            this.notificationManager.showError('Lütfen bir sebep seçin');
            return;
        }

        try {
            this.securityManager.reportUser(this.currentPeerId, reason, details);
            this.notificationManager.showSuccess('Rapor gönderildi');
            this.closeReportModal();
        } catch (error) {
            console.error('Rapor gönderme hatası:', error);
            this.notificationManager.showError('Rapor gönderilemedi: ' + error.message);
        }
    }

    closeReportModal() {
        const reportModal = document.getElementById('report-modal');
        if (reportModal) {
            reportModal.classList.remove('show');
        }
    }

    endChat() {
        // WebRTC bağlantısını kapat
        this.webRTCManager.cleanup();
        
        // Medya akışlarını durdur
        this.mediaManager.cleanup();
        
        // Socket bağlantısını temizle
        if (this.socket) {
            this.socket.emit('end-chat');
        }
        
        // Ekranı sıfırla
        this.switchScreen('welcome');
        
        // Zamanlayıcıyı temizle
        if (this.waitingTimer) {
            clearInterval(this.waitingTimer);
        }
        
        this.isSearching = false;
    }

    cleanup() {
        this.endChat();
        this.chatManager.cleanup();
        this.notificationManager.cleanup();
        this.securityManager.cleanup();
        
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Uygulamayı başlat
const app = new App();
window.app = app; // Global erişim için

// Sayfa yüklendiğinde
document.addEventListener('DOMContentLoaded', () => {
    // Kaydedilmiş temayı uygula
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.classList.add(`${savedTheme}-theme`);
    
    // Uygulamayı başlat
    app.initialize().catch(error => {
        console.error('Uygulama başlatma hatası:', error);
    });
}); 