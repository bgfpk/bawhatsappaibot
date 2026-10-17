import React from "react";
import Link from "next/link";
import { ArrowRight, Clock, User, Calendar, Tag, ChevronRight, BookOpen, Layers, ShieldCheck } from "lucide-react";
import { ButtonLink } from "./button-link";
import { StructuredData, buildBreadcrumbSchema, buildBlogPostingSchema } from "./structured-data";
import { type BlogPost, getBlogPath, getRelatedBlogPosts } from "@/lib/public-content";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";
import styles from "./blog/blog.module.css";

function renderContentWithLinks(text: string) {
  const parts = [];
  const regex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    const label = match[1];
    const href = match[2];
    parts.push(
      <Link key={`${href}-${match.index}`} href={href} style={{ color: "var(--ca-brand-strong)", textDecoration: "underline" }}>
        {label}
      </Link>
    );
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export function BlogArticle({ post }: { post: BlogPost }) {
  const relatedPosts = getRelatedBlogPosts(post, 3);
  const articlePath = getBlogPath(post.slug);

  return (
    <>
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl },
          { name: "Blog", url: `${PUBLIC_SITE_CONFIG.siteUrl}/blog` },
          { name: post.title, url: `${PUBLIC_SITE_CONFIG.siteUrl}${articlePath}` },
        ])}
      />
      <StructuredData data={buildBlogPostingSchema(post)} />

      {/* Article Hero & Header */}
      <section className={styles.articleHero}>
        <div className={styles.articleHeroContainer}>
          <nav aria-label="Breadcrumb" className={styles.articleBreadcrumbs}>
            <Link href="/">Home</Link>
            <ChevronRight size={14} />
            <Link href="/blog">Blog</Link>
            <ChevronRight size={14} />
            <span className={styles.articleBreadcrumbsCurrent}>{post.category}</span>
          </nav>

          <div style={{ marginBottom: "1rem" }}>
            <span className={styles.categoryBadge}>{post.category}</span>
          </div>

          <h1 className={styles.articleHeaderTitle}>{post.heroTitle || post.title}</h1>

          <p className={styles.articleLead}>{post.excerpt}</p>

          <div className={styles.articleMetaBar}>
            <span className={styles.metaItem}>
              <User size={15} className={styles.metaIcon} /> {post.author}
            </span>
            <span className={styles.metaItem}>
              <Calendar size={15} className={styles.metaIcon} /> Published {post.publishedAt}
            </span>
            <span className={styles.metaItem}>
              <Clock size={15} className={styles.metaIcon} /> {post.readingTime}
            </span>
            {post.tags && post.tags.length > 0 && (
              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem", marginLeft: "auto" }}>
                <Tag size={14} className={styles.metaIcon} />
                {post.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className={styles.tagPill}>{tag}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Two-Column Article Layout */}
      <div className={styles.articleMainLayout}>
        <article className={styles.articleBodyContent}>
          {post.sections.map((section) => (
            <section key={section.id} id={section.id} className={styles.articleSection}>
              <h2 className={styles.articleSectionTitle}>{section.title}</h2>
              {section.blocks.map((block, index) => {
                if (block.type === "paragraph") {
                  return (
                    <p key={`${section.id}-${index}`} className={styles.paragraph}>
                      {renderContentWithLinks(block.content)}
                    </p>
                  );
                }
                return (
                  <ul key={`${section.id}-${index}`} className={styles.bulletList}>
                    {block.items.map((item) => (
                      <li key={item} className={styles.bulletItem}>
                        {renderContentWithLinks(item)}
                      </li>
                    ))}
                  </ul>
                );
              })}
            </section>
          ))}

          {/* Related Articles Section */}
          <section className={styles.relatedSection}>
            <div className={styles.relatedHeader}>
              <Layers size={18} className={styles.metaIcon} />
              <h3 className={styles.relatedTitle}>Related Articles</h3>
            </div>
            <div className={styles.articleGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              {relatedPosts.map((related) => (
                <div key={related.slug} className={styles.articleCard}>
                  <div>
                    <span className={styles.categoryBadge} style={{ marginBottom: "0.5rem", display: "inline-block" }}>{related.category}</span>
                    <h4 className={styles.cardTitle} style={{ fontSize: "1.1rem" }}>
                      <Link href={getBlogPath(related.slug)}>{related.title}</Link>
                    </h4>
                    <p className={styles.cardExcerpt} style={{ fontSize: "0.875rem" }}>{related.excerpt}</p>
                  </div>
                  <Link href={getBlogPath(related.slug)} className={styles.cardLink}>
                    Read Guide <ArrowRight size={14} />
                  </Link>
                </div>
              ))}
            </div>
          </section>

          {/* Contextual Action Card */}
          <div className={styles.contextCard}>
            <div className={styles.eyebrow} style={{ marginBottom: "0.75rem" }}>
              <ShieldCheck size={14} /> Next Operational Steps
            </div>
            <h3 className={styles.contextCardTitle}>
              Build a Better WhatsApp Workflow with BlackArrow
            </h3>
            <p className={styles.contextCardText}>
              Pair this article with our documented features, pricing details, and setup guides to plan a reliable rollout for your business.
            </p>
            <div className={styles.buttonRow} style={{ justifyContent: "flex-start" }}>
              <ButtonLink href="/features">Explore Features</ButtonLink>
              <ButtonLink href="/pricing" variant="secondary">View Pricing</ButtonLink>
              <ButtonLink href="/docs" variant="ghost">Read Documentation</ButtonLink>
              <ButtonLink href="/contact" variant="ghost">Contact Support</ButtonLink>
            </div>
          </div>
        </article>

        {/* Sticky Table of Contents Sidebar */}
        {post.sections.length > 1 && (
          <aside className={styles.tocSidebar} aria-label="Table of contents">
            <div className={styles.tocHeader}>
              <BookOpen size={14} /> In This Article
            </div>
            <ul className={styles.tocList}>
              {post.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className={styles.tocLink}>
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    </>
  );
}
