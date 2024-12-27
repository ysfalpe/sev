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
let interests = new Set();
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

// İlgi alanı ekleme
function addInterest() {
    const input = document.getElementById('interest-input');
    const value = input.value.trim();
    
    if (value && !interests.has(value)) {
        interests.add(value);
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `
            ${value}
            <button onclick="removeInterest('${value}')">
                <i class="fas fa-times"></i>
            </button>
        `;
        document.getElementById('interest-tags').appendChild(tag);
        input.value = '';
    }
}

// İlgi alanı silme
function removeInterest(interest) {
    interests.delete(interest);
    const tags = document.getElementById('interest-tags');
    const tag = Array.from(tags.children).find(tag => tag.textContent.trim() === interest);
    if (tag) {
        tag.classList.add('animate__animated', 'animate__fadeOut');
        setTimeout(() => tags.removeChild(tag), 500);
    }
}

// Sohbet başlatma
async function startChat(type) {
    const language = document.getElementById('language-select').value;
    const preferences = {
        language,
        interests: Array.from(interests)
    };

    showScreen('waiting-screen');
    
    if (type === 'video') {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: true, 
                audio: true 
            });
            document.getElementById('local-video').srcObject = localStream;
        } catch (err) {
            showNotification('Kamera veya mikrofon erişimi reddedildi', 'error');
            return;
        }
    }

    socket.emit('findMatch', { type, preferences });
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

// Mesaj gönderme
function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message && peer) {
        socket.emit('message', { 
            message,
            to: peer._id  // Eşleşilen kişinin ID'si
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

// Emoji picker
function toggleEmojiPicker() {
    if (!emojiPicker) {
        emojiPicker = new EmojiPicker();
        document.getElementById('emoji-picker').appendChild(emojiPicker);
        
        emojiPicker.addEventListener('emoji-click', event => {
            const input = document.getElementById('message-input');
            input.value += event.detail.unicode;
            input.focus();
        });
    }
    
    const picker = document.getElementById('emoji-picker');
    picker.classList.toggle('active');
}

// Dosya yükleme
document.getElementById('file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
        showNotification('Sadece resim dosyaları desteklenmektedir', 'error');
        return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
        showNotification('Dosya boyutu 5MB\'dan küçük olmalıdır', 'error');
        return;
    }
    
    try {
        const reader = new FileReader();
        reader.onload = (e) => {
            socket.emit('message', { 
                type: 'image',
                data: e.target.result 
            });
            addImageMessage(e.target.result, 'sent');
        };
        reader.readAsDataURL(file);
    } catch (err) {
        showNotification('Dosya yüklenirken hata oluştu', 'error');
    }
});

// Resim mesajı ekleme
function addImageMessage(src, type) {
    const messages = document.getElementById('messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type} animate__animated animate__fadeIn`;
    
    const img = document.createElement('img');
    img.src = src;
    img.className = 'message-image';
    img.onclick = () => {
        const modal = document.createElement('div');
        modal.className = 'image-modal';
        modal.onclick = () => document.body.removeChild(modal);
        
        const modalImg = document.createElement('img');
        modalImg.src = src;
        modal.appendChild(modalImg);
        document.body.appendChild(modal);
    };
    
    messageDiv.appendChild(img);
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
    document.getElementById(screenId).classList.add('active');
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
            document.getElementById('remote-video').srcObject = stream;
            remoteStream = stream;
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
            document.getElementById('remote-video').srcObject = stream;
            remoteStream = stream;
        });
    }
    
    peer.signal(signal);
});

socket.on('message', ({ from, message, type }) => {
    if (type === 'image') {
        addImageMessage(message, 'received');
    } else {
        addMessage(message, 'received');
    }
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
document.getElementById('interest-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addInterest();
    }
});

document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Başlangıç ayarları
document.addEventListener('DOMContentLoaded', () => {
    // Tema kontrolü
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        toggleTheme();
    }
    
    // Emoji picker yükleme
    customElements.define('emoji-picker', EmojiPicker);
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
    const type = localStream ? 'video' : 'text';
    const language = document.getElementById('language-select').value;
    const preferences = {
        language,
        interests: Array.from(interests)
    };
    
    socket.emit('findMatch', { type, preferences });
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
        
        // Rapor sonrası otomatik olarak sonraki kişiye geç
        nextPartner();
    }
} 