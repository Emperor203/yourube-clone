"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

const REGION = "US";
const PAGE_SIZE = 24;
const DEBOUNCE_MS = 350;
const SEARCH_HISTORY_KEY = "yt.search.history";
const COMMENTS_KEY = "yt.comments.byVideo";
const COMMENT_AUTHOR = "you";
const COMMENT_AVATAR_COLORS = ["#0ea5e9", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];

const CATEGORY_OPTIONS = [
  { id: "", label: "All" },
  { id: "10", label: "Music" },
  { id: "20", label: "Gaming" },
  { id: "1", label: "Film" },
  { id: "24", label: "Entertainment" },
  { id: "17", label: "Sports" },
  { id: "25", label: "News" },
  { id: "27", label: "Education" },
];

// Hide unwanted videos from recommendations/feed.
const BLOCKED_TERMS = ["jelly roll", "thorns", "bossman dlow", "motion party"];

function formatViews(value) {
  const num = Number(value || 0);
  if (!num) return "0 views";
  return `${new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(num)} views`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function safeParseHistory(raw) {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function safeParseComments(raw) {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function formatCompact(value) {
  return new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 1 }).format(value || 0);
}

function formatRelativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "только что";
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} мин назад`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} ч назад`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays} дн назад`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths} мес назад`;
  return `${Math.floor(diffMonths / 12)} г назад`;
}

function normalizeComment(comment, index) {
  return {
    id: comment?.id || `legacy-${index}`,
    text: comment?.text || "",
    createdAt: comment?.createdAt || new Date().toISOString(),
    author: comment?.author || COMMENT_AUTHOR,
    likes: Number(comment?.likes || 0),
    avatarColor: comment?.avatarColor || COMMENT_AVATAR_COLORS[index % COMMENT_AVATAR_COLORS.length],
    replyCount: Number(comment?.replyCount || 0),
  };
}

