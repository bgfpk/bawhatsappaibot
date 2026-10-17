"use client";

import React, { useId } from "react";
import { Search, X } from "lucide-react";
import styles from "./blog.module.css";

interface BlogSearchProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
  availableCategories: string[];
  totalResultsCount: number;
}

export function BlogSearch({
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  availableCategories,
  totalResultsCount,
}: BlogSearchProps) {
  const searchInputId = useId();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      onSearchChange("");
    }
  };

  return (
    <div id="articles" className={styles.searchContainer}>
      <label htmlFor={searchInputId} className={styles.searchLabel}>
        Search articles &amp; topics
      </label>
      
      <div className={styles.searchInputWrapper}>
        <Search size={18} className={styles.searchIcon} />
        <input
          id={searchInputId}
          type="text"
          className={styles.searchInput}
          placeholder="Search articles by title, category, or topic..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {searchQuery && (
          <button
            type="button"
            className={styles.clearSearchBtn}
            onClick={() => onSearchChange("")}
            aria-label="Clear search input"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className={styles.topicFilterRow} role="tablist" aria-label="Blog Categories">
        <button
          type="button"
          role="tab"
          aria-selected={activeCategory === "all"}
          className={`${styles.filterTag} ${activeCategory === "all" ? styles.filterTagActive : ""}`}
          onClick={() => onCategoryChange("all")}
        >
          All Topics
        </button>
        {availableCategories.map((cat) => {
          const isActive = activeCategory === cat;
          return (
            <button
              key={cat}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.filterTag} ${isActive ? styles.filterTagActive : ""}`}
              onClick={() => onCategoryChange(cat)}
            >
              {cat}
            </button>
          );
        })}
      </div>

      {totalResultsCount === 0 && (
        <div className={styles.noResults} role="status">
          No matching articles found for &quot;{searchQuery}&quot;. Try searching for WhatsApp setup, AI strategy, ecommerce, voice notes, or support.
        </div>
      )}
    </div>
  );
}
