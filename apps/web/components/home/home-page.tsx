"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

import { AuthAwareCta } from "@/components/auth-aware-cta";
import { ButtonLink } from "@/components/button-link";
import { ThemeToggle } from "@/components/theme-toggle";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";

const faqs = [
  {
    id: "faq-1",
    q: "Does BlackArrow work with my existing WhatsApp number?",
    a: "Yes. You can connect an eligible WhatsApp number through WhatsApp Linked Devices by scanning the QR code shown in the BlackArrow dashboard."
  },
  {
    id: "faq-2",
    q: "Can my staff take over a conversation?",
    a: "Yes. Your team can pause AI replies and handle the customer conversation manually when needed."
  },
  {
    id: "faq-3",
    q: "Can I turn AI replies off instantly?",
    a: "Yes. AI replies can be paused or resumed from the available account and conversation controls."
  },
  {
    id: "faq-4",
    q: "What information can the bot learn?",
    a: "You can configure business instructions, products, services, FAQs, website knowledge, media and preferred reply behavior."
  },
  {
    id: "faq-5",
    q: "Can it understand voice notes and images?",
    a: "Yes. BlackArrow can understand supported voice notes and customer images and use that information when preparing replies."
  },
  {
    id: "faq-6",
    q: "How do saved sequences and follow-ups work?",
    a: "You can save reusable message sequences and configure follow-ups for supported customer journeys. Follow-ups can stop when the customer replies or a human takes over."
  },
  {
    id: "faq-7",
    q: "How do the subscription and wallet work?",
    a: "Your subscription covers access to the selected plan. Usage-based AI and messaging charges are deducted separately from your wallet according to the current rates."
  },
  {
    id: "faq-8",
    q: "Can I change my plan?",
    a: "Available plan changes depend on your current account and billing options. Contact support when assistance is required."
  },
  {
    id: "faq-9",
    q: "Is setup help available?",
    a: "Setup guidance and documentation are available. Additional implementation assistance may depend on the account and project requirements."
  },
  {
    id: "faq-10",
    q: "What happens when wallet credit is used?",
    a: "Usage-based AI and messaging activity consumes wallet credit. Add sufficient credit to continue using paid usage features."
  }
];

