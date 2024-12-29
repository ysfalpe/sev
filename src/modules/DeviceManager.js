import { NotificationManager } from "./NotificationManager.js";

export class DeviceManager {
    constructor() {
        this.notificationManager = new NotificationManager();
        this.selectedVideoDevice = null;
        this.selectedAudioDevice = null;
        this.stream = null;
    }

    async applyDeviceSelection(videoDeviceId, audioDeviceId) {
        try {
            const previousDevices = {
                video: this.selectedVideoDevice,
                audio: this.selectedAudioDevice
            };
            
            this.selectedVideoDevice = videoDeviceId;
            this.selectedAudioDevice = audioDeviceId;
            
            await this.updateMediaStream();
            this.notificationManager.showNotification("Cihaz ayarları güncellendi", "success");
            
            return {
                success: true,
                previousDevices,
                newDevices: {
                    video: videoDeviceId,
                    audio: audioDeviceId
                }
            };
        } catch (err) {
            console.error("Cihaz değişikliği hatası:", err);
            this.notificationManager.showNotification("Cihaz ayarları güncellenemedi", "error");
            
            // Hata durumunda eski ayarlara geri dön
            this.selectedVideoDevice = previousDevices.video;
            this.selectedAudioDevice = previousDevices.audio;
            
            return {
                success: false,
                error: err
            };
        }
    }

    async updateMediaStream() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        const constraints = {
            video: this.selectedVideoDevice ? { deviceId: { exact: this.selectedVideoDevice } } : true,
            audio: this.selectedAudioDevice ? { deviceId: { exact: this.selectedAudioDevice } } : true
        };

        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        return this.stream;
    }

    async getAvailableDevices() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        return {
            video: devices.filter(device => device.kind === "videoinput"),
            audio: devices.filter(device => device.kind === "audioinput")
        };
    }

    cleanup() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
    }
} 