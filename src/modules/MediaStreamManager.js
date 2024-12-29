import { EventEmitter } from 'events';

export class MediaStreamManager extends EventEmitter {
    constructor() {
        super();
        
        this.streams = new WeakMap();
        this.devices = new WeakMap();
        this.constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 44100,
                channelCount: 1
            },
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 24 },
                facingMode: 'user'
            }
        };
        
        this.audioContext = null;
        this.videoProcessors = new WeakMap();
        this.audioProcessors = new WeakMap();
        
        this.qualityProfiles = {
            high: {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    frameRate: { ideal: 24 },
                    bitrate: 1000000
                },
                audio: {
                    sampleRate: 44100,
                    bitrate: 96000
                }
            },
            medium: {
                video: {
                    width: { ideal: 640 },
                    height: { ideal: 480 },
                    frameRate: { ideal: 20 },
                    bitrate: 500000
                },
                audio: {
                    sampleRate: 44100,
                    bitrate: 64000
                }
            },
            low: {
                video: {
                    width: { ideal: 320 },
                    height: { ideal: 240 },
                    frameRate: { ideal: 15 },
                    bitrate: 250000
                },
                audio: {
                    sampleRate: 22050,
                    bitrate: 32000
                }
            }
        };
        
        this.processInterval = 100;
        this.lastProcessTime = 0;
        
        this.setupEventListeners();
    }

    setupEventListeners() {
        navigator.mediaDevices.addEventListener('devicechange', () => {
            this.updateDeviceList();
        });
    }

    async initialize() {
        try {
            await this.updateDeviceList();
            await this.initializeAudioContext();
        } catch (error) {
            this.emit('error', {
                type: 'INITIALIZATION_ERROR',
                error: error.message
            });
            throw error;
        }
    }

    async updateDeviceList() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            
            this.devices.clear();
            devices.forEach(device => {
                if (!this.devices.has(device.kind)) {
                    this.devices.set(device.kind, []);
                }
                this.devices.get(device.kind).push({
                    id: device.deviceId,
                    label: device.label,
                    kind: device.kind
                });
            });

            this.emit('devicesUpdated', Array.from(this.devices.entries()));
        } catch (error) {
            this.emit('error', {
                type: 'DEVICE_LIST_ERROR',
                error: error.message
            });
            throw error;
        }
    }

    async initializeAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                latencyHint: 'interactive',
                sampleRate: 48000
            });
        }
        
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    async getStream(constraints = this.constraints) {
        try {
            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            const streamId = this.generateStreamId();
            
            this.streams.set(streamId, {
                stream,
                constraints,
                processors: new Map()
            });

            this.setupStreamProcessing(streamId, stream);
            return { streamId, stream };
        } catch (error) {
            this.emit('error', {
                type: 'STREAM_ERROR',
                error: error.message
            });
            throw error;
        }
    }

    async getDisplayMedia(constraints = {}) {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always',
                    ...constraints.video
                },
                audio: constraints.audio || false
            });

            const streamId = this.generateStreamId();
            this.streams.set(streamId, {
                stream,
                constraints,
                processors: new Map()
            });

            return { streamId, stream };
        } catch (error) {
            this.emit('error', {
                type: 'DISPLAY_MEDIA_ERROR',
                error: error.message
            });
            throw error;
        }
    }

    setupStreamProcessing(streamId, stream) {
        stream.getTracks().forEach(track => {
            if (track.kind === 'audio') {
                this.setupAudioProcessing(streamId, track);
            } else if (track.kind === 'video') {
                this.setupVideoProcessing(streamId, track);
            }
        });
    }

    async setupAudioProcessing(streamId, track) {
        try {
            await this.initializeAudioContext();
            
            const source = this.audioContext.createMediaStreamSource(
                new MediaStream([track])
            );
            
            const processor = this.audioContext.createScriptProcessor(2048, 1, 1);
            processor.onaudioprocess = this.handleAudioProcess.bind(this, streamId);
            
            source.connect(processor);
            processor.connect(this.audioContext.destination);
            
            this.audioProcessors.set(streamId, { source, processor });
        } catch (error) {
            this.emit('error', {
                type: 'AUDIO_PROCESSING_ERROR',
                streamId,
                error: error.message
            });
        }
    }

    setupVideoProcessing(streamId, track) {
        try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            const processor = {
                canvas,
                ctx,
                running: true
            };

            this.videoProcessors.set(streamId, processor);
            this.processVideoFrame(streamId, track);
        } catch (error) {
            this.emit('error', {
                type: 'VIDEO_PROCESSING_ERROR',
                streamId,
                error: error.message
            });
        }
    }

    handleAudioProcess(streamId, event) {
        const inputData = event.inputBuffer.getChannelData(0);
        const outputData = event.outputBuffer.getChannelData(0);
        
        // Ses işleme
        let volume = 0;
        for (let i = 0; i < inputData.length; i++) {
            outputData[i] = inputData[i]; // Doğrudan kopyala
            volume += inputData[i] * inputData[i];
        }
        
        volume = Math.sqrt(volume / inputData.length);
        
        this.emit('audioLevel', {
            streamId,
            level: volume
        });
    }

    processVideoFrame(streamId, track) {
        const processor = this.videoProcessors.get(streamId);
        if (!processor || !processor.running) return;

        const { canvas, ctx } = processor;
        const video = document.createElement('video');
        video.srcObject = new MediaStream([track]);
        video.play();

        const drawFrame = () => {
            if (!processor.running) return;

            const now = Date.now();
            if (now - this.lastProcessTime < this.processInterval) {
                requestAnimationFrame(drawFrame);
                return;
            }
            this.lastProcessTime = now;

            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            this.processImageData(imageData);
            
            ctx.putImageData(imageData, 0, 0);
            
            requestAnimationFrame(drawFrame);
        };

        drawFrame();
    }

    processImageData(imageData) {
        const data = imageData.data;
        const len = data.length;
        
        for (let i = 0; i < len; i += 4) {
            const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = data[i + 1] = data[i + 2] = gray;
        }
    }

    async applyConstraints(streamId, constraints) {
        try {
            const streamData = this.streams.get(streamId);
            if (!streamData) {
                throw new Error('Stream not found');
            }

            const { stream } = streamData;
            const tracks = stream.getTracks();

            for (const track of tracks) {
                if (constraints[track.kind]) {
                    await track.applyConstraints(constraints[track.kind]);
                }
            }

            streamData.constraints = {
                ...streamData.constraints,
                ...constraints
            };

            this.emit('constraintsApplied', {
                streamId,
                constraints: streamData.constraints
            });
        } catch (error) {
            this.emit('error', {
                type: 'CONSTRAINTS_ERROR',
                streamId,
                error: error.message
            });
            throw error;
        }
    }

    async setQualityProfile(streamId, profile) {
        try {
            const profileSettings = this.qualityProfiles[profile];
            if (!profileSettings) {
                throw new Error('Invalid quality profile');
            }

            await this.applyConstraints(streamId, profileSettings);
        } catch (error) {
            this.emit('error', {
                type: 'QUALITY_PROFILE_ERROR',
                streamId,
                error: error.message
            });
            throw error;
        }
    }

    stopStream(streamId) {
        try {
            const streamData = this.streams.get(streamId);
            if (!streamData) return;

            const { stream } = streamData;
            stream.getTracks().forEach(track => track.stop());

            // Ses işleme temizliği
            const audioProcessor = this.audioProcessors.get(streamId);
            if (audioProcessor) {
                audioProcessor.source.disconnect();
                audioProcessor.processor.disconnect();
                this.audioProcessors.delete(streamId);
            }

            // Video işleme temizliği
            const videoProcessor = this.videoProcessors.get(streamId);
            if (videoProcessor) {
                videoProcessor.running = false;
                this.videoProcessors.delete(streamId);
            }

            this.streams.delete(streamId);
            this.emit('streamStopped', { streamId });
        } catch (error) {
            this.emit('error', {
                type: 'STREAM_STOP_ERROR',
                streamId,
                error: error.message
            });
        }
    }

    async toggleTrack(streamId, kind, enabled) {
        try {
            const streamData = this.streams.get(streamId);
            if (!streamData) {
                throw new Error('Stream not found');
            }

            const { stream } = streamData;
            const tracks = stream.getTracks().filter(track => track.kind === kind);

            tracks.forEach(track => {
                track.enabled = enabled;
            });

            this.emit('trackToggled', {
                streamId,
                kind,
                enabled
            });
        } catch (error) {
            this.emit('error', {
                type: 'TRACK_TOGGLE_ERROR',
                streamId,
                error: error.message
            });
            throw error;
        }
    }

    async switchDevice(streamId, deviceId, kind) {
        try {
            const streamData = this.streams.get(streamId);
            if (!streamData) {
                throw new Error('Stream not found');
            }

            const constraints = {
                ...streamData.constraints,
                [kind]: { ...streamData.constraints[kind], deviceId }
            };

            const { stream } = await this.getStream(constraints);
            const oldStream = streamData.stream;

            // Eski izleri durdur
            oldStream.getTracks().forEach(track => track.stop());

            // Yeni stream'i ayarla
            streamData.stream = stream;
            streamData.constraints = constraints;

            this.emit('deviceSwitched', {
                streamId,
                kind,
                deviceId
            });
        } catch (error) {
            this.emit('error', {
                type: 'DEVICE_SWITCH_ERROR',
                streamId,
                error: error.message
            });
            throw error;
        }
    }

    getStreamInfo(streamId) {
        const streamData = this.streams.get(streamId);
        if (!streamData) return null;

        const { stream, constraints } = streamData;
        return {
            id: streamId,
            tracks: stream.getTracks().map(track => ({
                id: track.id,
                kind: track.kind,
                label: track.label,
                enabled: track.enabled,
                muted: track.muted,
                readyState: track.readyState
            })),
            constraints
        };
    }

    generateStreamId() {
        return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    cleanup() {
        try {
            // Tüm stream'leri durdur
            for (const [streamId, streamData] of this.streams.entries()) {
                if (streamData.stream) {
                    streamData.stream.getTracks().forEach(track => track.stop());
                }
            }

            // Audio context'i kapat
            if (this.audioContext) {
                this.audioContext.close();
                this.audioContext = null;
            }

            // İşlemcileri temizle
            for (const processor of this.videoProcessors.values()) {
                if (processor) {
                    processor.running = false;
                    if (processor.canvas) {
                        processor.ctx = null;
                        processor.canvas = null;
                    }
                }
            }

            // WeakMap'leri temizle
            this.streams = new WeakMap();
            this.devices = new WeakMap();
            this.videoProcessors = new WeakMap();
            this.audioProcessors = new WeakMap();

            // Garbage collection'ı öner
            if (global.gc) {
                global.gc();
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }
}

export default MediaStreamManager; 