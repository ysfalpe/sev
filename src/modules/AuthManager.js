import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import SecurityManager from './SecurityManager';

export class AuthManager {
    constructor() {
        this.securityManager = new SecurityManager();
        this.activeTokens = new Set();
        this.refreshTokens = new Map();
        
        this.config = {
            accessTokenExpiry: '15m',
            refreshTokenExpiry: '7d',
            jwtSecret: process.env.JWT_SECRET,
            passwordMinLength: 8,
            passwordRequirements: {
                minLength: 8,
                requireNumbers: true,
                requireSpecialChars: true,
                requireUppercase: true,
                requireLowercase: true
            }
        };
    }

    async login(username, password, ip, userAgent) {
        try {
            // Rate limiting kontrolü
            if (!await this.securityManager.checkRateLimit(ip, 'login')) {
                throw new Error('Too many login attempts');
            }

            // Kullanıcı bilgilerini doğrula
            const user = await this.validateCredentials(username, password);
            if (!user) {
                throw new Error('Invalid credentials');
            }

            // Token oluştur
            const tokens = this.generateTokens(user);
            
            // Session oluştur
            const session = this.securityManager.createSession(user.id, userAgent, ip);
            
            // Refresh token'ı kaydet
            this.refreshTokens.set(tokens.refreshToken, {
                userId: user.id,
                sessionId: session.sessionId,
                expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 gün
            });

            return {
                accessToken: tokens.accessToken,
                refreshToken: tokens.refreshToken,
                sessionId: session.sessionId,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                }
            };
        } catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    async validateCredentials(username, password) {
        // Bu kısım veritabanı entegrasyonu gerektirir
        // Örnek implementasyon:
        const user = await db.users.findOne({ username });
        if (!user) return null;

        const isValid = await this.securityManager.verifyPassword(
            password,
            user.passwordHash,
            user.passwordSalt
        );

        return isValid ? user : null;
    }

    generateTokens(user) {
        const accessToken = jwt.sign(
            {
                userId: user.id,
                username: user.username,
                type: 'access'
            },
            this.config.jwtSecret,
            { expiresIn: this.config.accessTokenExpiry }
        );

        const refreshToken = jwt.sign(
            {
                userId: user.id,
                type: 'refresh',
                tokenId: uuidv4()
            },
            this.config.jwtSecret,
            { expiresIn: this.config.refreshTokenExpiry }
        );

        this.activeTokens.add(accessToken);

        return { accessToken, refreshToken };
    }

    async validateToken(token) {
        try {
            // Token formatını kontrol et
            if (!token || !token.startsWith('Bearer ')) {
                return false;
            }

            const tokenValue = token.split(' ')[1];

            // Token aktif mi kontrol et
            if (!this.activeTokens.has(tokenValue)) {
                return false;
            }

            // Token'ı doğrula
            const decoded = jwt.verify(tokenValue, this.config.jwtSecret);

            // Token tipini kontrol et
            if (decoded.type !== 'access') {
                return false;
            }

            return decoded;
        } catch (error) {
            return false;
        }
    }

    async refreshAccessToken(refreshToken) {
        try {
            // Refresh token'ı doğrula
            const decoded = jwt.verify(refreshToken, this.config.jwtSecret);
            
            // Token tipini kontrol et
            if (decoded.type !== 'refresh') {
                throw new Error('Invalid token type');
            }

            // Refresh token kaydını kontrol et
            const tokenRecord = this.refreshTokens.get(refreshToken);
            if (!tokenRecord) {
                throw new Error('Invalid refresh token');
            }

            // Süresi dolmuş mu kontrol et
            if (Date.now() > tokenRecord.expiresAt) {
                this.refreshTokens.delete(refreshToken);
                throw new Error('Refresh token expired');
            }

            // Kullanıcı bilgilerini al
            const user = await this.getUserById(decoded.userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Yeni token'lar oluştur
            const tokens = this.generateTokens(user);
            
            // Eski refresh token'ı sil
            this.refreshTokens.delete(refreshToken);
            
            // Yeni refresh token'ı kaydet
            this.refreshTokens.set(tokens.refreshToken, {
                userId: user.id,
                sessionId: tokenRecord.sessionId,
                expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
            });

            return tokens;
        } catch (error) {
            throw new Error(`Token refresh failed: ${error.message}`);
        }
    }

    async logout(accessToken, refreshToken) {
        // Access token'ı geçersiz kıl
        this.activeTokens.delete(accessToken);
        
        // Refresh token'ı sil
        this.refreshTokens.delete(refreshToken);
        
        // Session'ı sonlandır
        const tokenRecord = this.refreshTokens.get(refreshToken);
        if (tokenRecord) {
            this.securityManager.invalidateSession(tokenRecord.sessionId);
        }
    }

    validatePassword(password) {
        const requirements = this.config.passwordRequirements;
        
        if (password.length < requirements.minLength) {
            return false;
        }
        
        if (requirements.requireNumbers && !/\d/.test(password)) {
            return false;
        }
        
        if (requirements.requireSpecialChars && !/[!@#$%^&*]/.test(password)) {
            return false;
        }
        
        if (requirements.requireUppercase && !/[A-Z]/.test(password)) {
            return false;
        }
        
        if (requirements.requireLowercase && !/[a-z]/.test(password)) {
            return false;
        }
        
        return true;
    }

    async changePassword(userId, oldPassword, newPassword) {
        try {
            // Eski şifreyi doğrula
            const user = await this.getUserById(userId);
            const isValid = await this.securityManager.verifyPassword(
                oldPassword,
                user.passwordHash,
                user.passwordSalt
            );

            if (!isValid) {
                throw new Error('Invalid old password');
            }

            // Yeni şifreyi kontrol et
            if (!this.validatePassword(newPassword)) {
                throw new Error('New password does not meet requirements');
            }

            // Yeni şifreyi hashle
            const { hash, salt } = this.securityManager.hashPassword(newPassword);

            // Şifreyi güncelle
            await this.updateUserPassword(userId, hash, salt);

            // Tüm aktif oturumları sonlandır
            this.invalidateAllUserSessions(userId);

            return true;
        } catch (error) {
            throw new Error(`Password change failed: ${error.message}`);
        }
    }

    invalidateAllUserSessions(userId) {
        // Tüm refresh token'ları kontrol et
        for (const [token, record] of this.refreshTokens.entries()) {
            if (record.userId === userId) {
                this.refreshTokens.delete(token);
                this.securityManager.invalidateSession(record.sessionId);
            }
        }

        // Access token'ları temizle
        this.activeTokens.clear();
    }

    // Yardımcı metodlar
    async getUserById(userId) {
        // Bu kısım veritabanı entegrasyonu gerektirir
        return await db.users.findOne({ id: userId });
    }

    async updateUserPassword(userId, passwordHash, passwordSalt) {
        // Bu kısım veritabanı entegrasyonu gerektirir
        await db.users.update(
            { id: userId },
            { passwordHash, passwordSalt }
        );
    }
}

export default AuthManager; 