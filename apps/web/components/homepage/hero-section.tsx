"use client";

import Link from "next/link";
import {
  ArrowRight,
  Play,
  CheckCircle2,
  Shield,
  MessageSquare,
  Sparkles,
  QrCode,
  Brain,
  PauseCircle,
  Wallet,
  ShoppingBag,
  Layers,
  UserCheck,
} from "lucide-react";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import { trackCtaClick } from "@/lib/analytics";
import styles from "./homepage.module.css";

const CREDIBILITY_ITEMS = [
  {
    icon: QrCode,
    title: "Linked Devices QR",
    desc: "Connect your WhatsApp number via QR scanner without Meta API verification requirements.",
  },
  {
    icon: Brain,
    title: "Business-Trained AI",
    desc: "Replies strictly based on your catalog, policies, instructions, and FAQs.",
  },
  {
    icon: PauseCircle,
    title: "1-Click Human Control",
    desc: "Staff can pause automated replies per chat and step in anytime.",
  },
  {
    icon: Wallet,
    title: "Transparent Usage Wallet",
    desc: "Pay only for what you use with itemized cost awareness.",
  },
  {
    icon: ShoppingBag,
    title: "Customer & Order Capture",
    desc: "Capture leads, delivery addresses, and order details into workspace records.",
  },
  {
    icon: Layers,
    title: "Media & Sequences",
    desc: "Send saved photos, PDF catalogs, voice notes, and follow-up updates.",
  },
];

