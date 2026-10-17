import { stageApi } from '../staging/api';
import { StageLogin } from '../staging/StageLogin';
import React, { useState, useEffect, Suspense, lazy } from 'react';
import { Bot, LogIn, UserPlus, CheckCircle2, Zap, MessageSquare, Shield, ArrowRight, Mic, Package, Server, Megaphone, UserCheck, Users, Database, Link, RefreshCw, Sliders, ShieldCheck, BarChart3, Sun, Moon, BrainCircuit, Cpu, Route, Terminal, Globe, Plus, Truck, Webhook, ShoppingBag, MapPin, Mail, Sparkles, BookOpen, FileCheck, AlertTriangle, Scale } from 'lucide-react';
import { SeoHead } from './SeoHead';
import { getPublicPageFromLocation, resolvePublicSeoMetadata } from '../config/public-seo';
import { BrandLogo } from './BrandLogo';
import { PublicSiteFooter, PublicSiteHeader } from './PublicSiteChrome';
import { getBlogPostFromPath, isBlogPath } from '../content/blog-posts';
import { getSeoLandingPageFromPath, isSeoLandingPagePath } from '../content/seo-landing-pages';

const FeaturesPage = lazy(() => import('./FeaturesPage').then(m => ({ default: m.FeaturesPage })));
const PricingPage = lazy(() => import('./PricingPage').then(m => ({ default: m.PricingPage })));
const PublicHomePage = lazy(() => import('./PublicHomePage').then(m => ({ default: m.PublicHomePage })));
const HelpDocs = lazy(() => import('./HelpDocs').then(m => ({ default: m.default || (m as any).HelpDocs })));
const BlogLandingPage = lazy(() => import('./blog/BlogLandingPage').then(m => ({ default: m.BlogLandingPage })));
const BlogArticlePage = lazy(() => import('./blog/BlogArticlePage').then(m => ({ default: m.BlogArticlePage })));
const BlogNotFoundPage = lazy(() => import('./blog/BlogArticlePage').then(m => ({ default: m.BlogNotFoundPage })));
const SeoLandingPage = lazy(() => import('./seo/SeoLandingPage').then(m => ({ default: m.SeoLandingPage })));
const PublicIntegrationsPage = lazy(() => import('./PublicIntegrationsPage').then(m => ({ default: m.PublicIntegrationsPage })));

import {
  AI_USAGE_RATES,
  BETA_PLAN_DISCOUNT_LABEL,
  BETA_PLAN_DISCOUNT_ENDS_LABEL,
  BILLING_PLAN_DETAILS,
  FOUNDING_YEARLY_DISCOUNT_CTA,
  getPlanDisplayPricing,
} from '../config/pricing';
import { trackSignupConversion } from '../lib/conversion-events';

