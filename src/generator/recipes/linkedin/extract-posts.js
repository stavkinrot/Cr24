// LinkedIn posts extractor - simplified for extension use
// Based on extractposts.js but optimized for on-demand extraction

export function extractPosts() {
  console.log('[LinkedIn Extractor] Starting extraction...');
  
  const getText = (el) => (el?.innerText || '').replace(/\s+/g, ' ').replace(/[\u200e\u200f]/g, '').trim();
  
  const num = (s) => {
    if (!s) return '';
    const m = String(s).replace(/[\u200e\u200f]/g, '').match(/([\d.,]+)/);
    return m ? m[1].replace(/,/g, '') : '';
  };
  
  // Find all post articles in the feed
  const findArticles = () => Array.from(document.querySelectorAll(
    'div[data-view-name="feed-full-update"] [role="article"][data-urn^="urn:li:activity:"]'
  ));
  
  const getUrn = (article) => article?.getAttribute('data-urn') || '';
  
  const toPermalink = (urn) => urn ? `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}` : '';
  
  const getType = (article) => {
    if (article.querySelector('.update-components-poll')) return 'poll';
    if (article.querySelector('video')) return 'video';
    if (article.querySelector('.update-components-document')) return 'document';
    if (article.querySelector('.update-components-image')) return 'image';
    return 'text';
  };
  
  const getPostText = (article) => {
    const el = article.querySelector('.update-components-text, .update-components-update-v2__commentary');
    return getText(el);
  };
  
  const getImageUrl = (article) => {
    const img = article.querySelector('.update-components-image img.update-components-image__image, .update-components-image img.evi-image');
    return img?.getAttribute('src') || '';
  };
  
  const getImpressions = (root) => {
    const strong = root.querySelector('.content-analytics-entry-point .ca-entry-point__num-views strong');
    if (strong) return num(strong.textContent);
    const t = root.querySelector('.content-analytics-entry-point')?.innerText || '';
    const m = t.match(/([\d.,]+)\s+impressions/i);
    return m ? m[1].replace(/,/g, '') : '';
  };
  
  const getLikes = (root) => {
    const span = root.querySelector('.social-details-social-counts__reactions-count');
    return num(span?.textContent || '');
  };
  
  const getComments = (root) => {
    const btn = root.querySelector('.social-details-social-counts__comments [aria-label], .social-details-social-counts__comments');
    return num(btn?.getAttribute?.('aria-label') || btn?.innerText || '');
  };
  
  const getReposts = (root) => {
    const btn = root.querySelector('[aria-label*="reposts"], .social-details-social-counts__item--truncate-text');
    const t = btn?.getAttribute?.('aria-label') || btn?.innerText || '';
    const m = t.match(/([\d.,]+)\s+reposts?/i);
    return m ? m[1].replace(/,/g, '') : '';
  };
  
  const getPollVotes = (root) => {
    const b = root.querySelector('.update-components-poll-summary__option-button');
    return num(b?.innerText || '');
  };
  
  const getDateTime = (article) => {
    const t = article.querySelector('time[datetime]');
    if (t?.getAttribute('datetime')) return t.getAttribute('datetime');
    const rel = article.closest('.artdeco-card')?.querySelector('.update-components-actor__sub-description');
    return getText(rel);
  };
  
  const collectFromArticle = (article) => {
    const card = article.closest('.artdeco-card') || article.parentElement || article;
    
    // Click "see more" if present
    const seeMoreBtn = article.querySelector('.feed-shared-inline-show-more-text__see-more-less-toggle.see-more');
    if (seeMoreBtn && seeMoreBtn.offsetParent !== null) {
      seeMoreBtn.click();
    }
    
    const urn = getUrn(article);
    const postUrl = toPermalink(urn);
    const type = getType(article);
    const impressions = getImpressions(card);
    const likes = getLikes(card);
    const comments = getComments(card);
    const reposts = getReposts(card);
    const pollVotes = type === 'poll' ? getPollVotes(card) : '';
    const imageUrl = getImageUrl(article);
    const dateTime = getDateTime(article);
    const postText = getPostText(article);
    
    return {
      postUrl,
      impressions,
      likes,
      comments,
      reposts,
      type,
      pollVotes,
      imageUrl,
      dateTime,
      postText
    };
  };
  
  // Collect from all visible articles
  const articles = findArticles();
  console.log(`[LinkedIn Extractor] Found ${articles.length} articles`);
  
  const posts = articles
    .map(article => {
      try {
        return collectFromArticle(article);
      } catch (err) {
        console.error('[LinkedIn Extractor] Error collecting post:', err);
        return null;
      }
    })
    .filter(post => post && (post.postUrl || post.postText || post.imageUrl));
  
  console.log(`[LinkedIn Extractor] Extracted ${posts.length} posts`);
  
  return {
    posts,
    count: posts.length,
    timestamp: new Date().toISOString()
  };
}

