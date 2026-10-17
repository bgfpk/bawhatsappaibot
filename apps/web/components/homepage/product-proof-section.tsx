"use client";

import { useState, useRef, KeyboardEvent } from "react";
import {
  MessageSquare,
  Users,
  ShoppingBag,
  Clock,
  Layers,
  Wallet,
  Mic,
  FileText,
  PauseCircle,
  Sparkles,
  CheckCircle2,
  UserCheck,
} from "lucide-react";
import styles from "./homepage.module.css";

const PROOF_TABS = [
  { id: "conversations", label: "1. Conversations", icon: MessageSquare },
  { id: "customers", label: "2. Customer 360", icon: Users },
  { id: "orders", label: "3. Orders", icon: ShoppingBag },
  { id: "followups", label: "4. Follow-Ups", icon: Clock },
  { id: "automations", label: "5. Automations", icon: Layers },
  { id: "wallet", label: "6. Wallet & Usage", icon: Wallet },
] as const;

type ProofTabId = (typeof PROOF_TABS)[number]["id"];

export function ProductProofSection() {
  const [activeTab, setActiveTab] = useState<ProofTabId>("conversations");
  const tabRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    let nextIndex = currentIndex;

    if (e.key === "ArrowRight") {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % PROOF_TABS.length;
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + PROOF_TABS.length) % PROOF_TABS.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      nextIndex = PROOF_TABS.length - 1;
    }

    if (nextIndex !== currentIndex) {
      const nextTab = PROOF_TABS[nextIndex];
      setActiveTab(nextTab.id);
      tabRefs.current[nextTab.id]?.focus();
    }
  };

  return (
    <section id="product-proof" className={styles.section} style={{ paddingTop: "4rem", paddingBottom: "4.5rem" }}>
      <div className={styles.container}>
        <div className={styles.sectionHeader} style={{ textAlign: "center", maxWidth: "48rem", margin: "0 auto 3rem" }}>
          <span className={styles.eyebrow}>Platform Capabilities</span>
          <h2 className={styles.sectionTitle} style={{ fontSize: "clamp(1.875rem, 3.5vw, 2.75rem)", fontWeight: 800 }}>
            See BlackArrow in Action
          </h2>
          <p className={styles.sectionDesc} style={{ fontSize: "1.0625rem", color: "var(--ca-text-secondary)", lineHeight: 1.6 }}>
            Explore how BlackArrow connects your WhatsApp, follows your business instructions, handles customer requests, and keeps your team in control.
          </p>
        </div>

        {/* Accessible Tab Selection Bar */}
        <div
          role="tablist"
          aria-label="Product capabilities tabs"
          className={styles.tabScrollContainer}
          style={{
            display: "flex",
            gap: "0.5rem",
            overflowX: "auto",
            paddingBottom: "1rem",
            marginBottom: "1.5rem",
            justifyContent: "center",
          }}
        >
          {PROOF_TABS.map((tab, idx) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                id={`proof-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`proof-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.625rem 1.125rem",
                  borderRadius: "0.625rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  backgroundColor: isActive ? "var(--ca-brand-soft, rgba(50, 207, 145, 0.12))" : "var(--ca-surface-1)",
                  color: isActive ? "var(--ca-brand-strong)" : "var(--ca-text-secondary)",
                  border: isActive ? "1px solid rgba(50, 207, 145, 0.35)" : "1px solid var(--ca-border-subtle)",
                  cursor: "pointer",
                  transition: "all 140ms ease",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Proof Tab Display Shell */}
        <div className={styles.mockupShell} style={{ maxWidth: "62rem", margin: "0 auto" }}>
          {/* Header */}
          <div className={styles.mockupHeader} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div className={styles.dots}>
                <span className={styles.dot} style={{ backgroundColor: "#ef4444" }}></span>
                <span className={styles.dot} style={{ backgroundColor: "#f59e0b" }}></span>
                <span className={styles.dot} style={{ backgroundColor: "#10b981" }}></span>
              </div>
              <span style={{ fontSize: "0.8125rem", color: "var(--ca-text-muted)", fontWeight: 600 }}>
                BlackArrow Operations &bull; {PROOF_TABS.find((t) => t.id === activeTab)?.label}
              </span>
            </div>
            <span className={`${styles.badge} ${styles.badgeBrand}`}>Sample workspace</span>
          </div>

          {/* Accessible Tab Panel Container */}
          <div
            id={`proof-panel-${activeTab}`}
            role="tabpanel"
            aria-labelledby={`proof-tab-${activeTab}`}
            tabIndex={0}
            className={styles.mockupBody}
            style={{ minHeight: "22rem", outline: "none", backgroundColor: "var(--ca-canvas-0)", padding: "1.5rem" }}
          >
            {/* Tab 1: Conversations & AI Replies */}
            {activeTab === "conversations" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--ca-border-subtle)", paddingBottom: "0.75rem" }}>
                  <div>
                    <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--ca-text-primary)", margin: 0 }}>
                      Live Conversation Inbox &amp; AI Replies
                    </h3>
                    <p style={{ fontSize: "0.875rem", color: "var(--ca-text-muted)", margin: "0.25rem 0 0" }}>
                      Automated AI replies with 1-click human pause and takeover control per chat.
                    </p>
                  </div>
                  <span className={`${styles.badge} ${styles.badgeBrand}`}>AI Status: ACTIVE</span>
                </div>

                <div className={styles.grid2} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                  {/* Left: Chat Stream */}
                  <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ca-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Active Chat Stream
                    </div>
                    <div style={{ backgroundColor: "var(--ca-surface-2)", padding: "0.625rem", borderRadius: "0.5rem" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ca-text-secondary)" }}>Customer</div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--ca-text-primary)" }}>Do you have the Wireless ANC Headphones in Black? What is the delivery time to Karachi?</div>
                    </div>
                    <div style={{ backgroundColor: "rgba(50, 207, 145, 0.12)", border: "1px solid rgba(50, 207, 145, 0.25)", padding: "0.625rem", borderRadius: "0.5rem" }}>
                      <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ca-brand-strong)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        <span>BlackArrow Assistant</span>
                        <Sparkles size={12} />
                      </div>
                      <div style={{ fontSize: "0.8125rem", color: "var(--ca-text-primary)" }}>
                        Yes! The Wireless ANC Headphones in Black are in stock at Rs. 12,500. Delivery to Karachi takes 2–3 business days via PostEx COD. Would you like to place an order?
                      </div>
                    </div>
                  </div>

                  {/* Right: Human Takeover Controls */}
                  <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ca-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      Human Control &amp; Staff Takeover
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", backgroundColor: "var(--ca-canvas-1)", padding: "0.75rem", borderRadius: "0.5rem", border: "1px solid var(--ca-border-subtle)" }}>
                      <div>
                        <div style={{ fontSize: "0.8125rem", fontWeight: 700, color: "var(--ca-text-primary)" }}>Automated AI Replies</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--ca-text-muted)" }}>Staff can pause AI instantly per conversation</div>
                      </div>
                      <button type="button" className={styles.btnSecondary} style={{ fontSize: "0.78125rem", padding: "0.35rem 0.75rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <PauseCircle size={14} />
                        <span>Pause AI</span>
                      </button>
                    </div>
                    <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-secondary)", lineHeight: 1.5 }}>
                      When paused, the conversation routes directly to the team queue for staff response. AI can be resumed anytime with 1 click.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Customer 360 & CRM */}
            {activeTab === "customers" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ borderBottom: "1px solid var(--ca-border-subtle)", paddingBottom: "0.75rem" }}>
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--ca-text-primary)", margin: 0 }}>
                    Customer 360 &amp; CRM Pipeline
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--ca-text-muted)", margin: "0.25rem 0 0" }}>
                    Centralize customer profiles, chat histories, delivery addresses, and required information status.
                  </p>
                </div>

                <div className={styles.grid2} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                  <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                      <UserCheck size={18} style={{ color: "var(--ca-brand)" }} />
                      <span style={{ fontWeight: 700, color: "var(--ca-text-primary)", fontSize: "0.9375rem" }}>Customer Profile Record</span>
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", lineHeight: 1.6 }}>
                      <div><strong>Name:</strong> Hassan Raza</div>
                      <div><strong>Phone:</strong> WhatsApp Verified</div>
                      <div><strong>City:</strong> Islamabad (Sector F-7/2)</div>
                      <div><strong>Total Orders:</strong> 3 completed</div>
                      <div style={{ marginTop: "0.5rem" }}><span className={`${styles.badge} ${styles.badgeBrand}`}>VIP Customer</span></div>
                    </div>
                  </div>

                  <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--ca-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>
                      Required Information Status
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", fontSize: "0.8125rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Name Captured</span><span style={{ color: "var(--ca-brand-strong)", fontWeight: 600 }}>YES</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Phone Number</span><span style={{ color: "var(--ca-brand-strong)", fontWeight: 600 }}>VERIFIED</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Delivery Address</span><span style={{ color: "var(--ca-brand-strong)", fontWeight: 600 }}>COMPLETE</span></div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}><span>Preferred Courier</span><span>PostEx COD</span></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: Order Capture & Detail */}
            {activeTab === "orders" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ borderBottom: "1px solid var(--ca-border-subtle)", paddingBottom: "0.75rem" }}>
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--ca-text-primary)", margin: 0 }}>
                    Automated Order Capture &amp; Detail Summary
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--ca-text-muted)", margin: "0.25rem 0 0" }}>
                    Extract order items, quantities, and delivery addresses from WhatsApp chat into structured records.
                  </p>
                </div>

                <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1.25rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", borderBottom: "1px solid var(--ca-border-subtle)", paddingBottom: "0.5rem" }}>
                    <span style={{ fontWeight: 700, color: "var(--ca-text-primary)" }}>Order Record #ORD-9104</span>
                    <span className={`${styles.badge} ${styles.badgeBrand}`}>Pending Staff Verification</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", fontSize: "0.8125rem", color: "var(--ca-text-secondary)" }}>
                    <div>
                      <div style={{ color: "var(--ca-text-muted)", fontSize: "0.75rem" }}>Item &amp; Quantity</div>
                      <div style={{ fontWeight: 600, color: "var(--ca-text-primary)", marginTop: "0.2rem" }}>Smartwatch Series 7 (Black) &bull; Qty: 1</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--ca-text-muted)", fontSize: "0.75rem" }}>Total Amount</div>
                      <div style={{ fontWeight: 700, color: "var(--ca-brand-strong)", marginTop: "0.2rem" }}>Rs. 8,900 (Cash on Delivery)</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--ca-text-muted)", fontSize: "0.75rem" }}>Courier Status</div>
                      <div style={{ fontWeight: "600", color: "var(--ca-text-primary)", marginTop: "0.2rem" }}>Leopards Courier (Configured)</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 4: Scheduled Follow-Ups */}
            {activeTab === "followups" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ borderBottom: "1px solid var(--ca-border-subtle)", paddingBottom: "0.75rem" }}>
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--ca-text-primary)", margin: 0 }}>
                    Follow-Up Sequences &amp; Reminders
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--ca-text-muted)", margin: "0.25rem 0 0" }}>
                    Configure follow-up message sequences for open leads and order updates.
                  </p>
                </div>

                <div className={styles.grid2} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                  <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--ca-brand-strong)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                      <Clock size={16} />
                      <span>Pending Follow-Up Task</span>
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", lineHeight: 1.5 }}>
                      <strong>Reason:</strong> Abandoned Cart Recovery<br />
                      <strong>Scheduled Time:</strong> Today at 4:30 PM (24h after inquiry)<br />
                      <strong>Status:</strong> Queued for automated dispatch
                    </div>
                  </div>

                  <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--ca-brand-strong)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                      <CheckCircle2 size={16} />
                      <span>Completed Follow-Up</span>
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", lineHeight: 1.5 }}>
                      <strong>Reason:</strong> Order Delivery Confirmation<br />
                      <strong>Dispatched:</strong> Yesterday at 10:15 AM<br />
                      <strong>Outcome:</strong> Customer confirmed receipt
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 5: Automations & Sequences */}
            {activeTab === "automations" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ borderBottom: "1px solid var(--ca-border-subtle)", paddingBottom: "0.75rem" }}>
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--ca-text-primary)", margin: 0 }}>
                    Media Groups &amp; Sequence Automations
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--ca-text-muted)", margin: "0.25rem 0 0" }}>
                    Organize product photos, PDF catalogs, voice notes, and welcome sequences into automated triggers.
                  </p>
                </div>

                <div className={styles.grid2} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                  <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--ca-brand-strong)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.35rem" }}>
                      <Layers size={16} />
                      <span>Media Group: Catalog PDF</span>
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", lineHeight: 1.5 }}>
                      Contains: 2026 Product Brochure.pdf &bull; Triggers on keyword "catalog" or automated welcome sequence.
                    </div>
                  </div>

                  <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--ca-brand-strong)", fontWeight: 700, fontSize: "0.875rem", marginBottom: "0.35rem" }}>
                      <FileText size={16} />
                      <span>Sequence Group: Welcome Flow</span>
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--ca-text-secondary)", lineHeight: 1.5 }}>
                      3-Step Welcome Flow: Text introduction &rarr; PDF catalog &rarr; Follow-up discount coupon after 2 hours.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 6: Wallet & Usage */}
            {activeTab === "wallet" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ borderBottom: "1px solid var(--ca-border-subtle)", paddingBottom: "0.75rem" }}>
                  <h3 style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--ca-text-primary)", margin: 0 }}>
                    Transparent AI Wallet &amp; Usage Billed
                  </h3>
                  <p style={{ fontSize: "0.875rem", color: "var(--ca-text-muted)", margin: "0.25rem 0 0" }}>
                    Itemized pay-as-you-go usage rates billed transparently per AI action.
                  </p>
                </div>

                <div className={styles.grid2} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                  <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--ca-text-muted)", textTransform: "uppercase", fontWeight: 700 }}>AI Credit Wallet</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "var(--ca-brand-strong)", margin: "0.25rem 0" }}>Active Balance</div>
                    <div style={{ fontSize: "0.78125rem", color: "var(--ca-text-muted)" }}>Includes 7-day trial &amp; $1 initial test credit</div>
                  </div>

                  <div className={styles.card} style={{ backgroundColor: "var(--ca-surface-1)", padding: "1rem", fontSize: "0.8125rem", lineHeight: 1.6 }}>
                    <div style={{ fontWeight: 700, color: "var(--ca-text-primary)", marginBottom: "0.35rem" }}>Itemized Action Rates</div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>AI Text Reply:</span><strong>$0.003 / reply</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Voice Note Understanding:</span><strong>$0.010 / note</strong></div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}><span>Image Understanding:</span><strong>$0.007 / image</strong></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
