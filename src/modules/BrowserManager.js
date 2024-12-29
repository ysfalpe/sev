import { ErrorManager } from "./ErrorManager.js";

export class BrowserManager {
    constructor() {
        this.errorManager = new ErrorManager();
    }

    checkBrowserCompatibility() {
        const requiredFeatures = {
            webrtc: () => !!window.RTCPeerConnection,
            mediaDevices: () => !!navigator.mediaDevices,
            getUserMedia: () => !!navigator.mediaDevices?.getUserMedia,
            webSocket: () => !!window.WebSocket,
            screen: () => !!navigator.mediaDevices?.getDisplayMedia
        };
        
        const missingFeatures = Object.entries(requiredFeatures)
            .filter(([, test]) => !test())
            .map(([feature]) => feature);
        
        if (missingFeatures.length > 0) {
            this.errorManager.handleError({
                type: "BROWSER",
                details: missingFeatures
            }, "BROWSER");
        }
        
        return {
            compatible: missingFeatures.length === 0,
            missingFeatures
        };
    }
} 