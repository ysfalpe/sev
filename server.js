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
        transports: ['websocket'], // Polling'i devre dışı bırak
        maxHttpBufferSize: 1e6 // 1MB
    });

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