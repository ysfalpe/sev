// Socket.io bağlantısı
const socket = io();

// WebRTC değişkenleri
let peer = null;
let localStream = null;
let remoteStream = null;
let isVideoEnabled = true;
let isAudioEnabled = true;
let isScreenSharing = false;

// UI değişkenleri
let currentTheme = 'light';
let emojiPicker = null;
let notificationTimeout = null;

// Tema değiştirme
function toggleTheme() {
    const body = document.body;
    const themeIcon = document.querySelector('.theme-toggle i');
    
    if (currentTheme === 'light') {
        body.classList.remove('light-theme');
        body.classList.add('dark-theme');
        themeIcon.classList.remove('fa-moon');
        themeIcon.classList.add('fa-sun');
        currentTheme = 'dark';
    } else {
        body.classList.remove('dark-theme');
        body.classList.add('light-theme');
        themeIcon.classList.remove('fa-sun');
        themeIcon.classList.add('fa-moon');
        currentTheme = 'light';
    }
}

// Sohbet başlatma
async function startChat() {
    showScreen('waiting-screen');
    showNotification('Arama başlatılıyor...', 'info');
    
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: true, 
            audio: true 
        });
        document.getElementById('local-video').srcObject = localStream;
        
        // Arama başlatma animasyonu
        const loadingContainer = document.querySelector('.loading-container');
        loadingContainer.style.animation = 'pulse 2s infinite';
        const loadingSpinner = document.querySelector('.loading-spinner');
        loadingSpinner.style.animation = 'spin 1s linear infinite';
        
        socket.emit('findMatch', { type: 'video' });
    } catch (err) {
        showNotification('Kamera veya mikrofon erişimi reddedildi', 'error');
        showScreen('welcome-screen');
        return;
    }
}

// Video kontrolü
function toggleVideo() {
    const videoTrack = localStream.getVideoTracks()[0];
    videoTrack.enabled = !videoTrack.enabled;
    isVideoEnabled = videoTrack.enabled;
    
    const btn = document.getElementById('video-toggle');
    btn.innerHTML = isVideoEnabled ? 
        '<i class="fas fa-video"></i>' : 
        '<i class="fas fa-video-slash"></i>';
    
    showNotification(isVideoEnabled ? 'Kamera açıldı' : 'Kamera kapatıldı');
}

// Ses kontrolü
function toggleAudio() {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    isAudioEnabled = audioTrack.enabled;
    
    const btn = document.getElementById('audio-toggle');
    btn.innerHTML = isAudioEnabled ? 
        '<i class="fas fa-microphone"></i>' : 
        '<i class="fas fa-microphone-slash"></i>';
    
    showNotification(isAudioEnabled ? 'Mikrofon açıldı' : 'Mikrofon kapatıldı');
}

// Ekran paylaşımı
async function toggleScreenShare() {
    if (!isScreenSharing) {
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
                video: true 
            });
            const videoTrack = screenStream.getVideoTracks()[0];
            
            videoTrack.onended = () => {
                stopScreenShare();
            };

            const sender = peer.getSenders().find(s => s.track.kind === 'video');
            await sender.replaceTrack(videoTrack);
            
            isScreenSharing = true;
            document.getElementById('screen-share').classList.add('active');
            showNotification('Ekran paylaşımı başlatıldı');
        } catch (err) {
            showNotification('Ekran paylaşımı başlatılamadı', 'error');
        }
    } else {
        stopScreenShare();
    }
}

// Ekran paylaşımını durdurma
async function stopScreenShare() {
    if (isScreenSharing) {
        const videoTrack = localStream.getVideoTracks()[0];
        const sender = peer.getSenders().find(s => s.track.kind === 'video');
        await sender.replaceTrack(videoTrack);
        
        isScreenSharing = false;
        document.getElementById('screen-share').classList.remove('active');
        showNotification('Ekran paylaşımı durduruldu');
    }
}

// Mesaj gönderme
function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message && peer) {
        socket.emit('message', { 
            message,
            to: peer._id
        });
        addMessage(message, 'sent');
        input.value = '';
    }
}

