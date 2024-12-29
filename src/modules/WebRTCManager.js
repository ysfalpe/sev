import { EventEmitter } from 'events';

export class WebRTCManager extends EventEmitter {
    constructor(config = {}) {
        super();
        
        this.config = {
            iceServers: [
                {
                    urls: process.env.STUN_SERVER || 'stun:stun.l.google.com:19302'
                },
                {
                    urls: process.env.TURN_SERVER,
                    username: process.env.TURN_USERNAME,
                    credential: process.env.TURN_CREDENTIAL
                }
            ],
            iceTransportPolicy: 'all',
            bundlePolicy: 'balanced',
            rtcpMuxPolicy: 'require',
            ...config
        };

        this.peerConnections = new WeakMap();
        this.dataChannels = new WeakMap();
        this.localStream = null;
        this.remoteStreams = new WeakMap();
        this.candidates = new WeakMap();
        this.stats = new WeakMap();
        
        // Performance metrikleri
        this.metrics = {
            connectionTimes: new WeakMap(),
            iceGatheringTimes: new WeakMap(),
            datachannelStats: new WeakMap()
        };

        // Otomatik kalite ayarları
        this.qualityConfig = {
            videoBandwidth: 800, // Düşük başlangıç değeri
            audioBandwidth: 32, // Düşük başlangıç değeri
            videoQuality: 'medium', // Varsayılan orta kalite
            adaptiveBitrate: true,
            maxFrameRate: 24 // FPS sınırı
        };

        // CPU kullanımını azaltmak için throttle
        this.statsUpdateInterval = 3000; // 3 saniye
        this.lastStatsUpdate = 0;

        this.setupEventListeners();
    }

    setupEventListeners() {
        this.on('error', this.handleError.bind(this));
        this.on('iceCandidate', this.handleIceCandidate.bind(this));
        this.on('negotiationNeeded', this.handleNegotiationNeeded.bind(this));
    }

    async createPeerConnection(peerId, options = {}) {
        try {
            const startTime = Date.now();
            
            const peerConnection = new RTCPeerConnection({
                ...this.config,
                ...options
            });

            this.setupPeerConnectionListeners(peerConnection, peerId);
            this.peerConnections.set(peerId, peerConnection);
            
            // Bağlantı süresini kaydet
            this.metrics.connectionTimes.set(peerId, {
                start: startTime,
                setup: Date.now() - startTime
            });

            return peerConnection;
        } catch (error) {
            this.emit('error', {
                type: 'CONNECTION_ERROR',
                peerId,
                error: error.message
            });
            throw error;
        }
    }

    setupPeerConnectionListeners(peerConnection, peerId) {
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.emit('iceCandidate', {
                    peerId,
                    candidate: event.candidate
                });
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            this.handleIceConnectionStateChange(peerConnection, peerId);
        };

        peerConnection.onnegotiationneeded = () => {
            this.emit('negotiationNeeded', { peerId });
        };

        peerConnection.ontrack = (event) => {
            this.handleTrackEvent(event, peerId);
        };

