export const QUALITY_LEVELS = {
    video: {
        ultra: {
            width: 3840,
            height: 2160,
            frameRate: 60,
            bitrate: 12000000
        },
        high: {
            width: 1920,
            height: 1080,
            frameRate: 30,
            bitrate: 4000000
        },
        medium: {
            width: 1280,
            height: 720,
            frameRate: 30,
            bitrate: 2000000
        },
        low: {
            width: 640,
            height: 480,
            frameRate: 24,
            bitrate: 800000
        },
        minimal: {
            width: 320,
            height: 240,
            frameRate: 15,
            bitrate: 300000
        }
    },
    audio: {
        high: {
            sampleRate: 48000,
            bitrate: 128000,
            channels: 2
        },
        medium: {
            sampleRate: 44100,
            bitrate: 96000,
            channels: 2
        },
        low: {
            sampleRate: 22050,
            bitrate: 64000,
            channels: 1
        }
    }
};

export const QUALITY_MESSAGES = {
    excellent: "Mükemmel bağlantı kalitesi",
    good: "İyi bağlantı kalitesi",
    fair: "Orta bağlantı kalitesi",
    poor: "Düşük bağlantı kalitesi",
    critical: "Kritik bağlantı kalitesi"
};

export class QualityManager {
    constructor() {
        this.qualityLevels = {
            high: { width: 1280, height: 720, frameRate: 30, bitrate: 2500000 },
            medium: { width: 854, height: 480, frameRate: 25, bitrate: 1000000 },
            low: { width: 640, height: 360, frameRate: 20, bitrate: 500000 }
        };
        
        this.currentQuality = 'medium';
        this.statsInterval = null;
        this.performanceStats = {
            cpu: 0,
            memory: 0,
            bandwidth: 0
        };
    }

    startMonitoring() {
        this.monitorNetworkQuality();
        this.monitorSystemResources();
        this.monitorMediaQuality();
    }

