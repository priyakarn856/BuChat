// Giphy API integration for GIF support
const GIPHY_API_KEY = process.env.REACT_APP_GIPHY_API_KEY || 'demo'; // Use demo key for testing
const GIPHY_BASE_URL = 'https://api.giphy.com/v1/gifs';

class GifService {
  // Search GIFs
  async searchGifs(query, limit = 20, offset = 0) {
    try {
      const response = await fetch(
        `${GIPHY_BASE_URL}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&rating=g`
      );
      const data = await response.json();
      
      return {
        gifs: data.data.map(gif => ({
          id: gif.id,
          url: gif.images.fixed_height.url,
          previewUrl: gif.images.fixed_height_small.url,
          width: gif.images.fixed_height.width,
          height: gif.images.fixed_height.height,
          title: gif.title
        })),
        pagination: data.pagination
      };
    } catch (error) {
      
      return { gifs: [], pagination: {} };
    }
  }

  // Get trending GIFs
  async getTrendingGifs(limit = 20, offset = 0) {
    try {
      const response = await fetch(
        `${GIPHY_BASE_URL}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&offset=${offset}&rating=g`
      );
      const data = await response.json();
      
      return {
        gifs: data.data.map(gif => ({
          id: gif.id,
          url: gif.images.fixed_height.url,
          previewUrl: gif.images.fixed_height_small.url,
          width: gif.images.fixed_height.width,
          height: gif.images.fixed_height.height,
          title: gif.title
        })),
        pagination: data.pagination
      };
    } catch (error) {
      
      return { gifs: [], pagination: {} };
    }
  }

  // Get GIF by ID
  async getGifById(gifId) {
    try {
      const response = await fetch(
        `${GIPHY_BASE_URL}/${gifId}?api_key=${GIPHY_API_KEY}`
      );
      const data = await response.json();
      const gif = data.data;
      
      return {
        id: gif.id,
        url: gif.images.fixed_height.url,
        previewUrl: gif.images.fixed_height_small.url,
        width: gif.images.fixed_height.width,
        height: gif.images.fixed_height.height,
        title: gif.title
      };
    } catch (error) {
      
      return null;
    }
  }
}

const gifService = new GifService();
export default gifService;
