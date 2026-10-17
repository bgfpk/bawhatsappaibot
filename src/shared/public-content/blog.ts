export {
  BLOG_CATEGORIES,
  BLOG_POSTS,
  BLOG_POSTS_BY_SLUG,
  BLOG_TAGS,
  getBlogPath,
  getBlogPostBySlug,
  getBlogPostFromPath,
  getBlogSlugFromPath,
  getRelatedBlogPosts,
  isBlogPath,
  READING_TIME_WPM,
  calculateBlogPostReadingTime,
  calculateBlogPostWordCount,
  calculateTextWordCount,
} from "../../content/blog-posts";

export type { BlogContentBlock, BlogPost, BlogSection } from "../../content/blog-posts";