function getRequestedAuthMode() {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname.replace(/\/+$/, '').toLowerCase();
  const hash = window.location.hash.replace(/^#/, '').toLowerCase();
  const params = new URLSearchParams(window.location.search);
  const mode = (params.get('mode') || params.get('auth') || hash).toLowerCase();

  if (path === '/signup' || mode === 'signup' || mode === 'register') return 'signup';
  if (path === '/login' || mode === 'login' || mode === 'signin' || mode === 'sign-in') return 'login';
  return null;
}

export default function Auth({ onLogin, onBack, isLoggedIn = false, isDarkMode, setIsDarkMode }: { onLogin: (user: any) => void, onBack?: () => void, isLoggedIn?: boolean, isDarkMode?: boolean, setIsDarkMode?: (mode: boolean) => void }) {
  const requestedAuthMode = getRequestedAuthMode();
  const [showLogin, setShowLogin] = useState(() => import.meta.env.BLACKARROW_STAGE || !!requestedAuthMode);
  const [activePage, setActivePage] = useState(() => getPublicPageFromLocation(window.location.pathname, window.location.hash));
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [isLogin, setIsLogin] = useState(() => import.meta.env.BLACKARROW_STAGE || requestedAuthMode !== 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [authMode, setAuthMode] = useState<'email' | 'phone'>('email');
  const [phone, setPhone] = useState('');
  const [isResetPassword, setIsResetPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otp, setOtp] = useState('');
  const [totpOtp, setTotpOtp] = useState('');
  const [oauthUserId, setOauthUserId] = useState('');
  const [exchangeRate, setExchangeRate] = useState<number>(1);
  const [signupCount, setSignupCount] = useState<number>(0);
  const [passwordStrength, setPasswordStrength] = useState({ score: 0, label: '', color: '' });
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    message: '',
    website: '',
  });
  const [contactStatus, setContactStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const LEGAL_VERSION = '2026-05-16';
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const isLocalhost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const isLocalEmailSignup = isLocalhost && !isLogin && authMode === 'email';
  const shouldUsePhoneOtp = authMode === 'phone' || isResetPassword || (!isLogin && !isLocalEmailSignup);
  const hasAcceptedLegal = legalAccepted;
  const currentSeoMetadata = resolvePublicSeoMetadata(typeof window === 'undefined' ? '/' : window.location.pathname);
  const currentBlogPost = typeof window === 'undefined' ? null : getBlogPostFromPath(window.location.pathname);
  const currentLandingPage = typeof window === 'undefined' ? null : getSeoLandingPageFromPath(window.location.pathname);
  const starterPlanDisplay = getPlanDisplayPricing('starter_plan');
  const growthPlanDisplay = getPlanDisplayPricing('growth_plan');
  const proPlanDisplay = getPlanDisplayPricing('pro_plan');

  const navigateToPublicPath = (path: string) => {
    window.history.pushState({}, '', path);
    setActivePage(getPublicPageFromLocation(path, ''));
    window.scrollTo(0, 0);
  };

  const buildLegalAcceptance = (source = 'signup_form') => ({
    terms: legalAccepted,
    privacy: legalAccepted,
    disclaimer: legalAccepted,
    marketingConsent: {
      promotionalMessages: marketingOptIn,
      channels: marketingOptIn ? ['whatsapp', 'email'] : [],
      acceptedAt: marketingOptIn ? new Date().toISOString() : null,
      source
    },
    acceptedAt: new Date().toISOString(),
    version: LEGAL_VERSION,
    source
  });

  const handleContactFormChange = (field: keyof typeof contactForm, value: string) => {
    setContactForm((current) => ({ ...current, [field]: value }));
    if (contactStatus) setContactStatus(null);
  };

  const handleContactSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (contactSubmitting) return;

    const payload = {
      name: contactForm.name.trim(),
      email: contactForm.email.trim(),
      phone: contactForm.phone.trim(),
      company: contactForm.company.trim(),
      message: contactForm.message.trim(),
      website: contactForm.website.trim(),
      pageUrl: typeof window !== 'undefined' ? window.location.href : '/contact',
    };

    if (!payload.name || !payload.email || !payload.phone || !payload.message) {
      setContactStatus({ type: 'error', message: 'Please fill in your name, email, WhatsApp number, and message.' });
      return;
    }

    if (payload.name.length < 2 || payload.name.length > 80) {
      setContactStatus({ type: 'error', message: 'Please enter a valid name.' });
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
      setContactStatus({ type: 'error', message: 'Please enter a valid email address.' });
      return;
    }

    if (payload.phone.replace(/[^0-9+()\-\s]/g, '').trim().length < 7) {
      setContactStatus({ type: 'error', message: 'Please enter a valid WhatsApp or phone number.' });
      return;
    }

    if (payload.company.length > 120) {
      setContactStatus({ type: 'error', message: 'Company name is too long.' });
      return;
    }

    if (payload.message.length < 10 || payload.message.length > 1200) {
      setContactStatus({ type: 'error', message: 'Please keep your message between 10 and 1200 characters.' });
      return;
    }

    setContactSubmitting(true);
    setContactStatus(null);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.success) {
        setContactStatus({
          type: 'error',
          message: data?.error || 'We could not send your message right now. Please try again shortly or email contact-086473cbd844@example.invalid.',
        });
        return;
      }

      setContactStatus({
        type: 'success',
        message: 'Thanks. Your message has been sent to our team on WhatsApp. We will get back to you soon.',
      });
      setContactForm({
        name: '',
        email: '',
        phone: '',
        company: '',
        message: '',
        website: '',
      });
    } catch {
      setContactStatus({
        type: 'error',
        message: 'We could not send your message right now. Please try again shortly or email contact-086473cbd844@example.invalid.',
      });
    } finally {
      setContactSubmitting(false);
    }
  };

  useEffect(() => {
    const checkStrength = (pass: string) => {
      let score = 0;
      if (!pass) return { score: 0, label: '', color: '' };
      if (pass.length >= 8) score += 1;
      if (/[A-Z]/.test(pass)) score += 1;
      if (/[0-9]/.test(pass)) score += 1;
      if (/[!@#$%^&*]/.test(pass)) score += 1;

      const labels = ['Very Weak', 'Weak', 'Good', 'Strong', 'Very Strong'];
      const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-emerald-500'];
      
      return { score, label: labels[score], color: colors[score] };
    };
    setPasswordStrength(checkStrength(password));
  }, [password]);

  useEffect(() => {
    if (import.meta.env.BLACKARROW_STAGE) return;
    fetch('https://open.er-api.com/v6/latest/USD')
      .then(res => res.json())
      .then(data => {
        if (data && data.rates && data.rates.USD) {
          setExchangeRate(data.rates.USD);
        }
      })
      .catch(() => console.log('Failed to fetch exchange rate'));

    fetch('/api/users/count')
      .then(res => res.json())
      .then(data => {
        if (data && data.count !== undefined) setSignupCount(data.count);
      })
      .catch(e => console.error(e));
  }, []);

  useEffect(() => {
    const syncPageFromUrl = () => setActivePage(getPublicPageFromLocation(window.location.pathname, window.location.hash));
    window.addEventListener('popstate', syncPageFromUrl);
    window.addEventListener('hashchange', syncPageFromUrl);
    return () => {
      window.removeEventListener('popstate', syncPageFromUrl);
      window.removeEventListener('hashchange', syncPageFromUrl);
    };
  }, []);

  useEffect(() => {
    const syncAuthModeFromUrl = () => {
      const mode = getRequestedAuthMode();
      if (!mode) return;
      setShowLogin(true);
      setIsLogin(mode !== 'signup');
      setOtpSent(false);
      setOtp('');
      setIsResetPassword(false);
      setLegalAccepted(false);
      setMarketingOptIn(false);
      window.scrollTo(0, 0);
    };

    syncAuthModeFromUrl();
    window.addEventListener('popstate', syncAuthModeFromUrl);
    window.addEventListener('hashchange', syncAuthModeFromUrl);
    return () => {
      window.removeEventListener('popstate', syncAuthModeFromUrl);
      window.removeEventListener('hashchange', syncAuthModeFromUrl);
    };
  }, []);

  useEffect(() => {
    // Intersection Observer for scroll reveal animations
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    }, { threshold: 0.1 });
    
    const timeoutId = setTimeout(() => {
      document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
    }, 100);
    
    return () => {
      clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, [activePage, showLogin]);

  useEffect(() => {
    if (showLogin) return;

    const hash = window.location.hash.replace('#', '');
    if (activePage === 'home' && hash) {
      setTimeout(() => document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' }), 100);
      return;
    }

    window.scrollTo(0, 0);
  }, [activePage, showLogin]);

  const handleGoogleAuth = async () => {
    try {
      if (!isLogin && !hasAcceptedLegal) {
        setError('Please accept Terms, Privacy Policy, and Disclaimer to continue.');
        return;
      }
      const legalAcceptance = !isLogin ? buildLegalAcceptance('google_oauth_signup') : null;
      const params = new URLSearchParams({ mode: isLogin ? 'login' : 'signup' });
      if (legalAcceptance) params.set('legalAcceptance', JSON.stringify(legalAcceptance));
      const response = await fetch(`/api/auth/url?${params.toString()}`);
      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(responseData.error || 'Failed to get auth URL');
      const { url } = responseData;

      const authWindow = window.open(url, 'oauth_popup', 'width=600,height=700');
      if (!authWindow) {
        setError('Please allow popups for this site to connect your account.');
      }
    } catch (e: any) {
      setError(e.message);
    }
  };

  React.useEffect(() => {
    if (import.meta.env.BLACKARROW_STAGE) return;
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      console.log(`[Auth] Received message from origin: ${origin}`, event.data);
      
      // Allow Google Cloud Run domains, localhost, and blackarrow domains
      const isAllowedOrigin = 
        origin.endsWith('.run.app') || 
        origin.includes('localhost') || 
        origin.includes('blackarrow-source.offline.invalid');

      if (!isAllowedOrigin) {
        console.warn(`[Auth] Message ignored - unauthorized origin: ${origin}`);
        return;
      }
      
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        console.log(`[Auth] OAuth success signal received. Logging in user...`);
        const user = event.data.payload || event.data.user;
        if (event.data.signupCreated === true || event.data.payload?.signupCreated === true) {
          trackSignupConversion({ user, source: 'google_oauth' });
        }
        onLogin(user);
      } else if (event.data?.type === 'OAUTH_REQUIRES_2FA') {
        setOauthUserId(event.data.payload.userId);
        setRequires2FA(true);
      } else if (event.data?.type === 'OAUTH_AUTH_ERROR') {
        setError(event.data.message || 'Google authentication failed.');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onLogin]);

  const handleSendOTP = async () => {
    if (!phone) return setError('Please enter your WhatsApp number');
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, isLogin, isReset: isResetPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send OTP');
      setOtpSent(true);
    } catch(err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      if (requires2FA && oauthUserId) {
         const res = await fetch('/api/auth/verify-google-2fa', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ userId: oauthUserId, totpOtp })
         });
         const data = await res.json();
         if (!res.ok) throw new Error(data.error || 'Failed to verify 2FA');
         if (!isLogin) trackSignupConversion({ user: data.user, source: 'phone_otp' });
         onLogin(data.user);
         return;
      }

      if (isResetPassword) {
         if (!otpSent) {
            await handleSendOTP();
            return;
         }
         
         const res = await fetch('/api/auth/verify-otp-reset', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({ phone, otp, newPassword })
         });
         
         const data = await res.json();
         if (!res.ok) throw new Error(data.error || 'Failed to reset password');
         alert("Password reset successful! Please login with your new password.");
         setIsResetPassword(false);
         setOtpSent(false);
         setOtp('');
         setIsLogin(true);
         setAuthMode('email');
         return;
      }

      if (!isLogin && !hasAcceptedLegal) {
        throw new Error('Please accept the Terms of Service, Privacy Policy, and Disclaimer before creating an account.');
      }

      if (shouldUsePhoneOtp) {
         if (!otpSent) {
            await handleSendOTP();
            return;
         }
         
         const endpoint = isLogin ? '/api/auth/verify-otp-login' : '/api/auth/verify-otp-register';
         const body = isLogin ? { phone, otp, totpOtp } : { email, password, name, phone, otp, legalAcceptance: buildLegalAcceptance('phone_otp_signup') };
         if (!isLogin && passwordStrength.score < 3) {
            throw new Error("Please use a tougher password! Aim for 'Strong' or better.");
         }
         
         const res = await fetch(endpoint, {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(body)
         });
         
         const data = await res.json();
         if (!res.ok && !data.requires2FA) throw new Error(data.error || 'Failed to authenticate');
         
         if (data.requires2FA) {
            setRequires2FA(true);
            return;
         }
         if (!isLogin) trackSignupConversion({ user: data.user, source: 'phone_otp' });
         onLogin(data.user);
         return;
      }

      if (!isLogin && passwordStrength.score < 3) {
        throw new Error("Please use a tougher password! Aim for 'Strong' or better (Security Strength 3/4). Use uppercase, numbers, and symbols.");
      }
      
      if (import.meta.env.BLACKARROW_STAGE) { const data=await stageApi('/api/auth/login','POST',{email,password}); onLogin(data.user); return; }
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body = isLogin ? { email, password, otp: requires2FA ? totpOtp : '' } : { email, password, name, legalAcceptance: buildLegalAcceptance('email_signup') };
      
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();
      if (!res.ok && !data.requires2FA) throw new Error(data.error || 'Failed to authenticate');
      
      if (data.requires2FA) {
         setRequires2FA(true);
         return;
      }
      if (!isLogin) trackSignupConversion({ user: data.user, source: 'email_password' });
      onLogin(data.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };


  if (import.meta.env.BLACKARROW_STAGE) {
    return <StageLogin email={email} password={password} loading={loading} error={error}
      setEmail={setEmail} setPassword={setPassword} onSubmit={handleSubmit} />;
  }
  if (!showLogin) {
    return (
      <div className="min-h-screen bg-white dark:bg-black font-sans selection:bg-[#25D366]/30 dark:selection:text-white text-gray-900 dark:text-white transition-colors duration-300">
        <SeoHead metadata={currentSeoMetadata} />
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes slideUpFade {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .reveal {
            animation: slideUpFade 0.7s ease-out forwards;
          }
          .bento-card {
            transition: transform 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94), box-shadow 0.2s;
          }
          .bento-card:hover {
            transform: perspective(1000px) rotateX(2deg) rotateY(-2deg) scale3d(1.02, 1.02, 1.02);
          }
          .marquee-content {
            display: flex;
            animation: scrolling 20s linear infinite;
          }
          @keyframes scrolling {
            0% { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          @keyframes pulseYellow {
            0% { box-shadow: 0 0 0 0 rgba(255, 255, 0, 0.7); }
            70% { box-shadow: 0 0 0 10px rgba(255, 255, 0, 0); }
            100% { box-shadow: 0 0 0 0 rgba(255, 255, 0, 0); }
          }
          .pulse-yellow {
            animation: pulseYellow 2s infinite;
          }
          @keyframes levitate {
            0% { transform: perspective(1000px) rotateY(-5deg) rotateX(5deg) translateY(0); }
            100% { transform: perspective(1000px) rotateY(-5deg) rotateX(5deg) translateY(-20px); }
          }
          .animate-levitate {
            animation: levitate 3s infinite alternate ease-in-out;
          }
          @keyframes drawLine {
            to { stroke-dashoffset: 0; }
          }
          .animate-draw {
            stroke-dasharray: 100;
            stroke-dashoffset: 100;
            animation: drawLine 2.5s linear infinite;
          }
        `}} />

        <PublicSiteHeader
          isDarkMode={!!isDarkMode}
          isLoggedIn={isLoggedIn}
          onToggleDarkMode={setIsDarkMode && typeof isDarkMode !== 'undefined' ? () => setIsDarkMode(!isDarkMode) : undefined}
          onSignIn={() => {
            setIsLogin(true);
            setShowLogin(true);
          }}
          onPrimaryAction={() => {
            if (isLoggedIn && onBack) {
              onBack();
            } else {
              setIsLogin(false);
              setShowLogin(true);
            }
          }}
        />

        <Suspense fallback={<div className="min-h-[300px] flex items-center justify-center p-8 text-sm font-medium text-gray-400">Loading page...</div>}>
          <main className="transition-colors duration-300">

          {activePage === 'home' && (
            <>
              <PublicHomePage
                isDarkMode={!!isDarkMode}
                isLoggedIn={isLoggedIn}
                onStartTrial={() => {
                  if (isLoggedIn && onBack) onBack();
                  else setShowLogin(true);
                }}
                onShowPricing={() => navigateToPublicPath('/pricing')}
                onShowFeatures={() => navigateToPublicPath('/features')}
              />
              <div className="hidden">
              {/* Section B: Hero Section */}
              <section className="reveal py-24 px-6 max-w-7xl mx-auto relative overflow-hidden min-h-[80vh] flex items-center">
                <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#25D366]/5 via-transparent to-transparent pointer-events-none"></div>
                
                <div className="grid lg:grid-cols-2 gap-16 items-center relative z-10 w-full">
                  <div className="text-left">
                    <span className="inline-block py-1.5 px-3 rounded-full bg-[#FFFF00]/10 border border-[#FFFF00]/30 text-yellow-600 dark:text-[#FFFF00] text-xs font-black uppercase tracking-widest mb-6 transition-colors duration-300">
                      ⚡ Built for High-Volume E-Commerce
                    </span>
                    <h1 className="text-5xl md:text-7xl font-black text-gray-900 dark:text-white tracking-tight leading-tight mb-6 transition-colors duration-300">
                      Stop Replying Manually. <br/>
                      <span className="text-[#25D366]">Start Scaling Automatically</span> on WhatsApp.
                    </h1>
                    <p className="text-xl text-gray-600 dark:text-gray-300 font-medium mb-8 leading-relaxed transition-colors duration-300">
                      The AI sales agent that replies with voice notes, learns from human handoffs, and instantly prepares orders for supported courier APIs.
                    </p>
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <button 
                        onClick={() => {
                          if (isLoggedIn && onBack) {
                            onBack();
                          } else {
                            setShowLogin(true);
                          }
                        }}
                        className="w-full sm:w-auto bg-[#25D366] text-white px-8 py-4 rounded-full font-black text-lg hover:scale-105 hover:shadow-sm transition-all duration-200 ease-in-out flex items-center justify-center gap-2"
                      >
                        {isLoggedIn ? 'Go to Dashboard' : 'Start 7-day free trial'} <ArrowRight className="w-5 h-5" />
                      </button>
                      <button 
                         onClick={() => { document.getElementById('features')?.scrollIntoView({behavior:'smooth'}) }}
                        className="w-full sm:w-auto bg-transparent border-2 border-[#25D366] text-[#25D366] px-8 py-4 rounded-full font-black text-lg hover:bg-[#25D366]/10 hover:scale-105 transition-all duration-200 flex items-center justify-center gap-2"
                      >
                        See How It Works
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                     {/* Glassmorphic 3D UI Mockup */}
                     <div className="bg-white/60 dark:bg-black/60 backdrop-blur-2xl rounded-3xl p-6 shadow-sm border border-gray-200 dark:border-white/10 relative transform animate-levitate z-20 transition-colors duration-300">
                       <div className="absolute inset-0 bg-gradient-to-br from-[#25D366]/10 to-transparent rounded-3xl pointer-events-none"></div>
                       
                       <div className="flex items-center gap-3 mb-6 border-b border-gray-200 dark:border-white/10 pb-4 relative z-10">
                           <div className="w-10 h-10 bg-[#25D366] rounded-full flex items-center justify-center shrink-0 shadow-sm shadow-[#25D366]/40">
                               <Bot className="text-white w-5 h-5"/>
                           </div>
                           <div>
                               <div className="font-bold text-gray-900 dark:text-white">Black Arrow</div>
                               <div className="text-xs text-[#25D366] drop-shadow-sm">Online</div>
                           </div>
                       </div>
                       
                       <div className="space-y-4 relative z-10">
                           {/* User Voice Note */}
                           <div className="flex justify-end relative">
                              <div className="bg-[#25D366]/10 p-3 rounded-2xl rounded-tr-sm text-sm border border-[#25D366]/30 text-gray-900 dark:text-white shadow-sm ml-4 max-w-[80%] flex items-center gap-2">
                                 <Mic className="w-4 h-4 text-[#25D366] animate-pulse" /> 0:04 Audio
                              </div>
                           </div>
                           
                           {/* AI Typing Indicator */}
                           <div className="flex justify-start relative">
                               <div className="bg-gray-100 dark:bg-white/5 p-3 rounded-2xl rounded-tl-sm text-sm border border-gray-200 dark:border-white/10 shadow-sm mr-4 flex items-center gap-1 transition-colors duration-300">
                                  <div className="w-2 h-2 bg-[#25D366] rounded-full animate-bounce"></div>
                                  <div className="w-2 h-2 bg-[#25D366] rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                                  <div className="w-2 h-2 bg-[#25D366] rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></div>
                               </div>
                           </div>

                           {/* Extracted Data */}
                           <div className="bg-white dark:bg-black/50 p-4 rounded-xl border border-gray-200 dark:border-white/10 relative overflow-hidden group transition-colors duration-300">
                               <div className="absolute top-0 right-0 p-2 text-[#25D366] opacity-50"><Bot className="w-4 h-4"/></div>
                               <div className="text-xs text-gray-500 font-bold mb-1">AI DETECTED INTENT</div>
                               <div className="text-sm font-bold text-gray-900 dark:text-white">Order Placement</div>
                               <div className="text-xs text-gray-600 dark:text-gray-400 mt-2">Address: 123 Main St, Karachi</div>
                           </div>

                           {/* Laser Line SVG */}
                           <div className="flex justify-center -my-2 relative z-0 h-16 w-full pointer-events-none">
                              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                 <path d="M50 0 L50 100" stroke="#25D366" strokeWidth="2" fill="none" className="animate-draw drop-shadow-sm" />
                              </svg>
                           </div>
                           
                           {/* Courier Sync */}
                           <div className="bg-gray-50 dark:bg-white/5 p-4 rounded-xl border border-gray-200 dark:border-white/10 relative z-10 transition-colors duration-300 shadow-sm">
                               <div className="absolute -top-2 -right-2 w-4 h-4 bg-[#FFFF00] rounded-full animate-pulse shadow-sm"></div>
                               <div className="text-xs text-gray-500 font-bold mb-1">COURIER SYNC</div>
                               <div className="flex items-center gap-2 mb-2 justify-between">
                                 <div className="flex items-center gap-2">
                                    <span className="font-bold text-gray-900 dark:text-white">Courier API</span>
                                    <ArrowRight className="w-3 h-3 text-gray-400"/>
                                 </div>
                                 <span className="text-xs text-[#25D366] border border-[#25D366]/30 bg-[#25D366]/10 px-3 py-1 rounded-full font-bold shadow-sm">Booking Generated</span>
                               </div>
                           </div>
                       </div>
                     </div>
                  </div>
                </div>
              </section>

              {/* Section C: Trust & Integration Bar */}
              <section id="integrations" className="reveal py-6 border-y border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-white/[0.02] overflow-hidden transition-colors duration-300">
                 <div className="max-w-[100vw] mx-auto flex items-center relative mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)">
                     <div className="absolute left-6 text-xs font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest z-10 bg-gray-50 dark:bg-black px-2 py-1 rounded shadow-[0_0_20px_20px_rgba(249,250,251,1)] dark:shadow-[0_0_20px_20px_rgba(0,0,0,1)] hidden md:block">
                       Natively Integrated With
                     </div>
                     {/* Marquee Container */}
                     <div className="w-full overflow-hidden relative">
                        <div className="marquee-content flex gap-12 md:gap-24 items-center w-max pl-16 py-2">
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> Courier API</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><Package className="w-8 h-8"/> Order Sync</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><Truck className="w-8 h-8"/> TCS</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><Database className="w-8 h-8"/> Google Sheets</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><Webhook className="w-8 h-8"/> Make.com</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><ShoppingBag className="w-8 h-8"/> Shopify</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><Zap className="w-8 h-8"/> Zapier</span>
                            
                            {/* Duplicate for infinite effect */}
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all md:ml-32"><svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg> Courier API</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><Package className="w-8 h-8"/> Order Sync</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><Truck className="w-8 h-8"/> TCS</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><Database className="w-8 h-8"/> Google Sheets</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><Webhook className="w-8 h-8"/> Make.com</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><ShoppingBag className="w-8 h-8"/> Shopify</span>
                            <span className="font-black text-xl flex items-center gap-2 text-gray-800 dark:text-white opacity-50 grayscale hover:grayscale-0 transition-all"><Zap className="w-8 h-8"/> Zapier</span>
                        </div>
                     </div>
                 </div>
              </section>

              {/* Section D: Core Features (Bento Box Grid Layout) */}
              <section id="features" className="reveal py-24 max-w-7xl mx-auto px-6">
                <div className="text-center mb-16">
                  <h2 className="text-4xl md:text-6xl font-black tracking-tight text-gray-900 dark:text-white">Everything You Need to Run Commerce on Auto-Pilot.</h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-6 lg:grid-cols-6 gap-6 grid-rows-[auto_auto]">
                   {/* Card 1 */}
                   <div className="bento-card col-span-1 md:col-span-3 lg:col-span-3 bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-[#25D366]/0 hover:border-[#25D366] transition-all duration-300 group shadow-sm overflow-hidden relative">
                      <div className="absolute inset-0 bg-[#25D366]/0 group-hover:bg-[#25D366]/5 transition-colors pointer-events-none"></div>
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-900 dark:text-white mb-6 group-hover:text-[#25D366] group-hover:shadow-sm transition-all shadow-sm">
                        <Mic className="w-7 h-7" strokeWidth={1.5} />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 relative z-10 transition-colors duration-300">Human-Like Voice Notes</h3>
                      <p className="text-gray-600 dark:text-gray-400 font-medium leading-relaxed relative z-10">Generates and replies to customer voice notes with highly customizable personas.</p>
                   </div>
                   
                   {/* Card 2 */}
                   <div className="bento-card col-span-1 md:col-span-3 lg:col-span-3 bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-[#25D366]/0 hover:border-[#25D366] transition-all duration-300 group shadow-sm overflow-hidden relative">
                      <div className="absolute inset-0 bg-[#25D366]/0 group-hover:bg-[#25D366]/5 transition-colors pointer-events-none"></div>
                      <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-900 dark:text-white mb-6 group-hover:text-[#25D366] group-hover:shadow-sm transition-all shadow-sm">
                        <Package className="w-7 h-7" strokeWidth={1.5} />
                      </div>
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3 relative z-10 transition-colors duration-300">Zero-Touch Order Engine</h3>
                      <p className="text-gray-600 dark:text-gray-400 font-medium leading-relaxed relative z-10">Automatically extracts shipping addresses and prepares fulfillment through supported courier connections.</p>
                   </div>

                   {/* Card 3 */}
                   <div className="bento-card col-span-1 md:col-span-2 lg:col-span-2 bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-[#25D366]/0 hover:border-[#25D366] transition-all duration-300 group shadow-sm overflow-hidden relative">
                      <div className="absolute inset-0 bg-[#25D366]/0 group-hover:bg-[#25D366]/5 transition-colors pointer-events-none"></div>
                      <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-900 dark:text-white mb-6 group-hover:text-[#25D366] group-hover:shadow-sm transition-all shadow-sm">
                        <BrainCircuit className="w-6 h-6" strokeWidth={1.5} />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 relative z-10 transition-colors duration-300">Continuous Self-Learning</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium leading-relaxed relative z-10">When a human takes over, the AI watches, logs new rules, and never makes the same mistake twice.</p>
                   </div>

                   {/* Card 4 */}
                   <div className="bento-card col-span-1 md:col-span-2 lg:col-span-2 bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-[#25D366]/0 hover:border-[#25D366] transition-all duration-300 group shadow-sm overflow-hidden relative">
                      <div className="absolute inset-0 bg-[#25D366]/0 group-hover:bg-[#25D366]/5 transition-colors pointer-events-none"></div>
                      <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-900 dark:text-white mb-6 group-hover:text-[#25D366] group-hover:shadow-sm transition-all shadow-sm">
                        <Server className="w-6 h-6" strokeWidth={1.5} />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 relative z-10 transition-colors duration-300">Multi-Instance Fleet</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium leading-relaxed relative z-10">Run multiple WhatsApp numbers from one dashboard. Built-in proxy rotation prevents bans.</p>
                   </div>

                   {/* Card 5 */}
                   <div className="bento-card col-span-1 md:col-span-2 lg:col-span-2 bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-[#25D366]/0 hover:border-[#25D366] transition-all duration-300 group shadow-sm overflow-hidden relative">
                      <div className="absolute inset-0 bg-[#25D366]/0 group-hover:bg-[#25D366]/5 transition-colors pointer-events-none"></div>
                      <div className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-white/5 flex items-center justify-center text-gray-900 dark:text-white mb-6 group-hover:text-[#25D366] group-hover:shadow-sm transition-all shadow-sm">
                        <Megaphone className="w-6 h-6" strokeWidth={1.5} />
                      </div>
                      <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 relative z-10 transition-colors duration-300">Broadcast & Follow-ups</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 font-medium leading-relaxed relative z-10">Send bulk campaigns, automate follow-ups, and keep live lead capture visible.</p>
                   </div>
                </div>

                <div className="mt-16 flex justify-center text-center">
                  <a href="https://wa.me/923136923129" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 bg-[#25D366] text-white px-8 py-4 rounded-full font-black text-xl hover:scale-105 hover:shadow-[0_0_20px_rgba(37,211,102,0.4)] transition-all duration-300 animate-bounce">
                    <MessageSquare className="w-6 h-6" />
                    <span>Talk to me 🤖</span>
                  </a>
                </div>
              </section>

              {/* Section E: Dashboard Showcase (Parallax Section) */}
              <section className="reveal py-32 relative overflow-hidden bg-gray-100 dark:bg-black/80 border-y border-gray-200 dark:border-white/5 transition-colors duration-300" style={{ backgroundAttachment: 'fixed', backgroundPosition: 'center', backgroundSize: 'cover' }}>
                 <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60 pointer-events-none dark:opacity-100 opacity-50"></div>
                 <div className="max-w-4xl mx-auto px-6 text-center relative z-20 mb-12">
                   <h2 className="text-4xl md:text-5xl font-black tracking-tight text-gray-900 dark:text-white mb-4 drop-shadow-md">Centralized Control. Unmatched Visibility.</h2>
                   <p className="text-lg text-gray-700 dark:text-gray-300 font-medium drop-shadow-md">Monitor live chats, override AI instantly, manage your product catalog, and track prepaid wallet usage from one command center.</p>
                 </div>
                 
                 <div className="max-w-6xl mx-auto px-6 relative z-10" style={{ transform: 'translateY(-20px)' }}>
                    <div className="w-full aspect-[16/9] bg-white/90 dark:bg-black/90 backdrop-blur-2xl rounded-t-[2rem] border border-gray-300 dark:border-white/10 shadow-sm overflow-hidden relative flex flex-col transition-colors duration-300">
                       {/* Mock Dashboard UI */}
                       <div className="bg-gray-100/50 dark:bg-white/[0.03] border-b border-gray-200 dark:border-white/10 p-4 flex gap-4 h-16 items-center shrink-0 transition-colors duration-300">
                          <div className="w-3 h-3 rounded-full bg-red-500"></div>
                          <div className="w-3 h-3 rounded-full bg-[#FFFF00]"></div>
                          <div className="w-3 h-3 rounded-full bg-[#25D366]"></div>
                          <div className="flex-1"></div>
                          <div className="px-4 py-1.5 bg-white shadow-sm dark:bg-black rounded-full border border-gray-200 dark:border-white/10 text-xs font-bold text-gray-500 dark:text-gray-400 flex items-center gap-2">
                             <div className="w-2 h-2 bg-[#25D366] rounded-full animate-pulse shadow-sm"></div> Live Monitor
                          </div>
                       </div>
                       <div className="flex flex-1 overflow-hidden">
                          <div className="w-48 bg-gray-50/50 dark:bg-black/50 border-r border-gray-200 dark:border-white/10 p-4 space-y-4 transition-colors duration-300">
                             <div className="h-8 bg-gray-200 dark:bg-white/5 rounded-lg border border-transparent dark:border-white/5"></div>
                             <div className="h-8 bg-gray-300 dark:bg-white/10 rounded-lg border border-transparent dark:border-white/5 shadow-sm"></div>
                             <div className="h-8 bg-gray-200 dark:bg-white/5 rounded-lg border border-transparent dark:border-white/5"></div>
                             <div className="h-8 bg-gray-200 dark:bg-white/5 rounded-lg border border-transparent dark:border-white/5"></div>
                          </div>
                          <div className="flex-1 p-8 grid grid-cols-3 gap-6 grid-rows-[auto_1fr]">
                             <div className="h-32 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl relative overflow-hidden flex flex-col justify-end p-6 shadow-sm transition-colors duration-300">
                                <div className="text-gray-500 dark:text-gray-400 font-bold text-sm mb-1 uppercase tracking-wider">Active Threads</div>
                                <div className="text-4xl font-black text-gray-900 dark:text-white">124</div>
                             </div>
                             <div className="h-32 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl relative overflow-hidden flex flex-col justify-end p-6 shadow-sm transition-colors duration-300">
                                <div className="text-gray-500 dark:text-gray-400 font-bold text-sm mb-1 uppercase tracking-wider">Bookings Pushed</div>
                                <div className="text-4xl font-black text-gray-900 dark:text-white">89</div>
                             </div>
                             <div className="h-32 bg-[#25D366]/5 border border-[#25D366]/30 dark:bg-[#25D366]/10 rounded-2xl relative overflow-hidden flex flex-col justify-end p-6 shadow-sm transition-colors duration-300">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-[#25D366]/20 rounded-full blur-[30px] -mr-10 -mt-10 pointer-events-none"></div>
                                <div className="text-[#25D366] font-bold text-sm mb-1 uppercase tracking-wider">Wallet Balance</div>
                                <div className="text-4xl font-black text-gray-900 dark:text-white">$450.00</div>
                             </div>
                             <div className="col-span-3 bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-6 relative overflow-hidden shadow-sm flex flex-col transition-colors duration-300">
                               <div className="text-gray-900 dark:text-white font-bold mb-4">Live Conversation Stream</div>
                               <div className="space-y-4 flex-1">
                                  <div className="flex gap-4">
                                     <div className="h-8 w-8 shrink-0 rounded-full bg-gray-200 dark:bg-white/10 overflow-hidden flex items-center justify-center"><UserCheck className="w-4 h-4 text-gray-500"/></div>
                                     <div className="flex-1 h-12 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10"></div>
                                  </div>
                                  <div className="flex gap-4 opacity-70">
                                     <div className="h-8 w-8 shrink-0 rounded-full bg-[#25D366]/20 shadow-sm flex items-center justify-center"><Bot className="w-4 h-4 text-[#25D366]"/></div>
                                     <div className="flex-1 h-12 rounded-xl bg-[#25D366]/5 border border-[#25D366]/20"></div>
                                  </div>
                               </div>
                             </div>
                          </div>
                       </div>
                    </div>
                 </div>
              </section>

              {/* Section F: Pricing Section */}
              <section id="pricing" className="reveal py-32 max-w-7xl mx-auto px-6 relative">
                <div className="text-center mb-16 relative z-10">
                  <h2 className="text-4xl md:text-6xl font-black tracking-tight text-gray-900 dark:text-white mb-4">Simple, Scalable Pricing.</h2>
                  <p className="text-lg text-gray-600 dark:text-gray-400 font-medium">Three plans for WhatsApp automation. AI usage is pay-as-you-go.</p>
                  <p className="mt-4 inline-flex items-center rounded-full border border-[#25D366]/25 bg-[#25D366]/8 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-[#148f4d] dark:text-[#25D366]">
                    {BETA_PLAN_DISCOUNT_LABEL}
                  </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10 items-stretch font-sans">
                  {/* Card 1 */}
                  <div className="bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-[2rem] p-8 shadow-sm flex flex-col relative transition-all duration-300 hover:-translate-y-[10px] hover:shadow-sm group hover:border-[#25D366]/50">
                    <h4 className="text-xl font-black text-gray-900 dark:text-white mb-2 transition-colors duration-300">{BILLING_PLAN_DETAILS.starter_plan.name}</h4>
                    <div className="text-5xl font-black mb-6 text-gray-900 dark:text-white transition-colors duration-300 flex flex-col">
                      <div className="text-base font-black text-gray-400 line-through dark:text-gray-500 mb-1">Regular ${starterPlanDisplay.regularMonthlyPrice}/mo</div>
                      <div className="flex items-baseline">
                        Now ${starterPlanDisplay.currentMonthlyPrice}<span className="text-lg text-gray-500 dark:text-gray-400 font-medium tracking-normal">/mo</span>
                      </div>
                      <div className="mt-2 text-[11px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-300">50% off until {BETA_PLAN_DISCOUNT_ENDS_LABEL}</div>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mb-4">Start with a 7-day free trial and $1 AI test credit. AI usage is charged separately from your wallet balance.</p>
                    <ul className="space-y-4 mb-8 flex-1 border-t border-gray-200 dark:border-white/10 pt-6">
                      <li className="flex items-center gap-3 text-sm text-gray-900 dark:text-white font-black transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366] drop-shadow-[0_0_8px_rgba(37,211,102,0.8)]" /> 1 Base Instance
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-900 dark:text-white font-black transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366] drop-shadow-[0_0_8px_rgba(37,211,102,0.8)]" /> 5 Included Products
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-900 dark:text-white font-black transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366] drop-shadow-[0_0_8px_rgba(37,211,102,0.8)]" /> Max Cap: 2 Instances
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-900 dark:text-white font-black transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366] drop-shadow-[0_0_8px_rgba(37,211,102,0.8)]" /> Max Cap: 30 Products
                      </li>
                    </ul>
                    <button onClick={() => { setShowLogin(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-full bg-gray-100 dark:bg-white/5 text-gray-900 dark:text-white py-4 border border-transparent dark:border-white/10 rounded-xl font-black hover:bg-gray-200 dark:hover:bg-white/10 transition-colors hover:scale-105 duration-200 ease-in-out">Start Starter</button>
                  </div>

                  {/* Card 2 (Most Popular) */}
                  <div className="bg-white/80 dark:bg-black/60 backdrop-blur-3xl border-2 border-[#FFFF00] pulse-yellow rounded-[2rem] p-8 shadow-sm flex flex-col relative transform transition-all duration-300 hover:-translate-y-[10px] hover:shadow-sm group lg:-mt-4 lg:mb-4 hover:border-[#25D366]">
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-amber-400 dark:bg-amber-600 text-black dark:text-neutral-50 text-xs font-black px-4 py-1 rounded-full uppercase tracking-widest shadow-sm">Most Popular</div>
                    <h4 className="text-xl font-black text-gray-900 dark:text-white mb-2 transition-colors duration-300">{BILLING_PLAN_DETAILS.growth_plan.name}</h4>
                    <div className="text-5xl font-black mb-6 text-gray-900 dark:text-white transition-colors duration-300">
                      <div className="text-base font-black text-gray-400 line-through dark:text-gray-500 mb-1">Regular ${growthPlanDisplay.regularMonthlyPrice}/mo</div>
                      Now ${growthPlanDisplay.currentMonthlyPrice}<span className="text-lg text-gray-500 dark:text-gray-400 font-medium tracking-normal">/mo</span>
                      <div className="mt-2 text-[11px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-300">50% off until {BETA_PLAN_DISCOUNT_ENDS_LABEL}</div>
                    </div>
                    <ul className="space-y-4 mb-8 flex-1 border-t border-gray-200 dark:border-white/10 pt-6">
                      <li className="flex items-center gap-3 text-sm text-gray-900 dark:text-white font-black transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> 3 Base Instances
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-900 dark:text-white font-black transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> 30 Included Products
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-900 dark:text-white transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> Max Cap: 7 Instances
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-900 dark:text-white transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> Max Cap: 150 Products
                      </li>
                    </ul>
                    <button onClick={() => { setShowLogin(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-full bg-[#25D366] text-white py-4 rounded-xl font-black hover:scale-105 hover:shadow-sm transition-all duration-200 ease-in-out">Select Plan</button>
                  </div>

                  {/* Card 3 */}
                  <div className="bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 rounded-[2rem] p-8 shadow-sm flex flex-col relative transition-all duration-300 hover:-translate-y-[10px] hover:shadow-sm group hover:border-[#25D366]/50">
                    <h4 className="text-xl font-black text-gray-900 dark:text-white mb-2 transition-colors duration-300">{BILLING_PLAN_DETAILS.pro_plan.name}</h4>
                    <div className="text-5xl font-black mb-6 text-gray-900 dark:text-white transition-colors duration-300">
                      <div className="text-base font-black text-gray-400 line-through dark:text-gray-500 mb-1">Regular ${proPlanDisplay.regularMonthlyPrice}/mo</div>
                      Now ${proPlanDisplay.currentMonthlyPrice}<span className="text-lg text-gray-500 dark:text-gray-400 font-medium tracking-normal">/mo</span>
                      <div className="mt-2 text-[11px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-300">50% off until {BETA_PLAN_DISCOUNT_ENDS_LABEL}</div>
                    </div>
                    <ul className="space-y-4 mb-8 flex-1 border-t border-gray-200 dark:border-white/10 pt-6">
                      <li className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 font-bold transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> 10 Base Instances
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 font-bold transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> 100 Included Products
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> Max Cap: 30 Instances
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> Max Cap: 500 Products
                      </li>
                    </ul>
                    <button onClick={() => { setShowLogin(true); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="w-full bg-gray-100 dark:bg-white/5 border border-transparent dark:border-white/10 text-gray-900 dark:text-white py-4 rounded-xl font-black hover:bg-gray-200 dark:hover:bg-white/10 transition-colors hover:scale-105 duration-200 ease-in-out">Select Plan</button>
                  </div>

                  {/* Card 4 */}
                  <div className="hidden">
                    <h4>Full pricing details</h4>
                    <div>
                      AI usage, add-ons, annual founding offers, and account setup are on the dedicated pricing page.
                    </div>
                    <ul className="space-y-4 mb-8 flex-1 border-t border-gray-200 dark:border-white/10 pt-6">
                      <li className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 font-bold transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> View all plan limits
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 font-bold transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> AI usage pricing
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> Add-ons
                      </li>
                      <li className="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-300 transition-colors duration-300">
                        <CheckCircle2 className="w-5 h-5 shrink-0 text-[#25D366]" /> Wallet explanation
                      </li>
                    </ul>
                    <button onClick={() => navigateToPublicPath('/pricing')}>View full pricing</button>
                  </div>

                </div>
                <div className="text-center mt-12 relative z-10 transition-colors duration-300 max-w-4xl mx-auto flex flex-col gap-4">
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-white/10 inline-block px-5 py-2.5 rounded-full bg-white/60 dark:bg-black/60 backdrop-blur-md shadow-sm">AI usage is pay-as-you-go. Start with a 7-day free trial and $1 AI test credit. {FOUNDING_YEARLY_DISCOUNT_CTA}</p>
                  
                  <div className="bg-white/60 dark:bg-white/5 backdrop-blur-md border border-gray-200 dark:border-white/10 p-6 rounded-2xl shadow-sm text-center flex flex-col gap-6 items-center">
                     <div className="flex-1 text-center w-full">
                       <h5 className="font-black text-gray-900 dark:text-white text-2xl mb-3">Pay-As-You-Go Cost Breakdown</h5>
                       <p className="text-sm text-gray-600 dark:text-gray-400 font-medium max-w-2xl mx-auto">Wallet usage is separate from the monthly subscription and covers AI processing plus paid outgoing automation sends.</p>
                     </div>
                     <div className="w-full grid grid-cols-1 gap-4 md:grid-cols-3 shrink-0 text-sm font-bold">
                        {AI_USAGE_RATES.map((rate) => (
                          <div key={rate.label} className="bg-gray-100 dark:bg-black/50 p-5 rounded-[1.5rem] border border-gray-200 dark:border-white/10 flex flex-col items-center justify-center text-center">
                             {rate.badge ? <div className="text-amber-600 dark:text-amber-300 text-[10px] uppercase tracking-widest mb-2 font-black">{rate.badge}</div> : null}
                             <div className="text-gray-500 dark:text-gray-500 text-xs uppercase tracking-widest mb-2 font-black">{rate.label}</div>
                             <div className="text-[#25D366] text-2xl font-black">{rate.price}</div>
                             {rate.regularPrice ? <div className="text-[11px] text-gray-400 dark:text-gray-500 font-bold mt-2">{rate.regularPrice}</div> : null}
                             {rate.savings ? <div className="text-[11px] text-amber-600 dark:text-amber-300 font-black mt-1">{rate.savings}</div> : null}
                             {rate.compactCharge ? <div className="text-[10px] text-gray-500 dark:text-gray-400 font-bold mt-2">{rate.compactCharge}</div> : null}
                             {rate.note ? <div className="text-[10px] text-gray-400 dark:text-gray-500 font-medium mt-2 uppercase tracking-wide opacity-80">{rate.note}</div> : null}
                          </div>
                        ))}
                     </div>
                     <button onClick={() => navigateToPublicPath('/pricing')} className="bg-[#25D366] text-white px-6 py-3 rounded-xl font-black inline-flex items-center gap-2">View full pricing <ArrowRight className="w-4 h-4" /></button>
                  </div>
                </div>
              </section>

              {/* Section G: Final CTA */}
              <section className="reveal py-32 bg-gray-50 dark:bg-black text-center relative overflow-hidden transition-colors duration-300 border-t border-gray-200 dark:border-white/5">
                 <div className="absolute inset-0 z-0 flex items-center justify-center">
                    <div className="absolute w-[800px] h-[800px] bg-[#25D366]/10 blur-[150px] rounded-full pointer-events-none" />
                 </div>
                 <div className="max-w-4xl mx-auto px-6 relative z-10">
                    <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-tight mb-10 text-gray-900 dark:text-white">
                       Ready to launch with 50% beta pricing until {BETA_PLAN_DISCOUNT_ENDS_LABEL}?
                    </h2>
                    <div className="mb-8 p-3 bg-[#25D366]/10 border border-[#25D366]/30 rounded-xl inline-block mx-auto">
                       <p className="text-[#25D366] font-black uppercase tracking-widest text-sm text-center">7-day free trial, no card required.</p>
                    </div>
                    <br/>
                    <button 
                       onClick={() => {
                         if (isLoggedIn && onBack) {
                           onBack();
                         } else {
                           setShowLogin(true);
                         }
                       }}
                       className="bg-[#25D366] text-white px-12 py-6 rounded-full font-black text-2xl shadow-sm hover:shadow-sm hover:scale-105 transition-all duration-300 flex items-center justify-center gap-3 mx-auto"
                    >
                       {isLoggedIn ? 'Go to Dashboard' : 'Start 7-day free trial'} <ArrowRight className="w-6 h-6"/>
                    </button>
                 </div>
              </section>
              </div>
            </>
              )}

              {activePage === 'pricing' && (
                <PricingPage
                  onStart={() => {
                    if (isLoggedIn && onBack) onBack();
                    else {
                      setShowLogin(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                />
              )}

              {activePage === 'features' && (
                <FeaturesPage
                  onShowHome={() => navigateToPublicPath('/')}
                  onShowPricing={() => navigateToPublicPath('/pricing')}
                  onStartTrial={() => {
                    if (isLoggedIn && onBack) {
                      onBack();
                    } else {
                      setShowLogin(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  primaryCtaLabel={isLoggedIn ? 'Go to Dashboard' : 'Start Trial'}
                />
              )}

              {activePage === 'integrations' && (
                <PublicIntegrationsPage
                  onStartTrial={() => {
                    if (isLoggedIn && onBack) {
                      onBack();
                    } else {
                      setShowLogin(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  onShowHome={() => navigateToPublicPath('/')}
                  onShowPricing={() => navigateToPublicPath('/pricing')}
                  onShowFeatures={() => navigateToPublicPath('/features')}
                  onShowDocs={() => navigateToPublicPath('/docs')}
                  primaryCtaLabel={isLoggedIn ? 'Go to Dashboard' : 'Start Free'}
                />
              )}

              {activePage === 'blog' && (
                isBlogPath(window.location.pathname) && currentBlogPost ? (
                  <BlogArticlePage
                    post={currentBlogPost}
                    isLoggedIn={isLoggedIn}
                    onPrimaryAction={() => {
                      if (isLoggedIn && onBack) {
                        onBack();
                      } else {
                        setShowLogin(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                  />
                ) : isBlogPath(window.location.pathname) && !currentBlogPost && window.location.pathname.replace(/\/+$/, '') !== '/blog' ? (
                  <BlogNotFoundPage />
                ) : (
                  <BlogLandingPage
                    isLoggedIn={isLoggedIn}
                    onPrimaryAction={() => {
                      if (isLoggedIn && onBack) {
                        onBack();
                      } else {
                        setShowLogin(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                  />
                )
              )}

              {activePage === 'solution' && (
                isSeoLandingPagePath(window.location.pathname) && currentLandingPage ? (
                  <SeoLandingPage
                    page={currentLandingPage}
                    isLoggedIn={isLoggedIn}
                    onPrimaryAction={() => {
                      if (isLoggedIn && onBack) {
                        onBack();
                      } else {
                        setShowLogin(true);
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }
                    }}
                  />
                ) : (
                  <BlogNotFoundPage />
                )
              )}


              {activePage === 'about' && (
            <div className="animate-fade-in w-full">
              {/* Animation Styles specifically for About Page */}
              <style dangerouslySetInnerHTML={{__html: `
                @keyframes spinSlow {
                  from { transform: rotate(0deg); }
                  to { transform: rotate(360deg); }
                }
                .animate-spin-slow {
                  animation: spinSlow 60s linear infinite;
                }
                @keyframes floatAbout {
                  0% { transform: translateY(0px) rotate(0deg); }
                  50% { transform: translateY(-20px) rotate(2deg); }
                  100% { transform: translateY(0px) rotate(0deg); }
                }
                .animate-float-about {
                  animation: floatAbout 8s ease-in-out infinite;
                }
                @keyframes typeWriter {
                  from { width: 0%; opacity: 0; }
                  1% { opacity: 1; }
                  to { width: 100%; opacity: 1; }
                }
                .typing-text {
                  display: inline-block;
                  overflow: hidden;
                  white-space: pre-wrap;
                  border-right: 0.15em solid #25D366;
                  width: 0;
                  opacity: 0;
                  animation: typeWriter 3s steps(40, end) forwards, blinkCursor .75s step-end infinite;
                  animation-play-state: paused;
                }
                .reveal .typing-text {
                  animation-play-state: running;
                }
                @keyframes blinkCursor {
                  from, to { border-color: transparent }
                  50% { border-color: #25D366; }
                }
              `}} />

              {/* 3. Hero Section: The Mission */}
              <section className="reveal py-32 px-6 relative overflow-hidden flex items-center min-h-[70vh] border-b border-gray-200 dark:border-white/5 transition-colors duration-300">
                <div className="absolute inset-0 flex justify-center items-center pointer-events-none opacity-10 dark:opacity-10 transition-opacity">
                   <Globe strokeWidth={0.5} className="w-[800px] h-[800px] text-[#25D366] animate-spin-slow" />
                </div>
                <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#25D366]/5 via-transparent to-transparent pointer-events-none"></div>
                <div className="max-w-5xl mx-auto text-center relative z-10 w-full">
                  <span className="inline-block py-1.5 px-4 rounded-full bg-[#FFFF00]/10 border border-[#FFFF00]/30 text-yellow-600 dark:text-[#FFFF00] text-sm font-black uppercase tracking-widest mb-8 transition-colors duration-300 shadow-sm">
                    ⚡ Our Mission
                  </span>
                  <h1 className="text-5xl md:text-7xl font-black text-gray-900 dark:text-white tracking-tight leading-tight mb-8 transition-colors duration-300 drop-shadow-sm">
                    Engineering the Future of <br className="hidden md:block"/> Conversational Commerce.
                  </h1>
                  <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 font-medium leading-relaxed max-w-4xl mx-auto transition-colors duration-300">
                    We believe that scaling an e-commerce business shouldn't mean hiring an army of agents. We build intelligent infrastructure to make zero-touch fulfillment a reality.
                  </p>
                </div>
              </section>

              {/* 4. Our Story / Origins */}
              <section className="reveal py-32 px-6 max-w-7xl mx-auto relative flex items-center">
                <div className="grid lg:grid-cols-2 gap-16 items-center">
                  <div className="text-left">
                    <h2 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-tight mb-8 transition-colors duration-300">
                      Born from the Need for True Automation.
                    </h2>
                    <div className="space-y-6 text-lg text-gray-600 dark:text-gray-400 font-medium leading-relaxed transition-colors duration-300">
                      <p>
                        Current chatbots are rigid and robotic. E-commerce brands needed a system that actually understands human nuance, processes voice notes naturally, and connects chat to fulfillment without manual data entry.
                      </p>
                      <p>
                        Black Arrow was engineered from the ground up to solve these exact bottlenecks, creating a seamless bridge between customer chat and courier dispatch.
                      </p>
                    </div>
                  </div>
                  <div className="relative h-[400px] flex items-center justify-center">
                    {/* Abstract glassmorphic timeline/cards */}
                    <div className="absolute w-[80%] h-[200px] bg-white/60 dark:bg-white/5 backdrop-blur-2xl rounded-3xl border border-gray-200 dark:border-white/10 shadow-sm animate-float-about z-20 left-10 p-6 flex flex-col justify-center transition-colors duration-300">
                      <div className="w-10 h-10 bg-[#25D366]/20 rounded-full flex items-center justify-center text-[#25D366] mb-4">
                        <Mic className="w-5 h-5"/>
                      </div>
                      <div className="h-4 w-3/4 bg-gray-200 dark:bg-white/10 rounded mb-2"></div>
                      <div className="h-4 w-1/2 bg-gray-200 dark:bg-white/10 rounded"></div>
                    </div>
                    <div className="absolute w-[80%] h-[200px] bg-[#25D366]/10 dark:bg-[#25D366]/10 backdrop-blur-3xl rounded-3xl border border-[#25D366]/30 shadow-sm animate-float-about z-10 right-0 top-10 p-6 flex flex-col justify-center" style={{ animationDelay: '1s' }}>
                      <div className="w-10 h-10 bg-[#25D366] rounded-full flex items-center justify-center text-white mb-4 shadow-sm">
                        <Package className="w-5 h-5"/>
                      </div>
                      <div className="h-4 w-full bg-white/50 dark:bg-white/20 rounded mb-2"></div>
                      <div className="h-4 w-2/3 bg-white/50 dark:bg-white/20 rounded"></div>
                    </div>
                  </div>
                </div>
              </section>

              {/* 5. Core Values */}
              <section className="reveal py-24 max-w-7xl mx-auto px-6 border-t border-gray-200 dark:border-white/5 transition-colors duration-300">
                <div className="grid md:grid-cols-3 gap-8">
                  {/* Card 1 */}
                  <div className="bento-card bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-[#25D366]/0 hover:border-[#25D366] transition-all duration-300 group shadow-sm overflow-hidden relative">
                    <div className="absolute inset-0 bg-[#25D366]/0 group-hover:bg-[#25D366]/5 transition-colors pointer-events-none"></div>
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-black/50 flex items-center justify-center text-gray-900 dark:text-white mb-8 group-hover:text-[#25D366] group-hover:shadow-sm transition-all shadow-sm">
                      <Cpu className="w-8 h-8" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-4 relative z-10 transition-colors duration-300">Uncompromising Intelligence.</h3>
                    <p className="text-lg text-gray-600 dark:text-gray-400 font-medium leading-relaxed relative z-10">No hallucinations. Our AI is strictly gated by your product catalog and custom instructions.</p>
                  </div>
                  
                  {/* Card 2 */}
                  <div className="bento-card bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-[#25D366]/0 hover:border-[#25D366] transition-all duration-300 group shadow-sm overflow-hidden relative">
                    <div className="absolute inset-0 bg-[#25D366]/0 group-hover:bg-[#25D366]/5 transition-colors pointer-events-none"></div>
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-black/50 flex items-center justify-center text-gray-900 dark:text-white mb-8 group-hover:text-[#25D366] group-hover:shadow-sm transition-all shadow-sm">
                      <Route className="w-8 h-8" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-4 relative z-10 transition-colors duration-300">Zero-Touch Sync.</h3>
                    <p className="text-lg text-gray-600 dark:text-gray-400 font-medium leading-relaxed relative z-10">Native order extraction and supported courier integrations keep fulfillment fast without extra manual handoffs.</p>
                  </div>

                  {/* Card 3 */}
                  <div className="bento-card bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-[#25D366]/0 hover:border-[#25D366] transition-all duration-300 group shadow-sm overflow-hidden relative">
                    <div className="absolute inset-0 bg-[#25D366]/0 group-hover:bg-[#25D366]/5 transition-colors pointer-events-none"></div>
                    <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-black/50 flex items-center justify-center text-gray-900 dark:text-white mb-8 group-hover:text-[#25D366] group-hover:shadow-sm transition-all shadow-sm">
                      <Shield className="w-8 h-8" strokeWidth={1.5} />
                    </div>
                    <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-4 relative z-10 transition-colors duration-300">Built for Volume.</h3>
                    <p className="text-lg text-gray-600 dark:text-gray-400 font-medium leading-relaxed relative z-10">Master-level proxy rotation and anti-ban architectures keep your multi-instance fleets online 24/7.</p>
                  </div>
                </div>
              </section>

              {/* 6. Leadership & Engineering */}
              <section className="reveal py-32 px-6 max-w-5xl mx-auto text-center border-t border-gray-200 dark:border-white/5 transition-colors duration-300">
                 <h2 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight mb-12">The Architects Behind the Engine.</h2>
                 <div className="bg-white/60 dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 p-12 rounded-[3rem] shadow-sm text-left transition-colors duration-300 hover:shadow-sm transition-shadow">
                   <p className="text-xl text-gray-700 dark:text-gray-300 font-medium leading-relaxed mb-6">
                     Black Arrow was conceptualized and built under the umbrella of Firdosi Digital. Founded by Ahad Firdosi, a specialist in advanced automated bot development, the platform is driven by a deep expertise in high-volume system architecture.
                   </p>
                   <p className="text-xl text-gray-700 dark:text-gray-300 font-medium leading-relaxed">
                     Built for international teams, our engineering focus is enterprise-grade conversational AI for fast-moving commerce and service operations.
                   </p>
                 </div>
              </section>

              {/* 7. The Technology Stack */}
              <section className="reveal py-32 px-6 max-w-6xl mx-auto border-t border-gray-200 dark:border-white/5 transition-colors duration-300">
                <div className="bg-[#1e1e1e] rounded-xl overflow-hidden shadow-sm border border-[#333] font-mono text-sm max-w-3xl mx-auto">
                   <div className="bg-[#2d2d2d] px-4 py-3 flex items-center gap-3 border-b border-[#333]">
                      <div className="flex gap-2">
                         <div className="w-3 h-3 rounded-full bg-[#ff5f56]"></div>
                         <div className="w-3 h-3 rounded-full bg-[#ffbd2e]"></div>
                         <div className="w-3 h-3 rounded-full bg-[#27c93f]"></div>
                      </div>
                      <div className="text-gray-400 text-xs font-bold font-sans opacity-80 flex-1 text-center pr-8">system_architecture.json</div>
                   </div>
                   <div className="p-8 overflow-x-auto text-left text-base">
                      <div className="text-gray-300 typing-text">
                        <span className="text-blue-400">{'{'}</span><br/>
                        {'  '}<span className="text-red-400">"Voice_Engine"</span>: <span className="text-green-400">"Native FFmpeg Audio Transcoding"</span>,<br/>
                        {'  '}<span className="text-red-400">"Database"</span>: <span className="text-green-400">"Zero-Loss Merging via Verify-Live-DB"</span>,<br/>
                        {'  '}<span className="text-red-400">"Proxy_Network"</span>: <span className="text-green-400">"Automated Webshare Rotation"</span>,<br/>
                        {'  '}<span className="text-red-400">"Courier_API"</span>: [<span className="text-green-400">"Supported_Courier"</span>, <span className="text-green-400">"Order_Sync"</span>]<br/>
                        <span className="text-blue-400">{'}'}</span>
                      </div>
                   </div>
                </div>
              </section>

              {/* 8. Final CTA */}
              <section className="reveal py-32 text-center relative overflow-hidden transition-colors duration-300 border-t border-gray-200 dark:border-white/5 bg-gray-50 dark:bg-black">
                 <div className="absolute inset-0 z-0 flex items-center justify-center">
                    <div className="absolute w-[100vw] h-[100vh] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#25D366]/5 via-transparent to-transparent opacity-80 pointer-events-none mix-blend-screen" />
                 </div>
                 <div className="max-w-4xl mx-auto px-6 relative z-10">
                    <h2 className="text-4xl md:text-6xl font-black tracking-tight leading-tight mb-10 text-gray-900 dark:text-white">
                       Join the thousands of brands automating their growth.
                    </h2>
                    <button 
                       onClick={() => {
                         if (isLoggedIn && onBack) {
                           onBack();
                         } else {
                           setShowLogin(true);
                         }
                       }}
                       className="bg-[#25D366] text-white px-12 py-6 rounded-full font-black text-2xl shadow-sm hover:shadow-sm hover:scale-105 transition-all duration-300 flex items-center justify-center gap-3 mx-auto"
                    >
                       Start 7-day free trial <ArrowRight className="w-6 h-6"/>
                    </button>
                 </div>
              </section>
            </div>
          )}


          {activePage === 'contact' && (
            <div className="w-full flex-col flex items-center reveal transition-colors duration-300">
              {/* Hero Section */}
              <section className="w-full relative py-20 px-6 md:py-32 flex flex-col items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black pointer-events-none z-0 hidden dark:block"></div>
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white pointer-events-none z-0 block dark:hidden"></div>
                <div className="relative z-10 text-center max-w-3xl mx-auto flex flex-col items-center mt-10">
                   <h1 className="text-4xl md:text-6xl font-black mb-6 text-gray-900 dark:text-white tracking-tight">Let's Scale Your Operations.</h1>
                   <p className="text-xl md:text-2xl text-gray-600 dark:text-gray-400 font-medium leading-relaxed">
                     Get in touch with our sales team to discuss enterprise infrastructure, custom API limits, or general support.
                   </p>
                </div>
              </section>

              {/* Main Content Area */}
              <section className="w-full max-w-7xl mx-auto px-6 pb-24 relative z-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
                  {/* Left Column: Direct Channels */}
                  <div className="flex flex-col gap-6">
                    {/* Card 1: WhatsApp */}
                    <div className="bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 p-8 rounded-3xl shadow-sm hover:shadow-[0_0_20px_rgba(37,211,102,0.15)] hover:border-[#25D366] hover:-translate-y-1 transition-all duration-300 group">
                      <div className="w-14 h-14 bg-[#25D366]/10 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <MessageSquare className="w-7 h-7 text-[#25D366]" />
                      </div>
                      <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Chat with Sales</h3>
                      <p className="text-gray-500 dark:text-gray-400 font-medium mb-6">Fastest response time. Talk directly with our implementation team.</p>
                      <a href="https://wa.me/923136923129" target="_blank" rel="noopener noreferrer" className="inline-flex items-center text-xl text-[#25D366] font-black hover:opacity-80 transition-opacity">
                        +92 313 6923129
                      </a>
                    </div>

                    {/* Card 2: Email */}
                    <div className="bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 p-8 rounded-3xl shadow-sm hover:shadow-[0_0_20px_rgba(37,211,102,0.15)] hover:border-[#25D366] hover:-translate-y-1 transition-all duration-300 group">
                      <div className="w-14 h-14 bg-gray-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <Mail className="w-7 h-7 text-gray-700 dark:text-gray-300 group-hover:text-[#25D366] transition-colors" />
                      </div>
                      <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Email Us</h3>
                      <p className="text-gray-500 dark:text-gray-400 font-medium mb-6">For billing inquiries, technical support, or API documentation.</p>
                      <a href="mailto:contact-086473cbd844@example.invalid" className="inline-flex items-center text-xl text-gray-900 dark:text-white font-black hover:text-[#25D366] transition-colors">
                        contact-086473cbd844@example.invalid
                      </a>
                    </div>

                    {/* Card 3: Headquarters */}
                    <div className="bg-white/50 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 p-8 rounded-3xl shadow-sm hover:shadow-[0_0_20px_rgba(37,211,102,0.15)] hover:border-[#25D366] hover:-translate-y-1 transition-all duration-300 group">
                      <div className="w-14 h-14 bg-gray-100 dark:bg-white/5 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
                        <MapPin className="w-7 h-7 text-gray-700 dark:text-gray-300 group-hover:text-[#25D366] transition-colors" />
                      </div>
                      <h3 className="text-2xl font-black text-gray-900 dark:text-white mb-2">Firdosi Digital</h3>
                      <p className="text-gray-500 dark:text-gray-400 font-medium text-lg">Remote-first international support.</p>
                    </div>
                  </div>

                  {/* Right Column: Direct Inquiry Form */}
                  <div className="bg-white/50 dark:bg-white/5 backdrop-blur-3xl border border-gray-200 dark:border-white/10 p-8 md:p-10 rounded-3xl shadow-sm h-fit">
                    <h2 className="text-3xl font-black text-gray-900 dark:text-white mb-8 tracking-tight">Send a Message</h2>
                    <form className="flex flex-col gap-8" onSubmit={handleContactSubmit} noValidate>
                      <div>
                        <input type="text" required maxLength={80} value={contactForm.name} onChange={(e) => handleContactFormChange('name', e.target.value)} placeholder="Full Name" className="w-full bg-transparent border-0 border-b border-gray-300 dark:border-white/20 p-2 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-500 focus:ring-0 focus:border-[#25D366] transition-colors outline-none font-medium" />
                      </div>
                      <div>
                        <input type="email" required maxLength={120} value={contactForm.email} onChange={(e) => handleContactFormChange('email', e.target.value)} placeholder="Email Address" className="w-full bg-transparent border-0 border-b border-gray-300 dark:border-white/20 p-2 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-500 focus:ring-0 focus:border-[#25D366] transition-colors outline-none font-medium" />
                      </div>
                      <div>
                        <input type="text" required maxLength={40} value={contactForm.phone} onChange={(e) => handleContactFormChange('phone', e.target.value)} placeholder="WhatsApp / Phone Number" className="w-full bg-transparent border-0 border-b border-gray-300 dark:border-white/20 p-2 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-500 focus:ring-0 focus:border-[#25D366] transition-colors outline-none font-medium" />
                      </div>
                      <div>
                        <input type="text" maxLength={120} value={contactForm.company} onChange={(e) => handleContactFormChange('company', e.target.value)} placeholder="Company / Business Name" className="w-full bg-transparent border-0 border-b border-gray-300 dark:border-white/20 p-2 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-500 focus:ring-0 focus:border-[#25D366] transition-colors outline-none font-medium" />
                      </div>
                      <div>
                        <textarea required minLength={10} maxLength={1200} value={contactForm.message} onChange={(e) => handleContactFormChange('message', e.target.value)} placeholder="How can we help?" rows={4} className="w-full bg-transparent border-0 border-b border-gray-300 dark:border-white/20 p-2 text-gray-900 dark:text-white placeholder:text-gray-500 dark:placeholder:text-gray-500 focus:ring-0 focus:border-[#25D366] transition-colors outline-none font-medium resize-none"></textarea>
                      </div>
                      <div className="hidden" aria-hidden="true">
                        <label htmlFor="contact-website">Website</label>
                        <input id="contact-website" type="text" tabIndex={-1} autoComplete="off" value={contactForm.website} onChange={(e) => handleContactFormChange('website', e.target.value)} />
                      </div>
                      {contactStatus ? (
                        <div className={`rounded-2xl px-4 py-3 text-sm ${contactStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-50 text-red-600 dark:bg-red-950/35 dark:text-red-300'}`}>
                          {contactStatus.message}
                        </div>
                      ) : null}
                      <button type="submit" disabled={contactSubmitting} className="bg-[#25D366] text-white font-black text-xl py-5 rounded-2xl hover:scale-105 transition-transform duration-300 shadow-lg shadow-[#25D366]/20 w-full mt-4 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100">
                        {contactSubmitting ? 'Sending...' : 'Send Message'}
                      </button>
                    </form>
                  </div>
                </div>
              </section>
            </div>
          )}

          {activePage === 'documentation' && <HelpDocs />}

          {activePage === 'tos' && (
            <div className="animate-fade-in w-full pb-32">
              {/* 2. Hero Section */}
              <section className="reveal py-24 px-6 relative overflow-hidden flex items-center border-b border-gray-200 dark:border-white/5 transition-colors duration-300 bg-gray-50 dark:bg-black">
                 <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#25D366]/10 via-transparent to-transparent pointer-events-none"></div>
                 <div className="max-w-4xl mx-auto text-center relative z-10 w-full bg-white/60 dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 p-12 rounded-3xl shadow-sm">
                   <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-tight mb-4 transition-colors duration-300">
                     Terms of Service
                   </h1>
                   <p className="text-lg text-[#25D366] font-bold tracking-widest uppercase">
                     Last Updated: May 2026
                   </p>
                 </div>
              </section>
              
              {/* 3. Content Container */}
              <section className="reveal py-16 px-6 max-w-7xl mx-auto flex flex-col lg:flex-row gap-12 relative items-start">
                 {/* Left Sidebar (Sticky) */}
                 <div className="w-full lg:w-1/4 sticky top-32 bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 p-6 rounded-2xl shadow-sm hidden lg:block">
                    <h3 className="text-lg font-black text-gray-900 dark:text-white mb-6 uppercase tracking-widest border-b border-gray-200 dark:border-white/10 pb-4">Table of Contents</h3>
                    <ul className="space-y-4 text-sm font-bold text-gray-600 dark:text-gray-400">
                       <li><a href="#tos-1" onClick={(e) => { e.preventDefault(); document.getElementById('tos-1')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">1. Acceptance of Terms</a></li>
                       <li><a href="#tos-2" onClick={(e) => { e.preventDefault(); document.getElementById('tos-2')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">2. Service Description</a></li>
                       <li><a href="#tos-3" onClick={(e) => { e.preventDefault(); document.getElementById('tos-3')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">3. Account Registration & Billing</a></li>
                       <li><a href="#tos-4" onClick={(e) => { e.preventDefault(); document.getElementById('tos-4')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">4. Acceptable Use</a></li>
                       <li><a href="#tos-5" onClick={(e) => { e.preventDefault(); document.getElementById('tos-5')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">5. Data Processing</a></li>
                       <li><a href="#tos-6" onClick={(e) => { e.preventDefault(); document.getElementById('tos-6')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">6. Service Availability</a></li>
                       <li><a href="#tos-7" onClick={(e) => { e.preventDefault(); document.getElementById('tos-7')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">7. Termination</a></li>
                       <li><a href="#tos-8" onClick={(e) => { e.preventDefault(); document.getElementById('tos-8')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">8. Governing Law</a></li>
                    </ul>
                 </div>
                 
                 {/* Right Column (Main Content) */}
                 <div className="w-full lg:w-3/4 bg-white/80 dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 p-8 md:p-12 rounded-[2rem] shadow-sm text-gray-700 dark:text-gray-300 font-medium leading-[1.8] space-y-10">
                    <div id="tos-1" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">1. Acceptance of Terms</h2>
                       <p>By accessing or using Black Arrow ("Platform", "we", "us"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Platform. We reserve the right to update these terms at any time.</p>
                    </div>
                    <div id="tos-2" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">2. Service Description</h2>
                       <p>Black Arrow provides an automated WhatsApp conversational agent, order extraction infrastructure, and direct API integrations with third-party logistics providers (PostEx and Leopards Courier). We are an independent infrastructure provider and are not affiliated with Meta Platforms, Inc. or WhatsApp.</p>
                    </div>
                    <div id="tos-3" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">3. Account Registration & Wallet Billing</h2>
                       <ul className="list-disc pl-6 space-y-3 mt-4">
                          <li><strong className="text-gray-900 dark:text-white">Subscriptions:</strong> You must maintain an active subscription tier (Starter, Growth, or Pro) to access base instances and product limits.</li>
                          <li><strong className="text-gray-900 dark:text-white">Wallet System:</strong> BlackArrow uses a Pay-As-You-Go pre-paid wallet for AI usage and paid outgoing automation sends. AI replies, voice processing, sequence/template sends, and Media Group file sends can deduct micro-charges from your balance.</li>
                          <li><strong className="text-gray-900 dark:text-white">Non-Refundable:</strong> All wallet top-ups and subscription payments are final and non-refundable, including in the event of account suspension.</li>
                       </ul>
                    </div>
                    <div id="tos-4" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">4. Acceptable Use & Meta Compliance</h2>
                       <p className="mb-4">You are solely responsible for the content transmitted through your connected WhatsApp instances. You agree to:</p>
                       <ul className="list-disc pl-6 space-y-3">
                          <li>Comply with all local laws and Meta's official WhatsApp Commerce and Messaging Policies.</li>
                          <li>Not use the Platform to send unsolicited spam, illegal content, or deceptive marketing.</li>
                          <li>Acknowledge that while Black Arrow provides proxy rotation to minimize connection flags, <strong className="text-[#25D366]">we do not guarantee immunity from WhatsApp number bans</strong>. Meta retains the ultimate authority over active numbers. Banned numbers are the sole responsibility of the user.</li>
                       </ul>
                    </div>
                    <div id="tos-5" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">5. Data Processing & Third-Party Logistics</h2>
                       <ul className="list-disc pl-6 space-y-3 mt-4">
                          <li><strong className="text-gray-900 dark:text-white">Courier Integrations:</strong> Black Arrow transmits extracted customer data (Name, Phone, Address) directly to PostEx or Leopards Courier based on your connected API credentials. We are not liable for courier delays, failed deliveries, or API outages from these third parties.</li>
                          <li><strong className="text-gray-900 dark:text-white">Data Ownership:</strong> You retain all rights to your customer CRM data. We claim no ownership over your leads.</li>
                       </ul>
                    </div>
                    <div id="tos-6" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">6. Service Availability & Support</h2>
                       <p>We strive for 99.9% uptime, but the Platform is provided on an "as is" and "as available" basis. We are not liable for business losses incurred during temporary system downtimes, AI hallucinations, or missed order extractions.</p>
                    </div>
                    <div id="tos-7" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">7. Termination</h2>
                       <p>We reserve the right to suspend or terminate your access to the Platform instantly, without notice or refund, if we determine you have violated these Terms (e.g., using the platform for illegal activities or malicious spam).</p>
                    </div>
                    <div id="tos-8" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">8. Governing Law</h2>
                       <p>These terms shall be governed by and construed in accordance with the laws of Pakistan. Any disputes arising under these terms will be subject to the exclusive jurisdiction of the courts in Lahore.</p>
                    </div>
                 </div>
              </section>
            </div>
          )}
          {activePage === 'privacy' && (
            <div className="animate-fade-in w-full pb-32">
              {/* Hero Section */}
              <section className="reveal py-24 px-6 relative overflow-hidden flex items-center border-b border-gray-200 dark:border-white/5 transition-colors duration-300 bg-gray-50 dark:bg-black">
                 <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#25D366]/10 via-transparent to-transparent pointer-events-none"></div>
                 <div className="max-w-4xl mx-auto text-center relative z-10 w-full bg-white/60 dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 p-12 rounded-3xl shadow-sm">
                   <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-tight mb-4 transition-colors duration-300">
                     Privacy Policy
                   </h1>
                   <p className="text-lg text-[#25D366] font-bold tracking-widest uppercase">
                     Last Updated: May 2026
                   </p>
                 </div>
              </section>
              
              {/* Content Container */}
              <section className="reveal py-16 px-6 max-w-7xl mx-auto flex flex-col lg:flex-row gap-12 relative items-start">
                 {/* Left Sidebar (Sticky) */}
                 <div className="w-full lg:w-1/4 sticky top-32 bg-white/60 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 p-6 rounded-2xl shadow-sm hidden lg:block">
                    <h3 className="text-lg font-black text-gray-900 dark:text-white mb-6 uppercase tracking-widest border-b border-gray-200 dark:border-white/10 pb-4">Table of Contents</h3>
                    <ul className="space-y-4 text-sm font-bold text-gray-600 dark:text-gray-400">
                       <li><a href="#privacy-1" onClick={(e) => { e.preventDefault(); document.getElementById('privacy-1')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">1. Introduction</a></li>
                       <li><a href="#privacy-2" onClick={(e) => { e.preventDefault(); document.getElementById('privacy-2')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">2. Information We Collect</a></li>
                       <li><a href="#privacy-3" onClick={(e) => { e.preventDefault(); document.getElementById('privacy-3')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">3. How We Use Your Information</a></li>
                       <li><a href="#privacy-4" onClick={(e) => { e.preventDefault(); document.getElementById('privacy-4')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">4. Data Processing & Sharing</a></li>
                       <li><a href="#privacy-5" onClick={(e) => { e.preventDefault(); document.getElementById('privacy-5')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">5. Data Security & Retention</a></li>
                       <li><a href="#privacy-6" onClick={(e) => { e.preventDefault(); document.getElementById('privacy-6')?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">6. Contact Information</a></li>
                    </ul>
                 </div>
                 
                 {/* Right Column (Main Content) */}
                 <div className="w-full lg:w-3/4 bg-white/80 dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 p-8 md:p-12 rounded-[2rem] shadow-sm text-gray-700 dark:text-gray-300 font-medium leading-[1.8] space-y-10">
                    <div id="privacy-1" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">1. Introduction</h2>
                       <p>At Black Arrow, we take your privacy and the security of your customer data seriously. This Privacy Policy explains how we collect, use, process, and protect information when you use our WhatsApp automation and order fulfillment platform.</p>
                    </div>
                    
                    <div id="privacy-2" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">2. Information We Collect</h2>
                       <p className="mb-4">To provide our infrastructure, we collect the following types of data:</p>
                       <ul className="list-disc pl-6 space-y-3">
                          <li><strong className="text-gray-900 dark:text-white">Account Information:</strong> Name, email address, phone number, and authentication details (e.g., Google OAuth or OTP data) used to create your Black Arrow account.</li>
                          <li><strong className="text-gray-900 dark:text-white">Connected Accounts Data:</strong> API keys and tokens you provide for your courier accounts (PostEx, Leopards Courier) to enable auto-fulfillment.</li>
                          <li><strong className="text-gray-900 dark:text-white">Conversational Data:</strong> Text messages, voice notes, and media transmitted through your connected WhatsApp instances.</li>
                          <li><strong className="text-gray-900 dark:text-white">Extracted Customer Leads:</strong> Names, shipping addresses, phone numbers, and product interests automatically extracted by the AI from your customer chats.</li>
                       </ul>
                    </div>

                    <div id="privacy-3" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">3. How We Use Your Information</h2>
                       <p className="mb-4">We use the collected data strictly to operate and improve the Black Arrow service. This includes:</p>
                       <ul className="list-disc pl-6 space-y-3">
                          <li>Processing incoming WhatsApp messages and generating intelligent text or audio responses.</li>
                          <li>Automatically extracting shipping data to generate live tracking codes.</li>
                          <li>Calculating AI and paid automation usage to deduct appropriate micro-charges from your prepaid wallet.</li>
                          <li>Training your specific bot instance through the "Learned Knowledge Base" when you utilize the human-handoff feature.</li>
                       </ul>
                    </div>

                    <div id="privacy-4" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">4. Data Processing & Third-Party Sharing</h2>
                       <p className="mb-4">We do not sell your data or your customers' data to third-party advertisers. We only share data with necessary infrastructure partners:</p>
                       <ul className="list-disc pl-6 space-y-3">
                          <li><strong className="text-gray-900 dark:text-white">Logistics Providers:</strong> Extracted order data is pushed directly to PostEx or Leopards Courier APIs strictly for fulfillment purposes.</li>
                          <li><strong className="text-gray-900 dark:text-white">AI Processing:</strong> To understand context and generate responses, conversational data is securely processed natively through Google's Gemini API, which serves as the core intelligence engine for the platform.</li>
                          <li><strong className="text-gray-900 dark:text-white">Proxy Networks:</strong> To maintain connection stability, IP routing data is managed through our integrated Webshare proxy networks.</li>
                       </ul>
                    </div>

                    <div id="privacy-5" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">5. Data Security & Retention</h2>
                       <p>We implement enterprise-grade security measures, including 2FA requirements and secure database merging architectures, to protect your data against unauthorized access. We retain conversational and order data in your centralized CRM dashboard as long as your account remains active. You may export or delete your lead data at any time via the dashboard.</p>
                    </div>

                    <div id="privacy-6" className="scroll-mt-32 group">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 group-hover:text-[#25D366] transition-colors">6. Contact Information</h2>
                       <p className="mb-4">If you have questions regarding this Privacy Policy or how your data is handled, please reach out to us.</p>
                       <ul className="space-y-2 mt-4 font-bold">
                          <li><strong className="text-gray-900 dark:text-white">Operated By:</strong> Firdosi Digital</li>
                          <li><strong className="text-gray-900 dark:text-white">Location:</strong> Remote-first international support</li>
                          <li><strong className="text-gray-900 dark:text-white">Contact Email:</strong> contact-8c899f100007@example.invalid</li>
                       </ul>
                    </div>
                 </div>
              </section>
            </div>
          )}

          {activePage === 'disclaimer' && (
            <div className="animate-fade-in w-full pb-32">
              <section className="reveal py-24 px-6 relative overflow-hidden flex items-center border-b border-gray-200 dark:border-white/5 transition-colors duration-300 bg-gray-50 dark:bg-black">
                 <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#25D366]/10 via-transparent to-transparent pointer-events-none"></div>
                 <div className="max-w-4xl mx-auto text-center relative z-10 w-full">
                   <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-amber-500/20">
                     <AlertTriangle className="w-8 h-8 text-amber-500" />
                   </div>
                   <p className="text-lg text-[#25D366] font-bold tracking-widest uppercase mb-4">Important Notice</p>
                   <h1 className="text-4xl md:text-5xl font-black text-gray-900 dark:text-white tracking-tight leading-tight mb-6 transition-colors duration-300">
                     Platform Disclaimer
                   </h1>
                   <p className="text-xl text-gray-600 dark:text-gray-400 font-medium max-w-3xl mx-auto">
                     Last Updated: May 16, 2026. Please read this notice carefully before using WhatsApp automation, AI replies, courier integrations, and template forwarding.
                   </p>
                 </div>
              </section>
              <section className="reveal py-16 px-6 max-w-7xl mx-auto flex flex-col lg:flex-row gap-12 relative items-start">
                 <aside className="w-full lg:w-1/4 lg:sticky lg:top-32 bg-white/70 dark:bg-white/5 backdrop-blur-xl border border-gray-200 dark:border-white/10 p-6 rounded-2xl shadow-sm">
                    <h3 className="text-lg font-black text-gray-900 dark:text-white mb-6 uppercase tracking-widest border-b border-gray-200 dark:border-white/10 pb-4">Disclaimer Index</h3>
                    <ul className="space-y-4 text-sm font-bold text-gray-600 dark:text-gray-400">
                       {[
                         ['disc-1', '1. Independent Service'],
                         ['disc-2', '2. WhatsApp Risk'],
                         ['disc-3', '3. AI Limitations'],
                         ['disc-4', '4. Customer and Order Data'],
                         ['disc-5', '5. Third-Party Services'],
                         ['disc-6', '6. Business Outcomes'],
                         ['disc-7', '7. Client Responsibility']
                       ].map(([id, label]) => (
                         <li key={id}>
                           <a href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }); }} className="hover:text-[#25D366] transition-colors block">{label}</a>
                         </li>
                       ))}
                    </ul>
                 </aside>

                 <div className="w-full lg:w-3/4 bg-white/80 dark:bg-white/5 backdrop-blur-2xl border border-gray-200 dark:border-white/10 p-8 md:p-12 rounded-[2rem] shadow-sm text-gray-700 dark:text-gray-300 font-medium leading-[1.8] space-y-10">
                    <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 p-6 rounded-2xl">
                      <h2 className="text-xl font-black text-amber-900 dark:text-amber-200 mb-3 flex items-center gap-2"><Scale className="w-5 h-5" />Important Legal Notice</h2>
                      <p>Black Arrow provides automation infrastructure and AI-assisted workflow tools. It does not replace your legal, compliance, customer support, product, logistics, or business judgment. You remain responsible for how the platform is configured, monitored, and used.</p>
                    </div>

                    <div id="disc-1" className="scroll-mt-32">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">1. Independent Service</h2>
                       <p>Black Arrow is an independent software platform. It is not owned, operated, endorsed, certified, or officially approved by WhatsApp, Meta Platforms, Google, PostEx, Leopards Courier, or any other third-party provider referenced in the application.</p>
                    </div>

                    <div id="disc-2" className="scroll-mt-32">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4 text-red-600 dark:text-red-400">2. WhatsApp Automation Risk</h2>
                       <p>WhatsApp may restrict, flag, disconnect, or ban numbers that use automation, bulk messaging, unofficial connection methods, policy-violating content, or unusual traffic patterns. Black Arrow cannot guarantee that any WhatsApp number will remain active. Clients should use a dedicated business or secondary number and follow WhatsApp policies, consent rules, and applicable messaging laws.</p>
                    </div>

                    <div id="disc-3" className="scroll-mt-32">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">3. AI Limitations</h2>
                       <p>AI-generated replies may be incomplete, inaccurate, delayed, repetitive, or inappropriate for a specific customer situation. The quality of responses depends on your catalog, instructions, training examples, templates, and monitoring. You are responsible for reviewing important conversations and correcting the assistant when needed.</p>
                    </div>

                    <div id="disc-4" className="scroll-mt-32">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">4. Customer and Order Data</h2>
                       <p>The platform may process names, phone numbers, addresses, chat content, order details, media, and delivery information to operate customer support and fulfillment workflows. You are responsible for obtaining any required customer permissions and ensuring that your use of customer data complies with applicable privacy and consumer protection laws.</p>
                    </div>

                    <div id="disc-5" className="scroll-mt-32">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">5. Third-Party Services</h2>
                       <p>Courier APIs, AI providers, hosting infrastructure, proxy services, WhatsApp connectivity, and external payment or logistics systems may experience outages, policy changes, rate limits, pricing changes, or data processing delays. Black Arrow is not responsible for losses caused by third-party availability, decisions, or service changes.</p>
                    </div>

                    <div id="disc-6" className="scroll-mt-32">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">6. Business Outcomes</h2>
                       <p>We do not guarantee sales, revenue, conversion rates, delivery success, customer satisfaction, uninterrupted uptime, or error-free automation. Any examples, demonstrations, or dashboards are illustrative and should not be treated as guaranteed outcomes.</p>
                    </div>

                    <div id="disc-7" className="scroll-mt-32">
                       <h2 className="text-2xl font-black text-gray-900 dark:text-white mb-4">7. Client Responsibility</h2>
                       <p>By using the platform, you agree to configure it lawfully, monitor conversations, keep credentials secure, avoid spam or deceptive messaging, honor customer requests, and maintain backup processes for critical operations. If you do not accept these risks, you should not connect a WhatsApp account or activate automation.</p>
                    </div>
                 </div>
              </section>
            </div>
          )}

        </main>
      </Suspense>



        
        <PublicSiteFooter isDarkMode={!!isDarkMode} />
        <footer className="hidden relative bg-black border-t border-white/5 py-16 px-6 overflow-hidden">
          <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#25D366]/10 via-black to-black pointer-events-none"></div>
          <div className="max-w-7xl mx-auto flex flex-col items-center gap-8 relative z-10 text-center">
            <div className="flex flex-col items-center gap-4">
              <BrandLogo isDarkMode={Boolean(isDarkMode)} imageClassName="h-14 w-auto" />
              <p className="text-sm text-gray-500 font-medium max-w-xl">Client documentation, legal notices, and platform resources for WhatsApp AI automation teams.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 font-bold text-sm">
              <a href="/" className="hover:text-[#25D366] transition-colors inline-block text-gray-400 hover:text-white">Home</a>
              <a href="/features" className="hover:text-[#25D366] transition-colors inline-block text-gray-400 hover:text-white">Features</a>
              <a href="/about" className="hover:text-[#25D366] transition-colors inline-block text-gray-400 hover:text-white">About</a>
              <a href="/contact" className="hover:text-[#25D366] transition-colors inline-block text-gray-400 hover:text-white">Contact Sales</a>
              <a href="/docs" className="hover:text-[#25D366] transition-colors inline-block text-gray-400 hover:text-white">Documentation</a>
              <a href="/terms" className="hover:text-[#25D366] transition-colors inline-block text-gray-400 hover:text-white">Terms of Service</a>
              <a href="/privacy" className="hover:text-[#25D366] transition-colors inline-block text-gray-400 hover:text-white">Privacy Policy</a>
              <a href="/disclaimer" className="hover:text-[#25D366] transition-colors inline-block text-gray-400 hover:text-white">Disclaimer</a>
            </div>
            <div className="text-sm font-medium shrink-0 text-gray-600">
               © 2026 BlackArrow. All rights reserved.
            </div>
          </div>
        </footer>

        {/* Global WhatsApp FAB */}
        <a 
          href="https://wa.me/923136923129" 
          target="_blank" 
          rel="noopener noreferrer"
          className="fixed bottom-6 right-6 w-14 h-14 bg-[#25D366] rounded-full flex items-center justify-center shadow-lg shadow-[#25D366]/40 hover:scale-110 transition-transform duration-300 z-50 group hover:shadow-xl hover:shadow-[#25D366]/50"
          title="Chat with Sales"
        >
          <MessageSquare className="w-7 h-7 text-white" />
          <span className="absolute inline-flex h-full w-full rounded-full bg-[#25D366] opacity-20 group-hover:animate-ping"></span>
        </a>
      </div>
    );  }  return (
    <div className="auth-workspace min-h-screen flex items-center justify-center p-4 relative">
      <SeoHead metadata={currentSeoMetadata} />
      {setIsDarkMode && typeof isDarkMode !== 'undefined' && (
        <button
          onClick={() => setIsDarkMode(!isDarkMode)}
          className="ca-button-icon absolute top-6 right-6 h-11 w-11 rounded-xl"
          title="Toggle Dark Mode"
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      )}
      <div className="ca-auth-panel max-w-md w-full rounded-[var(--ca-radius-panel)] p-8 flex flex-col items-center">
        <div className="flex justify-center mb-6">
          <BrandLogo isDarkMode={Boolean(isDarkMode)} imageClassName="h-16 w-auto" />
        </div>
        
        <h2 className="text-2xl font-black text-center mb-2 text-[var(--ca-text-primary)]">BlackArrow</h2>
        <p className="text-center text-[var(--ca-text-secondary)] mb-8 font-medium">
          {isLogin ? 'Sign in to manage your AI assistant' : 'Create an account to start'}
        </p>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/40 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm mb-6 border border-red-100 dark:border-red-900">
            {error}
          </div>
        )}

        {!isLogin && (
          <div className="w-full mb-4 rounded-2xl border border-[var(--ca-border)] bg-[var(--ca-surface-2)] p-4 space-y-3">
            <p className="text-[11px] font-black uppercase tracking-widest text-[var(--ca-text-muted)]">Required legal confirmation</p>
            <label className="flex items-start gap-3 text-xs text-[var(--ca-text-secondary)] leading-snug cursor-pointer">
              <input
                type="checkbox"
                checked={legalAccepted}
                onChange={(e) => setLegalAccepted(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I have read, understood, and agree to the{' '}
                <a href="/terms" className="text-[var(--ca-brand)] hover:underline font-bold">Terms of Service</a>
                ,{' '}
                <a href="/privacy" className="text-[var(--ca-brand)] hover:underline font-bold">Privacy Policy</a>
                , and{' '}
                <a href="/disclaimer" className="text-[var(--ca-brand)] hover:underline font-bold">Disclaimer</a>,
                including WhatsApp automation, AI, third-party platform, and business outcome risks.
              </span>
            </label>
            <label className="flex items-start gap-3 text-xs text-[var(--ca-text-muted)] leading-snug cursor-pointer border-t border-[var(--ca-border-subtle)] pt-3">
              <input
                type="checkbox"
                checked={marketingOptIn}
                onChange={(e) => setMarketingOptIn(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                I would like to receive onboarding tips, product updates, and promotional messages from Black Arrow by WhatsApp and email. I can opt out at any time.
              </span>
            </label>
          </div>
        )}

        <button
          onClick={handleGoogleAuth}
          disabled={!isLogin && !hasAcceptedLegal}
          className={`w-full bg-[var(--ca-surface-1)] border border-[var(--ca-border)] text-[var(--ca-text-primary)] py-3 rounded-xl font-bold transition-colors flex items-center justify-center gap-3 mb-2 ${isLogin || hasAcceptedLegal ? 'hover:bg-[var(--ca-surface-2)]' : 'opacity-50 cursor-not-allowed'}`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>
        {!isLogin && (
          <p className="w-full text-center text-[11px] text-[var(--ca-text-muted)] font-medium mb-6">
            Please accept Terms, Privacy Policy, and Disclaimer to continue.
          </p>
        )}

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[var(--ca-border)]"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-[var(--ca-surface-1)] text-[var(--ca-text-secondary)]">
               {isLogin ? (
                 <div className="flex gap-4 items-center">
                    <button type="button" onClick={() => setAuthMode('email')} className={`font-bold pb-1 ${authMode === 'email' ? 'text-[var(--ca-text-primary)] border-b-2 border-[var(--ca-brand)]' : 'text-[var(--ca-text-secondary)]'}`}>Email</button>
                    <button type="button" onClick={() => setAuthMode('phone')} className={`font-bold pb-1 ${authMode === 'phone' ? 'text-[var(--ca-text-primary)] border-b-2 border-[var(--ca-brand)]' : 'text-[var(--ca-text-secondary)]'}`}>WhatsApp OTP</button>
                 </div>
               ) : 'Or continue with email / Phone'}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 w-full">
          {!requires2FA && (!isLogin || authMode === 'email') && !isResetPassword && (
            <div className={otpSent && !isLogin ? 'hidden' : 'block'}>
              {!isLogin && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-[var(--ca-text-secondary)] mb-1">Company Name</label>
                  <input 
                    type="text" 
                    required 
                    value={name} 
                    onChange={e => setName(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--ca-border)] bg-[var(--ca-surface-1)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ca-brand)] transition-all"
                    placeholder="Acme Corp"
                  />
                </div>
              )}
              <div className="mb-4">
                  <label className="block text-sm font-medium text-[var(--ca-text-secondary)] mb-1">Email</label>
                  <input 
                    type="email" 
                    required={(!requires2FA && authMode === 'email' && !otpSent) || (!requires2FA && !isLogin && !otpSent)} 
                    value={email} 
                    onChange={e => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--ca-border)] bg-[var(--ca-surface-1)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ca-brand)] transition-all"
                    placeholder="contact-258d8dc916db@example.invalid"
                  />
              </div>
              <div className="mb-4">
                  <label className="block text-sm font-medium text-[var(--ca-text-secondary)] mb-1">Password</label>
                  <input 
                    type="password" 
                    required={(!requires2FA && authMode === 'email' && !otpSent) || (!requires2FA && !isLogin && !otpSent)} 
                    value={password} 
                    onChange={e => setPassword(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-[var(--ca-border)] bg-[var(--ca-surface-1)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ca-brand)] transition-all"
                    placeholder="••••••••"
                  />
                  {!isLogin && password && (
                    <div className="mt-2">
                       <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] font-black uppercase text-[var(--ca-text-muted)] tracking-widest leading-none">Security Strength: <span className="text-[var(--ca-text-secondary)]">{passwordStrength.label}</span></span>
                          <span className="text-[10px] font-bold text-[var(--ca-text-muted)]">{passwordStrength.score}/4</span>
                       </div>
                       <div className="h-1.5 w-full bg-[var(--ca-surface-2)] rounded-full overflow-hidden">
                          <div className={`h-full ${passwordStrength.color} transition-all duration-500`} style={{ width: `${(passwordStrength.score / 4) * 100}%` }}></div>
                       </div>
                       {passwordStrength.score < 3 && (
                          <p className="text-[10px] text-orange-500 font-bold mt-1.5 leading-tight">Pro Tip: Use uppercase, numbers, and symbols for a tougher password!</p>
                       )}
                    </div>
                  )}
              </div>
            </div>
          )}

          {!requires2FA && shouldUsePhoneOtp && (
            <div className={otpSent ? 'hidden' : 'block'}>
              <label className="block text-sm font-medium text-[var(--ca-text-secondary)] mb-1">WhatsApp Number</label>
              <input 
                type="text" 
                required={!requires2FA && shouldUsePhoneOtp && !otpSent}
                value={phone} 
                onChange={e => setPhone(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[var(--ca-border)] bg-[var(--ca-surface-1)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ca-brand)] transition-all"
                placeholder="+92 3XX XXXXXXX"
              />
            </div>
          )}

          {isResetPassword && !otpSent && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-[var(--ca-text-secondary)] mb-1">New Password</label>
              <input 
                type="password" 
                required 
                value={newPassword} 
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[var(--ca-border)] bg-[var(--ca-surface-1)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ca-brand)] transition-all"
                placeholder="••••••••"
              />
            </div>
          )}

          {(!requires2FA && otpSent) && (
             <div className="animate-in fade-in zoom-in duration-300">
               <div className="bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl mb-4 text-center">
                 <Shield className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                 <h4 className="font-bold">Verify WhatsApp OTP</h4>
                 <p className="text-xs">Enter the code sent to {phone}</p>
               </div>
               <input 
                 type="text" 
                 required 
                 value={otp} 
                 onChange={e => setOtp(e.target.value)}
                 className="w-full px-4 py-4 rounded-xl border border-[var(--ca-border)] bg-[var(--ca-surface-1)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ca-brand)] transition-all text-center text-xl tracking-widest font-mono font-bold"
                 placeholder="6-Digit OTP"
               />
               <button type="button" onClick={() => { setOtpSent(false); setOtp(''); }} className="block w-full text-center text-xs text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] mt-4 font-bold">Back</button>
             </div>
          )}
          
          {requires2FA && (
             <div className="animate-in fade-in zoom-in duration-300">
               <div className="bg-emerald-50 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800 p-4 rounded-xl mb-4 text-center">
                 <Shield className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                 <h4 className="font-bold">Two-Factor Authentication</h4>
                 <p className="text-xs">Enter the code from your Authenticator app</p>
               </div>
               <input 
                 type="text" 
                 required 
                 value={totpOtp} 
                 onChange={e => setTotpOtp(e.target.value)}
                 className="w-full px-4 py-4 rounded-xl border border-[var(--ca-border)] bg-[var(--ca-surface-1)] text-[var(--ca-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ca-brand)] transition-all text-center text-xl tracking-widest font-mono font-bold"
                 placeholder="000 000"
               />
               <button type="button" onClick={() => { setRequires2FA(false); setTotpOtp(''); }} className="block w-full text-center text-xs text-[var(--ca-text-muted)] hover:text-[var(--ca-text-primary)] mt-4 font-bold">Back to Login</button>
             </div>
          )}

          <button 
            type="submit" 
            disabled={loading || (!isLogin && !requires2FA && !otpSent && !hasAcceptedLegal)}
            className="w-full bg-[var(--ca-brand)] text-white py-3 rounded-xl font-bold hover:bg-[var(--ca-brand-strong)] transition-colors flex items-center justify-center gap-2 mt-6 disabled:opacity-70"
          >
            {loading ? 'Processing...' : (
               shouldUsePhoneOtp && !otpSent ? 'Send OTP' : (
                 isResetPassword ? 'Reset Password' : (isLogin ? <><LogIn className="w-4 h-4"/> Sign In</> : <><UserPlus className="w-4 h-4"/> {isLocalEmailSignup ? 'Create Account' : 'Verify & Create Account'}</>)
               )
            )}
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-[var(--ca-text-secondary)] space-y-3">
          {isLogin && !requires2FA && (
            <div>
              <button 
                type="button" 
                onClick={() => { setIsResetPassword(!isResetPassword); setOtpSent(false); setOtp(''); }} 
                className="font-bold text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] transition-colors"
              >
                {isResetPassword ? 'Back to Login' : 'Forgot Password?'}
              </button>
            </div>
          )}
          <div className="text-[var(--ca-text-secondary)]">
            {isLogin ? "Don't have an account? " : "Already have an account? "}
            <button 
              type="button" 
              onClick={() => { setIsLogin(!isLogin); setOtpSent(false); setOtp(''); setLegalAccepted(false); setMarketingOptIn(false); }}
              className="font-bold text-[var(--ca-brand)] hover:underline"
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </div>
          <div>
            <button 
              type="button" 
              onClick={() => setShowLogin(false)} 
              className="text-xs text-[var(--ca-text-secondary)] hover:text-[var(--ca-text-primary)] underline underline-offset-2"
            >
              ← Back to homepage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