export function HomePageDesign() {
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  const toggleFaq = (id: string) => {
    setOpenFaq(openFaq === id ? null : id);
  };

  useEffect(() => {
    document.body.classList.add("stitch-home-active");

    const handleScroll = () => {
      const header = document.querySelector(".stitch-home-9204 header");
      if (header) {
        if (window.scrollY > 80) {
          header.classList.add("h-14", "bg-surface/98", "shadow-2xl");
          header.classList.remove("h-16");
        } else {
          header.classList.add("h-16");
          header.classList.remove("h-14", "bg-surface/98", "shadow-2xl");
        }
      }
    };

    window.addEventListener("scroll", handleScroll);

    return () => {
      document.body.classList.remove("stitch-home-active");
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <div className="stitch-home-9204">
      {/* 1. STICKY HEADER */}
      <header data-review-section="header" className="fixed top-0 w-full z-50 bg-surface/95 backdrop-blur-md border-b border-border-subtle h-16 transition-all duration-300">
        <nav className="max-w-[1440px] mx-auto px-panel-padding flex justify-between items-center h-full">
          <Link href="/" className="flex items-center select-none outline-none">
            <img
              src="/brand/black-arrow-logo-dark.png"
              alt="BlackArrow Logo"
              width="190"
              height="45"
              decoding="async"
              style={{
                width: "190px",
                height: "auto",
                maxHeight: "45px",
                objectFit: "contain",
                display: "block"
              }}
            />
          </Link>
          <div className="hidden md:flex items-center gap-10">
            <Link className="text-text-muted hover:text-primary transition-matte font-body-sm font-medium" href="/features">Product</Link>
            <Link className="text-text-muted hover:text-primary transition-matte font-body-sm font-medium" href="/#how-it-works">How It Works</Link>
            <Link className="text-text-muted hover:text-primary transition-matte font-body-sm font-medium" href="/integrations">Integrations</Link>
            <Link className="text-text-muted hover:text-primary transition-matte font-body-sm font-medium" href="/pricing">Pricing</Link>
            <Link className="text-text-muted hover:text-primary transition-matte font-body-sm font-medium" href="/docs">Resources</Link>
          </div>
          <div className="flex items-center gap-6">
            <ThemeToggle />
            <ButtonLink href={CURRENT_CTA_LINKS.signIn} className="text-text-main font-body-sm font-medium px-4 py-2 hover:bg-white/5 transition-matte rounded" variant="ghost">Login</ButtonLink>
            <AuthAwareCta className="bg-primary text-on-primary font-body-sm font-bold px-8 py-2.5 rounded hover-lift active:scale-95 transition-matte shadow-lg shadow-primary/10">Start Free Trial</AuthAwareCta>
          </div>
        </nav>
      </header>

      <main className="pt-16">
        {/* 2. HERO SECTION */}
        <section data-review-section="hero" className="max-w-[1440px] mx-auto px-panel-padding py-section-margin grid lg:grid-cols-2 gap-20 items-center overflow-hidden">
          <div className="ownership-line pl-10">
            <span className="label-caps text-primary mb-6 block font-bold">NEXT-GEN AUTOMATION</span>
            <h1 className="font-display-xl text-text-main mb-8">
              Turn WhatsApp Into Your <span className="text-primary">Sales &amp; Support System</span>
            </h1>
            <p className="text-text-muted text-body-lg mb-12 max-w-xl">
              Deploy intelligent AI that understands context, handles complex inquiries, and hands off to humans only when necessary.
            </p>
            <div className="flex flex-col gap-3 mb-12">
              <div className="flex flex-wrap gap-6">
                <AuthAwareCta showArrow className="bg-primary text-on-primary font-bold px-12 py-6 text-lg rounded hover-lift transition-matte shadow-xl shadow-primary/20">Start Free Trial</AuthAwareCta>
                <ButtonLink href="#product" className="border border-border-subtle px-12 py-6 text-lg rounded hover:bg-surface-container-low transition-matte" variant="secondary">View Product Demo</ButtonLink>
              </div>
              <p className="text-text-muted text-body-sm font-medium">7-day trial or 100 hosted AI replies. Includes $1 AI test credit where available.</p>
            </div>
            <div className="flex items-center gap-10 opacity-70">
              <div className="flex items-center gap-2 text-body-sm"><span className="material-symbols-outlined text-primary">smart_toy</span> AI Replies</div>
              <div className="flex items-center gap-2 text-body-sm"><span className="material-symbols-outlined text-primary">pan_tool</span> Human Takeover</div>
              <div className="flex items-center gap-2 text-body-sm"><span className="material-symbols-outlined text-primary">person</span> Customer Context</div>
            </div>
          </div>
          <div className="overflow-hidden py-10 px-4">
            <div className="hero-mockup-container matte-surface-1 rounded-2xl p-2 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] border border-white/5">
              <div className="matte-surface-2 rounded-xl overflow-hidden grid grid-cols-12 h-[640px]">
                <div className="col-span-4 border-r border-border-subtle p-6 space-y-3 bg-surface-container-lowest">
                  <div className="matte-surface-3 p-4 rounded-lg ownership-line">
                    <div className="text-body-sm font-bold">Thomas Mueller</div>
                    <div className="text-[13px] text-primary">Active Support Session</div>
                  </div>
                  <div className="p-4 rounded-lg opacity-40">
                    <div className="text-body-sm font-bold">Sarah Jenkins</div>
                    <div className="text-[13px] text-text-muted">Wait: 2m</div>
                  </div>
                  <div className="p-4 rounded-lg opacity-40">
                    <div className="text-body-sm font-bold">Marco Rossi</div>
                    <div className="text-[13px] text-text-muted">Wait: 5m</div>
                  </div>
                </div>
                <div className="col-span-8 flex flex-col bg-surface">
                  <div className="px-6 py-5 border-b border-border-subtle flex items-center justify-between">
                    <span className="text-[13px] font-bold text-text-muted">CHAT: THOMAS M.</span>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                      <span className="text-[13px] text-primary font-bold">AI REPLIES ACTIVE</span>
                    </div>
                  </div>
                  <div className="flex-1 p-8 space-y-6">
                    <div className="bg-surface-container-high p-5 rounded-2xl rounded-tl-none text-body-sm max-w-[85%] border border-white/5">
                      Is the express shipping available for Munich?
                    </div>
                    <div className="bg-primary/10 border border-primary/20 p-5 rounded-2xl rounded-tr-none text-body-sm max-w-[85%] ml-auto">
                      <div className="text-[12px] text-primary font-bold mb-2">AI REPLY DRAFT</div>
                      Yes, Thomas! Express shipping (1-2 days) is available for Munich.
                    </div>
                  </div>
                  <div className="p-6 border-t border-border-subtle bg-surface-container-lowest">
                    <div className="bg-surface-container-high h-14 rounded-xl px-5 flex items-center text-body-sm text-text-muted justify-between">
                      <span>Context: ID #44129 • High</span>
                      <button className="bg-primary/20 text-primary font-bold text-[12px] px-4 py-2 rounded-lg hover:bg-primary hover:text-on-primary transition-matte">Take Over Chat</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3. PROBLEM GRID */}
        <section data-review-section="problems" className="max-w-[1440px] mx-auto px-panel-padding py-section-margin">
          <div className="text-center mb-24">
            <h2 className="font-display-lg mb-8">Your WhatsApp Is Busy. Your Team Shouldn’t Be Overwhelmed.</h2>
            <p className="text-text-muted text-body-lg max-w-3xl mx-auto">Scaling a business on WhatsApp shouldn't mean hiring dozens of agents just to answer basic questions.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            <div className="matte-surface-1 p-10 rounded-2xl space-y-6 border border-white/10 hover:border-primary/50 transition-matte group">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-primary/10 transition-matte">
                <span className="material-symbols-outlined text-text-muted group-hover:text-primary text-4xl">timer</span>
              </div>
              <h3 className="font-headline-sm font-bold text-text-main">Slow Replies</h3>
              <p className="text-text-muted text-body-md leading-relaxed">Customers expect instant answers. Every minute they wait is a minute they could be looking elsewhere.</p>
            </div>
            <div className="matte-surface-1 p-10 rounded-2xl space-y-6 border border-white/10 hover:border-primary/50 transition-matte group">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-primary/10 transition-matte">
                <span className="material-symbols-outlined text-text-muted group-hover:text-primary text-4xl">repeat</span>
              </div>
              <h3 className="font-headline-sm font-bold text-text-main">Repeated Questions</h3>
              <p className="text-text-muted text-body-md leading-relaxed">Agents frequently answer the same delivery and pricing questions over and over again.</p>
            </div>
            <div className="matte-surface-1 p-10 rounded-2xl space-y-6 border border-white/10 hover:border-primary/50 transition-matte group">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-primary/10 transition-matte">
                <span className="material-symbols-outlined text-text-muted group-hover:text-primary text-4xl">person_search</span>
              </div>
              <h3 className="font-headline-sm font-bold text-text-main">Lost Customer Context</h3>
              <p className="text-text-muted text-body-md leading-relaxed">Switching between chats makes it hard to remember who is a premium customer and who just bought yesterday.</p>
            </div>
            <div className="matte-surface-1 p-10 rounded-2xl space-y-6 border border-white/10 hover:border-primary/50 transition-matte group">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-primary/10 transition-matte">
                <span className="material-symbols-outlined text-text-muted group-hover:text-primary text-4xl">notifications_active</span>
              </div>
              <h3 className="font-headline-sm font-bold text-text-main">Missed Follow-ups</h3>
              <p className="text-text-muted text-body-md leading-relaxed">Leads go cold because manual follow-ups are hard to track and execute consistently.</p>
            </div>
            <div className="matte-surface-1 p-10 rounded-2xl space-y-6 border border-white/10 hover:border-primary/50 transition-matte group">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-primary/10 transition-matte">
                <span className="material-symbols-outlined text-text-muted group-hover:text-primary text-4xl">shopping_cart_checkout</span>
              </div>
              <h3 className="font-headline-sm font-bold text-text-main">Manual Order Updates</h3>
              <p className="text-text-muted text-body-md leading-relaxed">Copy-pasting tracking numbers from your backend into WhatsApp is a massive waste of human talent.</p>
            </div>
            <div className="matte-surface-1 p-10 rounded-2xl space-y-6 border border-white/10 hover:border-primary/50 transition-matte group">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-primary/10 transition-matte">
                <span className="material-symbols-outlined text-text-muted group-hover:text-primary text-4xl">transfer_within_a_station</span>
              </div>
              <h3 className="font-headline-sm font-bold text-text-main">Unclear Human Handoff</h3>
              <p className="text-text-muted text-body-md leading-relaxed">Transitions can be clunky, leaving customers in automated loops.</p>
            </div>
          </div>
        </section>

        {/* 4. SETUP WORKFLOW */}
        <section data-review-section="steps" id="how-it-works" className="max-w-[1440px] mx-auto px-panel-padding py-section-margin bg-surface-light rounded-4xl">
          <div className="text-center mb-24">
            <h2 className="font-display-lg">From WhatsApp Connection to Working AI in Six Clear Steps.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-6">
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/10 border-t-4 border-t-primary relative connector-line">
              <div className="text-4xl font-black text-white/5 absolute right-6 top-6">01</div>
              <div className="mb-6 text-primary font-bold text-label-caps">STEP ONE</div>
              <h4 className="font-bold mb-3 text-headline-sm text-text-main">Connect WhatsApp</h4>
              <p className="text-body-sm text-text-muted leading-relaxed">Link your business number via QR code or API in seconds.</p>
            </div>
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/10 border-t-4 border-t-border-subtle relative connector-line">
              <div className="text-4xl font-black text-white/5 absolute right-6 top-6">02</div>
              <div className="mb-6 text-text-muted font-bold text-label-caps">STEP TWO</div>
              <h4 className="font-bold mb-3 text-headline-sm text-text-main">Add Business Information</h4>
              <p className="text-body-sm text-text-muted leading-relaxed">Upload FAQs, guidelines, and core company details.</p>
            </div>
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/10 border-t-4 border-t-border-subtle relative connector-line">
              <div className="text-4xl font-black text-white/5 absolute right-6 top-6">03</div>
              <div className="mb-6 text-text-muted font-bold text-label-caps">STEP THREE</div>
              <h4 className="font-bold mb-3 text-headline-sm text-text-main">Add Products or Services</h4>
              <p className="text-body-sm text-text-muted leading-relaxed">Import your catalog or connect your WooCommerce store.</p>
            </div>
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/10 border-t-4 border-t-border-subtle relative connector-line">
              <div className="text-4xl font-black text-white/5 absolute right-6 top-6">04</div>
              <div className="mb-6 text-text-muted font-bold text-label-caps">STEP FOUR</div>
              <h4 className="font-bold mb-3 text-headline-sm text-text-main">Choose Customer Details</h4>
              <p className="text-body-sm text-text-muted leading-relaxed">Define how the AI should identify and tag your customers.</p>
            </div>
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/10 border-t-4 border-t-border-subtle relative connector-line">
              <div className="text-4xl font-black text-white/5 absolute right-6 top-6">05</div>
              <div className="mb-6 text-text-muted font-bold text-label-caps">STEP FIVE</div>
              <h4 className="font-bold mb-3 text-headline-sm text-text-main">Test Your Bot</h4>
              <p className="text-body-sm text-text-muted leading-relaxed">Run internal simulations to refine logic and tone.</p>
            </div>
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/10 border-t-4 border-t-border-subtle relative">
              <div className="text-4xl font-black text-white/5 absolute right-6 top-6">06</div>
              <div className="mb-6 text-text-muted font-bold text-label-caps">STEP SIX</div>
              <h4 className="font-bold mb-3 text-headline-sm text-text-main">Go Live</h4>
              <p className="text-body-sm text-text-muted leading-relaxed">Switch to production and let the automation begin.</p>
            </div>
          </div>
        </section>

        {/* 5. COMMAND CENTER */}
        <section data-review-section="command-center" id="product" className="w-full px-panel-padding py-section-margin">
          <div className="max-w-[1280px] mx-auto mb-16 text-center">
            <h2 className="font-display-lg mb-6 text-text-main">Total Inbox Control</h2>
            <p className="text-text-muted text-body-lg max-w-3xl mx-auto">The Command Center brings your team and AI together in a single high-performance interface.</p>
          </div>
          <div className="max-w-[1440px] mx-auto matte-surface-1 rounded-3xl overflow-hidden border border-border-subtle shadow-[0_48px_80px_-16px_rgba(0,0,0,0.8)]">
            <div className="bg-surface-container-high px-8 py-5 border-b border-border-subtle flex items-center justify-between">
              <div className="flex gap-2.5">
                <div className="w-3.5 h-3.5 rounded-full bg-border-subtle"></div>
                <div className="w-3.5 h-3.5 rounded-full bg-border-subtle"></div>
                <div className="w-3.5 h-3.5 rounded-full bg-border-subtle"></div>
              </div>
              <div className="text-[12px] font-bold text-text-muted tracking-[0.2em] font-label-caps">BLACKARROW COMMAND CENTER - v2.4.0</div>
              <div className="flex items-center gap-6 text-text-muted">
                <span className="material-symbols-outlined">search</span>
                <span className="material-symbols-outlined">account_circle</span>
              </div>
            </div>
            <div className="grid grid-cols-12 h-[720px] overflow-hidden">
              <div className="col-span-3 border-r border-border-subtle flex flex-col bg-surface-container-lowest">
                <div className="px-6 py-4 border-b border-border-subtle bg-surface-container-lowest">
                  <div className="matte-surface-3 rounded-lg px-3 py-2 flex items-center gap-2 border border-white/5">
                    <span className="material-symbols-outlined text-text-muted text-sm">search</span>
                    <input type="text" placeholder="Search chats..." className="bg-transparent border-none text-[13px] text-text-main focus:ring-0 w-full" disabled />
                  </div>
                </div>
                <div className="flex-1 p-6 space-y-6 overflow-y-auto no-scrollbar">
                  <div className="matte-surface-3 p-5 rounded-xl ownership-line relative border border-white/5">
                    <div className="text-body-sm font-bold truncate text-text-main">Thomas Mueller</div>
                    <div className="text-[14px] text-text-muted truncate mt-2">"Is the express shipping available..."</div>
                    <span className="absolute right-4 top-4 w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                  </div>
                  <div className="p-5 rounded-xl hover:bg-white/5 transition-matte cursor-pointer">
                    <div className="text-body-sm font-bold truncate text-text-main">Sarah Jenkins</div>
                    <div className="text-[14px] text-text-muted truncate mt-2">"Thanks for the help today!"</div>
                  </div>
                  <div className="p-5 rounded-xl hover:bg-white/5 transition-matte cursor-pointer">
                    <div className="text-body-sm font-bold truncate text-text-main">Marco Rossi</div>
                    <div className="text-[14px] text-primary truncate mt-2 font-medium">Awaiting AI Response...</div>
                  </div>
                </div>
              </div>
              <div className="col-span-6 flex flex-col bg-surface-container-low">
                <div className="p-8 border-b border-border-subtle flex items-center justify-between bg-surface/50">
                  <div className="text-headline-sm font-bold text-text-main">Thomas Mueller</div>
                  <span className="bg-primary/10 text-primary border border-primary/30 px-4 py-1.5 rounded-full text-[12px] font-bold tracking-wider">AI REPLIES ACTIVE</span>
                </div>
                <div className="flex-1 p-10 space-y-8 overflow-y-auto no-scrollbar">
                  <div className="bg-surface-container-high p-6 rounded-2xl rounded-tl-none max-w-[80%] text-body-md border border-white/5">
                    Is the express shipping available for the Pro Keyboard in Munich?
                    <div className="text-[11px] text-text-muted mt-2 text-right">10:45 AM</div>
                  </div>
                  <div className="bg-primary/10 border border-primary/20 p-6 rounded-2xl rounded-tr-none max-w-[80%] ml-auto ownership-line">
                    <div className="text-[12px] text-primary font-bold mb-3 tracking-widest uppercase">AI REPLY DRAFT</div>
                    <p className="text-body-md leading-relaxed text-text-main">Yes, Thomas! Express shipping (1-2 days) is available for Munich. Since your order value is over €150, it's actually free. Should I add it to your cart?</p>
                    <div className="text-[11px] text-primary mt-2 text-right">10:45 AM</div>
                  </div>
                </div>
                <div className="p-8 border-t border-border-subtle bg-surface/30">
                  <div className="matte-surface-3 p-5 rounded-2xl flex items-center gap-6 border border-white/10">
                    <input className="bg-transparent border-none focus:ring-0 flex-1 text-body-md text-text-main" placeholder="Type a message or let AI handle it..." type="text" disabled />
                    <button className="material-symbols-outlined text-primary text-3xl hover:scale-110 transition-transform" disabled>send</button>
                  </div>
                </div>
              </div>
              <div className="col-span-3 border-l border-border-subtle p-10 space-y-8 overflow-y-auto bg-surface-container-lowest command-center-right no-scrollbar">
                <div>
                  <div className="text-label-caps text-text-muted mb-6 font-bold border-b border-white/5 pb-4">COLLECTED DETAILS</div>
                  <div className="space-y-4">
                    <div className="flex justify-between text-body-md">
                      <span className="text-text-muted">Identity:</span>
                      <span className="font-medium text-text-main">Thomas Mueller</span>
                    </div>
                    <div className="flex justify-between text-body-md">
                      <span className="text-text-muted">ID:</span>
                      <span className="font-medium text-text-main">#44129</span>
                    </div>
                    <div className="flex justify-between text-body-md">
                      <span className="text-text-muted">Total Spend:</span>
                      <span className="font-data-tabular font-medium text-text-main">€1,240.00</span>
                    </div>
                    <div className="flex justify-between text-body-md">
                      <span className="text-text-muted">Priority:</span>
                      <span className="text-primary font-bold bg-primary/10 px-3 py-1 rounded">High</span>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-label-caps text-text-muted mb-6 font-bold border-b border-white/5 pb-4">CUSTOMER REQUIREMENT</div>
                  <p className="text-body-sm text-text-main leading-relaxed">Wants express shipping to Munich for Pro Keyboard</p>
                </div>
                <div>
                  <div className="text-label-caps text-text-muted mb-6 font-bold border-b border-white/5 pb-4">COLLECTED DETAILS</div>
                  <p className="text-body-sm text-text-muted leading-relaxed">Address: Marienplatz 1, Munich</p>
                </div>
                <div>
                  <div className="text-label-caps text-text-muted mb-6 font-bold border-b border-white/5 pb-4">FOLLOW-UP STATE</div>
                  <p className="text-body-sm text-text-main leading-relaxed">Scheduled: July 20, 2026 at 10:00 AM</p>
                </div>
                <div>
                  <div className="text-label-caps text-text-muted mb-6 font-bold border-b border-white/5 pb-4">CUSTOMER REQUIREMENT</div>
                  <ul className="text-body-sm space-y-3">
                    <li className="flex gap-3"><span className="text-primary font-bold">✓</span> Order #9021 Status</li>
                    <li className="flex gap-3"><span className="text-primary font-bold">✓</span> Shipping Timeline</li>
                    <li className="flex gap-3 opacity-50"><span className="text-text-muted">○</span> Cart Checkout</li>
                  </ul>
                </div>
                <div>
                  <div className="text-label-caps text-text-muted mb-6 font-bold border-b border-white/5 pb-4">NEXT RECOMMENDED ACTION</div>
                  <p className="text-body-sm text-primary font-bold">Confirm &amp; send invoice</p>
                </div>
                <div className="pt-4">
                  <button className="w-full bg-surface-container-highest border border-border-subtle text-body-sm font-bold py-4 rounded-xl hover:bg-primary hover:text-on-primary transition-matte shadow-lg">Take Over Chat</button>
                </div>
              </div>
            </div>
          </div>
          <div className="max-w-[1280px] mx-auto mt-20 grid grid-cols-2 md:grid-cols-4 gap-12 border-t border-white/5 pt-12">
            <div className="flex items-center gap-5">
              <span className="material-symbols-outlined text-primary text-3xl">bolt</span>
              <span className="text-body-lg font-bold text-text-main">Instant AI Drafting</span>
            </div>
            <div className="flex items-center gap-5">
              <span className="material-symbols-outlined text-primary text-3xl">people</span>
              <span className="text-body-lg font-bold text-text-main">Seamless Handoff</span>
            </div>
            <div className="flex items-center gap-5">
              <span className="material-symbols-outlined text-primary text-3xl">analytics</span>
              <span className="text-body-lg font-bold text-text-main">Real-time Context</span>
            </div>
            <div className="flex items-center gap-5">
              <span className="material-symbols-outlined text-primary text-3xl">verified</span>
              <span className="text-body-lg font-bold text-text-main">Full Visibility</span>
            </div>
          </div>
        </section>

        {/* 6. BUSINESS KNOWLEDGE */}
        <section data-review-section="knowledge" className="bg-surface-light py-section-margin">
          <div className="max-w-[1440px] mx-auto px-panel-padding grid lg:grid-cols-2 gap-32 items-center">
            <div className="matte-surface-1 rounded-3xl p-10 space-y-8 flex flex-col shadow-2xl border border-white/10 min-h-[600px] overflow-hidden">
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 border-b border-border-subtle pb-6">
                <span className="font-bold text-primary text-body-sm text-center py-2 px-3 bg-white/5 rounded-lg border border-primary/20">Business Instructions</span>
                <span className="text-text-muted text-body-sm text-center py-2 px-3 hover:text-white transition-matte cursor-pointer rounded-lg hover:bg-white/5">Products &amp; Services</span>
                <span className="text-text-muted text-body-sm text-center py-2 px-3 hover:text-white transition-matte cursor-pointer rounded-lg hover:bg-white/5">Website Knowledge</span>
                <span className="text-text-muted text-body-sm text-center py-2 px-3 hover:text-white transition-matte cursor-pointer rounded-lg hover:bg-white/5">WooCommerce Knowledge</span>
                <span className="text-text-muted text-body-sm text-center py-2 px-3 hover:text-white transition-matte cursor-pointer rounded-lg hover:bg-white/5">Media Library</span>
                <span className="text-text-muted text-body-sm text-center py-2 px-3 hover:text-white transition-matte cursor-pointer rounded-lg hover:bg-white/5">Saved Business Facts</span>
              </div>
              <div className="flex-1 space-y-6 pt-4">
                <div className="matte-surface-2 p-6 rounded-2xl flex items-center gap-6 ownership-line border border-white/5">
                  <span className="material-symbols-outlined text-text-muted text-4xl">description</span>
                  <div>
                    <div className="text-body-lg font-bold mb-1 text-text-main">Brand_Guidelines.pdf</div>
                    <div className="text-body-sm text-text-muted">Parsed: 120 pages</div>
                  </div>
                </div>
                <div className="matte-surface-2 p-6 rounded-2xl flex items-center gap-6 ownership-line-neutral border border-white/5">
                  <span className="material-symbols-outlined text-text-muted text-4xl">language</span>
                  <div>
                    <div className="text-body-lg font-bold mb-1 text-text-main">https://yourbusiness.com</div>
                    <div className="text-body-sm text-text-muted">Website knowledge connected</div>
                  </div>
                </div>
                <div className="matte-surface-2 p-6 rounded-2xl flex items-center gap-6 ownership-line-neutral border border-white/5">
                  <span className="material-symbols-outlined text-text-muted text-4xl">inventory_2</span>
                  <div>
                    <div className="text-body-lg font-bold mb-1 text-text-main">Product_Inventory_DB</div>
                    <div className="text-body-sm text-text-muted">WooCommerce knowledge connected</div>
                  </div>
                </div>
              </div>
              <button className="w-full border border-border-subtle text-body-md font-bold py-5 rounded-2xl mt-6 hover:bg-surface-container-low transition-matte tracking-wide">+ ADD NEW DATA SOURCE</button>
            </div>
            <div>
              <span className="text-label-caps text-primary mb-8 block font-bold">BRAIN OF THE SYSTEM</span>
              <h2 className="font-display-lg mb-12">AI That Knows Your Business Deeply.</h2>
              <div className="space-y-12">
                <div className="flex gap-8">
                  <div className="w-1.5 h-auto bg-primary rounded-full"></div>
                  <div>
                    <h4 className="font-bold text-headline-sm mb-3 text-text-main">Dynamic Instructions</h4>
                    <p className="text-text-muted text-body-lg leading-relaxed">Set custom tone of voice, forbidden words, and escalation rules in plain English. No coding required.</p>
                  </div>
                </div>
                <div className="flex gap-8">
                  <div className="w-1.5 h-auto bg-primary rounded-full"></div>
                  <div>
                    <h4 className="font-bold text-headline-sm mb-3 text-text-main">Product Knowledge</h4>
                    <p className="text-text-muted text-body-lg leading-relaxed">Sync your catalog to let AI handle complex inventory queries, stock status, and feature comparisons natively.</p>
                  </div>
                </div>
                <div className="flex gap-8">
                  <div className="w-1.5 h-auto bg-primary rounded-full"></div>
                  <div>
                    <h4 className="font-bold text-headline-sm mb-3 text-text-main">Website &amp; Documentation</h4>
                    <p className="text-text-muted text-body-lg leading-relaxed">The AI natively crawls your public help docs, FAQs, and blogs to stay up to date with your latest policies.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7. MULTIMODAL AI */}
        <section data-review-section="multimodal" className="max-w-[1440px] mx-auto px-panel-padding py-section-margin">
          <div className="text-center mb-24">
            <h2 className="font-display-lg mb-8 text-text-main">Customers Don’t Only Send Text.</h2>
            <p className="text-text-muted text-body-lg max-w-3xl mx-auto">BlackArrow can work with supported text, voice notes, customer images and documents.</p>
          </div>
          <div className="grid lg:grid-cols-12 gap-24 items-center">
            <div className="lg:col-span-7 matte-surface-1 rounded-3xl p-10 overflow-hidden h-[640px] flex flex-col justify-end bg-surface-container-lowest/50 border border-white/5">
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10">
                    <span className="material-symbols-outlined text-text-muted text-xl">person</span>
                  </div>
                  <div className="bg-surface-container-high px-5 py-4 rounded-2xl rounded-tl-none max-w-md text-body-md border border-white/5">
                    Do you have the blue mechanical keyboard in stock?
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10">
                    <span className="material-symbols-outlined text-text-muted text-xl">person</span>
                  </div>
                  <div className="bg-surface-container-high px-5 py-4 rounded-2xl rounded-tl-none flex items-center gap-5 w-72 shadow-lg border border-white/5">
                    <span className="material-symbols-outlined text-primary text-2xl cursor-pointer">play_arrow</span>
                    <div className="flex-1 h-1 bg-white/10 rounded-full relative">
                      <div className="absolute inset-0 w-1/3 bg-primary rounded-full"></div>
                    </div>
                    <span className="text-[12px] font-data-tabular font-medium text-text-main">0:12</span>
                  </div>
                </div>
                <div className="flex items-start gap-4 justify-end">
                  <div className="bg-white/5 border border-white/10 p-5 rounded-2xl rounded-tr-none max-w-md text-body-md">
                    <div className="text-[11px] text-text-muted font-bold mb-2 tracking-widest">AI PROCESSING...</div>
                    <p className="text-text-muted italic text-[15px]">"I’m also sending a photo of my current setup."</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/10">
                    <span className="material-symbols-outlined text-text-muted text-xl">person</span>
                  </div>
                  <div className="bg-surface-container-high p-3 rounded-2xl rounded-tl-none shadow-lg border border-white/5">
                    <div className="w-72 h-36 bg-surface-container-highest rounded-xl flex items-center justify-center border border-white/5">
                      <span className="material-symbols-outlined text-text-muted text-4xl">image</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-4 justify-end">
                  <div className="bg-primary/10 border border-primary/20 p-5 rounded-2xl rounded-tr-none max-w-md text-body-md shadow-lg">
                    <div className="text-[11px] text-primary font-bold mb-2 uppercase tracking-widest">AI Response</div>
                    <p className="leading-relaxed text-text-main text-[15px]">Great choice! The Pro Blue is in stock. I see your current setup uses a standard desk mat—our XL mat would fit perfectly with that blue aesthetic. Want to see a photo?</p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
                    <span className="material-symbols-outlined text-on-primary text-xl">smart_toy</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="lg:col-span-5 space-y-12">
              <div className="flex gap-8 group">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:border-primary/50 transition-matte">
                  <span className="material-symbols-outlined text-text-main text-3xl">mic</span>
                </div>
                <div>
                  <h4 className="font-bold text-headline-sm mb-3 text-text-main">Voice Note Understanding</h4>
                  <p className="text-text-muted text-body-md leading-relaxed">Understand supported voice messages and use their content when replying.</p>
                </div>
              </div>
              <div className="flex gap-8 group">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:border-primary/50 transition-matte">
                  <span className="material-symbols-outlined text-text-main text-3xl">visibility</span>
                </div>
                <div>
                  <h4 className="font-bold text-headline-sm mb-3 text-text-main">Image Understanding</h4>
                  <p className="text-text-muted text-body-md leading-relaxed">Review customer images to identify relevant products, requests or visible issues.</p>
                </div>
              </div>
              <div className="flex gap-8 group">
                <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0 group-hover:border-primary/50 transition-matte">
                  <span className="material-symbols-outlined text-text-main text-3xl">description</span>
                </div>
                <div>
                  <h4 className="font-bold text-headline-sm mb-3 text-text-main">Document Understanding</h4>
                  <p className="text-text-muted text-body-md leading-relaxed">Read useful information from supported documents shared in the conversation.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 8. MEDIA & SEQUENCES */}
        <section data-review-section="sequences" className="max-w-[1440px] mx-auto px-panel-padding py-section-margin bg-surface-light rounded-4xl">
          <div className="text-center mb-24">
            <span className="text-label-caps text-text-muted mb-6 block font-bold tracking-[0.2em]">SEQUENCES &amp; MEDIA</span>
            <h2 className="font-display-lg mb-8">Automated Multi-Step Workflows</h2>
            <p className="text-text-muted max-w-3xl mx-auto text-body-lg">Don't just answer questions. Drive customers through a curated journey with media-rich message sequences that convert.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/5 hover:border-primary/30 transition-matte flex flex-col justify-between min-h-[220px]">
              <div className="text-[12px] font-bold text-primary mb-6 tracking-widest">1. Welcome Message (T+0: Welcome)</div>
              <p className="text-body-sm text-text-main leading-relaxed">"Hi Sarah! Thanks for your interest in our mechanical collection. Here is our catalog..."</p>
            </div>
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/5 hover:border-accent-violet/30 transition-matte flex flex-col justify-between min-h-[220px]">
              <div className="text-[12px] font-bold text-accent-violet mb-6 tracking-widest uppercase">2. Product Image (T+1H: Showcase)</div>
              <div className="h-20 bg-surface-container-high rounded-xl mb-4 flex items-center justify-center border border-white/5">
                <span className="material-symbols-outlined text-text-muted text-3xl">image</span>
              </div>
              <p className="text-[13px] text-text-muted text-center font-medium">Interactive Image with Buttons</p>
            </div>
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/5 hover:border-accent-violet/30 transition-matte flex flex-col justify-between min-h-[220px]">
              <div className="text-[12px] font-bold text-accent-violet mb-6 tracking-widest uppercase">3. Product Information (T+2H: Info)</div>
              <p className="text-body-sm text-text-main leading-relaxed">"Here are the details of our Pro Mechanical Keyboard featuring hot-swappable switches..."</p>
            </div>
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/5 hover:border-accent-rose/30 transition-matte flex flex-col justify-between min-h-[220px]">
              <div className="text-[12px] font-bold text-accent-rose mb-6 tracking-widest uppercase">4. Document or PDF (T+24H: Details)</div>
              <div className="flex items-center gap-4 bg-surface-container-high p-4 rounded-xl border border-white/5">
                <span className="material-symbols-outlined text-accent-rose text-2xl">picture_as_pdf</span>
                <span className="text-[13px] font-medium text-text-main truncate">Full_Pricing.pdf</span>
              </div>
            </div>
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/5 hover:border-primary/30 transition-matte flex flex-col justify-between min-h-[220px]">
              <div className="text-[12px] font-bold text-primary mb-6 tracking-widest">5. Follow-up (T+48H: Follow Up)</div>
              <p className="text-body-sm text-text-main leading-relaxed">"Hi Sarah, did you have a chance to look at the details?"</p>
            </div>
            <div className="matte-surface-2 p-8 rounded-2xl border border-white/5 hover:border-primary/30 transition-matte flex flex-col justify-between min-h-[220px]">
              <div className="text-[12px] font-bold text-primary mb-6 tracking-widest">6. Human Takeover (T+72H: Handoff)</div>
              <p className="text-body-sm text-text-muted leading-relaxed">Chat paused. Assigned to Specialist.</p>
            </div>
          </div>
        </section>

        {/* 9. CUSTOMER 360 */}
        <section data-review-section="customer-360" className="py-section-margin">
          <div className="max-w-[1440px] mx-auto px-panel-padding grid lg:grid-cols-2 gap-32 items-center">
            <div>
              <h2 className="font-display-lg mb-10 text-text-main">Know Your Customers <span className="text-primary">Instantly</span>.</h2>
              <p className="text-text-muted mb-12 text-body-lg max-w-xl leading-relaxed">Stop digging through fragmented chat history. BlackArrow creates a unified profile for every contact, summarizing details in a few sentences.</p>
              <div className="grid grid-cols-2 gap-8">
                <div className="matte-surface-1 p-8 rounded-2xl border border-white/5">
                  <div className="font-bold text-headline-sm mb-3 text-text-main">Unified Identity</div>
                  <p className="text-body-md text-text-muted">Verified contact history, recent interactions, and order states in one view.</p>
                </div>
                <div className="matte-surface-1 p-8 rounded-2xl border border-white/5">
                  <div className="font-bold text-headline-sm mb-3 text-text-main">AI Summaries</div>
                  <p className="text-body-md text-text-muted">An intelligent gist of the relationship, intent, and sentiment.</p>
                </div>
              </div>
            </div>
            <div className="matte-surface-2 rounded-3xl p-12 space-y-8 shadow-2xl border border-white/5">
              <div className="flex items-center gap-8 justify-between">
                <div className="flex items-center gap-8">
                  <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center font-bold text-2xl text-primary">TM</div>
                  <div>
                    <div className="font-headline-sm mb-1 text-text-main">Thomas Mueller</div>
                    <div className="text-body-md text-text-muted font-medium">Munich, DE • Lead Stage: <span className="text-primary font-bold">Closing</span></div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-text-muted uppercase font-bold tracking-wider">Scheduled Follow-up</div>
                  <div className="text-sm text-primary font-semibold">July 20, 2026 at 10:00 AM</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 bg-surface-container-lowest/50 p-6 rounded-xl border border-white/5">
                <div>
                  <div className="text-[11px] text-text-muted uppercase font-bold">Customer Requirement</div>
                  <div className="text-sm text-text-main font-semibold mt-1">Wants express shipping to Munich for Pro Keyboard</div>
                </div>
                <div>
                  <div className="text-[11px] text-text-muted uppercase font-bold">Collected Details</div>
                  <div className="text-sm text-text-main font-semibold mt-1">Marienplatz 1, Munich • +49 89 1234567</div>
                </div>
              </div>
              <div className="bg-surface-container-lowest p-8 rounded-2xl border border-white/5 shadow-inner">
                <div className="text-label-caps text-text-muted mb-4 font-bold tracking-widest">AI SUMMARY</div>
                <p className="text-body-md leading-relaxed text-text-main">Repeat customer interested in mechanical keyboards. Frequently asks about shipping. Prefers WhatsApp.</p>
              </div>
              <div className="space-y-6 pt-6">
                <div className="text-label-caps text-text-muted mb-4 font-bold tracking-widest">INTERACTION TIMELINE</div>
                <div className="relative pl-10 space-y-8 before:content-[''] before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-[2px] before:bg-white/10">
                  <div className="relative before:content-[''] before:absolute before:left-[-39px] before:top-1.5 before:w-4 before:h-4 before:rounded-full before:bg-primary before:shadow-[0_0_12px_rgba(54,217,134,0.5)]">
                    <div className="text-body-md font-bold mb-1 text-text-main">Product Inquiry: Mechanical Pro</div>
                    <div className="text-[14px] text-text-muted">Today, 10:45 AM via AI Assistant</div>
                  </div>
                  <div className="relative before:content-[''] before:absolute before:left-[-39px] before:top-1.5 before:w-4 before:h-4 before:rounded-full before:bg-white/20">
                    <div className="text-body-md font-bold mb-1 text-text-main">PDF Catalog Sent</div>
                    <div className="text-[14px] text-text-muted">Today, 10:46 AM via Automation</div>
                  </div>
                  <div className="relative opacity-50 before:content-[''] before:absolute before:left-[-39px] before:top-1.5 before:w-4 before:h-4 before:rounded-full before:bg-white/10">
                    <div className="text-body-md font-bold mb-1 text-text-main">Previous Order #9012</div>
                    <div className="text-[14px] text-text-muted">March 12, 2024 • €1,240.00</div>
                  </div>
                </div>
              </div>
              <div className="pt-4 border-t border-white/5 flex justify-between items-center text-sm">
                <span className="text-text-muted">Next Recommended Action:</span>
                <span className="text-primary font-bold">Confirm &amp; send invoice</span>
              </div>
            </div>
          </div>
        </section>

        {/* 10. FOLLOW-UPS */}
        <section data-review-section="followups" className="max-w-[1440px] mx-auto px-panel-padding py-section-margin bg-surface-light rounded-4xl">
          <div className="grid lg:grid-cols-12 gap-24 items-start">
            <div className="lg:col-span-5 space-y-10">
              <h2 className="font-display-lg text-text-main">Automated Persistence</h2>
              <p className="text-text-muted text-body-lg leading-relaxed">Use configured follow-up rules to help reduce missed customer inquiries. Follow-ups can stop when the customer replies or a human takes over.</p>
              <div className="space-y-6">
                <div className="matte-surface-1 p-6 rounded-2xl flex justify-between items-center border-l-8 border-primary shadow-lg border border-white/5">
                  <span className="text-body-lg font-bold text-text-main">1st Reminder</span>
                  <span className="text-label-caps text-text-muted font-bold bg-white/5 px-4 py-2 rounded-lg">AFTER 2 HOURS</span>
                </div>
                <div className="matte-surface-1 p-6 rounded-2xl flex justify-between items-center border-l-8 border-white/10 opacity-70 border border-white/5">
                  <span className="text-body-lg font-bold text-text-main">Final Nudge</span>
                  <span className="text-label-caps text-text-muted font-bold bg-white/5 px-4 py-2 rounded-lg">AFTER 24 HOURS</span>
                </div>
                <div className="matte-surface-1 p-6 rounded-2xl flex justify-between items-center border-l-8 border-white/5 opacity-40 border border-white/5">
                  <span className="text-body-lg font-bold text-text-main">Handoff to Human</span>
                  <span className="text-label-caps text-text-muted font-bold bg-white/5 px-4 py-2 rounded-lg">IF NO REPLY</span>
                </div>
              </div>
            </div>
            <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="matte-surface-2 p-10 rounded-3xl space-y-6 hover:border-primary/30 transition-matte shadow-xl border border-white/5">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                  <span className="material-symbols-outlined text-primary text-4xl">inventory</span>
                </div>
                <h4 className="font-bold text-headline-sm text-text-main">Product Inquiry Follow-up</h4>
                <p className="text-body-md text-text-muted leading-relaxed">"Great news! The Pro Keyboard is back in stock. Should I reserve one for your Munich order?"</p>
              </div>
              <div className="matte-surface-2 p-10 rounded-3xl space-y-6 hover:border-accent-violet/30 transition-matte shadow-xl border border-white/5">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                  <span className="material-symbols-outlined text-accent-violet text-4xl">payments</span>
                </div>
                <h4 className="font-bold text-headline-sm text-text-main">Payment Reminder</h4>
                <p className="text-body-md text-text-muted leading-relaxed">"Hi Thomas, we noticed your order invoice for the mechanical keyboard is still pending. Need help with payment?"</p>
              </div>
              <div className="matte-surface-2 p-10 rounded-3xl space-y-6 hover:border-accent-rose/30 transition-matte shadow-xl border border-white/5">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                  <span className="material-symbols-outlined text-accent-rose text-4xl">calendar_month</span>
                </div>
                <h4 className="font-bold text-headline-sm text-text-main">Appointment Reminder</h4>
                <p className="text-body-md text-text-muted leading-relaxed">"Hi Thomas, just a quick reminder for our product demo tomorrow at 10:00 AM CET."</p>
              </div>
              <div className="matte-surface-2 p-10 rounded-3xl space-y-6 hover:border-primary/30 transition-matte shadow-xl border border-white/5">
                <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                  <span className="material-symbols-outlined text-primary text-4xl">local_shipping</span>
                </div>
                <h4 className="font-bold text-headline-sm text-text-main">Order Status Update</h4>
                <p className="text-body-md text-text-muted leading-relaxed">"Your order #9021 has been shipped! You can track it here: blackarrow.ai/track/9021"</p>
              </div>
            </div>
          </div>
        </section>

        {/* 11. COMMERCE */}
        <section data-review-section="orders" className="py-section-margin">
          <div className="max-w-[1440px] mx-auto px-panel-padding">
            <div className="mb-20 text-center lg:text-left">
              <h2 className="font-display-lg mb-8 text-text-main">Support Sales and Orders on WhatsApp</h2>
              <p className="text-text-muted text-body-lg max-w-2xl leading-relaxed">Help customers move from product questions to collected order details and business review.</p>
            </div>
            <div className="matte-surface-1 rounded-[2.5rem] overflow-hidden grid lg:grid-cols-2 border border-white/10 shadow-[0_64px_96px_-24px_rgba(0,0,0,0.9)]">
              <div className="p-16 space-y-12 border-r border-white/5 bg-surface-container-lowest/30">
                <div className="flex items-start gap-8 group">
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xl flex-shrink-0 group-hover:scale-110 transition-transform">1</div>
                  <div>
                    <div className="font-bold text-headline-sm mb-3 text-text-main">Customer Question</div>
                    <p className="text-body-lg text-text-muted">The customer asks about a product, service, availability or delivery.</p>
                  </div>
                </div>
                <div className="flex items-start gap-8 group">
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xl flex-shrink-0 group-hover:scale-110 transition-transform">2</div>
                  <div>
                    <div className="font-bold text-headline-sm mb-3 text-text-main">Product Information Shared</div>
                    <p className="text-body-lg text-text-muted">The assistant provides configured product or service information.</p>
                  </div>
                </div>
                <div className="flex items-start gap-8 group">
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xl flex-shrink-0 group-hover:scale-110 transition-transform">3</div>
                  <div>
                    <div className="font-bold text-headline-sm mb-3 text-text-main">Customer Details Collected</div>
                    <p className="text-body-lg text-text-muted">Relevant customer, delivery or order details are collected.</p>
                  </div>
                </div>
                <div className="flex items-start gap-8 group">
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xl flex-shrink-0 group-hover:scale-110 transition-transform">4</div>
                  <div>
                    <div className="font-bold text-headline-sm mb-3 text-text-main">Order Saved</div>
                    <p className="text-body-lg text-text-muted">The order or request is saved for business review.</p>
                  </div>
                </div>
                <div className="flex items-start gap-8 group">
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xl flex-shrink-0 group-hover:scale-110 transition-transform">5</div>
                  <div>
                    <div className="font-bold text-headline-sm mb-3 text-text-main">Business Review</div>
                    <p className="text-body-lg text-text-muted">The team reviews the details and completes the next required action.</p>
                  </div>
                </div>
                <div className="flex items-start gap-8 group">
                  <div className="w-12 h-12 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xl flex-shrink-0 group-hover:scale-110 transition-transform">6</div>
                  <div>
                    <div className="font-bold text-headline-sm mb-3 text-text-main">Status or Delivery Update Where Integrated</div>
                    <p className="text-body-lg text-text-muted">Order or tracking information may be shared when the required integration is enabled.</p>
                  </div>
                </div>
              </div>
              <div className="bg-surface-container-highest/30 p-16 flex items-center justify-center">
                <div className="matte-surface-2 rounded-3xl p-10 shadow-3xl w-full max-w-lg border border-white/10 bg-surface">
                  <div className="flex justify-between items-center border-b border-white/10 pb-6 mb-8">
                    <span className="font-bold text-label-caps tracking-widest text-text-muted">NEW ORDER DRAFT</span>
                    <span className="text-[12px] bg-primary text-on-primary px-4 py-1.5 rounded-full font-bold tracking-wider">ORDER DRAFT</span>
                  </div>
                  <div className="flex gap-8 items-center mb-8">
                    <div className="w-24 h-24 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center">
                      <span className="material-symbols-outlined text-text-muted text-4xl">keyboard</span>
                    </div>
                    <div className="flex-1">
                      <div className="text-body-lg font-bold mb-2 text-text-main">Pro Mechanical Keyboard</div>
                      <div className="text-body-sm text-text-muted">SKU: PRO-KB-DE-001 • Qty: 1</div>
                    </div>
                    <div className="font-data-tabular font-bold text-2xl text-text-main">€189.00</div>
                  </div>
                  <div className="border-t border-white/5 pt-8 space-y-5">
                    <div className="flex justify-between text-body-md">
                      <span className="text-text-muted">Delivery:</span>
                      <span className="text-text-main font-medium">To be confirmed</span>
                    </div>
                    <div className="flex justify-between font-bold text-headline-sm border-t border-white/5 pt-5">
                      <span className="text-text-main">Total:</span>
                      <span className="font-data-tabular text-primary">€189.00</span>
                    </div>
                  </div>
                  <div className="space-y-3 pt-8 mb-8">
                    <div className="text-label-caps text-text-muted font-bold tracking-widest">DELIVERY ADDRESS</div>
                    <div className="text-body-md leading-relaxed text-text-main">Thomas Mueller, Marienplatz 1, 80331 Munich, Germany</div>
                  </div>
                  <button className="w-full bg-primary text-on-primary font-bold py-6 rounded-2xl hover-lift transition-matte text-xl shadow-xl shadow-primary/20">REVIEW ORDER</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 12. HUMAN CONTROL */}
        <section data-review-section="human-control" className="max-w-[1440px] mx-auto px-panel-padding py-section-margin">
          <div className="text-center mb-20">
            <h2 className="font-display-lg mb-8 text-text-main">You Are Always in Charge</h2>
            <p className="text-text-muted text-body-lg max-w-2xl mx-auto">AI is your assistant, not your replacement. Monitor performance and step in whenever complexity arises.</p>
          </div>
          <div className="matte-surface-1 rounded-4xl p-16 grid lg:grid-cols-3 gap-16 border border-white/10 shadow-2xl">
            <div className="space-y-8">
              <div className="text-label-caps text-text-muted font-bold tracking-widest">GLOBAL AI STATUS</div>
              <div className="flex items-center gap-6">
                <div className="w-16 h-9 bg-primary rounded-full relative p-1.5 cursor-pointer shadow-inner">
                  <div className="w-6 h-6 bg-white rounded-full absolute right-1.5 shadow-md"></div>
                </div>
                <span className="font-bold text-primary text-headline-sm">AI ENABLED</span>
              </div>
              <p className="text-body-lg text-text-muted leading-relaxed">Instantly toggle AI across all your connected numbers from one central switch.</p>
            </div>
            <div className="space-y-8">
              <div className="text-label-caps text-text-muted font-bold tracking-widest">MANUAL TAKEOVER</div>
              <div className="flex items-center gap-4 bg-white/5 p-5 rounded-2xl border border-white/10 max-w-[260px]">
                <span className="material-symbols-outlined text-text-main text-3xl">front_hand</span>
                <span className="font-bold text-body-lg text-text-main">Pause Session</span>
              </div>
              <p className="text-body-lg text-text-muted leading-relaxed">Stop the AI for specific customers during complex conversations or delicate support.</p>
            </div>
            <div className="space-y-8">
              <div className="text-label-caps text-text-muted font-bold tracking-widest">CREDIT STATUS</div>
              <div className="flex items-center gap-6">
                <span className="text-5xl font-data-tabular font-bold text-text-main tracking-tighter">$412.50</span>
                <button className="bg-white/10 border border-white/10 text-white text-[13px] font-bold px-5 py-2.5 rounded-xl hover:bg-white/20 transition-matte">TOP UP</button>
              </div>
              <p className="text-body-lg text-text-muted leading-relaxed">Transparent pay-as-you-go credit for AI tokens and media. Only pay for what you use.</p>
            </div>
          </div>
        </section>

        {/* 13. INTEGRATIONS */}
        <section data-review-section="integrations" className="py-section-margin max-w-[1440px] mx-auto px-panel-padding">
          <div className="text-center mb-20">
            <h2 className="font-display-lg mb-8 text-text-main">Supported Integrations</h2>
            <p className="text-text-muted text-body-lg max-w-2xl mx-auto">Available connections include WooCommerce, WordPress, website knowledge, courier APIs where configured, the BlackArrow API and webhooks.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
            <div className="matte-surface-2 p-10 rounded-3xl border border-white/5 hover:border-primary/20 transition-matte space-y-6">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <span className="material-symbols-outlined text-primary text-4xl">shopping_cart</span>
              </div>
              <h3 className="font-bold text-headline-sm text-text-main">WooCommerce</h3>
              <p className="text-text-muted text-body-lg leading-relaxed">Connect supported product, customer and order information where configured.</p>
            </div>
            <div className="matte-surface-2 p-10 rounded-3xl border border-white/5 hover:border-accent-rose/20 transition-matte space-y-6">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <span className="material-symbols-outlined text-accent-rose text-4xl">feed</span>
              </div>
              <h3 className="font-bold text-headline-sm text-text-main">WordPress</h3>
              <p className="text-text-muted text-body-lg leading-relaxed">Use supported WordPress or website content as business knowledge.</p>
            </div>
            <div className="matte-surface-2 p-10 rounded-3xl border border-white/5 hover:border-accent-violet/20 transition-matte space-y-6">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <span className="material-symbols-outlined text-accent-violet text-4xl">language</span>
              </div>
              <h3 className="font-bold text-headline-sm text-text-main">Website Knowledge</h3>
              <p className="text-text-muted text-body-lg leading-relaxed">Add supported public website information to the assistant’s knowledge.</p>
            </div>
            <div className="matte-surface-2 p-10 rounded-3xl border border-white/5 hover:border-primary/20 transition-matte space-y-6">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <span className="material-symbols-outlined text-primary text-4xl">local_shipping</span>
              </div>
              <h3 className="font-bold text-headline-sm text-text-main">Courier APIs</h3>
              <p className="text-text-muted text-body-lg leading-relaxed">Retrieve available tracking or delivery information where a supported courier integration is configured.</p>
            </div>
            <div className="matte-surface-2 p-10 rounded-3xl border border-white/5 hover:border-text-main/20 transition-matte space-y-6">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <span className="material-symbols-outlined text-text-main text-4xl">api</span>
              </div>
              <h3 className="font-bold text-headline-sm text-text-main">Public API</h3>
              <p className="text-text-muted text-body-lg leading-relaxed">Connect supported external systems using the BlackArrow API.</p>
            </div>
            <div className="matte-surface-2 p-10 rounded-3xl border border-white/5 hover:border-primary/20 transition-matte space-y-6">
              <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10">
                <span className="material-symbols-outlined text-primary text-4xl">webhook</span>
              </div>
              <h3 className="font-bold text-headline-sm text-text-main">Webhooks</h3>
              <p className="text-text-muted text-body-lg leading-relaxed">Send configured event data to connected endpoints.</p>
            </div>
          </div>
        </section>

        {/* 14. USE CASES */}
        <section data-review-section="use-cases" className="bg-surface-light py-section-margin rounded-[4rem]">
          <div className="max-w-[1440px] mx-auto px-panel-padding">
            <div className="text-center mb-24">
              <h2 className="font-display-lg mb-8 text-text-main">Built for High-Performance Teams.</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10 mb-40">
              <div className="matte-surface-2 p-12 rounded-3xl border border-white/5 hover:border-primary/20 transition-matte">
                <span className="material-symbols-outlined text-primary mb-8 text-5xl">shopping_bag</span>
                <h3 className="font-bold text-headline-sm mb-5 text-text-main">E-commerce</h3>
                <p className="text-text-muted text-body-lg leading-relaxed">Help answer product questions, collect customer details and assist with order updates.</p>
              </div>
              <div className="matte-surface-2 p-12 rounded-3xl border border-white/5 hover:border-accent-rose/20 transition-matte">
                <span className="material-symbols-outlined text-accent-rose mb-8 text-5xl">medical_services</span>
                <h3 className="font-bold text-headline-sm mb-5 text-text-main">Healthcare and Clinics</h3>
                <p className="text-text-muted text-body-lg leading-relaxed">Help manage appointment inquiries, common questions and patient guidance according to configured business rules.</p>
              </div>
              <div className="matte-surface-2 p-12 rounded-3xl border border-white/5 hover:border-accent-violet/20 transition-matte">
                <span className="material-symbols-outlined text-accent-violet mb-8 text-5xl">school</span>
                <h3 className="font-bold text-headline-sm mb-5 text-text-main">Education and Consultancies</h3>
                <p className="text-text-muted text-body-lg leading-relaxed">Collect student inquiries, share information and help staff manage follow-ups.</p>
              </div>
              <div className="matte-surface-2 p-12 rounded-3xl border border-white/5 hover:border-primary/20 transition-matte">
                <span className="material-symbols-outlined text-primary mb-8 text-5xl">apartment</span>
                <h3 className="font-bold text-headline-sm mb-5 text-text-main">Real Estate</h3>
                <p className="text-text-muted text-body-lg leading-relaxed">Share property information, collect buyer requirements and support viewing inquiries.</p>
              </div>
              <div className="matte-surface-2 p-12 rounded-3xl border border-white/5 hover:border-text-main/20 transition-matte">
                <span className="material-symbols-outlined text-text-main mb-8 text-5xl">work_history</span>
                <h3 className="font-bold text-headline-sm mb-5 text-text-main">Professional Services</h3>
                <p className="text-text-muted text-body-lg leading-relaxed">Collect customer requirements and route qualified inquiries to the appropriate team.</p>
              </div>
              <div className="matte-surface-2 p-12 rounded-3xl border border-white/5 hover:border-primary/20 transition-matte">
                <span className="material-symbols-outlined text-primary mb-8 text-5xl">storefront</span>
                <h3 className="font-bold text-headline-sm mb-5 text-text-main">Local Retail</h3>
                <p className="text-text-muted text-body-lg leading-relaxed">Answer product and location questions and help communicate configured pickup or delivery details.</p>
              </div>
            </div>

            {/* 14. OUTCOMES BAND */}
            <div className="text-center mb-24">
              <h2 className="font-display-lg mb-8 text-text-main">Engineered for Radical Efficiency.</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-12 border-y border-white/10 py-20">
              <div className="space-y-4">
                <div className="font-bold text-headline-sm text-primary">Faster Replies</div>
                <p className="text-text-muted text-body-sm leading-relaxed">Help customers receive useful answers sooner.</p>
              </div>
              <div className="space-y-4">
                <div className="font-bold text-headline-sm text-primary">Fewer Repeated Questions</div>
                <p className="text-text-muted text-body-sm leading-relaxed">Reduce repetitive manual replies with configured business information.</p>
              </div>
              <div className="space-y-4">
                <div className="font-bold text-headline-sm text-primary">Better Context</div>
                <p className="text-text-muted text-body-sm leading-relaxed">Keep useful customer and conversation details available for future handling.</p>
              </div>
              <div className="space-y-4">
                <div className="font-bold text-headline-sm text-primary">Consistent Follow-ups</div>
                <p className="text-text-muted text-body-sm leading-relaxed">Use configured reminders and follow-up flows.</p>
              </div>
              <div className="space-y-4">
                <div className="font-bold text-headline-sm text-primary">Connected Updates</div>
                <p className="text-text-muted text-body-sm leading-relaxed">Share supported order and delivery information where integrated.</p>
              </div>
              <div className="space-y-4">
                <div className="font-bold text-headline-sm text-primary">Human Handoff</div>
                <p className="text-text-muted text-body-sm leading-relaxed">Allow staff to take control with relevant conversation context.</p>
              </div>
            </div>
          </div>
        </section>

        {/* 15. PRICING */}
        <section data-review-section="pricing" className="py-section-margin">
          <div className="max-w-[1440px] mx-auto px-panel-padding">
            <div className="text-center mb-24">
              <h2 className="font-display-lg mb-8 text-text-main">Simple, Scale-First Pricing</h2>
              <p className="text-text-muted text-body-lg">Start with one number. Expand as your volume grows.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-10 items-start">
              {/* Starter */}
              <div className="matte-surface-1 p-16 rounded-[2rem] border border-white/5 hover:border-white/10 transition-matte">
                <div className="text-label-caps text-text-muted mb-10 font-bold tracking-widest uppercase">STARTER</div>
                <div className="mb-10">
                  <span className="text-6xl font-bold font-data-tabular text-text-main">$9</span>
                  <span className="text-text-muted text-body-lg">/mo</span>
                </div>
                <ul className="space-y-6 text-body-md text-text-muted mb-16">
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-text-main text-2xl">check</span> 1 WhatsApp instance</li>
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-text-main text-2xl">check</span> 5 products/services</li>
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-text-main text-2xl">check</span> 1,000 customers</li>
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-text-main text-2xl">check</span> Standard support</li>
                </ul>
                <AuthAwareCta className="w-full border-2 border-white/10 py-5 rounded-2xl hover:bg-white/5 transition-matte font-bold text-body-lg text-center block">Start Free Trial</AuthAwareCta>
              </div>
              {/* Growth */}
              <div className="matte-surface-2 p-16 rounded-[2rem] border-2 border-primary relative scale-105 shadow-[0_48px_80px_-16px_rgba(54,217,134,0.3)] bg-gradient-to-b from-[#151a17] to-black">
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-primary text-on-primary text-[13px] font-bold px-6 py-2 rounded-full tracking-widest shadow-xl">MOST POPULAR</div>
                <div className="text-label-caps text-primary mb-10 font-bold tracking-widest uppercase">GROWTH</div>
                <div className="mb-10">
                  <span className="text-6xl font-bold font-data-tabular text-text-main">$29</span>
                  <span className="text-text-muted text-body-lg">/mo</span>
                </div>
                <ul className="space-y-6 text-body-md text-text-main mb-16">
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-primary text-2xl">check</span> 3 WhatsApp instances</li>
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-primary text-2xl">check</span> 30 products/services</li>
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-primary text-2xl">check</span> 10,000 customers</li>
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-primary text-2xl">check</span> Courier integration where available</li>
                </ul>
                <AuthAwareCta className="w-full bg-primary text-on-primary font-bold py-6 rounded-2xl shadow-xl hover-lift transition-matte text-xl text-center block">Start Free Trial</AuthAwareCta>
              </div>
              {/* Pro */}
              <div className="matte-surface-1 p-16 rounded-[2rem] border border-white/5 hover:border-white/10 transition-matte">
                <div className="text-label-caps text-text-muted mb-10 font-bold tracking-widest uppercase">PRO</div>
                <div className="mb-10">
                  <span className="text-6xl font-bold font-data-tabular text-text-main">$89</span>
                  <span className="text-text-muted text-body-lg">/mo</span>
                </div>
                <ul className="space-y-6 text-body-md text-text-muted mb-16">
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-text-main text-2xl">check</span> 10 WhatsApp instances</li>
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-text-main text-2xl">check</span> 100 products/services</li>
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-text-main text-2xl">check</span> 50,000 customers</li>
                  <li className="flex items-center gap-4"><span className="material-symbols-outlined text-text-main text-2xl">check</span> Higher usage capacity</li>
                </ul>
                <ButtonLink href="https://wa.me/923136923129" className="w-full border-2 border-white/10 py-5 rounded-2xl hover:bg-white/5 transition-matte font-bold text-body-lg text-center block" variant="secondary">Contact Sales</ButtonLink>
              </div>
            </div>
            <div className="mt-20 matte-surface-1 p-10 rounded-2xl text-center max-w-4xl mx-auto border border-white/5 bg-white/[0.02]">
              <p className="text-body-md text-text-muted">Monthly plan access and wallet usage are separate. Trial: 7-day trial or 100 hosted AI replies. Includes $1 AI test credit where available.</p>
            </div>
          </div>
        </section>

        {/* 16. FAQ */}
        <section data-review-section="faq" className="bg-surface-light py-section-margin">
          <div className="max-w-[1440px] mx-auto px-panel-padding">
            <div className="text-center mb-24">
              <h2 className="font-display-lg text-text-main">Clear Answers Before You Start.</h2>
            </div>
            <div className="grid md:grid-cols-2 gap-8 items-start" id="faq-accordion">
              {/* Column 1 */}
              <div className="space-y-8">
                {[faqs[0], faqs[1], faqs[2], faqs[3], faqs[4]].map(faq => (
                  <div key={faq.id} className={`accordion-item matte-surface-2 rounded-2xl border border-white/5 overflow-hidden ${openFaq === faq.id ? 'open' : ''}`}>
                    <button
                      className="w-full px-10 py-8 text-left flex justify-between items-center hover:bg-white/5 transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded"
                      onClick={() => toggleFaq(faq.id)}
                      aria-expanded={openFaq === faq.id}
                      id={`faq-btn-${faq.id}`}
                      aria-controls={`faq-content-${faq.id}`}
                    >
                      <span className="font-bold text-headline-sm text-text-main">{faq.q}</span>
                      <span className={`material-symbols-outlined transition-transform duration-300 ${openFaq === faq.id ? 'rotate-180' : ''}`}>expand_more</span>
                    </button>
                    <div
                      id={`faq-content-${faq.id}`}
                      role="region"
                      aria-labelledby={`faq-btn-${faq.id}`}
                      className="accordion-content"
                    >
                      <p className="text-text-muted text-body-lg leading-relaxed px-10">{faq.a}</p>
                    </div>
                  </div>
                ))}
              </div>
              {/* Column 2 */}
              <div className="space-y-8">
                {[faqs[5], faqs[6], faqs[7], faqs[8], faqs[9]].map(faq => (
                  <div key={faq.id} className={`accordion-item matte-surface-2 rounded-2xl border border-white/5 overflow-hidden ${openFaq === faq.id ? 'open' : ''}`}>
                    <button
                      className="w-full px-10 py-8 text-left flex justify-between items-center hover:bg-white/5 transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded"
                      onClick={() => toggleFaq(faq.id)}
                      aria-expanded={openFaq === faq.id}
                      id={`faq-btn-${faq.id}`}
                      aria-controls={`faq-content-${faq.id}`}
                    >
                      <span className="font-bold text-headline-sm text-text-main">{faq.q}</span>
                      <span className={`material-symbols-outlined transition-transform duration-300 ${openFaq === faq.id ? 'rotate-180' : ''}`}>expand_more</span>
                    </button>
                    <div
                      id={`faq-content-${faq.id}`}
                      role="region"
                      aria-labelledby={`faq-btn-${faq.id}`}
                      className="accordion-content"
                    >
                      <p className="text-text-muted text-body-lg leading-relaxed px-10">{faq.a}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 17. FINAL CTA */}
        <section data-review-section="final-cta" className="max-w-[1440px] mx-auto px-panel-padding py-40">
          <div className="matte-surface-1 border border-white/10 rounded-[3rem] p-24 text-center shadow-[0_64px_128px_-32px_rgba(54,217,134,0.15)] bg-gradient-to-b from-[#111513] to-black">
            <h2 className="font-display-xl mb-10 text-text-main">Start With One WhatsApp Number.<br/>Build From There.</h2>
            <p className="text-text-muted text-headline-sm mb-16 max-w-3xl mx-auto leading-relaxed">Natively automate your customer conversations and order updates on the world's most popular messaging app.</p>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8">
              <AuthAwareCta showArrow className="bg-primary text-on-primary font-bold text-xl px-16 py-7 rounded-2xl hover-lift transition-matte shadow-2xl shadow-primary/30">Start Free Trial</AuthAwareCta>
              <ButtonLink href="#product" className="border-2 border-white/10 text-text-main font-bold text-xl px-16 py-7 rounded-2xl hover:bg-white/5 transition-matte" variant="secondary">View Product Demo</ButtonLink>
            </div>
          </div>
        </section>
      </main>

      {/* 18. FOOTER */}
      <footer data-review-section="footer" className="bg-surface-container-low border-t border-white/10 pt-32 pb-bottom-safe-area">
        <div className="max-w-[1440px] mx-auto px-panel-padding">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-20 mb-32">
            <div className="col-span-2">
              <div className="mb-8">
                <img
                  src="/brand/black-arrow-logo-dark.png"
                  alt="BlackArrow Logo"
                  style={{
                    width: "190px",
                    height: "auto",
                    maxHeight: "45px",
                    objectFit: "contain",
                    display: "block"
                  }}
                />
              </div>
              <p className="text-text-muted text-body-md max-w-sm mb-10 leading-relaxed">
                BlackArrow helps businesses manage WhatsApp sales, customer support, follow-ups, customer details and order communication with AI assistance.
              </p>
              <div className="flex gap-8">
                <span className="material-symbols-outlined text-text-muted text-3xl cursor-pointer hover:text-primary transition-matte">public</span>
                <span className="material-symbols-outlined text-text-muted text-3xl cursor-pointer hover:text-primary transition-matte">share</span>
                <span className="material-symbols-outlined text-text-muted text-3xl cursor-pointer hover:text-primary transition-matte">forum</span>
              </div>
            </div>
            <div>
              <div className="font-bold text-headline-sm text-text-main mb-10">Product</div>
              <ul className="space-y-6 text-text-muted text-body-sm">
                <li>
                  <Link href="/features#inbox" className="hover:text-primary transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">AI Inbox</Link>
                </li>
                <li>
                  <Link href="/docs" className="hover:text-primary transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">Knowledge Base</Link>
                </li>
                <li>
                  <Link href="/features" className="hover:text-primary transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">Automations</Link>
                </li>
                <li>
                  <Link href="/integrations" className="hover:text-primary transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">Integrations</Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-bold text-headline-sm text-text-main mb-10">Solutions</div>
              <ul className="space-y-6 text-text-muted text-body-sm">
                <li>
                  <Link href="/ecommerce-whatsapp-bot" className="hover:text-primary transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">E-commerce</Link>
                </li>
                <li>
                  <Link href="/whatsapp-customer-support" className="hover:text-primary transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">Customer Support</Link>
                </li>
                <li>
                  <Link href="/whatsapp-automation-for-small-business" className="hover:text-primary transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">Small Business</Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-bold text-headline-sm text-text-main mb-10">Company</div>
              <ul className="space-y-6 text-text-muted text-body-sm">
                <li>
                  <Link href="/about" className="hover:text-primary transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">About Us</Link>
                </li>
                <li>
                  <Link href="/privacy" className="hover:text-primary transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">Privacy Policy</Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-primary transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">Terms of Service</Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/5 pt-12 flex flex-col md:flex-row justify-between items-center gap-10">
            <p className="text-body-sm text-text-muted font-medium">© {new Date().getFullYear()} BlackArrow. All rights reserved.</p>
            <div className="flex gap-12 text-body-sm text-text-muted">
              <Link href="/docs" className="hover:text-text-main transition-matte focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded">Developer API</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
