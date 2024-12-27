// Socket.IO bağlantısı
const socket = io('http://localhost:3001');

let currentPeer = null;
let localStream = null;
let chatType = null;
let currentPartner = null;
let screenStream = null;
let interests = new Set();

// DOM elementleri
const screens = {
    welcome: document.getElementById('welcome-screen'),
    chat: document.getElementById('chat-screen'),
    waiting: document.getElementById('waiting-screen')
};

const videoElements = {
    local: document.getElementById('local-video'),
    remote: document.getElementById('remote-video')
};

// Tema değiştirme
function toggleTheme() {
    document.body.classList.toggle('dark-theme');
    const icon = document.querySelector('.theme-toggle i');
    icon.classList.toggle('fa-moon');
    icon.classList.toggle('fa-sun');
    
    // Tema tercihini kaydet
    const isDark = document.body.classList.contains('dark-theme');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

// Kaydedilmiş tema tercihini yükle
if (localStorage.getItem('theme') === 'dark') {
    toggleTheme();
}

// İlgi alanı ekleme
function addInterest() {
    const input = document.getElementById('interest-input');
    const interest = input.value.trim().toLowerCase();
    
    if (interest && interests.size < 5) {
        interests.add(interest);
        updateInterestTags();
        input.value = '';
    }
}

// İlgi alanı silme
function removeInterest(interest) {
    interests.delete(interest);
    updateInterestTags();
}

// İlgi alanı etiketlerini güncelleme
function updateInterestTags() {
    const container = document.getElementById('interest-tags');
    container.innerHTML = '';
    
    interests.forEach(interest => {
        const tag = document.createElement('div');
        tag.className = 'tag';
        tag.innerHTML = `
            ${interest}
            <button onclick="removeInterest('${interest}')">&times;</button>
        `;
        container.appendChild(tag);
    });
}

// Emoji seçici
function toggleEmojiPicker() {
    const picker = document.getElementById('emoji-picker');
    picker.classList.toggle('active');
}

// Dosya yükleme ve önizleme
document.getElementById('file-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            alert('Dosya boyutu çok büyük. Maximum 5MB.');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            sendFile(file.name, e.target.result);
        };
        reader.readAsDataURL(file);
    }
});

// Dosya gönderme
function sendFile(fileName, fileData) {
    if (currentPartner) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message sent';
        
        if (fileData.startsWith('data:image')) {
            const img = document.createElement('img');
            img.src = fileData;
            img.className = 'file-preview';
            messageElement.appendChild(img);
        } else {
            const link = document.createElement('a');
            link.href = fileData;
            link.download = fileName;
            link.textContent = fileName;
            messageElement.appendChild(link);
        }
        
        document.getElementById('messages').appendChild(messageElement);
        
        socket.emit('message', {
            to: currentPartner,
            message: {
                type: 'file',
                fileName,
                fileData
            }
        });
    }
}

// Ekran paylaşımı
async function toggleScreenShare() {
    if (!screenStream) {
        try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
            videoElements.local.srcObject = screenStream;
            if (currentPeer) {
                const videoTrack = screenStream.getVideoTracks()[0];
                const sender = currentPeer.getSenders().find(s => s.track.kind === 'video');
                sender.replaceTrack(videoTrack);
            }
            document.getElementById('screen-share').textContent = 'Ekranı Durdur';
        } catch (err) {
            console.error('Ekran paylaşımı hatası:', err);
        }
    } else {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
        if (localStream) {
            videoElements.local.srcObject = localStream;
            if (currentPeer) {
                const videoTrack = localStream.getVideoTracks()[0];
                const sender = currentPeer.getSenders().find(s => s.track.kind === 'video');
                sender.replaceTrack(videoTrack);
            }
        }
        document.getElementById('screen-share').textContent = 'Ekran Paylaş';
    }
}

// Oda oluşturma
function createRoom() {
    const name = document.getElementById('room-name').value.trim();
    const topic = document.getElementById('room-topic').value.trim();
    
    if (name && topic) {
        socket.emit('createRoom', { name, topic });
    }
}

// Odaya katılma
function joinRoom(roomId) {
    socket.emit('joinRoom', { roomId });
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
    
    if (reason && currentPartner) {
        socket.emit('reportUser', {
            userId: currentPartner,
            reason,
            details
        });
        closeReportModal();
        alert('Raporunuz gönderildi. Teşekkür ederiz.');
    }
}