// Mesaj ekleme
function addMessage(message, type) {
    const messages = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type} animate__animated animate__fadeIn`;
    messageDiv.textContent = message;
    messages.appendChild(messageDiv);
    messages.scrollTop = messages.scrollHeight;
}

// Bildirim gösterme
function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} animate__animated animate__fadeInDown`;
    
    if (notificationTimeout) {
        clearTimeout(notificationTimeout);
    }
    
    notificationTimeout = setTimeout(() => {
        notification.classList.remove('animate__fadeInDown');
        notification.classList.add('animate__fadeOutUp');
        
        setTimeout(() => {
            notification.className = 'notification';
            notification.textContent = '';
        }, 500);
    }, 3000);
}

// Ekran değiştirme
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    const targetScreen = document.getElementById(screenId);
    targetScreen.classList.add('active');
    
    // Ekran geçiş animasyonları
    if (screenId === 'waiting-screen') {
        const loadingSpinner = document.querySelector('.loading-spinner');
        loadingSpinner.style.animation = 'spin 1s linear infinite';
        const loadingContainer = document.querySelector('.loading-container');
        loadingContainer.style.animation = 'pulse 2s infinite';
    }
}

// Socket.io event listeners
socket.on('matchFound', ({ partnerId }) => {
    showScreen('chat-screen');
    showNotification('Eşleşme bulundu!', 'success');
    
    if (localStream) {
        peer = new SimplePeer({
            initiator: true,
            stream: localStream
        });
        peer._id = partnerId;
        
        peer.on('signal', signal => {
            socket.emit('signal', { to: partnerId, signal });
        });
        
        peer.on('stream', stream => {
            const remoteVideo = document.getElementById('remote-video');
            remoteVideo.srcObject = stream;
            remoteVideo.classList.add('animate__animated', 'animate__fadeIn');
            remoteStream = stream;
        });
        
        peer.on('error', err => {
            showNotification('Bağlantı hatası oluştu', 'error');
            endChat();
        });
    }
});

socket.on('signal', ({ from, signal }) => {
    if (!peer) {
        peer = new SimplePeer({
            stream: localStream
        });
        peer._id = from;
        
        peer.on('signal', signal => {
            socket.emit('signal', { to: from, signal });
        });
        
        peer.on('stream', stream => {
            const remoteVideo = document.getElementById('remote-video');
            remoteVideo.srcObject = stream;
            remoteVideo.classList.add('animate__animated', 'animate__fadeIn');
            remoteStream = stream;
        });
    }
    
    peer.signal(signal);
});

socket.on('message', ({ from, message }) => {
    addMessage(message, 'received');
});

socket.on('partnerLeft', () => {
    showNotification('Eşleşilen kişi ayrıldı', 'warning');
    if (peer) {
        peer.destroy();
        peer = null;
    }
    showScreen('welcome-screen');
});

// Event listeners
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Başlangıç ayarları
document.addEventListener('DOMContentLoaded', () => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        toggleTheme();
    }
});

// Sohbeti sonlandırma
function endChat() {
    if (peer) {
        peer.destroy();
        peer = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    socket.emit('leaveChat');
    showScreen('welcome-screen');
    showNotification('Sohbet sonlandırıldı', 'info');
}

// Sonraki kişiyi bulma
function nextPartner() {
    if (peer) {
        peer.destroy();
        peer = null;
    }
    
    showScreen('waiting-screen');
    
    // Arama başlatma animasyonu
    const loadingSpinner = document.querySelector('.loading-spinner');
    loadingSpinner.style.animation = 'spin 1s linear infinite';
    const loadingContainer = document.querySelector('.loading-container');
    loadingContainer.style.animation = 'pulse 2s infinite';
    
    socket.emit('findMatch', { type: 'video' });
    showNotification('Yeni eşleşme aranıyor...', 'info');
}

// Arama iptali
function cancelSearch() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    socket.emit('leaveChat');
    showScreen('welcome-screen');
    showNotification('Arama iptal edildi', 'info');
}

// Raporlama modalı
function reportUser() {
    document.getElementById('report-modal').classList.add('active');
}

function closeReportModal() {
    document.getElementById('report-modal').classList.remove('active');
}

function submitReport() {
    const reason = document.getElementById('report-reason').value;
    const details = document.getElementById('report-details').value;
    
    if (!reason) {
        showNotification('Lütfen bir sebep seçin', 'error');
        return;
    }
    
    if (peer) {
        socket.emit('reportUser', {
            userId: peer._id,
            reason,
            details
        });
        
        closeReportModal();
        showNotification('Kullanıcı rapor edildi', 'success');
        nextPartner();
    }
} 