export function HeroSection() {
  return (
    <section id="hero" className={styles.section} style={{ paddingTop: "3.5rem", paddingBottom: "4rem" }}>
      <div className={styles.container}>
        {/* Asymmetrical 2-Column Hero Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "3rem",
            alignItems: "center",
            marginBottom: "4.5rem",
          }}
        >
          {/* Left Column: Copy & CTAs */}
          <div style={{ maxWidth: "36rem" }}>
            {/* Kicker / Eyebrow */}
            <div className={styles.badge} style={{ marginBottom: "1.25rem", padding: "0.35rem 0.875rem", display: "inline-flex" }}>
              <Sparkles size={14} style={{ color: "var(--ca-brand)" }} />
              <span>WhatsApp Operations Platform for Growing Businesses</span>
            </div>

            {/* Exact H1 */}
            <h1
              style={{
                fontSize: "clamp(2.25rem, 4.5vw, 3.5rem)",
                fontWeight: 800,
                lineHeight: 1.14,
                letterSpacing: "-0.03em",
                color: "var(--ca-text-primary)",
                marginBottom: "1.25rem",
              }}
            >
              Automate WhatsApp Sales, Support, Orders, and Follow-Ups with AI
            </h1>

            {/* Concise Supporting Copy */}
            <p
              style={{
                fontSize: "clamp(1rem, 1.8vw, 1.15rem)",
                color: "var(--ca-text-secondary)",
                lineHeight: 1.6,
                marginBottom: "1.75rem",
              }}
            >
              Connect a business WhatsApp number to an AI assistant that answers customers, understands text, images and voice notes, captures leads and orders, sends saved media and sequences, and hands conversations to the team when needed.
            </p>

            {/* CTA Group */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: "0.875rem",
                marginBottom: "1.25rem",
              }}
            >
              <Link
                href={CURRENT_CTA_LINKS.startTrial}
                className={styles.btnPrimary}
                onClick={() => trackCtaClick({ cta_name: "Start Free Trial", destination: CURRENT_CTA_LINKS.startTrial, cta_location: "hero_section" })}
                style={{ fontSize: "1rem", padding: "0.875rem 1.75rem" }}
              >
                <span>Start Free Trial</span>
                <ArrowRight size={16} />
              </Link>
              <a href="#how-it-works" className={styles.btnSecondary} style={{ fontSize: "1rem", padding: "0.875rem 1.75rem" }}>
                <Play size={15} />
                <span>See How It Works</span>
              </a>
            </div>

            {/* Truthful Trial & Safety Lines */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.84375rem", color: "var(--ca-text-muted)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <CheckCircle2 size={14} style={{ color: "var(--ca-brand)", flexShrink: 0 }} />
                <span>Includes a 7-day trial and $1 AI test credit.</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Shield size={14} style={{ color: "var(--ca-brand)", flexShrink: 0 }} />
                <span>Connects via Linked Devices QR. Your team can step in and take over anytime.</span>
              </div>
            </div>
          </div>

          {/* Right Column: Layered BlackArrow Product Composition */}
          <div className={styles.mockupShell} style={{ width: "100%", margin: "0 auto" }}>
            {/* Desktop Dashboard Top Bar */}
            <div className={styles.mockupHeader}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div className={styles.dots}>
                  <span className={styles.dot} style={{ backgroundColor: "#ef4444" }}></span>
                  <span className={styles.dot} style={{ backgroundColor: "#f59e0b" }}></span>
                  <span className={styles.dot} style={{ backgroundColor: "#10b981" }}></span>
                </div>
                <span style={{ fontSize: "0.8125rem", color: "var(--ca-text-muted)", fontWeight: 600 }}>BlackArrow Operations Dashboard</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span className={`${styles.badge} ${styles.badgeBrand}`}>
                  <span style={{ width: "6px", height: "6px", borderRadius: "50%", backgroundColor: "var(--ca-brand)", display: "inline-block" }}></span>
                  WhatsApp Connected
                </span>
              </div>
            </div>

            {/* Inner Dashboard Body Grid */}
            <div className={styles.mockupBody} style={{ backgroundColor: "var(--ca-canvas-0)", padding: "1.25rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
                {/* Left Panel: Instance Status & Control */}
                <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
                  {/* Instance Card */}
                  <div className={styles.card} style={{ padding: "0.875rem", backgroundColor: "var(--ca-surface-1)" }}>
                    <div style={{ fontSize: "0.71875rem", color: "var(--ca-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: "0.375rem" }}>
                      Connected WhatsApp Instance
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 700, color: "var(--ca-text-primary)", fontSize: "0.875rem" }}>Primary Store Instance</div>
                        <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-muted)" }}>Paired via Linked Devices QR</div>
                      </div>
                      <span className={`${styles.badge} ${styles.badgeBrand}`}>Online</span>
                    </div>
                  </div>

                  {/* AI Response State Card */}
                  <div className={styles.card} style={{ padding: "0.875rem", backgroundColor: "var(--ca-surface-1)" }}>
                    <div style={{ fontSize: "0.71875rem", color: "var(--ca-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700, marginBottom: "0.375rem" }}>
                      AI Response &amp; Handoff Control
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.375rem" }}>
                      <span style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)" }}>Automated AI Replies</span>
                      <span className={`${styles.badge} ${styles.badgeBrand}`}>ACTIVE</span>
                    </div>
                    <div style={{ fontSize: "0.75rem", color: "var(--ca-text-muted)", lineHeight: 1.4 }}>
                      Staff can pause automated replies per chat with 1 click to step in manually.
                    </div>
                  </div>

                  {/* Customer 360 Context Drawer */}
                  <div className={styles.card} style={{ padding: "0.875rem", backgroundColor: "var(--ca-surface-1)", border: "1px solid rgba(50, 207, 145, 0.2)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.375rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.75rem", fontWeight: 700, color: "var(--ca-text-primary)" }}>
                        <UserCheck size={14} style={{ color: "var(--ca-brand-strong)" }} />
                        <span>Customer 360 Detail</span>
                      </div>
                      <span style={{ fontSize: "0.6875rem", color: "var(--ca-brand-strong)", fontWeight: 600 }}>Record Logged</span>
                    </div>
                    <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-secondary)", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                      <div><strong>Customer:</strong> Sarah K. (+92 300 1234567)</div>
                      <div><strong>City:</strong> Lahore &bull; <strong>Order:</strong> #ORD-8492</div>
                      <div style={{ fontSize: "0.71875rem", color: "var(--ca-text-muted)", marginTop: "0.2rem" }}>Courier: PostEx (Pending dispatch confirmation)</div>
                    </div>
                  </div>
                </div>

                {/* Right Panel: WhatsApp Conversation Stream */}
                <div className={styles.card} style={{ padding: "0.875rem", backgroundColor: "var(--ca-surface-1)", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ca-border-subtle)", paddingBottom: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                      <MessageSquare size={15} style={{ color: "var(--ca-brand)" }} />
                      <span style={{ fontWeight: 700, fontSize: "0.8125rem", color: "var(--ca-text-primary)" }}>Live WhatsApp Chat Stream</span>
                    </div>
                    <span style={{ fontSize: "0.6875rem", color: "var(--ca-text-muted)" }}>Inbox #104</span>
                  </div>

                  {/* Customer Message */}
                  <div style={{ alignSelf: "flex-start", backgroundColor: "var(--ca-surface-2)", padding: "0.5rem 0.75rem", borderRadius: "0.625rem 0.625rem 0.625rem 0.125rem", maxWidth: "90%" }}>
                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--ca-text-secondary)", marginBottom: "0.1rem" }}>Customer (Sarah)</div>
                    <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-primary)" }}>Hi, I want to order 2 units of the Leather Tote Bag. What is the total price and delivery fee to Gulberg, Lahore?</div>
                  </div>

                  {/* AI Assistant Multimodal Reply */}
                  <div style={{ alignSelf: "flex-end", backgroundColor: "rgba(50, 207, 145, 0.12)", border: "1px solid rgba(50, 207, 145, 0.25)", padding: "0.5rem 0.75rem", borderRadius: "0.625rem 0.625rem 0.125rem 0.625rem", maxWidth: "90%" }}>
                    <div style={{ fontSize: "0.6875rem", fontWeight: 700, color: "var(--ca-brand-strong)", marginBottom: "0.1rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                      <span>BlackArrow Assistant</span>
                      <Sparkles size={11} />
                    </div>
                    <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-primary)", lineHeight: 1.4 }}>
                      Hello Sarah! The Leather Tote Bag is Rs. 4,500 each. For 2 units, the total is Rs. 9,000 with Rs. 200 standard delivery to Gulberg, Lahore. Total: Rs. 9,200. Shall I confirm your Cash on Delivery order?
                    </div>
                  </div>

                  {/* Customer Confirmation */}
                  <div style={{ alignSelf: "flex-start", backgroundColor: "var(--ca-surface-2)", padding: "0.5rem 0.75rem", borderRadius: "0.625rem 0.625rem 0.625rem 0.125rem", maxWidth: "90%" }}>
                    <div style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--ca-text-secondary)", marginBottom: "0.1rem" }}>Customer</div>
                    <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-primary)" }}>Yes please, confirm order! Here is my address: House 42, Block B, Gulberg III.</div>
                  </div>

                  {/* System Action Output */}
                  <div style={{ marginTop: "0.2rem", backgroundColor: "var(--ca-canvas-1)", padding: "0.5rem 0.625rem", borderRadius: "0.375rem", border: "1px solid var(--ca-border-subtle)", fontSize: "0.71875rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--ca-brand-strong)", fontWeight: 600, marginBottom: "0.1rem" }}>
                      <span>Order #ORD-8492 Logged</span>
                      <span>1-Click Takeover Ready</span>
                    </div>
                    <div style={{ color: "var(--ca-text-secondary)" }}>2x Leather Tote Bag &bull; Rs. 9,200 COD &bull; Address captured</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SECTION 3 — Credibility Strip Without Fake Social Proof */}
        <div id="credibility-strip" style={{ borderTop: "1px solid var(--ca-border-subtle)", paddingTop: "3rem" }}>
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ca-brand-strong)" }}>
              Engineered For Factual WhatsApp Operations
            </span>
            <h2 style={{ fontSize: "clamp(1.5rem, 3vw, 2.125rem)", fontWeight: 800, color: "var(--ca-text-primary)", marginTop: "0.5rem" }}>
              Built on Factual Product Principles
            </h2>
          </div>

          <div className={styles.centeredFlexGrid}>
            {CREDIBILITY_ITEMS.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={i}
                  className={`${styles.card} ${styles.centeredFlexItem4}`}
                  style={{
                    padding: "1.25rem",
                    backgroundColor: "var(--ca-surface-1)",
                    borderRadius: "0.75rem",
                    display: "flex",
                    gap: "1rem",
                    alignItems: "start",
                  }}
                >
                  <div
                    style={{
                      width: "2.5rem",
                      height: "2.5rem",
                      borderRadius: "0.5rem",
                      backgroundColor: "rgba(50, 207, 145, 0.12)",
                      border: "1px solid rgba(50, 207, 145, 0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--ca-brand)",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--ca-text-primary)", marginBottom: "0.25rem" }}>
                      {item.title}
                    </h3>
                    <p style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", lineHeight: 1.5, margin: 0 }}>
                      {item.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
