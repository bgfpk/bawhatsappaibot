"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, Menu, X, Sun, Moon, ArrowRight } from "lucide-react";
import { CURRENT_CTA_LINKS } from "@/lib/cta-links";
import { trackCtaClick } from "@/lib/analytics";
import styles from "./homepage.module.css";

const THEME_KEY = "blackarrow-public-theme";

export function HomepageHeader() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [solutionsOpen, setSolutionsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const menuBtnRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
    const activeTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(activeTheme);
  }, []);

  const closeMobileMenu = () => {
    const mainRoute = document.querySelector(".homepage-route") || document.querySelector(".homepage-prototype-route");
    if (mainRoute) {
      mainRoute.removeAttribute("inert");
    }
    setMobileMenuOpen(false);
    requestAnimationFrame(() => {
      menuBtnRef.current?.focus();
    });
  };

  useEffect(() => {
    // Lock body scrolling and add inert attribute to underlying page content when mobile drawer is open
    const mainRoute = document.querySelector(".homepage-route") || document.querySelector(".homepage-prototype-route");

    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      document.body.style.height = "100vh";
      if (mainRoute) {
        mainRoute.setAttribute("inert", "");
      }

      // Move focus to first focusable element inside drawer
      const timer = setTimeout(() => {
        if (drawerRef.current) {
          const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
          );
          if (focusables.length > 0) {
            focusables[0].focus();
          }
        }
      }, 30);

      return () => clearTimeout(timer);
    } else {
      document.body.style.overflow = "";
      document.body.style.height = "";
      if (mainRoute) {
        mainRoute.removeAttribute("inert");
      }
    }
  }, [mobileMenuOpen]);

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    try {
      localStorage.setItem(THEME_KEY, nextTheme);
    } catch {
      // Ignore localStorage availability errors
    }
  };

  const handleDrawerKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      closeMobileMenu();
      return;
    }

    if (e.key === "Tab" && drawerRef.current) {
      const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusables.length === 0) return;

      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  };

  const renderBrandLogo = () => (
    <Link href="/" className={styles.brandLink} aria-label="BlackArrow Homepage">
      <Image
        src={theme === "light" ? "/brand/black-arrow-logo-light.png" : "/brand/black-arrow-logo-dark.png"}
        alt="BlackArrow Logo"
        width={140}
        height={32}
        priority
        style={{ height: "auto", width: "auto", maxHeight: "28px" }}
      />
    </Link>
  );

  return (
    <header className={styles.header}>
      <div className={styles.container}>
        <div className={styles.navRow}>
          {/* Brand Logo */}
          {renderBrandLogo()}

          {/* Desktop Nav */}
          <nav className={styles.navLinks} aria-label="Main Navigation">
            <Link href="/features" className={styles.navLink}>
              Features
            </Link>

            {/* Solutions Dropdown Menu */}
            <div
              className={styles.dropdownWrapper}
              onMouseEnter={() => setSolutionsOpen(true)}
              onMouseLeave={() => setSolutionsOpen(false)}
            >
              <button
                type="button"
                className={styles.navLink}
                aria-expanded={solutionsOpen}
                onClick={() => setSolutionsOpen(!solutionsOpen)}
              >
                <span>Solutions</span>
                <ChevronDown
                  size={14}
                  style={{
                    transform: solutionsOpen ? "rotate(180deg)" : "rotate(0deg)",
                    transition: "transform 140ms ease",
                  }}
                />
              </button>

              {solutionsOpen && (
                <div className={styles.dropdownMenu} role="menu">
                  <Link
                    href="/whatsapp-order-capture"
                    className={styles.dropdownItem}
                    role="menuitem"
                    onClick={() => setSolutionsOpen(false)}
                  >
                    <div>
                      <div className={styles.dropdownItemTitle}>WhatsApp Sales &amp; Order Capture</div>
                      <div className={styles.dropdownItemDesc}>Automate product inquiries, cart items, and delivery records.</div>
                    </div>
                  </Link>
                  <Link
                    href="/whatsapp-customer-support"
                    className={styles.dropdownItem}
                    role="menuitem"
                    onClick={() => setSolutionsOpen(false)}
                  >
                    <div>
                      <div className={styles.dropdownItemTitle}>Grounded AI Customer Support</div>
                      <div className={styles.dropdownItemDesc}>Grounded AI answers FAQs, policy questions, and voice notes.</div>
                    </div>
                  </Link>
                  <Link
                    href="/whatsapp-automation"
                    className={styles.dropdownItem}
                    role="menuitem"
                    onClick={() => setSolutionsOpen(false)}
                  >
                    <div>
                      <div className={styles.dropdownItemTitle}>Automated Follow-Up Sequences</div>
                      <div className={styles.dropdownItemDesc}>Schedule non-spam follow-up sequences for abandoned chats.</div>
                    </div>
                  </Link>
                </div>
              )}
            </div>

            <Link href="/pricing" className={styles.navLink}>
              Pricing
            </Link>
            <Link href="/integrations" className={styles.navLink}>
              Integrations
            </Link>
            <Link href="/docs" className={styles.navLink}>
              Docs
            </Link>
            <Link href="/blog" className={styles.navLink}>
              Blog
            </Link>
            <Link href="/about" className={styles.navLink}>
              About
            </Link>
            <Link href="/contact" className={styles.navLink}>
              Contact
            </Link>
          </nav>

          {/* Header Action Right Block */}
          <div className={styles.navActions}>
            {/* Theme Toggle Button */}
            <button
              type="button"
              className={styles.themeBtn}
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>

            {/* Auth Buttons */}
            <div className={styles.desktopCtaGroup}>
              <Link
                href={CURRENT_CTA_LINKS.signIn}
                className={styles.btnSecondary}
                onClick={() => trackCtaClick({ cta_name: "Sign In", destination: CURRENT_CTA_LINKS.signIn, cta_location: "header_nav" })}
              >
                Sign In
              </Link>
              <Link
                href={CURRENT_CTA_LINKS.startTrial}
                className={styles.btnPrimary}
                onClick={() => trackCtaClick({ cta_name: "Start Free Trial", destination: CURRENT_CTA_LINKS.startTrial, cta_location: "header_nav" })}
              >
                <span>Start Free Trial</span>
                <ArrowRight size={14} />
              </Link>
            </div>

            {/* Mobile Menu Toggle Button */}
            <button
              ref={menuBtnRef}
              type="button"
              className={styles.mobileMenuBtn}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Body-Level React Portal Mobile Navigation Drawer with Focus Trap & Inert Handling */}
      {mounted &&
        mobileMenuOpen &&
        createPortal(
          <div
            ref={drawerRef}
            className={styles.mobileMenuDrawer}
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Navigation Drawer"
            onKeyDown={handleDrawerKeyDown}
          >
            {/* Top Bar inside Drawer */}
            <div className={styles.mobileDrawerHeader}>
              {renderBrandLogo()}
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <button
                  type="button"
                  className={styles.themeBtn}
                  onClick={toggleTheme}
                  aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
                >
                  {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
                </button>
                <button
                  type="button"
                  className={styles.mobileMenuBtn}
                  onClick={closeMobileMenu}
                  aria-label="Close menu"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Scrollable Nav Items inside Drawer */}
            <div className={styles.mobileDrawerBody}>
              <nav style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <Link href="/features" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Features
                </Link>
                <Link href="#customer-operations" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Sales &amp; Orders
                </Link>
                <Link href="#knowledge-ai" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Customer Support
                </Link>
                <Link href="#customer-operations" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Follow-Ups
                </Link>
                <Link href="#use-cases" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Industry Use Cases
                </Link>
                <Link href="/docs" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Documentation
                </Link>
                <Link href="/blog" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Blog
                </Link>
                <Link href="/pricing" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Pricing
                </Link>
                <Link href="/integrations" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Integrations
                </Link>
                <Link href="/about" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  About
                </Link>
                <Link href="/contact" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Contact
                </Link>
                <Link href="/terms" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Terms
                </Link>
                <Link href="/privacy" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Privacy
                </Link>
                <Link href="/disclaimer" className={styles.mobileNavLink} onClick={closeMobileMenu}>
                  Disclaimer
                </Link>
              </nav>

              <div
                style={{
                  marginTop: "1.5rem",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                  borderTop: "1px solid var(--ca-border-subtle)",
                  paddingTop: "1.25rem",
                }}
              >
                <Link
                  href={CURRENT_CTA_LINKS.signIn}
                  className={styles.btnSecondary}
                  onClick={() => {
                    trackCtaClick({ cta_name: "Sign In", destination: CURRENT_CTA_LINKS.signIn, cta_location: "mobile_drawer" });
                    closeMobileMenu();
                  }}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  Sign In
                </Link>
                <Link
                  href={CURRENT_CTA_LINKS.startTrial}
                  className={styles.btnPrimary}
                  onClick={() => {
                    trackCtaClick({ cta_name: "Start Free Trial", destination: CURRENT_CTA_LINKS.startTrial, cta_location: "mobile_drawer" });
                    closeMobileMenu();
                  }}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  <span>Start Free Trial</span>
                  <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
}
