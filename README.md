# WebRTC Video Konferans Uygulaması

Bu proje, WebRTC teknolojisini kullanarak gerçek zamanlı video konferans özelliği sunan bir web uygulamasıdır.

## Özellikler

- Gerçek zamanlı video ve ses iletişimi
- Çoklu kullanıcı desteği
- Ekran paylaşımı
- Metin tabanlı sohbet
- Oda yönetimi
- Kullanıcı kimlik doğrulama
- Güvenli bağlantı (TURN/STUN)
- Ölçeklenebilir mimari

## Teknolojiler

- Node.js
- Express.js
- Socket.IO
- WebRTC
- Redis
- PostgreSQL
- JWT Authentication
- Webpack

## Gereksinimler

- Node.js (>= 18.0.0)
- Redis Server
- PostgreSQL
- TURN/STUN Server

## Kurulum

1. Projeyi klonlayın:
```bash
git clone https://github.com/yourusername/webrtc-app.git
cd webrtc-app
```

2. Bağımlılıkları yükleyin:
```bash
npm install
```

3. .env dosyasını oluşturun:
```bash
cp .env.example .env
```

4. .env dosyasını düzenleyin:
```env
PORT=3000
NODE_ENV=development
...
```

5. Veritabanını oluşturun:
```bash
psql -U postgres
CREATE DATABASE webrtc_db;
```

6. Uygulamayı başlatın:
```bash
# Geliştirme modu
npm run dev

# Üretim modu
npm start
```

## Yapılandırma

### TURN/STUN Sunucusu

TURN/STUN sunucusu için aşağıdaki yapılandırmaları .env dosyasında ayarlayın:

```env
STUN_SERVER=stun:stun.l.google.com:19302
TURN_SERVER=turn:your.turn.server:3478
TURN_USERNAME=your_username
TURN_CREDENTIAL=your_password
```

### Redis

Redis bağlantı ayarları:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_password
```

### PostgreSQL

PostgreSQL bağlantı ayarları:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=webrtc_db
DB_USER=postgres
DB_PASSWORD=your_password
```

## API Dokümantasyonu

### Kimlik Doğrulama

#### Kayıt
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

#### Giriş
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "string",
  "password": "string"
}
```

### Oda Yönetimi

#### Oda Oluşturma
```http
POST /api/rooms
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "string",
  "maxParticipants": number
}
```

#### Odaya Katılma
```http
POST /api/rooms/:roomId/join
Authorization: Bearer <token>
```

## WebSocket Olayları

### Bağlantı
```javascript
socket.on('connect', () => {
  console.log('Bağlantı kuruldu');
});
```

### Oda Olayları
```javascript
// Odaya katılma
socket.emit('join-room', roomId, userId);

// Kullanıcı bağlandı
socket.on('user-connected', userId => {
  console.log('Kullanıcı bağlandı:', userId);
});

// Kullanıcı ayrıldı
socket.on('user-disconnected', userId => {
  console.log('Kullanıcı ayrıldı:', userId);
});
```

## Güvenlik

- JWT tabanlı kimlik doğrulama
- Rate limiting
- XSS koruması
- CORS yapılandırması
- Helmet güvenlik başlıkları
- Şifreli WebSocket bağlantıları

## Performans Optimizasyonları

- Redis önbelleği
- WebSocket bağlantı havuzu
- Medya akışı optimizasyonu
- Webpack bundle optimizasyonu
- Cluster mod desteği

## Test

```bash
# Unit testleri çalıştır
npm test

# Test coverage raporu
npm run test:coverage
```

## Dağıtım

1. Üretim ortamı için .env dosyasını yapılandırın
2. Bağımlılıkları yükleyin:
```bash
npm ci
```
3. Uygulamayı derleyin:
```bash
npm run build
```
4. Uygulamayı başlatın:
```bash
npm start
```

## Katkıda Bulunma

1. Projeyi fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişikliklerinizi commit edin (`git commit -m 'feat: Add amazing feature'`)
4. Branch'inizi push edin (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## Lisans

Bu proje MIT lisansı altında lisanslanmıştır. Detaylar için [LICENSE](LICENSE) dosyasına bakın.

## İletişim

Your Name - [@yourusername](https://twitter.com/yourusername)

Proje Linki: [https://github.com/yourusername/webrtc-app](https://github.com/yourusername/webrtc-app) 
