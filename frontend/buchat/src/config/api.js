export const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://ul0we70whi.execute-api.ap-south-1.amazonaws.com/Prod';

export const API_ENDPOINTS = {
  // Users
  USERS: '/users',
  USER_BY_USERNAME: (username) => `/users/${username}`,
  USER_POSTS: (username) => `/users/${username}/posts`,
  USER_COMMENTS: (username) => `/users/${username}/comments`,
  USER_STATS: (username) => `/users/${username}/stats`,
  USER_LEVEL: (username) => `/users/${username}/level`,
  USER_GROUPS: (username) => `/users/${username}/groups`,
  
  // Groups
  GROUPS: '/groups',
  GROUP_BY_NAME: (name) => `/groups/${encodeURIComponent(name)}`,
  JOIN_GROUP: (name) => `/groups/${encodeURIComponent(name)}/join`,
  LEAVE_GROUP: (name) => `/groups/${encodeURIComponent(name)}/leave`,
  DISCOVER_GROUPS: '/groups/discover',
  
  // Posts
  CREATE_POST: (groupName) => `/groups/${encodeURIComponent(groupName)}/posts`,
  POST_BY_ID: (postId) => `/posts/${postId}`,
  GROUP_POSTS: (groupName) => `/groups/${encodeURIComponent(groupName)}/posts`,
  SEARCH_POSTS: '/posts/search',
  TRENDING_POSTS: '/posts/trending',
  GLOBAL_POSTS: '/posts',
  
  // Comments
  CREATE_COMMENT: (postId) => `/posts/${postId}/comments`,
  POST_COMMENTS: (postId) => `/posts/${postId}/comments`,
  COMMENT_BY_ID: (commentId) => `/comments/${commentId}`,
  
  // Voting
  VOTE_POST: (postId) => `/posts/${postId}/vote`,
  VOTE_COMMENT: (commentId) => `/comments/${commentId}/vote`,
  
  // Social
  FOLLOW_USER: (username) => `/users/${username}/follow`,
  USER_FOLLOWERS: (username) => `/users/${username}/followers`,
  USER_FOLLOWING: (username) => `/users/${username}/following`,
  SEND_MESSAGE: '/messages',
  GET_CONVERSATION: (conversationId) => `/messages/conversations/${conversationId}`,
  GET_INBOX: '/messages/inbox',
  MARK_MESSAGE_READ: (messageId) => `/messages/${messageId}/read`,
  MARK_CONVERSATION_READ: (conversationId) => `/messages/conversations/${conversationId}/read`,
  DELETE_MESSAGE: (messageId) => `/messages/${messageId}`,
  TYPING_INDICATOR: (conversationId) => `/messages/conversations/${conversationId}/typing`,
  POLL_MESSAGES: (conversationId) => `/messages/conversations/${conversationId}/poll`,
  CLEAR_CONVERSATION: (conversationId) => `/messages/conversations/${conversationId}/clear`,
  GET_MESSAGE_REQUESTS: '/messages/requests',
  RESPOND_MESSAGE_REQUEST: (requestId) => `/messages/requests/${requestId}`,
  BLOCK_USER: (username) => `/users/${username}/block`,
  UNBLOCK_USER: (username) => `/users/${username}/block`,
  GET_BLOCKED_USERS: '/users/blocked',
  CROSSPOST: (postId) => `/posts/${postId}/crosspost`,
  SHARE_POST: (postId) => `/posts/${postId}/share`,
  GET_FEED: '/feed',
  GET_CONVERSATIONS: '/messages/conversations',
  
  // Notifications
  GET_NOTIFICATIONS: '/notifications',
  CREATE_NOTIFICATION: '/notifications',
  MARK_NOTIFICATION_READ: (notificationId) => `/notifications/${notificationId}/read`,
  
  // Gamification
  AWARD_BADGE: (username) => `/users/${username}/badges`,
  GET_BADGES: (username) => `/users/${username}/badges`,
  UPDATE_STREAK: (username) => `/users/${username}/streak`,
  GROUP_LEADERBOARD: (name) => `/groups/${encodeURIComponent(name)}/leaderboard`,
  GLOBAL_LEADERBOARD: '/leaderboard',
  CHECK_ACHIEVEMENTS: (username) => `/users/${username}/check-achievements`,
  
  // Moderation
  REPORT_POST: (postId) => `/posts/${postId}/report`,
  REPORT_COMMENT: (commentId) => `/comments/${commentId}/report`,
  HIDE_POST: (postId) => `/posts/${postId}/hide`,
  REMOVE_POST: (postId) => `/posts/${postId}/remove`,
  BAN_USER: (groupName) => `/groups/${encodeURIComponent(groupName)}/ban`,
  UNBAN_USER: (groupName, userId) => `/groups/${encodeURIComponent(groupName)}/ban/${userId}`,
  SET_MODERATOR: (groupName) => `/groups/${encodeURIComponent(groupName)}/moderators`,
  PENDING_REPORTS: '/reports/pending',
  UPDATE_REPORT: (reportId) => `/reports/${reportId}`,
  
  // AI Features
  AUTO_TAG: (postId) => `/posts/${postId}/auto-tag`,
  GET_SENTIMENT: (postId) => `/posts/${postId}/sentiment`,
  COMMENT_SENTIMENT: (commentId) => `/comments/${commentId}/sentiment`,
  MODERATE_IMAGE: '/media/moderate',
  GET_RECOMMENDATIONS: '/recommendations',
  ANALYZE_TOXICITY: (commentId) => `/comments/${commentId}/analyze-toxicity`,
  
  // Unique Features
  CREATE_POLL: (groupName) => `/groups/${encodeURIComponent(groupName)}/polls`,
  VOTE_POLL: (pollId) => `/polls/${pollId}/vote`,
  GET_POLL: (pollId) => `/polls/${pollId}`,
  CREATE_CAPSULE: (groupName) => `/groups/${encodeURIComponent(groupName)}/capsules`,
  OPEN_CAPSULE: (capsuleId) => `/capsules/${capsuleId}`,
  UPCOMING_CAPSULES: (groupName) => `/groups/${encodeURIComponent(groupName)}/capsules/upcoming`,
  CREATE_EVENT: (groupName) => `/groups/${encodeURIComponent(groupName)}/events`,
  RSVP_EVENT: (eventId) => `/events/${eventId}/rsvp`,
  GET_EVENT: (eventId) => `/events/${eventId}`,
  UPCOMING_EVENTS: (groupName) => `/groups/${encodeURIComponent(groupName)}/events/upcoming`,
  
  // Media
  PRESIGN_MEDIA: '/media/presign',
  UPLOAD_PRESIGN: '/upload/presign',
};
