import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

export class SecurityManager {
    constructor() {
        this.activeSessions = new Map();
        this.rateLimiters = new Map();
        this.config = {
            saltRounds: 10,
            sessionTimeout: 30 * 60 * 1000, // 30 dakika
            maxLoginAttempts: 5,
            blockDuration: 15 * 60 * 1000, // 15 dakika
            rateLimits: {
                login: {
                    windowMs: 15 * 60 * 1000, // 15 dakika
                    max: 5 // 5 deneme
                },
                api: {
                    windowMs: 60 * 1000, // 1 dakika
                    max: 100 // 100 istek
                }
            }
        };

        this.setupRateLimiters();
    }

    setupRateLimiters() {
        // Login rate limiter
        this.rateLimiters.set('login', rateLimit({
            windowMs: this.config.rateLimits.login.windowMs,
            max: this.config.rateLimits.login.max,
            message: 'Too many login attempts, please try again later.'
        }));

        // API rate limiter
        this.rateLimiters.set('api', rateLimit({
            windowMs: this.config.rateLimits.api.windowMs,
            max: this.config.rateLimits.api.max,
            message: 'Too many requests, please try again later.'
        }));
    }

    async checkRateLimit(ip, type) {
        const limiter = this.rateLimiters.get(type);
        if (!limiter) return true;

        return new Promise((resolve) => {
            limiter(
                { ip },
                {},
                (err) => {
                    if (err) {
                        resolve(false);
                    } else {
                        resolve(true);
                    }
                }
            );
        });
    }

    hashPassword(password) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = crypto.pbkdf2Sync(
            password,
            salt,
            10000,
            64,
            'sha512'
        ).toString('hex');

        return { hash, salt };
    }

    verifyPassword(password, hash, salt) {
        const verifyHash = crypto.pbkdf2Sync(
            password,
            salt,
            10000,
            64,
            'sha512'
        ).toString('hex');

        return hash === verifyHash;
    }

    createSession(userId, userAgent, ip) {
        const sessionId = uuidv4();
        const session = {
            userId,
            userAgent,
            ip,
            createdAt: Date.now(),
            lastActivity: Date.now()
        };

        this.activeSessions.set(sessionId, session);
        this.cleanupExpiredSessions();

        return { sessionId, session };
    }

    updateSessionActivity(sessionId) {
        const session = this.activeSessions.get(sessionId);
        if (session) {
            session.lastActivity = Date.now();
            this.activeSessions.set(sessionId, session);
        }
    }

    invalidateSession(sessionId) {
        this.activeSessions.delete(sessionId);
    }

    cleanupExpiredSessions() {
        const now = Date.now();
        for (const [sessionId, session] of this.activeSessions.entries()) {
            if (now - session.lastActivity > this.config.sessionTimeout) {
                this.invalidateSession(sessionId);
            }
        }
    }

    validateSession(sessionId, ip, userAgent) {
        const session = this.activeSessions.get(sessionId);
        if (!session) return false;

        // IP ve user agent kontrolü
        if (session.ip !== ip || session.userAgent !== userAgent) {
            this.invalidateSession(sessionId);
            return false;
        }

        // Session timeout kontrolü
        if (Date.now() - session.lastActivity > this.config.sessionTimeout) {
            this.invalidateSession(sessionId);
            return false;
        }

        this.updateSessionActivity(sessionId);
        return true;
    }

    getSecurityMiddleware() {
        return [
            helmet(),
            helmet.contentSecurityPolicy({
                directives: {
                    defaultSrc: ["'self'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", 'data:', 'https:'],
                    connectSrc: ["'self'"],
                    fontSrc: ["'self'"],
                    objectSrc: ["'none'"],
                    mediaSrc: ["'self'"],
                    frameSrc: ["'none'"]
                }
            }),
            helmet.dnsPrefetchControl({ allow: false }),
            helmet.expectCt({ maxAge: 86400, enforce: true }),
            helmet.frameguard({ action: 'deny' }),
            helmet.hsts({
                maxAge: 31536000,
                includeSubDomains: true,
                preload: true
            }),
            helmet.ieNoOpen(),
            helmet.noSniff(),
            helmet.permittedCrossDomainPolicies({ permittedPolicies: 'none' }),
            helmet.referrerPolicy({ policy: 'same-origin' }),
            helmet.xssFilter()
        ];
    }

    sanitizeInput(input) {
        if (typeof input !== 'string') return input;

        return input
            .replace(/[<>]/g, '') // HTML tags kaldır
            .replace(/['"]/g, '') // Tırnak işaretlerini kaldır
            .trim(); // Boşlukları temizle
    }

    validateInput(input, type) {
        const patterns = {
            email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            username: /^[a-zA-Z0-9_-]{3,16}$/,
            password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
            url: /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/,
            phone: /^\+?[\d\s-]{10,}$/
        };

        if (!patterns[type]) return false;
        return patterns[type].test(input);
    }

    generateSecureToken(length = 32) {
        return crypto.randomBytes(length).toString('hex');
    }

    encryptData(data, key) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        const authTag = cipher.getAuthTag();
        
        return {
            encrypted,
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex')
        };
    }

    decryptData(encryptedData, key) {
        try {
            const decipher = crypto.createDecipheriv(
                'aes-256-gcm',
                key,
                Buffer.from(encryptedData.iv, 'hex')
            );
            
            decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
            
            let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            throw new Error('Decryption failed');
        }
    }

    generateCSRFToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    validateCSRFToken(token, storedToken) {
        return crypto.timingSafeEqual(
            Buffer.from(token),
            Buffer.from(storedToken)
        );
    }
}

export default SecurityManager; 