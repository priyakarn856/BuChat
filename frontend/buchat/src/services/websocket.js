class WebSocketService {
    constructor() {
        this.ws = null;
        this.listeners = {};
    }

    connect(userId, wsUrl) {
        this.ws = new WebSocket(`${wsUrl}?userId=${userId}`);
        
        this.ws.onopen = () => console.log('WebSocket connected');
        this.ws.onclose = () => console.log('WebSocket disconnected');
        this.ws.onerror = (error) => console.error('WebSocket error:', error);
        
        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.notifyListeners(message);
        };
    }

    subscribe(conversationId) {
        this.send({ action: 'subscribe', conversationId });
    }

    unsubscribe(conversationId) {
        this.send({ action: 'unsubscribe', conversationId });
    }

    send(data) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    notifyListeners(message) {
        const listeners = this.listeners[message.type] || [];
        listeners.forEach(callback => callback(message));
    }

    disconnect() {
        this.ws?.close();
    }
}

export default new WebSocketService();
