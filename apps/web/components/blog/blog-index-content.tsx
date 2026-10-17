"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowRight, Clock, ShieldCheck, Zap, Layers } from "lucide-react";
import { BlogHero } from "./blog-hero";
import { BlogSearch } from "./blog-search";
import { FeaturedArticleCard } from "./featured-article-card";
import { type BlogPost, BLOG_POSTS, BLOG_CATEGORIES, getBlogPath } from "@/lib/public-content";
import { ButtonLink } from "@/components/button-link";
import styles from "./blog.module.css";

export function BlogIndexContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const featuredPost = useMemo(() => {
    return BLOG_POSTS.find((p) => p.featured) || BLOG_POSTS[0];
  }, []);

  const filteredPosts = useMemo(() => {
    return BLOG_POSTS.filter((post) => {
      if (activeCategory !== "all" && post.category !== activeCategory) {
        return false;
      }
      if (normalizedQuery) {
        const inTitle = post.title.toLowerCase().includes(normalizedQuery);
        const inExcerpt = post.excerpt.toLowerCase().includes(normalizedQuery);
        const inCategory = post.category.toLowerCase().includes(normalizedQuery);
        const inTags = post.tags.some((t) => t.toLowerCase().includes(normalizedQuery));
        return inTitle || inExcerpt || inCategory || inTags;
      }
      return true;
    });
  }, [normalizedQuery, activeCategory]);

  const showFeaturedSection = !normalizedQuery && activeCategory === "all";

  const gridPosts = useMemo(() => {
    if (showFeaturedSection) {
      return filteredPosts.filter((p) => p.slug !== featuredPost.slug);
    }
    return filteredPosts;
  }, [showFeaturedSection, filteredPosts, featuredPost.slug]);

  return (
    <>
      <BlogHero />

      <section className={styles.searchSection}>
        <BlogSearch
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          availableCategories={BLOG_CATEGORIES}
          totalResultsCount={filteredPosts.length}
        />
      </section>

      {/* Featured Guide Section (Only when no query or active category filter) */}
      {showFeaturedSection && (
        <section className={`${styles.section} ${styles.sectionMuted}`}>
          <div className={styles.container}>
            <div className={styles.header} style={{ marginBottom: "1.75rem" }}>
              <div className={styles.eyebrow}>
                <Zap size={14} /> Featured Reading
              </div>
              <h2 className={styles.title}>Featured Operations Guide</h2>
            </div>
            <FeaturedArticleCard post={featuredPost} />
          </div>
        </section>
      )}

      {/* Main Articles Grid Section */}
      <section className={styles.section}>
        <div className={styles.container}>
          <div className={styles.header}>
            <div className={styles.eyebrow}>
              <Layers size={14} /> Practical Guides
            </div>
            <h2 className={styles.title}>
              {showFeaturedSection ? "All BlackArrow Articles" : "Filtered Search Results"}
            </h2>
            <p className={styles.subtitle}>
              Grounded articles covering WhatsApp automation setup, order capture, AI boundaries, voice notes, and support operations.
            </p>
          </div>

          {gridPosts.length > 0 && (
            <div className={styles.articleGrid}>
              {gridPosts.map((post) => (
                <article key={post.slug} className={styles.articleCard}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <span className={styles.categoryBadge}>{post.category}</span>
                      <span className={styles.metaText} style={{ fontSize: "0.8125rem" }}>
                        <Clock size={12} /> {post.readingTime}
                      </span>
                    </div>

                    <h3 className={styles.cardTitle}>
                      <Link href={getBlogPath(post.slug)}>{post.title}</Link>
                    </h3>

                    <p className={styles.cardExcerpt}>{post.excerpt}</p>
                  </div>

                  <div className={styles.cardFooter}>
                    <span>Published {post.publishedAt}</span>
                    <Link href={getBlogPath(post.slug)} className={styles.cardLink}>
                      Read Article <ArrowRight size={14} />
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Why Practical Blog Content Matters */}
      <section className={`${styles.section} ${styles.sectionAlt}`}>
        <div className={styles.container}>
          <div className={`${styles.header} ${styles.headerCenter}`}>
            <div className={styles.eyebrow}>
              <ShieldCheck size={14} /> Operations First
            </div>
            <h2 className={styles.title}>Why BlackArrow Articles Focus on Practical Truth</h2>
            <p className={styles.subtitle} style={{ margin: "0 auto" }}>
              Our content connects real customer workflows with factual platform capabilities.
            </p>
          </div>

          <div className={styles.articleGrid} style={{ gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))" }}>
            <div className={styles.articleCard} style={{ cursor: "default" }}>
              <h3 className={styles.cardTitle} style={{ fontSize: "1.2rem" }}>Narrow the First Workflow</h3>
              <p className={styles.cardExcerpt} style={{ marginBottom: 0 }}>
                Decide what to automate first instead of attempting to replace all human judgment on day one.
              </p>
            </div>

            <div className={styles.articleCard} style={{ cursor: "default" }}>
              <h3 className={styles.cardTitle} style={{ fontSize: "1.2rem" }}>Realistic Expectations</h3>
              <p className={styles.cardExcerpt} style={{ marginBottom: 0 }}>
                Understand where AI excels and where human handoff remains essential for support and order accuracy.
              </p>
            </div>

            <div className={styles.articleCard} style={{ cursor: "default" }}>
              <h3 className={styles.cardTitle} style={{ fontSize: "1.2rem" }}>Connected Documentation</h3>
              <p className={styles.cardExcerpt} style={{ marginBottom: 0 }}>
                Each article links directly into features, pricing, and setup docs so teams can plan a safe rollout.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Restrained Final CTA */}
      <section className={`${styles.section} ${styles.sectionMuted}`}>
        <div className={styles.container} style={{ textAlign: "center", maxWidth: "800px" }}>
          <h2 className={styles.title}>Build a Better WhatsApp Workflow with BlackArrow</h2>
          <p className={styles.subtitle} style={{ margin: "0 auto 2rem" }}>
            Start with the workflows you already understand, test real customer scenarios, and expand only after your results are clear.
          </p>
          <div className={styles.buttonRow}>
            <ButtonLink href="/features">Explore Features</ButtonLink>
            <ButtonLink href="/pricing" variant="secondary">View Pricing</ButtonLink>
            <ButtonLink href="/docs" variant="ghost">Read Documentation</ButtonLink>
            <ButtonLink href="/contact" variant="ghost">Contact Support</ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
