import Link from "next/link";

import { ButtonLink } from "./button-link";
import { Faq } from "./faq";
import { FeatureCard } from "./feature-card";
import { Section, SectionCard } from "./section";
import {
  StructuredData,
  buildBreadcrumbSchema,
  buildWebPageSchema,
} from "./structured-data";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";

import { type SeoLandingPage, getBlogPath } from "@/lib/public-content";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

export function SeoLandingArticle({ page }: { page: SeoLandingPage }) {
  return (
    <>
      <StructuredData
        data={buildWebPageSchema({
          path: `/${page.slug}`,
          name: page.title,
          description: page.heroSubtitle,
        })}
      />
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl },
          { name: page.title, url: `${PUBLIC_SITE_CONFIG.siteUrl}/${page.slug}` },
        ])}
      />

      <section className="page-hero">
        <div className="hero-copy-panel">
          <p className="hero-kicker">{page.heroLabel}</p>
          <h1>{page.heroTitle}</h1>
          <p>{page.heroSubtitle}</p>
          <div className="button-row">
            <ButtonLink href={CURRENT_CTA_LINKS.startTrial}>Start free trial</ButtonLink>
            <ButtonLink href="/pricing" variant="secondary">
              View pricing
            </ButtonLink>
          </div>
        </div>
      </section>

      <Section eyebrow={page.primaryKeyword} title={page.title}>
        <div className="article-body">
          <section>
            {page.intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </section>
        </div>
      </Section>

      <Section eyebrow="Benefits" title="Why teams search for this workflow">
        <div className="split-grid">
          <SectionCard>
            <h3>Problems this page addresses</h3>
            <ul className="check-list">
              {page.problemPoints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </SectionCard>
          <SectionCard>
            <h3>How BlackArrow helps</h3>
            <ul className="check-list">
              {page.solutionPoints.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </SectionCard>
        </div>
      </Section>

      <Section eyebrow="Feature cards" title="The product capabilities that support this use case">
        <div className="feature-grid">
          {page.featureSections.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              title={feature.title}
              body={feature.description}
              tone={index === 0 ? "accent" : "default"}
            />
          ))}
        </div>
      </Section>

      <Section eyebrow="Use case fit" title="How this workflow fits real businesses">
        <SectionCard>
          <p>{page.workflowIntro}</p>
          <p>{page.useCaseSummary}</p>
          <p className="legal-note">{page.complianceNote}</p>
        </SectionCard>
      </Section>

      <Section eyebrow="FAQ" title="Questions buyers usually ask on this path">
        <Faq items={page.faqs} />
      </Section>

      <Section eyebrow="Keep exploring" title="Related pricing, docs, and articles">
        <div className="article-card-grid">
          {page.internalLinks.map((link) => (
            <article key={link.href} className="article-card">
              <h3>{link.label}</h3>
              <Link href={link.href}>Open page</Link>
            </article>
          ))}
          {page.relatedSolutionLinks.map((link) => (
            <article key={link.href} className="article-card">
              <h3>{link.label}</h3>
              <Link href={link.href}>Open page</Link>
            </article>
          ))}
          {page.relatedBlogPosts.map((slug) => (
            <article key={slug} className="article-card">
              <h3>Blog article</h3>
              <Link href={getBlogPath(slug)}>Read supporting article</Link>
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
