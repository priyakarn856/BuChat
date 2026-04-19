import api from './api';

export const callService = {
  async initiateCall(recipientId, callType, offer) {
    const response = await api.post('/calls', { recipientId, callType, offer });
    return response.data;
  },

  async answerCall(callId, answer) {
    const response = await api.post(`/calls/${encodeURIComponent(callId)}/answer`, { answer });
    return response.data;
  },

  async rejectCall(callId) {
    const response = await api.post(`/calls/${encodeURIComponent(callId)}/reject`);
    return response.data;
  },

  async endCall(callId) {
    const response = await api.post(`/calls/${encodeURIComponent(callId)}/end`);
    return response.data;
  },

  async getCallStatus(callId) {
    const response = await api.get(`/calls/${encodeURIComponent(callId)}`);
    return response.data;
  },

  async exchangeIceCandidate(callId, candidate) {
    const response = await api.post(`/calls/${encodeURIComponent(callId)}/ice`, { candidate });
    return response.data;
  },

  async getIceCandidates(callId) {
    const response = await api.get(`/calls/${encodeURIComponent(callId)}/ice`);
    return response.data;
  }
};
