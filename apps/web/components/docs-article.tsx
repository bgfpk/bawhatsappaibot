import Link from "next/link";

import { ButtonLink } from "./button-link";
import { SectionCard } from "./section";
import {
  StructuredData,
  buildBreadcrumbSchema,
  buildTechArticleSchema,
} from "./structured-data";

import { CURRENT_CTA_LINKS } from "@/lib/cta-links";

import { DOCS_PAGES, type DocsPage, getDocsPagePath } from "@/lib/public-content";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

export function DocsArticle({ page }: { page: DocsPage }) {
  const currentIndex = DOCS_PAGES.findIndex((entry) => entry.slug === page.slug);
  const prevPage = currentIndex > 0 ? DOCS_PAGES[currentIndex - 1] : null;
  const nextPage = currentIndex >= 0 && currentIndex < DOCS_PAGES.length - 1 ? DOCS_PAGES[currentIndex + 1] : null;

  return (
    <>
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl },
          { name: "Docs", url: `${PUBLIC_SITE_CONFIG.siteUrl}/docs` },
          { name: page.title, url: `${PUBLIC_SITE_CONFIG.siteUrl}${getDocsPagePath(page.slug)}` },
        ])}
      />
      <StructuredData data={buildTechArticleSchema(page)} />

      <section className="page-hero">
        <div className="hero-copy-panel">
          <p className="hero-kicker">{page.shortLabel}</p>
          <h1>{page.title}</h1>
          <p>{page.summary}</p>
          <div className="button-row">
            <ButtonLink href="/docs" variant="secondary">
              Back to docs
            </ButtonLink>
            <ButtonLink href={CURRENT_CTA_LINKS.startTrial}>Start free trial</ButtonLink>
          </div>
        </div>
      </section>

      <div className="article-layout">
        <div className="article-body">
          <section>
            <p className="article-overline">Guide intro</p>
            {page.intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>

          {page.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.steps?.length ? (
                <>
                  <p className="article-overline">Steps</p>
                  <ul>
                    {section.steps.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {section.bestPractices?.length ? (
                <>
                  <p className="article-overline">Best practices</p>
                  <ul>
                    {section.bestPractices.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {section.warnings?.length ? (
                <>
                  <p className="article-overline">Warnings</p>
                  <ul>
                    {section.warnings.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ))}

          <section>
            <h2>Related docs</h2>
            <div className="article-card-grid">
              {page.relatedDocs.map((slug) => {
                const related = DOCS_PAGES.find((entry) => entry.slug === slug);
                if (!related) return null;

                return (
                  <article key={related.slug} className="article-card">
                    <p className="card-kicker">{related.shortLabel}</p>
                    <h3>{related.title}</h3>
                    <p>{related.summary}</p>
                    <Link href={getDocsPagePath(related.slug)}>Open guide</Link>
                  </article>
                );
              })}
            </div>
          </section>

          {page.relatedLinks && page.relatedLinks.length > 0 ? (
            <section style={{ marginTop: "2rem" }}>
              <h2>Related pages &amp; tools</h2>
              <div className="article-links" style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginTop: "1rem" }}>
                {page.relatedLinks.map((link) => (
                  <Link
                    key={`${link.href}-${link.label}`}
                    href={link.href}
                    style={{ color: "var(--ca-brand-strong)", textDecoration: "underline", marginRight: "1rem", fontWeight: 600 }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <nav aria-label="Guide pagination" className="docs-pagination" style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginTop: "2rem", paddingTop: "1.5rem", borderTop: "1px solid var(--ca-border-subtle)", marginBottom: "2rem" }}>
            {prevPage ? (
              <Link href={getDocsPagePath(prevPage.slug)} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-start", padding: "0.75rem 1rem", borderRadius: "8px", background: "var(--ca-surface-1)", border: "1px solid var(--ca-border-subtle)", textDecoration: "none", boxShadow: "var(--ca-shadow-soft)" }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ca-text-secondary)" }}>← Previous guide</span>
                <span style={{ fontWeight: 600, color: "var(--ca-brand-strong)", marginTop: "0.25rem", fontSize: "0.95rem" }}>{prevPage.title}</span>
              </Link>
            ) : <div />}
            {nextPage ? (
              <Link href={getDocsPagePath(nextPage.slug)} style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", padding: "0.75rem 1rem", borderRadius: "8px", background: "var(--ca-surface-1)", border: "1px solid var(--ca-border-subtle)", textDecoration: "none", textAlign: "right", marginLeft: "auto", boxShadow: "var(--ca-shadow-soft)" }}>
                <span style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--ca-text-secondary)" }}>Next guide →</span>
                <span style={{ fontWeight: 600, color: "var(--ca-brand-strong)", marginTop: "0.25rem", fontSize: "0.95rem" }}>{nextPage.title}</span>
              </Link>
            ) : null}
          </nav>

          <SectionCard>
            <p className="section-eyebrow">Next step</p>
            <h2>{page.ctaTitle}</h2>
            <p>{page.ctaBody}</p>
            <div className="button-row">
              <ButtonLink href={CURRENT_CTA_LINKS.startTrial}>Start free trial</ButtonLink>
              <ButtonLink href="mailto:contact-086473cbd844@example.invalid" variant="secondary">
                Contact support
              </ButtonLink>
            </div>
          </SectionCard>
        </div>

        <aside className="toc-card">
          <p className="section-eyebrow">On this page</p>
          <div className="toc-links">
            {page.sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </div>
        </aside>
      </div>
    </>
  );
}
