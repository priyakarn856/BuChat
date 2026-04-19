/**
 * UI Slice - User interface state management
 */
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Navigation
  activeView: 'messages', // 'messages', 'calls', 'contacts', 'settings', 'profile'
  
  // Modals
  modals: {
    forward: { isOpen: false, message: null },
    settings: { isOpen: false, tab: 'general' },
    profile: { isOpen: false, userId: null },
    media: { isOpen: false, items: [], currentIndex: 0 },
    confirm: { isOpen: false, title: '', message: '', onConfirm: null },
    qualitySettings: { isOpen: false },
  },
  
  // Sidebar state
  sidebar: {
    isOpen: true,
    isCollapsed: false,
    width: 320,
  },
  
  // Search
  search: {
    isOpen: false,
    query: '',
    results: [],
    filter: 'all', // 'all', 'messages', 'files', 'links'
  },
  
  // Selection mode
  selection: {
    isActive: false,
    selectedIds: [],
    type: 'messages', // 'messages', 'conversations'
  },
  
  // Toast notifications queue
  toasts: [],
  
  // Loading states
  loading: {
    global: false,
    messages: false,
    conversations: false,
    media: false,
    profile: false,
  },
  
  // Keyboard shortcuts
  shortcuts: {
    enabled: true,
    lastAction: null,
  },
  
  // Mobile-specific
  mobile: {
    isMenuOpen: false,
    isKeyboardOpen: false,
    safeAreaInsets: { top: 0, bottom: 0, left: 0, right: 0 },
  },
  
  // Performance metrics (dev mode)
  metrics: {
    fps: 60,
    memoryUsage: 0,
    lastRender: 0,
  },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    // Navigation
    setActiveView: (state, action) => {
      state.activeView = action.payload;
    },
    
    // Modals
    openModal: (state, action) => {
      const { modal, data = {} } = action.payload;
      if (state.modals[modal]) {
        state.modals[modal] = { isOpen: true, ...data };
      }
    },
    
    closeModal: (state, action) => {
      const modal = action.payload;
      if (state.modals[modal]) {
        state.modals[modal] = { ...initialState.modals[modal] };
      }
    },
    
    closeAllModals: (state) => {
      Object.keys(state.modals).forEach(modal => {
        state.modals[modal] = { ...initialState.modals[modal] };
      });
    },
    
    // Sidebar
    toggleSidebar: (state) => {
      state.sidebar.isOpen = !state.sidebar.isOpen;
    },
    
    setSidebarWidth: (state, action) => {
      state.sidebar.width = Math.max(260, Math.min(450, action.payload));
    },
    
    collapseSidebar: (state) => {
      state.sidebar.isCollapsed = true;
    },
    
    expandSidebar: (state) => {
      state.sidebar.isCollapsed = false;
    },
    
    // Search
    openSearch: (state) => {
      state.search.isOpen = true;
    },
    
    closeSearch: (state) => {
      state.search.isOpen = false;
      state.search.query = '';
      state.search.results = [];
    },
    
    setSearchQuery: (state, action) => {
      state.search.query = action.payload;
    },
    
    setSearchResults: (state, action) => {
      state.search.results = action.payload;
    },
    
    setSearchFilter: (state, action) => {
      state.search.filter = action.payload;
    },
    
    // Selection mode
    enterSelectionMode: (state, action) => {
      state.selection.isActive = true;
      state.selection.type = action.payload || 'messages';
      state.selection.selectedIds = [];
    },
    
    exitSelectionMode: (state) => {
      state.selection.isActive = false;
      state.selection.selectedIds = [];
    },
    
    toggleSelection: (state, action) => {
      const id = action.payload;
      const index = state.selection.selectedIds.indexOf(id);
      if (index > -1) {
        state.selection.selectedIds.splice(index, 1);
      } else {
        state.selection.selectedIds.push(id);
      }
    },
    
    selectAll: (state, action) => {
      state.selection.selectedIds = action.payload;
    },
    
    clearSelection: (state) => {
      state.selection.selectedIds = [];
    },
    
    // Toasts
    addToast: (state, action) => {
      const toast = {
        id: Date.now(),
        duration: 3000,
        type: 'info',
        ...action.payload,
      };
      state.toasts.push(toast);
    },
    
    removeToast: (state, action) => {
      state.toasts = state.toasts.filter(t => t.id !== action.payload);
    },
    
    clearToasts: (state) => {
      state.toasts = [];
    },
    
    // Loading states
    setLoading: (state, action) => {
      const { key, value } = action.payload;
      if (state.loading.hasOwnProperty(key)) {
        state.loading[key] = value;
      }
    },
    
    setGlobalLoading: (state, action) => {
      state.loading.global = action.payload;
    },
    
    // Mobile
    setMobileMenuOpen: (state, action) => {
      state.mobile.isMenuOpen = action.payload;
    },
    
    setKeyboardOpen: (state, action) => {
      state.mobile.isKeyboardOpen = action.payload;
    },
    
    setSafeAreaInsets: (state, action) => {
      state.mobile.safeAreaInsets = action.payload;
    },
    
    // Performance metrics
    updateMetrics: (state, action) => {
      state.metrics = { ...state.metrics, ...action.payload };
    },
    
    // Keyboard shortcuts
    setLastAction: (state, action) => {
      state.shortcuts.lastAction = action.payload;
    },
    
    toggleShortcuts: (state) => {
      state.shortcuts.enabled = !state.shortcuts.enabled;
    },
  },
});

export const {
  setActiveView,
  openModal,
  closeModal,
  closeAllModals,
  toggleSidebar,
  setSidebarWidth,
  collapseSidebar,
  expandSidebar,
  openSearch,
  closeSearch,
  setSearchQuery,
  setSearchResults,
  setSearchFilter,
  enterSelectionMode,
  exitSelectionMode,
  toggleSelection,
  selectAll,
  clearSelection,
  addToast,
  removeToast,
  clearToasts,
  setLoading,
  setGlobalLoading,
  setMobileMenuOpen,
  setKeyboardOpen,
  setSafeAreaInsets,
  updateMetrics,
  setLastAction,
  toggleShortcuts,
} = uiSlice.actions;

export default uiSlice.reducer;

// Selectors
export const selectActiveView = (state) => state.ui.activeView;
export const selectModal = (modal) => (state) => state.ui.modals[modal];
export const selectSidebar = (state) => state.ui.sidebar;
export const selectSearch = (state) => state.ui.search;
export const selectSelection = (state) => state.ui.selection;
export const selectToasts = (state) => state.ui.toasts;
export const selectLoading = (key) => (state) => state.ui.loading[key];
export const selectMobile = (state) => state.ui.mobile;
