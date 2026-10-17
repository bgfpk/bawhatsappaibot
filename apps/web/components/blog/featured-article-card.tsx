import React from "react";
import Link from "next/link";
import { ArrowRight, Clock, User, Calendar } from "lucide-react";
import { type BlogPost, getBlogPath } from "@/lib/public-content";
import { ButtonLink } from "@/components/button-link";
import styles from "./blog.module.css";

export function FeaturedArticleCard({ post }: { post: BlogPost }) {
  const articleUrl = getBlogPath(post.slug);

  return (
    <article className={styles.featuredCard}>
      <div className={styles.featuredMeta}>
        <span className={styles.categoryBadge}>Featured Guide</span>
        <span className={styles.categoryBadgeSecondary}>
          {post.category}
        </span>
        <span className={styles.metaText}>
          <Clock size={14} /> {post.readingTime}
        </span>
      </div>

      <h2 className={styles.featuredTitle}>
        <Link href={articleUrl}>{post.heroTitle || post.title}</Link>
      </h2>

      <p className={styles.featuredExcerpt}>{post.excerpt}</p>

      <div className={styles.authorDateRow}>
        <div style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
          <span className={styles.metaText}>
            <User size={14} /> {post.author}
          </span>
          <span className={styles.metaText}>
            <Calendar size={14} /> Published {post.publishedAt}
          </span>
        </div>
        <ButtonLink href={articleUrl}>
          Read Featured Guide <ArrowRight size={16} />
        </ButtonLink>
      </div>
    </article>
  );
}