function isBlockedVideo(video) {
  const haystack = `${video?.title || ""} ${video?.channelTitle || ""}`.toLowerCase();
  return BLOCKED_TERMS.some((term) => haystack.includes(term));
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState("");
  const [recentSearches, setRecentSearches] = useState([]);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [commentsByVideo, setCommentsByVideo] = useState({});
  const [commentInput, setCommentInput] = useState("");

  useEffect(() => {
    const fromStorage = safeParseHistory(window.localStorage.getItem(SEARCH_HISTORY_KEY));
    setRecentSearches(fromStorage.slice(0, 10));
    setCommentsByVideo(safeParseComments(window.localStorage.getItem(COMMENTS_KEY)));
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSubmittedQuery(query.trim());
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [query]);

  const heading = useMemo(() => {
    if (submittedQuery) return `Search results: ${submittedQuery}`;
    if (activeCategoryId) {
      const label = CATEGORY_OPTIONS.find((item) => item.id === activeCategoryId)?.label;
      return `Recommendations: ${label || "Category"}`;
    }
    return "Recommendations";
  }, [submittedQuery, activeCategoryId]);

  const suggestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return recentSearches.slice(0, 6);
    return recentSearches.filter((item) => item.toLowerCase().includes(normalized)).slice(0, 6);
  }, [query, recentSearches]);

  useEffect(() => {
    async function load() {
      try {
        setIsLoading(true);
        setError("");

        const params = new URLSearchParams({
          q: submittedQuery,
          regionCode: REGION,
          maxResults: String(PAGE_SIZE),
        });

        if (activeCategoryId) params.set("categoryId", activeCategoryId);

        const response = await fetch(`/api/youtube/videos?${params.toString()}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to load videos");
        }

        const nextItems = (data.items || []).filter((item) => !isBlockedVideo(item));
        setVideos(nextItems);
        setSelectedVideo((prev) => {
          if (!nextItems.length) return null;
          if (!prev) return nextItems[0];
          return nextItems.find((item) => item.id === prev.id) || nextItems[0];
        });
      } catch (err) {
        setError(err.message || "Could not load videos");
      } finally {
        setIsLoading(false);
      }
    }

    load();
  }, [submittedQuery, activeCategoryId]);

  useEffect(() => {
    const value = submittedQuery.trim();
    if (!value) return;

    setRecentSearches((prev) => {
      const next = [value, ...prev.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 10);
      window.localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, [submittedQuery]);

  function onSubmit(event) {
    event.preventDefault();
    setSubmittedQuery(query.trim());
    setIsSearchFocused(false);
  }

  function onSuggestionClick(value) {
    setQuery(value);
    setSubmittedQuery(value);
    setIsSearchFocused(false);
  }

  function onAddComment(event) {
    event.preventDefault();
    const text = commentInput.trim();
    const videoId = selectedVideo?.id;
    if (!text || !videoId) return;

    const nextComment = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      text,
      createdAt: new Date().toISOString(),
      author: COMMENT_AUTHOR,
      likes: 0,
      avatarColor: COMMENT_AVATAR_COLORS[Math.floor(Math.random() * COMMENT_AVATAR_COLORS.length)],
      replyCount: 0,
    };

    setCommentsByVideo((prev) => {
      const current = Array.isArray(prev[videoId]) ? prev[videoId] : [];
      const next = { ...prev, [videoId]: [nextComment, ...current].slice(0, 100) };
      window.localStorage.setItem(COMMENTS_KEY, JSON.stringify(next));
      return next;
    });
    setCommentInput("");
  }

  const selectedVideoComments = selectedVideo
    ? (commentsByVideo[selectedVideo.id] || []).map((comment, index) => normalizeComment(comment, index))
    : [];

  return (
    <div className="yt-shell">
      <header className="yt-header">
        <div className="yt-brand">My YouTube</div>
        <div className="yt-search-wrap">
          <form className="yt-search" onSubmit={onSubmit}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => window.setTimeout(() => setIsSearchFocused(false), 100)}
              placeholder="Search videos"
              aria-label="Search videos"
            />
            <button type="submit">Search</button>
          </form>
          {isSearchFocused && suggestions.length > 0 && (
            <ul className="yt-suggestions">
              {suggestions.map((item) => (
                <li key={item}>
                  <button type="button" onClick={() => onSuggestionClick(item)}>
                    {item}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      <nav className="yt-categories" aria-label="Video categories">
        {CATEGORY_OPTIONS.map((category) => (
          <button
            key={category.id || "all"}
            type="button"
            className={activeCategoryId === category.id ? "active" : ""}
            onClick={() => setActiveCategoryId(category.id)}
          >
            {category.label}
          </button>
        ))}
      </nav>

      <main className="yt-main">
        <section className="yt-player-wrap">
          {selectedVideo ? (
            <>
              <div className="yt-player">
                <iframe
                  src={`https://www.youtube.com/embed/${selectedVideo.id}`}
                  title={selectedVideo.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
              <h1>{selectedVideo.title}</h1>
              <p className="yt-meta-line">
                {selectedVideo.channelTitle} | {formatViews(selectedVideo.viewCount)} | {formatDate(selectedVideo.publishedAt)}
              </p>
              <p className="yt-description">{selectedVideo.description || "No description"}</p>
              <section className="yt-comments" aria-label="Comments">
                <div className="yt-comments-top">
                  <h2>{selectedVideoComments.length} комментариев</h2>
                  <button type="button" className="yt-sort-btn">Упорядочить</button>
                </div>
                <form className="yt-comment-form" onSubmit={onAddComment}>
                  <div className="yt-comment-avatar yt-comment-avatar-user" aria-hidden="true">Ю</div>
                  <div className="yt-comment-input-wrap">
                    <input
                      type="text"
                      value={commentInput}
                      onChange={(e) => setCommentInput(e.target.value)}
                      placeholder="Введите комментарий"
                      aria-label="Введите комментарий"
                      maxLength={240}
                    />
                    <button type="submit">Комментировать</button>
                  </div>
                </form>
                {selectedVideoComments.length === 0 ? (
                  <p className="yt-comments-empty">Пока нет комментариев.</p>
                ) : (
                  <ul className="yt-comments-list">
                    {selectedVideoComments.map((comment) => (
                      <li key={comment.id} className="yt-comment-item">
                        <div className="yt-comment-avatar" style={{ background: comment.avatarColor }} aria-hidden="true">
                          {String(comment.author || "U").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="yt-comment-body">
                          <p className="yt-comment-meta">
                            <strong>@{comment.author}</strong>
                            <span>{formatRelativeDate(comment.createdAt)}</span>
                          </p>
                          <p className="yt-comment-text">{comment.text}</p>
                          <div className="yt-comment-actions">
                            <button type="button">👍</button>
                            <span>{formatCompact(comment.likes)}</span>
                            <button type="button">👎</button>
                            <button type="button" className="yt-comment-reply-btn">Ответить</button>
                          </div>
                          {comment.replyCount > 0 && (
                            <button type="button" className="yt-comment-replies">
                              • {comment.replyCount} ответа
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            <div className="yt-empty">Select a video from the list</div>
          )}
        </section>

        <aside className="yt-feed">
          <h2>{heading}</h2>
          {isLoading && <div className="yt-state">Loading...</div>}
          {!isLoading && error && <div className="yt-state yt-error">{error}</div>}
          {!isLoading && !error && videos.length === 0 && <div className="yt-state">No videos found</div>}
          {!isLoading && !error && videos.length > 0 && (
            <ul>
              {videos.map((video) => (
                <li key={video.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedVideo(video)}
                    className={selectedVideo?.id === video.id ? "active" : ""}
                  >
                    <Image src={video.thumbnail} alt={video.title} width={320} height={180} />
                    <div>
                      <h3>{video.title}</h3>
                      <p>{video.channelTitle}</p>
                      <p>
                        {formatViews(video.viewCount)} | {formatDate(video.publishedAt)}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </main>
    </div>
  );
}