        peerConnection.ondatachannel = (event) => {
            this.setupDataChannel(event.channel, peerId);
        };
    }

    async createOffer(peerId, options = {}) {
        try {
            const peerConnection = this.peerConnections.get(peerId);
            if (!peerConnection) {
                throw new Error('Peer connection not found');
            }

            const offer = await peerConnection.createOffer(options);
            await peerConnection.setLocalDescription(offer);

            return offer;
        } catch (error) {
            this.emit('error', {
                type: 'OFFER_ERROR',
                peerId,
                error: error.message
            });
            throw error;
        }
    }

    async handleAnswer(peerId, answer) {
        try {
            const peerConnection = this.peerConnections.get(peerId);
            if (!peerConnection) {
                throw new Error('Peer connection not found');
            }

            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            this.emit('error', {
                type: 'ANSWER_ERROR',
                peerId,
                error: error.message
            });
            throw error;
        }
    }

    async addIceCandidate(peerId, candidate) {
        try {
            const peerConnection = this.peerConnections.get(peerId);
            if (!peerConnection) {
                // Adayı daha sonra eklemek üzere sakla
                if (!this.candidates.has(peerId)) {
                    this.candidates.set(peerId, []);
                }
                this.candidates.get(peerId).push(candidate);
                return;
            }

            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            this.emit('error', {
                type: 'ICE_CANDIDATE_ERROR',
                peerId,
                error: error.message
            });
            throw error;
        }
    }

    createDataChannel(peerId, label, options = {}) {
        try {
            const peerConnection = this.peerConnections.get(peerId);
            if (!peerConnection) {
                throw new Error('Peer connection not found');
            }

            const dataChannel = peerConnection.createDataChannel(label, options);
            this.setupDataChannel(dataChannel, peerId);

            return dataChannel;
        } catch (error) {
            this.emit('error', {
                type: 'DATA_CHANNEL_ERROR',
                peerId,
                error: error.message
            });
            throw error;
        }
    }

    setupDataChannel(dataChannel, peerId) {
        dataChannel.onopen = () => {
            this.dataChannels.set(peerId, dataChannel);
            this.emit('dataChannelOpen', { peerId, label: dataChannel.label });
        };

        dataChannel.onclose = () => {
            this.dataChannels.delete(peerId);
            this.emit('dataChannelClose', { peerId, label: dataChannel.label });
        };

        dataChannel.onmessage = (event) => {
            this.emit('dataChannelMessage', {
                peerId,
                label: dataChannel.label,
                data: event.data
            });
        };

        dataChannel.onerror = (error) => {
            this.emit('error', {
                type: 'DATA_CHANNEL_ERROR',
                peerId,
                label: dataChannel.label,
                error: error.message
            });
        };
    }

    async addTrack(track, stream) {
        try {
            this.localStream = stream;
            
            for (const [peerId, peerConnection] of this.peerConnections) {
                peerConnection.addTrack(track, stream);
            }
        } catch (error) {
            this.emit('error', {
                type: 'TRACK_ERROR',
                error: error.message
            });
            throw error;
        }
    }

    async removeTrack(track) {
        try {
            for (const [peerId, peerConnection] of this.peerConnections) {
                const sender = peerConnection.getSenders().find(s => s.track === track);
                if (sender) {
                    await peerConnection.removeTrack(sender);
                }
            }
        } catch (error) {
            this.emit('error', {
                type: 'TRACK_ERROR',
                error: error.message
            });
            throw error;
        }
    }

    handleTrackEvent(event, peerId) {
        const { streams } = event;
        if (streams && streams.length > 0) {
            this.remoteStreams.set(peerId, streams[0]);
            this.emit('track', { peerId, track: event.track, streams });
        }
    }

    handleIceConnectionStateChange(peerConnection, peerId) {
        const state = peerConnection.iceConnectionState;
        this.emit('iceConnectionStateChange', { peerId, state });

        if (state === 'failed' || state === 'disconnected' || state === 'closed') {
            this.handleConnectionFailure(peerId);
        }
    }

    async handleConnectionFailure(peerId) {
        try {
            // Bağlantıyı yeniden başlat
            await this.restartIce(peerId);
            
            // Kalite ayarlarını düşür
            if (this.qualityConfig.adaptiveBitrate) {
                this.adjustQuality('down');
            }
        } catch (error) {
            this.emit('error', {
                type: 'RECONNECTION_ERROR',
                peerId,
                error: error.message
            });
        }
    }

    async restartIce(peerId) {
        try {
            const peerConnection = this.peerConnections.get(peerId);
            if (!peerConnection) return;

            const offer = await peerConnection.createOffer({ iceRestart: true });
            await peerConnection.setLocalDescription(offer);

            this.emit('restartIce', { peerId, offer });
        } catch (error) {
            this.emit('error', {
                type: 'ICE_RESTART_ERROR',
                peerId,
                error: error.message
            });
            throw error;
        }
    }

    adjustQuality(direction) {
        if (direction === 'down') {
            this.qualityConfig.videoBandwidth = Math.max(
                this.qualityConfig.videoBandwidth * 0.7, // Daha agresif düşüş
                200 // Minimum değer
            );
            this.qualityConfig.videoQuality = 'low';
            this.qualityConfig.maxFrameRate = 15; // FPS'i düşür
        } else {
            this.qualityConfig.videoBandwidth = Math.min(
                this.qualityConfig.videoBandwidth * 1.1, // Daha yavaş artış
                1500 // Maksimum değer
            );
            this.qualityConfig.videoQuality = 'medium';
            this.qualityConfig.maxFrameRate = 24;
        }

        this.applyQualitySettings();
    }

    async applyQualitySettings() {
        try {
            for (const [peerId, peerConnection] of this.peerConnections) {
                const videoSender = peerConnection.getSenders()
                    .find(sender => sender.track?.kind === 'video');

                if (videoSender) {
                    const params = videoSender.getParameters();
                    if (!params.encodings) {
                        params.encodings = [{}];
                    }

                    params.encodings[0].maxBitrate = this.qualityConfig.videoBandwidth * 1000;
                    
                    await videoSender.setParameters(params);
                }
            }
        } catch (error) {
            this.emit('error', {
                type: 'QUALITY_ADJUSTMENT_ERROR',
                error: error.message
            });
        }
    }

    async getStats(peerId) {
        try {
            // Throttle stats güncellemelerini
            const now = Date.now();
            if (now - this.lastStatsUpdate < this.statsUpdateInterval) {
                return this.stats.get(peerId);
            }
            this.lastStatsUpdate = now;

            const peerConnection = this.peerConnections.get(peerId);
            if (!peerConnection) {
                throw new Error('Peer connection not found');
            }

            const stats = await peerConnection.getStats();
            const processedStats = this.processStats(stats);
            
            this.stats.set(peerId, processedStats);
            return processedStats;
        } catch (error) {
            this.emit('error', {
                type: 'STATS_ERROR',
                peerId,
                error: error.message
            });
            throw error;
        }
    }

    processStats(stats) {
        const processedStats = {
            video: {
                bitrate: 0,
                packetsLost: 0,
                frameRate: 0
            },
            audio: {
                bitrate: 0,
                packetsLost: 0
            },
            connection: {
                rtt: 0,
                localCandidateType: '',
                remoteCandidateType: ''
            }
        };

        stats.forEach(stat => {
            if (stat.type === 'inbound-rtp') {
                const mediaType = stat.mediaType || stat.kind;
                if (mediaType === 'video' || mediaType === 'audio') {
                    processedStats[mediaType].bitrate = stat.bytesReceived * 8 / 1000;
                    processedStats[mediaType].packetsLost = stat.packetsLost;
                    
                    if (mediaType === 'video') {
                        processedStats.video.frameRate = stat.framesPerSecond;
                    }
                }
            } else if (stat.type === 'candidate-pair' && stat.state === 'succeeded') {
                processedStats.connection.rtt = stat.currentRoundTripTime;
                processedStats.connection.localCandidateType = stat.localCandidateType;
                processedStats.connection.remoteCandidateType = stat.remoteCandidateType;
            }
        });

        return processedStats;
    }

    handleError(error) {
        console.error('WebRTC Error:', error);
        // Hata durumuna göre otomatik kurtarma mekanizmaları
        if (error.type === 'ICE_CONNECTION_FAILED') {
            this.restartIce(error.peerId);
        }
    }

    async cleanup(peerId) {
        try {
            const peerConnection = this.peerConnections.get(peerId);
            if (peerConnection) {
                // Tüm track'leri durdur
                peerConnection.getSenders().forEach(sender => {
                    if (sender.track) {
                        sender.track.stop();
                    }
                });
                
                // DataChannel'ları kapat
                const dataChannel = this.dataChannels.get(peerId);
                if (dataChannel) {
                    dataChannel.close();
                }

                // PeerConnection'ı kapat
                peerConnection.close();
            }

            // WeakMap referanslarını temizle
            this.peerConnections.delete(peerId);
            this.dataChannels.delete(peerId);
            this.remoteStreams.delete(peerId);
            this.candidates.delete(peerId);
            this.stats.delete(peerId);
            this.metrics.connectionTimes.delete(peerId);
            this.metrics.iceGatheringTimes.delete(peerId);
            this.metrics.datachannelStats.delete(peerId);

            // Garbage collection'ı öner
            if (global.gc) {
                global.gc();
            }
        } catch (error) {
            this.emit('error', {
                type: 'CLEANUP_ERROR',
                peerId,
                error: error.message
            });
        }
    }

    getConnectionState(peerId) {
        const peerConnection = this.peerConnections.get(peerId);
        return peerConnection ? peerConnection.connectionState : null;
    }

    getDataChannelState(peerId) {
        const dataChannel = this.dataChannels.get(peerId);
        return dataChannel ? dataChannel.readyState : null;
    }

    isConnected(peerId) {
        const state = this.getConnectionState(peerId);
        return state === 'connected' || state === 'completed';
    }
}

export default WebRTCManager; 