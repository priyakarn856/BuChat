import React, { useState, useEffect } from 'react';
import gifService from '../../services/gifService';
import './GifPicker.css';

const GifPicker = ({ onSelectGif, onClose }) => {
  const [gifs, setGifs] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadTrendingGifs();
  }, []);

  const loadTrendingGifs = async () => {
    setLoading(true);
    try {
      const data = await gifService.getTrendingGifs(30);
      setGifs(data.gifs);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (query) => {
    setSearchQuery(query);
    if (!query.trim()) {
      loadTrendingGifs();
      return;
    }

    setLoading(true);
    try {
      const data = await gifService.searchGifs(query, 30);
      setGifs(data.gifs);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="gif-picker">
      <div className="gif-picker-header">
        <input
          type="text"
          placeholder="Search GIFs..."
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          className="gif-search-input"
        />
        <button onClick={onClose} className="gif-close-btn">×</button>
      </div>
      
      <div className="gif-grid">
        {loading ? (
          <div className="gif-loading">Loading GIFs...</div>
        ) : gifs.length === 0 ? (
          <div className="gif-empty">No GIFs found</div>
        ) : (
          gifs.map(gif => (
            <div
              key={gif.id}
              className="gif-item"
              onClick={() => onSelectGif(gif)}
            >
              <img src={gif.previewUrl} alt={gif.title} />
            </div>
          ))
        )}
      </div>
      
      <div className="gif-footer">
        <span>Powered by GIPHY</span>
      </div>
    </div>
  );
};

export default GifPicker;
