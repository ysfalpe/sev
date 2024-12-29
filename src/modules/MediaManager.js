import { ERROR_MESSAGES } from '../config/constants.js';

export class MediaManager {
    constructor() {
        this.localStream = null;
        this.screenStream = null;
        this.currentVideoDevice = null;
        this.currentAudioDevice = null;
        this.devices = {
            video: [],
            audio: []
        };
        
        this.constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 },
                facingMode: 'user'
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };

        this.qualityLevels = {
            high: {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 30 }
                }
            },
            medium: {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 24 }
                }
            },
            low: {
                video: {
                    width: { ideal: 320 },
                    height: { ideal: 240 },
                    frameRate: { ideal: 15 }
                }
            }
        };

        this.setupDeviceChangeListener();
    }

    setupDeviceChangeListener() {
        navigator.mediaDevices.addEventListener('devicechange', async () => {
            await this.updateAvailableDevices();
            this.emit('devicesChanged', this.devices);
        });
    }

    async updateAvailableDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            this.devices = {
                video: devices.filter(device => device.kind === 'videoinput'),
                audio: devices.filter(device => device.kind === 'audioinput')
            };

            return this.devices;
        } catch (error) {
            console.error('Cihaz listesi alınamadı:', error);
            throw error;
        }
    }

    async requestPermissions() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            stream.getTracks().forEach(track => track.stop());
            await this.updateAvailableDevices();
            
            return true;
        } catch (error) {
            console.error('İzinler alınamadı:', error);
            return false;
        }
    }

    async getLocalStream(videoEnabled = true, audioEnabled = true) {
        try {
            if (this.localStream) {
                this.stopLocalStream();
            }

            const constraints = {
                video: videoEnabled ? this.constraints.video : false,
                audio: audioEnabled ? this.constraints.audio : false
            };

            this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Aktif cihazları kaydet
            const videoTrack = this.localStream.getVideoTracks()[0];
            const audioTrack = this.localStream.getAudioTracks()[0];
            
            if (videoTrack) {
                this.currentVideoDevice = videoTrack.getSettings().deviceId;
            }
            
            if (audioTrack) {
                this.currentAudioDevice = audioTrack.getSettings().deviceId;
            }

            return this.localStream;
        } catch (error) {
            console.error('Medya akışı alınamadı:', error);
            this.handleMediaError(error);
            throw error;
        }
    }

    async startScreenShare(withAudio = false) {
        try {
            const constraints = {
                video: {
                    cursor: 'always'
                },
                audio: withAudio
            };

            this.screenStream = await navigator.mediaDevices.getDisplayMedia(constraints);
            
            // Ekran paylaşımı bittiğinde
            this.screenStream.getVideoTracks()[0].onended = () => {
                this.stopScreenShare();
                this.emit('screenShareEnded');
            };

            return this.screenStream;
        } catch (error) {
            console.error('Ekran paylaşımı başlatılamadı:', error);
            this.handleMediaError(error);
            throw error;
        }
    }

    stopScreenShare() {
        if (this.screenStream) {
            this.screenStream.getTracks().forEach(track => track.stop());
            this.screenStream = null;
        }
    }

    async switchCamera(deviceId) {
        try {
            if (!this.localStream) {
                throw new Error('Aktif video akışı yok');
            }

            const newConstraints = {
                ...this.constraints.video,
                deviceId: { exact: deviceId }
            };

            const newStream = await navigator.mediaDevices.getUserMedia({
                video: newConstraints,
                audio: false
            });

            const newVideoTrack = newStream.getVideoTracks()[0];
            const oldVideoTrack = this.localStream.getVideoTracks()[0];

            if (oldVideoTrack) {
                oldVideoTrack.stop();
                this.localStream.removeTrack(oldVideoTrack);
            }

            this.localStream.addTrack(newVideoTrack);
            this.currentVideoDevice = deviceId;

            this.emit('videoDeviceChanged', deviceId);
            return newVideoTrack;
        } catch (error) {
            console.error('Kamera değiştirilemedi:', error);
            this.handleMediaError(error);
            throw error;
        }
    }

    async switchMicrophone(deviceId) {
        try {
            if (!this.localStream) {
                throw new Error('Aktif ses akışı yok');
            }

            const newConstraints = {
                ...this.constraints.audio,
                deviceId: { exact: deviceId }
            };

            const newStream = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: newConstraints
            });

            const newAudioTrack = newStream.getAudioTracks()[0];
            const oldAudioTrack = this.localStream.getAudioTracks()[0];

            if (oldAudioTrack) {
                oldAudioTrack.stop();
                this.localStream.removeTrack(oldAudioTrack);
            }

            this.localStream.addTrack(newAudioTrack);
            this.currentAudioDevice = deviceId;

            this.emit('audioDeviceChanged', deviceId);
            return newAudioTrack;
        } catch (error) {
            console.error('Mikrofon değiştirilemedi:', error);
            this.handleMediaError(error);
            throw error;
        }
    }

    setVideoQuality(quality) {
        if (!this.qualityLevels[quality]) {
            throw new Error('Geçersiz kalite seviyesi');
        }

        this.constraints.video = {
            ...this.constraints.video,
            ...this.qualityLevels[quality].video
        };

        // Aktif video varsa kaliteyi güncelle
        if (this.localStream && this.localStream.getVideoTracks().length > 0) {
            const videoTrack = this.localStream.getVideoTracks()[0];
            videoTrack.applyConstraints(this.constraints.video)
                .catch(error => {
                    console.error('Video kalitesi güncellenemedi:', error);
                    this.handleMediaError(error);
                });
        }
    }

    async toggleVideo() {
        if (!this.localStream) return false;
        
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            this.emit('videoStateChanged', videoTrack.enabled);
            return videoTrack.enabled;
        }
        return false;
    }

    async toggleAudio() {
        if (!this.localStream) return false;
        
        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            this.emit('audioStateChanged', audioTrack.enabled);
            return audioTrack.enabled;
        }
        return false;
    }

    stopLocalStream() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
    }

    handleMediaError(error) {
        let message = 'Medya hatası oluştu';
        
        switch (error.name) {
            case 'NotFoundError':
                message = 'Kamera veya mikrofon bulunamadı';
                break;
            case 'NotAllowedError':
                message = 'Kamera veya mikrofon izni reddedildi';
                break;
            case 'NotReadableError':
                message = 'Kamera veya mikrofona erişilemiyor';
                break;
            case 'OverconstrainedError':
                message = 'İstenen medya özellikleri desteklenmiyor';
                break;
            case 'AbortError':
                message = 'Medya işlemi iptal edildi';
                break;
        }

        this.emit('mediaError', { error, message });
    }

    getStreamSettings() {
        if (!this.localStream) return null;

        const videoTrack = this.localStream.getVideoTracks()[0];
        const audioTrack = this.localStream.getAudioTracks()[0];

        return {
            video: videoTrack ? videoTrack.getSettings() : null,
            audio: audioTrack ? audioTrack.getSettings() : null
        };
    }

    emit(eventName, data = null) {
        const event = new CustomEvent(eventName, { detail: data });
        window.dispatchEvent(event);
    }

    cleanup() {
        this.stopLocalStream();
        this.stopScreenShare();
    }
}

export { MediaManager }; 
export { MediaManager }; 