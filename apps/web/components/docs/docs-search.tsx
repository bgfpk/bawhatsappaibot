"use client";

import React, { useState, useId } from "react";
import { Search, X, Filter } from "lucide-react";
import styles from "./docs.module.css";

export const DOCS_SEARCH_TOPICS = [
  { id: "all", label: "All Topics" },
  { id: "setup", label: "Instance Setup" },
  { id: "ai", label: "AI & Behavior" },
  { id: "operations", label: "Customer Operations" },
  { id: "media", label: "Media & Sequences" },
  { id: "integrations", label: "Integrations & Logistics" },
  { id: "billing", label: "Plans & Wallet" },
  { id: "troubleshooting", label: "Troubleshooting" },
] as const;

interface DocsSearchProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  activeCategory?: string;
  onCategoryChange?: (category: string) => void;
  totalResultsCount?: number;
}

export function DocsSearch({
  searchQuery: externalQuery,
  onSearchChange: externalOnSearchChange,
  activeCategory: externalCategory,
  onCategoryChange: externalOnCategoryChange,
  totalResultsCount = 1,
}: DocsSearchProps = {}) {
  const [internalQuery, setInternalQuery] = useState("");
  const [internalCategory, setInternalCategory] = useState("all");
  const searchInputId = useId();

  const query = externalQuery !== undefined ? externalQuery : internalQuery;
  const setQuery = externalOnSearchChange || setInternalQuery;
  const category = externalCategory !== undefined ? externalCategory : internalCategory;
  const setCategory = externalOnCategoryChange || setInternalCategory;

  const knownTerms = [
    "all", "setup", "instance", "ai", "behavior", "customer", "operations", "media", "sequences",
    "integrations", "logistics", "plans", "wallet", "billing", "troubleshooting", "whatsapp",
    "reply", "mode", "pricing", "guide", "qr", "order", "crm", "courier", "contact", "support",
    "start", "quick", "account", "device", "bot", "takeover", "human", "text", "voice", "woocomerce"
  ];
  const hasMatch = !query.trim() || knownTerms.some(t => t.includes(query.toLowerCase()) || query.toLowerCase().includes(t));
  const effectiveCount = externalQuery !== undefined ? totalResultsCount : (hasMatch ? 1 : 0);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setQuery("");
    }
  };

  return (
    <div className={styles.searchContainer}>
      <label htmlFor={searchInputId} className={styles.searchLabel}>
        Search documentation topics
      </label>
      <div className={styles.searchInputWrapper}>
        <Search size={18} className={styles.searchIcon} />
        <input
          id={searchInputId}
          type="text"
          className={styles.searchInput}
          placeholder="Search setup, reply modes, CRM, logistics, wallet, or troubleshooting..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          autoComplete="off"
        />
        {query && (
          <button
            type="button"
            className={styles.clearSearchBtn}
            onClick={() => setQuery("")}
            aria-label="Clear search input"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className={styles.topicFilterRow} role="tablist" aria-label="Documentation Categories">
        {DOCS_SEARCH_TOPICS.map((topic) => {
          const isActive = category === topic.id;
          return (
            <button
              key={topic.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              className={`${styles.filterTag} ${isActive ? styles.filterTagActive : ""}`}
              onClick={() => setCategory(topic.id)}
            >
              {topic.label}
            </button>
          );
        })}
      </div>

      {effectiveCount === 0 && (
        <div className={styles.noResults} role="status">
          No matching documentation topics found for &quot;{query}&quot;. Try searching for setup, reply mode, pricing, or troubleshooting.
        </div>
      )}
    </div>
  );
}
