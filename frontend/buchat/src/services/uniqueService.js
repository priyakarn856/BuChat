import api from './api';
import { API_ENDPOINTS } from '../config/api';

export const uniqueService = {
  // Create poll
  createPoll: async (groupName, pollData) => {
    const response = await api.post(API_ENDPOINTS.CREATE_POLL(groupName), pollData);
    return response.data;
  },

  // Vote on poll
  votePoll: async (pollId, voteData) => {
    const response = await api.post(API_ENDPOINTS.VOTE_POLL(pollId), voteData);
    return response.data;
  },

  // Get poll
  getPoll: async (pollId) => {
    const response = await api.get(API_ENDPOINTS.GET_POLL(pollId));
    return response.data;
  },

  // Create time capsule
  createCapsule: async (groupName, capsuleData) => {
    const response = await api.post(API_ENDPOINTS.CREATE_CAPSULE(groupName), capsuleData);
    return response.data;
  },

  // Open capsule
  openCapsule: async (capsuleId) => {
    const response = await api.get(API_ENDPOINTS.OPEN_CAPSULE(capsuleId));
    return response.data;
  },

  // Get upcoming capsules
  getUpcomingCapsules: async (groupName, params = {}) => {
    const response = await api.get(API_ENDPOINTS.UPCOMING_CAPSULES(groupName), {
      params,
    });
    return response.data;
  },

  // Create event
  createEvent: async (groupName, eventData) => {
    const response = await api.post(API_ENDPOINTS.CREATE_EVENT(groupName), eventData);
    return response.data;
  },

  // RSVP to event
  rsvpEvent: async (eventId, rsvpData) => {
    const response = await api.post(API_ENDPOINTS.RSVP_EVENT(eventId), rsvpData);
    return response.data;
  },

  // Get event
  getEvent: async (eventId) => {
    const response = await api.get(API_ENDPOINTS.GET_EVENT(eventId));
    return response.data;
  },

  // Get upcoming events
  getUpcomingEvents: async (groupName, params = {}) => {
    const response = await api.get(API_ENDPOINTS.UPCOMING_EVENTS(groupName), {
      params,
    });
    return response.data;
  },
};
