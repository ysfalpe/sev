const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const Filter = require('bad-words');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

const app = express();
const filter = new Filter();

// SQLite bağlantısı
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './database.sqlite',
    logging: false
});

// Veritabanı modelleri
const User = sequelize.define('User', {
    socketId: {
        type: DataTypes.STRING,
        unique: true
    },
    ip: DataTypes.STRING,
    isBanned: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    banReason: DataTypes.STRING,
    lastActive: DataTypes.DATE,
    language: DataTypes.STRING,
    interests: {
        type: DataTypes.STRING,
        get() {
            const value = this.getDataValue('interests');
            return value ? JSON.parse(value) : [];
        },
        set(value) {
            this.setDataValue('interests', JSON.stringify(value));
        }
    }
});

const Report = sequelize.define('Report', {
    reportedUserId: DataTypes.INTEGER,
    reportedByUserId: DataTypes.INTEGER,
    reason: DataTypes.STRING,
    details: DataTypes.TEXT
});

const Room = sequelize.define('Room', {
    name: DataTypes.STRING,
    topic: DataTypes.STRING,
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
});

// Veritabanını senkronize et
sequelize.sync();

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));

const server = http.createServer(app);
const io = socketIO(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Aktif kullanıcıları takip etmek için
let waitingUsers = {
    video: new Map(),
    text: new Map()
};

let activeRooms = new Map();

// Socket.IO bağlantı yönetimi
io.on('connection', async (socket) => {
    const clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
    
    // Kullanıcı kontrolü
    const bannedUser = await User.findOne({ 
        where: { 
            ip: clientIp,
            isBanned: true
        }
    });

    if (bannedUser) {
        socket.emit('banned', { reason: bannedUser.banReason });
        socket.disconnect();
        return;
    }

    // Yeni kullanıcı oluştur
    const user = await User.create({
        socketId: socket.id,
        ip: clientIp,
        lastActive: new Date()
    });

    console.log('Yeni kullanıcı bağlandı:', socket.id);

    // Kullanıcı tercihleri güncelleme
    socket.on('updatePreferences', async ({ language, interests }) => {
        await User.update(
            { language, interests },
            { where: { socketId: socket.id } }
        );
    });

    // Eşleşme bulma
    socket.on('findMatch', async ({ type, preferences }) => {
        const user = await User.findOne({ where: { socketId: socket.id } });
        waitingUsers[type].set(socket.id, {
            socket,
            preferences,
            user
        });

        findMatch(type, socket, preferences);
    });

    // Oda oluşturma
    socket.on('createRoom', async ({ name, topic }) => {
        const room = await Room.create({
            name,
            topic
        });
        activeRooms.set(room.id.toString(), { users: new Set([socket.id]), room });
        socket.emit('roomCreated', { roomId: room.id });
    });

    // Odaya katılma
    socket.on('joinRoom', ({ roomId }) => {
        const roomData = activeRooms.get(roomId);
        if (roomData) {
            roomData.users.add(socket.id);
            socket.join(roomId);
            io.to(roomId).emit('userJoined', { userId: socket.id });
        }
    });

    // Mesaj filtreleme ve gönderme
    socket.on('message', async ({ to, message }) => {
        const filteredMessage = filter.clean(message);
        
        // Mesajı alıcıya gönder
        io.to(to).emit('message', {
            from: socket.id,
            message: filteredMessage
        });
        
        // Log mesajı
        console.log(`Mesaj gönderildi: ${socket.id} -> ${to}: ${filteredMessage}`);
    });

    // Kullanıcı raporlama
    socket.on('reportUser', async ({ userId, reason, details }) => {
        const reportedUser = await User.findOne({ where: { socketId: userId } });
        const reportingUser = await User.findOne({ where: { socketId: socket.id } });

        if (reportedUser && reportingUser) {
            await Report.create({
                reportedUserId: reportedUser.id,
                reportedByUserId: reportingUser.id,
                reason,
                details
            });

            // Otomatik ban kontrolü
            const reportCount = await Report.count({
                where: { reportedUserId: reportedUser.id }
            });

            if (reportCount >= 3) {
                await User.update(
                    {
                        isBanned: true,
                        banReason: 'Çok sayıda şikayet'
                    },
                    { where: { id: reportedUser.id } }
                );
                io.to(userId).emit('banned', { reason: 'Çok sayıda şikayet' });
            }
        }
    });

    // WebRTC sinyal iletimi
    socket.on('signal', ({ to, signal }) => {
        io.to(to).emit('signal', {
            from: socket.id,
            signal
        });
    });

    // Ekran paylaşımı sinyali
    socket.on('screenShare', ({ to, stream }) => {
        io.to(to).emit('screenShare', {
            from: socket.id,
            stream
        });
    });

    // Sohbetten ayrılma
    socket.on('leaveChat', async () => {
        removeFromWaitingUsers(socket.id);
        socket.broadcast.emit('partnerLeft', { partnerId: socket.id });
    });

    // Bağlantı kopması
    socket.on('disconnect', async () => {
        removeFromWaitingUsers(socket.id);
        socket.broadcast.emit('partnerLeft', { partnerId: socket.id });
        
        // Aktif odalardan çıkar
        for (const [roomId, roomData] of activeRooms) {
            if (roomData.users.has(socket.id)) {
                roomData.users.delete(socket.id);
                if (roomData.users.size === 0) {
                    await Room.update(
                        { isActive: false },
                        { where: { id: roomId } }
                    );
                    activeRooms.delete(roomId);
                }
            }
        }
        
        // Kullanıcı son aktif zamanını güncelle
        await User.update(
            { lastActive: new Date() },
            { where: { socketId: socket.id } }
        );
        
        console.log('Kullanıcı ayrıldı:', socket.id);
    });
});

// Eşleşme bulma fonksiyonu
function findMatch(type, socket, preferences) {
    const waitingList = waitingUsers[type];
    
    for (const [id, data] of waitingList) {
        if (id !== socket.id && isCompatible(preferences, data.preferences)) {
            // Eşleşme bulundu
            waitingList.delete(id);
            waitingList.delete(socket.id);
            
            // Eşleşen kullanıcıları bilgilendir
            io.to(id).emit('matchFound', { partnerId: socket.id });
            socket.emit('matchFound', { partnerId: id });
            return;
        }
    }
}

// Kullanıcı tercihleri uyumluluğu kontrolü
function isCompatible(prefs1, prefs2) {
    if (!prefs1 || !prefs2) return true;
    
    // Dil kontrolü
    if (prefs1.language && prefs2.language && prefs1.language !== prefs2.language) {
        return false;
    }
    
    // İlgi alanları kontrolü
    if (prefs1.interests && prefs2.interests && prefs1.interests.length > 0 && prefs2.interests.length > 0) {
        const commonInterests = prefs1.interests.filter(i => prefs2.interests.includes(i));
        if (commonInterests.length === 0) return false;
    }
    
    return true;
}

// Bekleyen kullanıcılardan çıkarma
function removeFromWaitingUsers(socketId) {
    for (const type in waitingUsers) {
        waitingUsers[type].delete(socketId);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor - Glitch üzerinde!`);
}); 