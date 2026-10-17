import { ButtonLink } from "./button-link";
import { SectionCard } from "./section";
import {
  StructuredData,
  buildBreadcrumbSchema,
  buildWebPageSchema,
} from "./structured-data";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";

import type { LegalDocument } from "@/lib/legal-content";
import { LEGAL_PAGE_NOTE } from "@/lib/marketing-content";
import { PUBLIC_SITE_CONFIG } from "@/lib/site-config";

export function LegalDocumentPage({
  document,
  pathname,
}: {
  document: LegalDocument;
  pathname: "/terms" | "/privacy" | "/disclaimer";
}) {
  return (
    <>
      <StructuredData
        data={buildWebPageSchema({
          path: pathname,
          name: document.title,
          description: document.description,
        })}
      />
      <StructuredData
        data={buildBreadcrumbSchema([
          { name: "Home", url: PUBLIC_SITE_CONFIG.siteUrl },
          { name: document.eyebrow, url: `${PUBLIC_SITE_CONFIG.siteUrl}${pathname}` },
        ])}
      />

      <section className="page-hero">
        <div className="hero-copy-panel">
          <p className="hero-kicker">{document.eyebrow}</p>
          <h1>{document.title}</h1>
          <p>{document.description}</p>
          <div className="button-row">
            <ButtonLink href={CURRENT_CTA_LINKS.dashboard} variant="secondary">
              Open dashboard
            </ButtonLink>
            <ButtonLink href="mailto:contact-086473cbd844@example.invalid">Contact support</ButtonLink>
          </div>
        </div>
      </section>

      <div className="article-layout">
        <div className="article-body">
          {document.sections.map((section) => (
            <section key={section.id} id={section.id} className="legal-section">
              <h2>{section.title}</h2>
              {section.paragraphs?.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
              {section.bullets?.length ? (
                <ul>
                  {section.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}

          <SectionCard>
            <p className="section-eyebrow">Important note</p>
            <p>{LEGAL_PAGE_NOTE}</p>
          </SectionCard>
        </div>

        <aside className="toc-card">
          <p className="section-eyebrow">Contents</p>
          <div className="toc-links">
            {document.sections.map((section) => (
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
