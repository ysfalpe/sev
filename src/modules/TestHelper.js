export class TestHelper {
    async runTests() {
        if (process.env.NODE_ENV !== "development") return;
        
        console.log("Testler başlatılıyor...");
        
        await this.testMediaDevices();
        await this.testWebRTCConnection();
        await this.testMessageHandling();
        await this.testNetworkResilience();
        
        console.log("Testler tamamlandı.");
    }
    
    async testMediaDevices() {
        console.log("Medya cihazları testi...");
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            this.assert(stream.getVideoTracks().length > 0, "Video track bulunamadı");
            this.assert(stream.getAudioTracks().length > 0, "Audio track bulunamadı");
            
            stream.getTracks().forEach(track => track.stop());
            console.log("✓ Medya cihazları testi başarılı");
        } catch (err) {
            console.error("✗ Medya cihazları testi başarısız:", err);
        }
    }
    
    async testWebRTCConnection() {
        console.log("WebRTC bağlantı testi...");
        
        try {
            const peer1 = new SimplePeer({ initiator: true });
            const peer2 = new SimplePeer();
            
            peer1.on("signal", data => peer2.signal(data));
            peer2.on("signal", data => peer1.signal(data));
            
            await new Promise((resolve, reject) => {
                peer1.on("connect", resolve);
                peer1.on("error", reject);
                setTimeout(reject, 5000);
            });
            
            console.log("✓ WebRTC bağlantı testi başarılı");
        } catch (err) {
            console.error("✗ WebRTC bağlantı testi başarısız:", err);
        }
    }
    
    async testMessageHandling() {
        console.log("Mesaj işleme testi...");
        
        try {
            const testMessage = "Test message <script>alert(1)</script>";
            const sanitized = sanitizeMessage(testMessage);
            
            this.assert(!sanitized.includes("<script>"), "XSS koruması başarısız");
            this.assert(validateMessage(testMessage), "Mesaj doğrulama başarısız");
            
            console.log("✓ Mesaj işleme testi başarılı");
        } catch (err) {
            console.error("✗ Mesaj işleme testi başarısız:", err);
        }
    }
    
    async testNetworkResilience() {
        console.log("Ağ dayanıklılık testi...");
        
        try {
            window.dispatchEvent(new Event("offline"));
            this.assert(!networkState.online, "Offline durumu algılanmadı");
            
            window.dispatchEvent(new Event("online"));
            this.assert(networkState.online, "Online durumu algılanmadı");
            
            console.log("✓ Ağ dayanıklılık testi başarılı");
        } catch (err) {
            console.error("✗ Ağ dayanıklılık testi başarısız:", err);
        }
    }

    assert(condition, message) {
        if (!condition) {
            throw new Error(message);
        }
    }
} 