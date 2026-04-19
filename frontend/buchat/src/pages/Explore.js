import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { postService } from '../services/postService';
import { groupService } from '../services/groupService';
import './Explore.css';

const Explore = () => {
  const [trending, setTrending] = useState([]);
  const [groups, setGroups] = useState([]);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    document.title = 'Explore Trending Posts & Communities - BuChat';
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.content = 'Discover trending posts, communities, and conversations on BuChat. Explore popular content and join active communities.';
    loadContent();
  }, []);

  const loadContent = async () => {
    try {
      const [posts, grps] = await Promise.all([
        postService.getPosts(),
        groupService.getGroups()
      ]);
      setTrending(posts.slice(0, 12));
      setGroups(grps.slice(0, 12));
    } catch (err) {
      console.error('Failed to load explore content', err);
    }
  };

  return (
    <div className="explore-page">
      <div className="explore-header">
        <h1>Explore BuChat</h1>
        <p>Discover trending posts, communities, and conversations</p>
      </div>

      <div className="explore-tabs">
        <button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>All</button>
        <button className={category === 'posts' ? 'active' : ''} onClick={() => setCategory('posts')}>Posts</button>
        <button className={category === 'communities' ? 'active' : ''} onClick={() => setCategory('communities')}>Communities</button>
      </div>

      {(category === 'all' || category === 'communities') && (
        <section className="explore-section">
          <h2>Trending Communities</h2>
          <div className="communities-grid">
            {groups.map(grp => (
              <Link key={grp.groupName} to={`/groups/${grp.groupName}`} className="community-card">
                <img src={grp.icon || '/default-group.png'} alt={grp.groupName} />
                <h3>{grp.groupName}</h3>
                <p>{grp.memberCount || 0} members</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(category === 'all' || category === 'posts') && (
        <section className="explore-section">
          <h2>Trending Posts</h2>
          <div className="posts-grid">
            {trending.map(post => (
              <Link key={post.postId} to={`/post/${post.postId}`} className="post-card">
                {post.mediaUrl && <img src={post.mediaUrl} alt={post.title} />}
                <h3>{post.title}</h3>
                <p>{post.upvotes || 0} upvotes • {post.commentCount || 0} comments</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Explore;
