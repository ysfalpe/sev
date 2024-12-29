import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import dotenv from 'dotenv';
import cluster from 'cluster';
import os from 'os';

// Ortam değişkenlerini yükle
dotenv.config();

// Worker sayısını CPU çekirdek sayısının yarısı olarak ayarla
const numCPUs = Math.max(1, Math.floor(os.cpus().length / 2));

if (cluster.isMaster) {
    console.log(`Ana süreç ${process.pid} çalışıyor`);

    // Worker'ları başlat
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    // Worker bellek kullanımını izle
    const workerMemory = new Map();
    
    cluster.on('message', (worker, message) => {
        if (message.type === 'memory') {
            workerMemory.set(worker.id, message.usage);
            
            // Bellek kullanımı yüksek olan worker'ları yeniden başlat
            if (message.usage > 1024 * 1024 * 1024) { // 1GB
                console.log(`Worker ${worker.id} bellek kullanımı yüksek, yeniden başlatılıyor...`);
                worker.kill();
                cluster.fork();
            }
        }
    });

    cluster.on('exit', (worker, code, signal) => {
        console.log(`Worker ${worker.process.pid} çıktı`);
        workerMemory.delete(worker.id);
        cluster.fork();
    });

    // Ana süreç bellek kullanımını izle
    setInterval(() => {
        const usage = process.memoryUsage();
        if (usage.heapUsed > 1.5 * 1024 * 1024 * 1024) { // 1.5GB
            console.log('Ana süreç bellek kullanımı yüksek, garbage collection öneriliyor');
            if (global.gc) {
                global.gc();
            }
        }
    }, 30000); // 30 saniye

} else {
    // Express uygulamasını oluştur
    const app = express();
    const server = http.createServer(app);

    // Redis bağlantı havuzu
    const redisPool = {
        min: 2,
        max: 10,
        clients: new Set()
    };

    // Redis istemcilerini oluştur
    const createRedisClient = () => {
        const client = createClient({
            host: process.env.REDIS_HOST || 'localhost',
            port: process.env.REDIS_PORT || 6379,
            password: process.env.REDIS_PASSWORD,
            retry_strategy: (options) => {
                if (options.total_retry_time > 1000 * 60 * 60) {
                    return new Error('Retry time exhausted');
                }
                return Math.min(options.attempt * 100, 3000);
            }
        });
        redisPool.clients.add(client);
        return client;
    };

    const pubClient = createRedisClient();
    const subClient = pubClient.duplicate();

    // Socket.IO sunucusunu oluştur
    const io = new Server(server, {
        cors: {
            origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
            methods: ['GET', 'POST'],
            credentials: true
        },
        pingTimeout: 60000,
        pingInterval: 25000,
        transports: ['websocket'],
        maxHttpBufferSize: 1e6
    });

    // Aktif kullanıcıları ve arama yapanları sakla
    const activeUsers = new Map();
    const searchingUsers = new Map();

    // Socket.IO event handler'ları
    io.on('connection', (socket) => {
        console.log(`Kullanıcı bağlandı: ${socket.id}`);
        
        // Kullanıcıyı aktif kullanıcılara ekle
        activeUsers.set(socket.id, {
            socket,
            preferences: null,
            partner: null,
            searching: false
        });

        // Arama başlatma
        socket.on('startSearch', async (data) => {
            try {
                const user = activeUsers.get(socket.id);
                if (!user) return;

                // Kullanıcı zaten arama yapıyor mu kontrol et
                if (user.searching) {
                    socket.emit('searchError', { message: 'Zaten arama yapılıyor' });
                    return;
                }

                // Kullanıcı zaten eşleşmiş mi kontrol et
                if (user.partner) {
                    socket.emit('searchError', { message: 'Zaten bir eşleşmeniz var' });
                    return;
                }

                // Kullanıcı tercihlerini kaydet
                user.preferences = data.preferences;
                user.searching = true;
                
                // Arama listesine ekle
                searchingUsers.set(socket.id, user);

                // Eşleşme ara
                findMatch(socket.id);

            } catch (error) {
                console.error('Arama başlatma hatası:', error);
                socket.emit('searchError', { message: 'Arama başlatılamadı' });
            }
        });

        // Aramayı iptal etme
        socket.on('cancelSearch', () => {
            const user = activeUsers.get(socket.id);
            if (user) {
                user.searching = false;
                searchingUsers.delete(socket.id);
                socket.emit('searchCancelled');
            }
        });

        // Bağlantı kopması
        socket.on('disconnect', () => {
            const user = activeUsers.get(socket.id);
            if (user) {
                // Eşleşmiş kullanıcıyı bilgilendir
                if (user.partner) {
                    const partner = activeUsers.get(user.partner);
                    if (partner) {
                        partner.socket.emit('partnerDisconnected');
                        partner.partner = null;
                    }
                }
                
                // Kullanıcıyı listelerden kaldır
                activeUsers.delete(socket.id);
                searchingUsers.delete(socket.id);
            }
            console.log(`Kullanıcı ayrıldı: ${socket.id}`);
        });
    });

    // Eşleşme bulma fonksiyonu
    async function findMatch(userId) {
        const user = searchingUsers.get(userId);
        if (!user) return;

        // Uygun eşleşme ara
        for (const [candidateId, candidate] of searchingUsers) {
            // Kendisi ile eşleştirme
            if (candidateId === userId) continue;
            
            // Eşleşme kriterleri kontrolü
            if (isMatchCompatible(user, candidate)) {
                // Eşleşmeyi gerçekleştir
                user.partner = candidateId;
                candidate.partner = userId;
                
                // Arama listesinden çıkar
                user.searching = false;
                candidate.searching = false;
                searchingUsers.delete(userId);
                searchingUsers.delete(candidateId);
                
                // Kullanıcıları bilgilendir
                user.socket.emit('matchFound', { partnerId: candidateId });
                candidate.socket.emit('matchFound', { partnerId: userId });
                
                return;
            }
        }

        // Eşleşme bulunamadı, 3 saniye sonra tekrar dene
        setTimeout(() => findMatch(userId), 3000);
    }

    // Eşleşme uygunluğunu kontrol et
    function isMatchCompatible(user1, user2) {
        const p1 = user1.preferences;
        const p2 = user2.preferences;
        
        // Yaş kontrolü
        const isAgeCompatible = (
            p1.minAge <= p2.maxAge &&
            p1.maxAge >= p2.minAge
        );

        // Dil kontrolü
        const isLanguageCompatible = (
            p1.language === p2.language
        );

        // İlgi alanları kontrolü (en az 1 ortak ilgi alanı)
        const hasCommonInterests = p1.interests.some(
            interest => p2.interests.includes(interest)
        );

        return isAgeCompatible && isLanguageCompatible && hasCommonInterests;
    }

    // Bellek kullanımını izle ve ana sürece bildir
    setInterval(() => {
        const usage = process.memoryUsage().heapUsed;
        process.send({ type: 'memory', usage });
        
        // Yüksek bellek kullanımında garbage collection öner
        if (usage > 800 * 1024 * 1024) { // 800MB
            if (global.gc) {
                global.gc();
            }
        }
    }, 10000); // 10 saniye

    // Bağlantı havuzu temizliği
    setInterval(() => {
        for (const client of redisPool.clients) {
            if (!client.connected) {
                client.quit();
                redisPool.clients.delete(client);
            }
        }
    }, 60000); // 60 saniye

    // Graceful shutdown
    const shutdown = async () => {
        console.log('Graceful shutdown başlatılıyor...');
        
        // Yeni bağlantıları reddet
        server.close();
        
        // Socket.IO bağlantılarını kapat
        io.close();
        
        // Redis bağlantılarını kapat
        for (const client of redisPool.clients) {
            await client.quit();
        }
        
        // Garbage collection'ı öner
        if (global.gc) {
            global.gc();
        }
        
        process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
}

// Hata yakalama
process.on('uncaughtException', (err) => {
    console.error('Yakalanmamış istisna:', err);
    if (global.gc) {
        global.gc();
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('İşlenmeyen reddetme:', reason);
    if (global.gc) {
        global.gc();
    }
    process.exit(1);
}); 
}); 