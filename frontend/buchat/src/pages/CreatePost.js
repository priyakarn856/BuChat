/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Image as ImageIcon, Video, FileText, Globe, Users, 
  X, ChevronDown, Send, Hash, Smile, Gift, Sparkles, Search, Clock
} from 'lucide-react';
import { toast } from 'react-toastify';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import GlassSelect from '../components/common/GlassSelect';
import { postService } from '../services/postService';
import { groupService } from '../services/groupService';
import { useAuth } from '../contexts/AuthContext';
import './CreatePost.css';

// --- EXPANDED EMOJI, GIF, STICKER DATA ---
const MOCK_GIFS = Array.from({length: 50}, (_, i) => `https://media.giphy.com/media/gif${i}/giphy.gif`);
const MOCK_STICKERS = Array.from({length: 40}, (_, i) => `https://media.giphy.com/media/sticker${i}/giphy.gif`);

const EMOJI_CATEGORIES = {
  "Recent": ["😂", "🔥", "❤️", "👍", "😭", "🙏", "👀", "✨", "💯", "🎉", "💪", "🤔"],
  "Smileys": ["😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗", "🤭", "🤫", "🤔", "🤐", "🤨", "😐", "😑", "😶", "😏", "😒", "🙄", "😬", "🤥", "😌", "😔", "😪", "🤤", "😴", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "😵", "🤯", "🤠", "🥳", "😎", "🤓", "🧐"],
  "Emotions": ["😕", "😟", "🙁", "☹️", "😮", "😯", "😲", "😳", "🥺", "😦", "😧", "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓", "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀", "☠️", "💩", "🤡", "👹", "👺", "👻", "👽", "👾", "🤖"],
  "Gestures": ["👋", "🤚", "🖐️", "✋", "🖖", "👌", "🤏", "✌️", "🤞", "🤟", "🤘", "🤙", "👈", "👉", "👆", "🖕", "👇", "☝️", "👍", "👎", "✊", "👊", "🤛", "🤜", "👏", "🙌", "👐", "🤲", "🤝", "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦿", "🦵", "🦶", "👂", "🦻", "👃", "🧠", "🦷", "🦴", "👀", "👁️", "👅", "👄"],
  "People": ["👶", "👧", "🧒", "👦", "👩", "🧑", "👨", "👩‍🦱", "🧑‍🦱", "👨‍🦱", "👩‍🦰", "🧑‍🦰", "👨‍🦰", "👱‍♀️", "👱", "👱‍♂️", "👩‍🦳", "🧑‍🦳", "👨‍🦳", "👩‍🦲", "🧑‍🦲", "👨‍🦲", "🧔", "👵", "🧓", "👴", "👲", "👳‍♀️", "👳", "👳‍♂️", "🧕", "👮‍♀️", "👮", "👮‍♂️", "👷‍♀️", "👷", "👷‍♂️", "💂‍♀️", "💂", "💂‍♂️"],
  "Animals": ["🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐽", "🐸", "🐵", "🙈", "🙉", "🙊", "🐒", "🐔", "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋", "🐌", "🐞", "🐜", "🦟", "🦗", "🕷️", "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓", "🦍", "🦧", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🐃", "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦌", "🐕", "🐩", "🦮", "🐕‍🦺", "🐈", "🐓", "🦃", "🦚", "🦜", "🦢", "🦩", "🕊️", "🐇", "🦝", "🦨", "🦡", "🦦", "🦥", "🐁", "🐀", "🐿️", "🦔"],
  "Food": ["🍏", "🍎", "🍐", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍈", "🍒", "🍑", "🥭", "🍍", "🥥", "🥝", "🍅", "🍆", "🥑", "🥦", "🥬", "🥒", "🌶️", "🌽", "🥕", "🧄", "🧅", "🥔", "🍠", "🥐", "🥯", "🍞", "🥖", "🥨", "🧀", "🥚", "🍳", "🧈", "🥞", "🧇", "🥓", "🥩", "🍗", "🍖", "🦴", "🌭", "🍔", "🍟", "🍕", "🥪", "🥙", "🧆", "🌮", "🌯", "🥗", "🥘", "🥫", "🍝", "🍜", "🍲", "🍛", "🍣", "🍱", "🥟", "🦪", "🍤", "🍙", "🍚", "🍘", "🍥", "🥠", "🥮", "🍢", "🍡", "🍧", "🍨", "🍦", "🥧", "🧁", "🍰", "🎂", "🍮", "🍭", "🍬", "🍫", "🍿", "🍩", "🍪", "🌰", "🥜", "🍯"],
  "Activities": ["⚽", "🏀", "🏈", "⚾", "🥎", "🎾", "🏐", "🏉", "🥏", "🎱", "🪀", "🏓", "🏸", "🏒", "🏑", "🥍", "🏏", "🥅", "⛳", "🪁", "🏹", "🎣", "🤿", "🥊", "🥋", "🎽", "🛹", "🛷", "⛸️", "🥌", "🎿", "⛷️", "🏂", "🪂", "🏋️", "🤼", "🤸", "🤺", "⛹️", "🤾", "🏌️", "🏇", "🧘", "🏄", "🏊", "🤽", "🚣", "🧗", "🚵", "🚴", "🏆", "🥇", "🥈", "🥉", "🏅", "🎖️", "🎗️", "🎫", "🎟️", "🎪", "🤹", "🎭", "🩰", "🎨", "🎬", "🎤", "🎧", "🎼", "🎹", "🥁", "🎷", "🎺", "🎸", "🪕", "🎻", "🎲", "♟️", "🎯", "🎳", "🎮", "🎰", "🧩"],
  "Travel": ["🚗", "🚕", "🚙", "🚌", "🚎", "🏎️", "🚓", "🚑", "🚒", "🚐", "🚚", "🚛", "🚜", "🦯", "🦽", "🦼", "🛴", "🚲", "🛵", "🏍️", "🛺", "🚨", "🚔", "🚍", "🚘", "🚖", "🚡", "🚠", "🚟", "🚃", "🚋", "🚞", "🚝", "🚄", "🚅", "🚈", "🚂", "🚆", "🚇", "🚊", "🚉", "✈️", "🛫", "🛬", "🛩️", "💺", "🛰️", "🚀", "🛸", "🚁", "🛶", "⛵", "🚤", "🛥️", "🛳️", "⛴️", "🚢", "⚓", "⛽", "🚧", "🚦", "🚥", "🗺️", "🗿", "🗽", "🗼", "🏰", "🏯", "🏟️", "🎡", "🎢", "🎠", "⛲", "⛱️", "🏖️", "🏝️", "🏜️", "🌋", "⛰️", "🏔️", "🗻", "🏕️", "⛺", "🏠", "🏡", "🏘️", "🏚️", "🏗️", "🏭", "🏢", "🏬", "🏣", "🏤", "🏥", "🏦", "🏨", "🏪", "🏫", "🏩", "💒", "🏛️", "⛪", "🕌", "🕍", "🛕", "🕋"],
  "Objects": ["⌚", "📱", "📲", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "🖲️", "🕹️", "🗜️", "💾", "💿", "📀", "📼", "📷", "📸", "📹", "🎥", "📽️", "🎞️", "📞", "☎️", "📟", "📠", "📺", "📻", "🎙️", "🎚️", "🎛️", "🧭", "⏱️", "⏲️", "⏰", "🕰️", "⌛", "⏳", "📡", "🔋", "🔌", "💡", "🔦", "🕯️", "🪔", "🧯", "🛢️", "💸", "💵", "💴", "💶", "💷", "💰", "💳", "💎", "⚖️", "🧰", "🔧", "🔨", "⚒️", "🛠️", "⛏️", "🔩", "⚙️", "🧱", "⛓️", "🧲", "🔫", "💣", "🧨", "🪓", "🔪", "🗡️", "⚔️", "🛡️", "🚬", "⚰️", "⚱️", "🏺", "🔮", "📿", "🧿", "💈", "⚗️", "🔭", "🔬", "🕳️", "💊", "💉", "🩸", "🩹", "🩺", "🌡️", "🧬", "🦠", "🧫", "🧪", "🧹", "🧺", "🧻", "🚽", "🚰", "🚿", "🛁", "🛀", "🧼", "🧽", "🧴", "🛎️", "🔑", "🗝️", "🚪", "🪑", "🛋️", "🛏️", "🛌", "🧸", "🖼️", "🛍️", "🛒", "🎁", "🎈", "🎏", "🎀", "🎊", "🎉", "🎎", "🏮", "🎐", "🧧", "✉️", "📩", "📨", "📧", "💌", "📥", "📤", "📦", "🏷️", "📪", "📫", "📬", "📭", "📮", "📯", "📜", "📃", "📄", "📑", "🧾", "📊", "📈", "📉", "🗒️", "🗓️", "📆", "📅", "🗑️", "📇", "🗃️", "🗳️", "🗄️", "📋", "📁", "📂", "🗂️", "🗞️", "📰", "📓", "📔", "📒", "📕", "📗", "📘", "📙", "📚", "📖", "🔖", "🧷", "🔗", "📎", "🖇️", "📐", "📏", "🧮", "📌", "📍", "✂️", "🖊️", "🖋️", "✒️", "🖌️", "🖍️", "📝", "✏️", "🔍", "🔎", "🔏", "🔐", "🔒", "🔓"],
  "Symbols": ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "💟", "☮️", "✝️", "☪️", "🕉️", "☸️", "✡️", "🔯", "🕎", "☯️", "☦️", "🛐", "⛎", "♈", "♉", "♊", "♋", "♌", "♍", "♎", "♏", "♐", "♑", "♒", "♓", "🆔", "⚛️", "🉑", "☢️", "☣️", "📴", "📳", "🈶", "🈚", "🈸", "🈺", "🈷️", "✴️", "🆚", "💮", "🉐", "㊙️", "㊗️", "🈴", "🈵", "🈹", "🈲", "🅰️", "🅱️", "🆎", "🆑", "🅾️", "🆘", "❌", "⭕", "🛑", "⛔", "📛", "🚫", "💯", "💢", "♨️", "🚷", "🚯", "🚳", "🚱", "🔞", "📵", "🚭", "❗", "❕", "❓", "❔", "‼️", "⁉️", "🔅", "🔆", "〽️", "⚠️", "🚸", "🔱", "⚜️", "🔰", "♻️", "✅", "🈯", "💹", "❇️", "✳️", "❎", "🌐", "💠", "Ⓜ️", "🌀", "💤", "🏧", "🚾", "♿", "🅿️", "🈳", "🈂️", "🛂", "🛃", "🛄", "🛅", "🚹", "🚺", "🚼", "🚻", "🚮", "🎦", "📶", "🈁", "🔣", "ℹ️", "🔤", "🔡", "🔠", "🆖", "🆗", "🆙", "🆒", "🆕", "🆓", "0️⃣", "1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟", "🔢", "#️⃣", "*️⃣", "⏏️", "▶️", "⏸️", "⏯️", "⏹️", "⏺️", "⏭️", "⏮️", "⏩", "⏪", "⏫", "⏬", "◀️", "🔼", "🔽", "➡️", "⬅️", "⬆️", "⬇️", "↗️", "↘️", "↙️", "↖️", "↕️", "↔️", "↪️", "↩️", "⤴️", "⤵️", "🔀", "🔁", "🔂", "🔄", "🔃", "🎵", "🎶", "➕", "➖", "➗", "✖️", "♾️", "💲", "💱", "™️", "©️", "®️", "〰️", "➰", "➿", "🔚", "🔙", "🔛", "🔝", "🔜", "✔️", "☑️", "🔘", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", "⚫", "⚪", "🟤", "🔺", "🔻", "🔸", "🔹", "🔶", "🔷", "🔳", "🔲", "▪️", "▫️", "◾", "◽", "◼️", "◻️", "🟥", "🟧", "🟨", "🟩", "🟦", "🟪", "⬛", "⬜", "🟫", "🔈", "🔇", "🔉", "🔊", "🔔", "🔕", "📣", "📢", "👁️‍🗨️", "💬", "💭", "🗯️", "♠️", "♣️", "♥️", "♦️", "🃏", "🎴", "🀄", "🕐", "🕑", "🕒", "🕓", "🕔", "🕕", "🕖", "🕗", "🕘", "🕙", "🕚", "🕛", "🕜", "🕝", "🕞", "🕟", "🕠", "🕡", "🕢", "🕣", "🕤", "🕥", "🕦", "🕧"]
};

const CreatePost = () => {
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  // --- State ---
  const [groups, setGroups] = useState([]);
  
  const [formData, setFormData] = useState({
    body: '',
    group: location.state?.groupName || '',
    audience: 'global',
    tags: '',
    type: 'text',
  });

  const [mediaFiles, setMediaFiles] = useState([]);
  const [mediaPreviews, setMediaPreviews] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Picker State
  const [activePicker, setActivePicker] = useState(null); // 'emoji', 'gif', 'sticker' or null
  const [pickerSearch, setPickerSearch] = useState('');
  const [emojiSearch, setEmojiSearch] = useState('');
  const [gifs, setGifs] = useState([]);
  const [stickers, setStickers] = useState([]);
  const [loadingMedia, setLoadingMedia] = useState(false);

  const GIPHY_API_KEY = process.env.REACT_APP_GIPHY_API_KEY || 'demo';
  const TENOR_API_KEY = process.env.REACT_APP_TENOR_API_KEY || 'AIzaSyAyimkuYQYF_FXVALexPuGQctUWRURdCYQ';
  const EMOJI_API_KEY = process.env.REACT_APP_EMOJI_API_KEY;
  const [apiEmojis, setApiEmojis] = useState([]);

  // --- Effects ---
  useEffect(() => {
    if (!isAuthenticated) { navigate('/login'); return; }
    fetchGroups();
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (activePicker === 'gif') fetchGifs();
    if (activePicker === 'sticker') fetchStickers();
    if (activePicker === 'emoji' && EMOJI_API_KEY) fetchApiEmojis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePicker]);

  useEffect(() => {
    if (activePicker === 'gif' && pickerSearch) {
      const timer = setTimeout(() => searchGifs(), 500);
      return () => clearTimeout(timer);
    }
    if (activePicker === 'sticker' && pickerSearch) {
      const timer = setTimeout(() => searchStickers(), 500);
      return () => clearTimeout(timer);
    }
    if (activePicker === 'emoji' && emojiSearch && EMOJI_API_KEY) {
      const timer = setTimeout(() => searchApiEmojis(), 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerSearch, emojiSearch, activePicker]);

  const fetchGroups = async () => {
    try {
      const response = await groupService.getAllGROUPS({ limit: 100 });
      setGroups(response.groups || []);
    } catch (error) {
      
    }
  };

  const fetchGifs = async () => {
    setLoadingMedia(true);
    try {
      // Fetch from both Giphy and Tenor
      const [giphyRes, tenorRes] = await Promise.all([
        fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=25&rating=g`),
        fetch(`https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=25&media_filter=gif`)
      ]);
      
      const giphyData = await giphyRes.json();
      const tenorData = await tenorRes.json();
      
      // Combine results
      const giphyGifs = (giphyData.data || []).map(g => ({
        id: `giphy-${g.id}`,
        images: { fixed_height: { url: g.images.fixed_height.url } },
        title: g.title
      }));
      
      const tenorGifs = (tenorData.results || []).map(t => ({
        id: `tenor-${t.id}`,
        images: { fixed_height: { url: t.media_formats.gif.url } },
        title: t.content_description
      }));
      
      setGifs([...giphyGifs, ...tenorGifs]);
    } catch (error) {
      
    } finally {
      setLoadingMedia(false);
    }
  };

  const searchGifs = async () => {
    if (!pickerSearch) return fetchGifs();
    setLoadingMedia(true);
    try {
      const [giphyRes, tenorRes] = await Promise.all([
        fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(pickerSearch)}&limit=25&rating=g`),
        fetch(`https://tenor.googleapis.com/v2/search?key=${TENOR_API_KEY}&q=${encodeURIComponent(pickerSearch)}&limit=25&media_filter=gif`)
      ]);
      
      const giphyData = await giphyRes.json();
      const tenorData = await tenorRes.json();
      
      const giphyGifs = (giphyData.data || []).map(g => ({
        id: `giphy-${g.id}`,
        images: { fixed_height: { url: g.images.fixed_height.url } },
        title: g.title
      }));
      
      const tenorGifs = (tenorData.results || []).map(t => ({
        id: `tenor-${t.id}`,
        images: { fixed_height: { url: t.media_formats.gif.url } },
        title: t.content_description
      }));
      
      setGifs([...giphyGifs, ...tenorGifs]);
    } catch (error) {
      
    } finally {
      setLoadingMedia(false);
    }
  };

  const fetchStickers = async () => {
    setLoadingMedia(true);
    try {
      const [giphyRes, tenorRes] = await Promise.all([
        fetch(`https://api.giphy.com/v1/stickers/trending?api_key=${GIPHY_API_KEY}&limit=25&rating=g`),
        fetch(`https://tenor.googleapis.com/v2/featured?key=${TENOR_API_KEY}&limit=25&media_filter=sticker`)
      ]);
      
      const giphyData = await giphyRes.json();
      const tenorData = await tenorRes.json();
      
      const giphyStickers = (giphyData.data || []).map(g => ({
        id: `giphy-${g.id}`,
        images: { fixed_height: { url: g.images.fixed_height.url } },
        title: g.title
      }));
      
      const tenorStickers = (tenorData.results || []).map(t => ({
        id: `tenor-${t.id}`,
        images: { fixed_height: { url: t.media_formats.gif.url } },
        title: t.content_description
      }));
      
      setStickers([...giphyStickers, ...tenorStickers]);
    } catch (error) {
      
    } finally {
      setLoadingMedia(false);
    }
  };

  const fetchApiEmojis = async () => {
    if (!EMOJI_API_KEY) return;
    setLoadingMedia(true);
    try {
      const response = await fetch(`https://emoji-api.com/emojis?access_key=${EMOJI_API_KEY}`);
      const data = await response.json();
      setApiEmojis(data || []);
    } catch (error) {
      
    } finally {
      setLoadingMedia(false);
    }
  };

  const searchApiEmojis = async () => {
    if (!EMOJI_API_KEY || !emojiSearch) return fetchApiEmojis();
    setLoadingMedia(true);
    try {
      const response = await fetch(`https://emoji-api.com/emojis?search=${encodeURIComponent(emojiSearch)}&access_key=${EMOJI_API_KEY}`);
      const data = await response.json();
      setApiEmojis(data || []);
    } catch (error) {
      
    } finally {
      setLoadingMedia(false);
    }
  };

  const searchStickers = async () => {
    if (!pickerSearch) return fetchStickers();
    setLoadingMedia(true);
    try {
      const [giphyRes, tenorRes] = await Promise.all([
        fetch(`https://api.giphy.com/v1/stickers/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(pickerSearch)}&limit=25&rating=g`),
        fetch(`https://tenor.googleapis.com/v2/search?key=${TENOR_API_KEY}&q=${encodeURIComponent(pickerSearch)}&limit=25&media_filter=sticker`)
      ]);
      
      const giphyData = await giphyRes.json();
      const tenorData = await tenorRes.json();
      
      const giphyStickers = (giphyData.data || []).map(g => ({
        id: `giphy-${g.id}`,
        images: { fixed_height: { url: g.images.fixed_height.url } },
        title: g.title
      }));
      
      const tenorStickers = (tenorData.results || []).map(t => ({
        id: `tenor-${t.id}`,
        images: { fixed_height: { url: t.media_formats.gif.url } },
        title: t.content_description
      }));
      
      setStickers([...giphyStickers, ...tenorStickers]);
    } catch (error) {
      
    } finally {
      setLoadingMedia(false);
    }
  };

  // --- Handlers ---
  const handleMediaChange = (e, type) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    if (type === 'image' && files.length + mediaFiles.length > 5) return toast.error('Max 5 images');
    if ((type === 'video' || type === 'audio') && mediaFiles.length > 0) return toast.error(`Only one ${type} allowed`);

    const newPreviews = files.map(file => ({
      url: URL.createObjectURL(file),
      type: file.type,
      name: file.name
    }));

    setMediaFiles(prev => [...prev, ...files]);
    setMediaPreviews(prev => [...prev, ...newPreviews]);
    setFormData(prev => ({ ...prev, type: type === 'document' ? 'link' : type }));
  };

  const addExternalMedia = (url, type) => {
    // For GIFs/Stickers, we treat them as external image links
    const newMedia = {
      url: url,
      type: 'image/gif',
      name: 'Animated GIF'
    };
    
    // In a real app, you might want to fetch the blob or handle as URL
    setMediaPreviews(prev => [...prev, newMedia]);
    setMediaFiles(prev => [...prev, newMedia]); // Mocking file object
    setActivePicker(null);
  };

  const insertEmoji = (emoji) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formData.body;
    const newText = text.substring(0, start) + emoji + text.substring(end);
    
    setFormData(prev => ({ ...prev, body: newText }));
    
    // Restore focus and cursor position
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + emoji.length;
      textarea.focus();
    }, 0);
  };

  const removeMedia = (index) => {
    const newFiles = mediaFiles.filter((_, i) => i !== index);
    const newPreviews = mediaPreviews.filter((_, i) => i !== index);
    
    if (mediaPreviews[index].url.startsWith('blob:')) {
      URL.revokeObjectURL(mediaPreviews[index].url);
    }
    
    setMediaFiles(newFiles);
    setMediaPreviews(newPreviews);
    if (newFiles.length === 0) setFormData(prev => ({ ...prev, type: 'text' }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.body && mediaFiles.length === 0) return toast.error('Post cannot be empty');

    setLoading(true);
    try {
      const uploadedMedia = [];
      
      for (const file of mediaFiles) {
        if (file.url) {
          uploadedMedia.push({ type: 'image', url: file.url, thumbnail: file.url });
        } else {
          const mediaData = await postService.uploadMedia(file);
          uploadedMedia.push(mediaData);
        }
      }

      const postData = {
        body: formData.body,
        media: uploadedMedia,
        userId: user.userId,
        audience: formData.audience,
        tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : []
      };

      if (formData.group) {
        postData.group = formData.group;
      }

      const response = await postService.createPost(formData.group || 'global', postData);
      
      // Auto-tag post if no manual tags were provided
      if ((!postData.tags || postData.tags.length === 0) && response.postId) {
        try {
          // Use AI to auto-generate tags in the background
          postService.autoTagPost(response.postId).catch(err => {
            console.log('Auto-tagging completed in background');
          });
        } catch (tagError) {
          // Non-critical, don't block the user
          console.log('Auto-tagging deferred');
        }
      }
      
      toast.success('Post created successfully!');
      navigate('/');
    } catch (error) {
      
      toast.error('Failed to create post');
    } finally {
      setLoading(false);
    }
  };

  // --- Render Helpers for Picker ---
  const renderPickerContent = () => {
    if (activePicker === 'emoji') {
      if (EMOJI_API_KEY && apiEmojis.length > 0) {
        const groupedEmojis = apiEmojis.reduce((acc, emoji) => {
          const group = emoji.group || 'other';
          if (!acc[group]) acc[group] = [];
          acc[group].push(emoji);
          return acc;
        }, {});

        return (
          <>
            <div className="picker-search-bar">
              <Search size={12} />
              <input 
                type="text" 
                placeholder="Search emoji..."
                value={emojiSearch}
                onChange={(e) => setEmojiSearch(e.target.value)}
              />
            </div>
            {loadingMedia ? (
              <div className="picker-loading">Loading...</div>
            ) : (
              <div className="picker-grid emoji-grid">
                {Object.entries(groupedEmojis).map(([category, emojis]) => (
                  <div key={category} className="emoji-category">
                    <h4 className="category-title">{category.replace(/-/g, ' ')}</h4>
                    <div className="emoji-row">
                      {emojis.map(emoji => (
                        <button 
                          key={emoji.slug} 
                          type="button" 
                          className="emoji-btn" 
                          onClick={() => insertEmoji(emoji.character)}
                          title={emoji.unicodeName}
                        >
                          {emoji.character}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        );
      }

      const filteredCategories = Object.entries(EMOJI_CATEGORIES).reduce((acc, [category, emojis]) => {
        const filtered = emojis.filter(emoji => 
          !emojiSearch || emoji.toLowerCase().includes(emojiSearch.toLowerCase())
        );
        if (filtered.length > 0) acc[category] = filtered;
        return acc;
      }, {});

      return (
        <>
          <div className="picker-search-bar">
            <Search size={12} />
            <input 
              type="text" 
              placeholder="Search emoji..."
              value={emojiSearch}
              onChange={(e) => setEmojiSearch(e.target.value)}
            />
          </div>
          <div className="picker-grid emoji-grid">
            {Object.entries(filteredCategories).map(([category, emojis]) => (
              <div key={category} className="emoji-category">
                <h4 className="category-title">{category}</h4>
                <div className="emoji-row">
                  {emojis.map(emoji => (
                    <button key={emoji} type="button" className="emoji-btn" onClick={() => insertEmoji(emoji)}>
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      );
    }

    const items = activePicker === 'sticker' ? stickers : gifs;
    
    return (
      <div className="picker-grid media-search-grid">
        <div className="picker-search-bar">
          <Search size={14} />
          <input 
            type="text" 
            placeholder={`Search ${activePicker}s...`}
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            autoFocus
          />
        </div>
        {loadingMedia ? (
          <div className="picker-loading">Loading...</div>
        ) : (
          <div className="gif-results">
            {items.map((item) => (
              <button 
                key={item.id} 
                type="button" 
                className="gif-btn" 
                onClick={() => addExternalMedia(item.images.fixed_height.url, 'gif')}
              >
                <img src={item.images.fixed_height.url} alt={item.title} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="create-post-page">
      <div className="create-post-container">
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="create-post-glass-card"
        >
          <div className="form-header">
            <div>
              <h1>Create Post</h1>
              <div className="header-decoration" />
            </div>
            <Button type="button" variant="ghost" onClick={() => navigate(-1)}>Cancel</Button>
          </div>

          <form onSubmit={handleSubmit} className="create-post-form">
            
            {/* --- Top Controls --- */}
            <div className="top-controls-grid">
              <GlassSelect
                value={formData.group}
                onChange={(val) => setFormData({ ...formData, group: val, audience: val ? 'group' : 'global' })}
                options={[{ value: '', label: 'My Profile' }]}
                optgroups={[
                  {
                    label: 'Your Tribes',
                    options: groups.map(g => ({ value: g.name, label: g.displayName || g.name }))
                  }
                ]}
              />

              <div className="audience-toggle-group">
                <button
                  type="button"
                  className={`audience-chip ${formData.audience === 'global' ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, audience: 'global' })}
                >
                  <Globe size={16} /> <span>Public</span>
                </button>
                {formData.group ? (
                  <button
                    type="button"
                    className={`audience-chip ${formData.audience === 'group' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, audience: 'group' })}
                  >
                    <Users size={16} /> <span>Members</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`audience-chip ${formData.audience === 'followers' ? 'active' : ''}`}
                    onClick={() => setFormData({ ...formData, audience: 'followers' })}
                  >
                    <Users size={16} /> <span>Followers</span>
                  </button>
                )}
              </div>
            </div>

            {/* --- Main Editor --- */}
            <div className="editor-glass-area">
              <textarea
                ref={textareaRef}
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder="What's sparking your mind today?"
                className="main-textarea"
                rows={8}
              />
              
              {/* Media Previews */}
              <AnimatePresence>
                {mediaPreviews.length > 0 && (
                  <motion.div 
                    className="media-preview-strip"
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  >
                    {mediaPreviews.map((media, i) => (
                      <motion.div 
                        key={i} 
                        className="preview-thumbnail"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                      >
                        <button type="button" onClick={() => removeMedia(i)} className="remove-thumb-btn">
                          <X size={12} />
                        </button>
                        <img src={media.url} alt="" />
                      </motion.div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* --- Toolbar --- */}
              <div className="editor-toolbar">
                <div className="tools-left">
                  {/* File Uploads */}
                  <div className="media-tools-group">
                    <label className="tool-icon-btn" title="Add Image">
                      <input type="file" accept="image/*" multiple onChange={(e) => handleMediaChange(e, 'image')} hidden />
                      <ImageIcon size={20} />
                    </label>
                    <label className="tool-icon-btn" title="Add Video">
                      <input type="file" accept="video/*" onChange={(e) => handleMediaChange(e, 'video')} hidden disabled={mediaFiles.length > 0} />
                      <Video size={20} />
                    </label>
                    <label className="tool-icon-btn" title="Add File">
                      <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={(e) => handleMediaChange(e, 'document')} hidden />
                      <FileText size={20} />
                    </label>
                  </div>

                  <div className="divider-vertical" />

                  {/* Fun Tools (Pickers) */}
                  <div className="fun-tools-group">
                    <button 
                      type="button" 
                      className={`tool-icon-btn ${activePicker === 'emoji' ? 'active' : ''}`}
                      onClick={() => setActivePicker(activePicker === 'emoji' ? null : 'emoji')}
                      title="Emoji"
                    >
                      <Smile size={20} />
                    </button>
                    <button 
                      type="button" 
                      className={`tool-icon-btn ${activePicker === 'gif' ? 'active' : ''}`}
                      onClick={() => setActivePicker(activePicker === 'gif' ? null : 'gif')}
                      title="GIF"
                    >
                      <Gift size={20} />
                    </button>
                    <button 
                      type="button" 
                      className={`tool-icon-btn ${activePicker === 'sticker' ? 'active' : ''}`}
                      onClick={() => setActivePicker(activePicker === 'sticker' ? null : 'sticker')}
                      title="Sticker"
                    >
                      <Sparkles size={20} />
                    </button>
                  </div>
                </div>
                
                <div className="tools-right">
                  <div className="tag-input-wrapper">
                    <Hash size={14} className="tag-icon" />
                    <input 
                      value={formData.tags}
                      onChange={(e) => setFormData({...formData, tags: e.target.value})}
                      placeholder="tags..."
                      className="mini-tag-input"
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* --- Bottom Row: Picker + Post Button --- */}
            <div className="bottom-row">
              <AnimatePresence>
                {activePicker && (
                  <motion.div 
                    className="picker-popover"
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                  <div className="picker-header">
                    <div className="picker-tabs">
                      <button 
                        type="button"
                        className={activePicker === 'emoji' ? 'active' : ''} 
                        onClick={() => setActivePicker('emoji')}
                      >
                        <Smile size={14} /> Emoji
                      </button>
                      <button 
                        type="button"
                        className={activePicker === 'gif' ? 'active' : ''} 
                        onClick={() => setActivePicker('gif')}
                      >
                        <Gift size={14} /> GIF
                      </button>
                      <button 
                        type="button"
                        className={activePicker === 'sticker' ? 'active' : ''} 
                        onClick={() => setActivePicker('sticker')}
                      >
                        <Sparkles size={14} /> Sticker
                      </button>
                    </div>
                    <button type="button" className="close-picker" onClick={() => setActivePicker(null)}>
                      <X size={14} />
                    </button>
                  </div>
                  
                    <div className="picker-content-area">
                      {renderPickerContent()}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* --- Post Button --- */}
              <div className="form-footer">
                <Button type="submit" variant="primary" loading={loading} icon={<Send size={16} />}>
                  Post
                </Button>
              </div>
            </div>

          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default CreatePost;
