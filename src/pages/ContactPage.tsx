import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, HelpCircle, Handshake, MessageSquare } from "lucide-react";
import { CadeLogo } from "@/components/CadeLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const CONTACT_EMAIL = "info@caderunning.com";

const navLinks = [
  { label: "Features", href: "/#features" },
  { label: "Philosophy", href: "/#philosophy" },
  { label: "FAQ", href: "/#faq" },
  { label: "Contact", href: "/contact" },
];

const infoBlocks = [
  {
    icon: HelpCircle,
    title: "Support",
    desc: "Questions about the app, intervals.icu integration, bugs, or account issues. We're here to help.",
  },
  {
    icon: Handshake,
    title: "Partnerships",
    desc: "Coaches, clubs, or teams interested in Cade. Reach out to explore how we can work together.",
  },
  {
    icon: MessageSquare,
    title: "Feedback",
    desc: "Feature requests, ideas, or general feedback. We read every message and use it to improve Cade.",
  },
];

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function handleMailtoSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(`Contact from ${name || "Cade user"}`);
    const body = encodeURIComponent(
      `${message}\n\n---\nFrom: ${name || "(no name)"}\nEmail: ${email || "(no email)"}`
    );
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* ── NAV ─────────────────────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <CadeLogo variant="full" size="xl" />
          </Link>
          <nav className="hidden sm:flex items-center gap-8">
            {navLinks.map(({ label, href }) => (
              <Link
                key={label}
                to={href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            ))}
            <Link
              to="/auth"
              className="text-sm font-medium text-foreground hover:text-primary transition-colors"
            >
              Sign in
            </Link>
          </nav>
          <Link to="/auth">
            <Button size="sm" className="gap-2 rounded-full">
              Get started
            </Button>
          </Link>
        </div>
      </header>

      {/* ── MAIN ────────────────────────────────────────────────────────── */}
      <main className="pt-24 pb-16 px-4 sm:px-6">
        <div className="max-w-[700px] mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold tracking-widest uppercase text-muted-foreground mb-3">
              Get in touch
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
              Contact Us
            </h1>
            <p className="text-lg text-muted-foreground">
              Have a question, partnership idea, or feedback? We'd love to hear from you.
            </p>
          </div>

          {/* Primary contact */}
          <div className="flex flex-col items-center gap-4 mb-16 p-6 rounded-xl bg-muted/30 border border-border">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Mail className="w-5 h-5" />
              <span className="text-sm font-medium">Email us</span>
            </div>
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="text-xl font-semibold text-foreground hover:text-primary transition-colors"
            >
              {CONTACT_EMAIL}
            </a>
            <p className="text-sm text-muted-foreground">
              We typically respond within 24–48 hours.
            </p>
          </div>

          {/* Useful info blocks */}
          <div className="grid gap-6 mb-16">
            {infoBlocks.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex gap-4 p-4 rounded-xl border border-border bg-background"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Contact form (mailto) */}
          <div className="rounded-xl border border-border bg-muted/20 p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-foreground mb-2">Send us a message</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Fill out the form below and we'll open your email client to send your message to{" "}
              <span className="font-medium text-foreground">{CONTACT_EMAIL}</span>.
            </p>
            <form onSubmit={handleMailtoSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="contact-name">Name</Label>
                <Input
                  id="contact-name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-email">Email</Label>
                <Input
                  id="contact-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-message">Message</Label>
                <Textarea
                  id="contact-message"
                  placeholder="How can we help?"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={5}
                  required
                  className="bg-background resize-none"
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto">
                Open email to send
              </Button>
            </form>
          </div>
        </div>
      </main>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="py-6 px-4 sm:px-6 border-t border-border">
        <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CadeLogo variant="full" size="sm" />
            <span>© 2026</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
            <Link to="/auth" className="hover:text-foreground transition-colors">
              Sign in to app
            </Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-foreground transition-colors">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