// Ekran değiştirme fonksiyonu
function showScreen(screenId) {
    Object.values(screens).forEach(screen => screen.classList.remove('active'));
    screens[screenId].classList.add('active');
}

// Sohbeti başlatma
async function startChat(type) {
    chatType = type;
    showScreen('waiting');

    const preferences = {
        language: document.getElementById('language-select').value,
        interests: Array.from(interests)
    };

    if (type === 'video') {
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                }, 
                audio: true 
            });
            videoElements.local.srcObject = localStream;
        } catch (err) {
            alert('Kamera erişimi sağlanamadı: ' + err.message);
            showScreen('welcome');
            return;
        }
    }

    socket.emit('findMatch', { type, preferences });
}

// Eşleşme bulunduğunda
socket.on('matchFound', async ({ partnerId }) => {
    currentPartner = partnerId;
    showScreen('chat');

    if (chatType === 'video') {
        initializePeerConnection(partnerId);
    }
});

// WebRTC bağlantısını başlatma
function initializePeerConnection(partnerId) {
    const peer = new SimplePeer({
        initiator: true,
        stream: localStream,
        trickle: false,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
    });

    currentPeer = peer;

    peer.on('signal', data => {
        socket.emit('signal', {
            signal: data,
            to: partnerId
        });
    });

    peer.on('stream', stream => {
        videoElements.remote.srcObject = stream;
    });

    peer.on('error', err => {
        console.error('Peer bağlantı hatası:', err);
        endChat();
    });

    socket.on('signal', ({ from, signal }) => {
        if (from === partnerId) {
            peer.signal(signal);
        }
    });
}

// Mesaj gönderme
function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message && currentPartner) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message sent';
        messageElement.textContent = message;
        document.getElementById('messages').appendChild(messageElement);
        
        socket.emit('message', {
            to: currentPartner,
            message
        });
        
        input.value = '';
    }
}

// Mesaj alma
socket.on('message', ({ from, message }) => {
    if (from === currentPartner) {
        const messageElement = document.createElement('div');
        messageElement.className = 'message received';
        
        if (typeof message === 'object' && message.type === 'file') {
            if (message.fileData.startsWith('data:image')) {
                const img = document.createElement('img');
                img.src = message.fileData;
                img.className = 'file-preview';
                messageElement.appendChild(img);
            } else {
                const link = document.createElement('a');
                link.href = message.fileData;
                link.download = message.fileName;
                link.textContent = message.fileName;
                messageElement.appendChild(link);
            }
        } else {
            messageElement.textContent = message;
        }
        
        document.getElementById('messages').appendChild(messageElement);
        messageElement.scrollIntoView({ behavior: 'smooth' });
    }
});

// Video/ses kontrolü
function toggleVideo() {
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        videoTrack.enabled = !videoTrack.enabled;
        document.getElementById('video-toggle').textContent = 
            videoTrack.enabled ? 'Kamerayı Kapat' : 'Kamerayı Aç';
    }
}

function toggleAudio() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        audioTrack.enabled = !audioTrack.enabled;
        document.getElementById('audio-toggle').textContent = 
            audioTrack.enabled ? 'Sesi Kapat' : 'Sesi Aç';
    }
}

// Sohbeti sonlandırma
function endChat() {
    if (currentPeer) {
        currentPeer.destroy();
        currentPeer = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    
    socket.emit('leaveChat');
    currentPartner = null;
    showScreen('welcome');
}

// Yeni eşleşme arama
function nextPartner() {
    endChat();
    startChat(chatType);
}

// Arama iptal
function cancelSearch() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    socket.emit('leaveChat');
    showScreen('welcome');
}

// Partner ayrıldığında
socket.on('partnerLeft', () => {
    alert('Karşı taraf sohbetten ayrıldı.');
    endChat();
});

// Yasaklama durumu
socket.on('banned', ({ reason }) => {
    alert(`Hesabınız şu sebepten dolayı yasaklandı: ${reason}`);
    endChat();
});

// Oda listesini güncelleme
socket.on('roomList', (rooms) => {
    const container = document.getElementById('room-list');
    container.innerHTML = '';
    
    rooms.forEach(room => {
        const div = document.createElement('div');
        div.className = 'room-item';
        div.innerHTML = `
            <div>
                <strong>${room.name}</strong>
                <p>${room.topic}</p>
            </div>
            <button onclick="joinRoom('${room._id}')" class="btn-small">Katıl</button>
        `;
        container.appendChild(div);
    });
}); 