    stopMonitoring() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
        }
    }

    async monitorNetworkQuality() {
        if ('connection' in navigator) {
            navigator.connection.addEventListener('change', () => {
                this.handleNetworkChange();
            });
        }

        this.statsInterval = setInterval(async () => {
            const stats = await this.getConnectionStats();
            this.adjustQualityBasedOnStats(stats);
        }, 5000);
    }

    async getConnectionStats() {
        try {
            const stats = await this.peerConnection.getStats();
            let totalBitrate = 0;
            let packetsLost = 0;
            let jitter = 0;

            stats.forEach(report => {
                if (report.type === 'inbound-rtp' && report.kind === 'video') {
                    totalBitrate = report.bytesReceived * 8 / report.timestamp;
                    packetsLost = report.packetsLost;
                    jitter = report.jitter;
                }
            });

            return { bitrate: totalBitrate, packetsLost, jitter };
        } catch (error) {
            console.error('Bağlantı istatistikleri alınamadı:', error);
            return null;
        }
    }

    adjustQualityBasedOnStats(stats) {
        if (!stats) return;

        const currentLevel = this.qualityLevels[this.currentQuality];
        
        // Kötü bağlantı koşulları
        if (stats.packetsLost > 50 || stats.jitter > 100 || stats.bitrate < currentLevel.bitrate * 0.5) {
            this.decreaseQuality();
        }
        // İyi bağlantı koşulları
        else if (stats.packetsLost < 10 && stats.jitter < 50 && stats.bitrate > currentLevel.bitrate * 1.5) {
            this.increaseQuality();
        }
    }

    async monitorSystemResources() {
        if ('performance' in window) {
            setInterval(async () => {
                // CPU kullanımı
                if ('memory' in performance) {
                    this.performanceStats.memory = performance.memory.usedJSHeapSize;
                }

                // Tahmini CPU kullanımı
                const startTime = performance.now();
                await new Promise(resolve => setTimeout(resolve, 100));
                const endTime = performance.now();
                const cpuUsage = (endTime - startTime) / 100;
                this.performanceStats.cpu = cpuUsage;

                this.adjustQualityBasedOnResources();
            }, 10000);
        }
    }

    adjustQualityBasedOnResources() {
        // Yüksek kaynak kullanımı durumunda kaliteyi düşür
        if (this.performanceStats.cpu > 0.8 || this.performanceStats.memory > 0.8 * performance.memory.jsHeapSizeLimit) {
            this.decreaseQuality();
            this.notifyHighResourceUsage();
        }
    }

    monitorMediaQuality() {
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            const audioTrack = this.localStream.getAudioTracks()[0];

            if (videoTrack) {
                videoTrack.addEventListener('ended', () => this.handleTrackEnded('video'));
                videoTrack.addEventListener('mute', () => this.handleTrackMuted('video'));
            }

            if (audioTrack) {
                audioTrack.addEventListener('ended', () => this.handleTrackEnded('audio'));
                audioTrack.addEventListener('mute', () => this.handleTrackMuted('audio'));
            }
        }
    }

    async decreaseQuality() {
        const qualities = Object.keys(this.qualityLevels);
        const currentIndex = qualities.indexOf(this.currentQuality);
        
        if (currentIndex < qualities.length - 1) {
            this.currentQuality = qualities[currentIndex + 1];
            await this.applyQualitySettings();
            this.notifyQualityChange('decreased');
        }
    }

    async increaseQuality() {
        const qualities = Object.keys(this.qualityLevels);
        const currentIndex = qualities.indexOf(this.currentQuality);
        
        if (currentIndex > 0) {
            this.currentQuality = qualities[currentIndex - 1];
            await this.applyQualitySettings();
            this.notifyQualityChange('increased');
        }
    }

    async applyQualitySettings() {
        const settings = this.qualityLevels[this.currentQuality];
        
        if (this.localStream) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            if (videoTrack) {
                try {
                    await videoTrack.applyConstraints({
                        width: { ideal: settings.width },
                        height: { ideal: settings.height },
                        frameRate: { ideal: settings.frameRate }
                    });
                } catch (error) {
                    console.error('Kalite ayarları uygulanamadı:', error);
                }
            }
        }
    }

    handleNetworkChange() {
        if (navigator.connection) {
            const connection = navigator.connection;
            
            if (connection.type === 'cellular' || connection.saveData) {
                this.decreaseQuality();
                this.notifyNetworkChange('cellular');
            } else if (connection.effectiveType === '4g' && this.currentQuality === 'low') {
                this.increaseQuality();
                this.notifyNetworkChange('fast');
            }
        }
    }

    handleTrackEnded(type) {
        this.notifyTrackEnded(type);
    }

    handleTrackMuted(type) {
        this.notifyTrackMuted(type);
    }

    notifyQualityChange(direction) {
        window.dispatchEvent(new CustomEvent('qualityChange', {
            detail: {
                quality: this.currentQuality,
                direction: direction
            }
        }));
    }

    notifyHighResourceUsage() {
        window.dispatchEvent(new CustomEvent('showNotification', {
            detail: {
                message: 'Yüksek sistem kaynak kullanımı tespit edildi. Video kalitesi düşürülüyor.',
                type: 'warning'
            }
        }));
    }

    notifyNetworkChange(type) {
        const messages = {
            cellular: 'Mobil veri bağlantısı tespit edildi. Video kalitesi düşürülüyor.',
            fast: 'Hızlı bağlantı tespit edildi. Video kalitesi artırılıyor.'
        };

        window.dispatchEvent(new CustomEvent('showNotification', {
            detail: {
                message: messages[type],
                type: 'info'
            }
        }));
    }

    notifyTrackEnded(type) {
        window.dispatchEvent(new CustomEvent('showNotification', {
            detail: {
                message: `${type === 'video' ? 'Kamera' : 'Mikrofon'} bağlantısı kesildi.`,
                type: 'error'
            }
        }));
    }

    notifyTrackMuted(type) {
        window.dispatchEvent(new CustomEvent('showNotification', {
            detail: {
                message: `${type === 'video' ? 'Kamera' : 'Mikrofon'} sessize alındı.`,
                type: 'warning'
            }
        }));
    }
}

export { QualityManager }; 
} 