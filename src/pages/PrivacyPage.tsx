import { Link } from "react-router-dom";
import { CadeLogo } from "@/components/CadeLogo";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 flex items-center h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <CadeLogo variant="full" size="xl" />
          </Link>
        </div>
      </header>

      <main className="max-w-[760px] mx-auto px-4 sm:px-6 py-16">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: March 22, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Who We Are</h2>
            <p>
              Cade ("we", "us", "our") is an AI-powered running coaching service operated by Franz Baumann.
              If you have any questions about this policy, contact us at{" "}
              <a href="mailto:franzbaumann07@gmail.com" className="text-primary underline underline-offset-2">
                franzbaumann07@gmail.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Data We Collect</h2>
            <p className="mb-3">We collect the following categories of personal data:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">Account data:</strong> Email address, username, and
                authentication credentials when you create an account.
              </li>
              <li>
                <strong className="text-foreground">Training data:</strong> Running activities, heart rate,
                HRV, sleep scores, CTL/ATL/TSB fitness metrics, and other physiological data imported from
                intervals.icu, Garmin, Coros, Apple Watch, or Polar via connected integrations.
              </li>
              <li>
                <strong className="text-foreground">Goal and plan data:</strong> Race goals, training
                philosophy preferences, season structures, and workout notes you provide.
              </li>
              <li>
                <strong className="text-foreground">Coach chat data:</strong> Messages exchanged with Coach
                Cade are stored to provide context for future coaching sessions.
              </li>
              <li>
                <strong className="text-foreground">Usage data:</strong> Pages visited, features used, and
                device/browser information collected via standard server logs.
              </li>
              <li>
                <strong className="text-foreground">Beta signup data:</strong> Email addresses submitted
                via the beta waitlist form.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. How We Use Your Data</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>To provide personalised coaching, training plans, and workout analysis.</li>
              <li>To generate AI responses from Coach Cade that are grounded in your actual physiology and history.</li>
              <li>To send you service-related emails (e.g. account confirmations, important updates).</li>
              <li>To improve the Cade platform based on aggregated, anonymised usage patterns.</li>
              <li>To comply with legal obligations.</li>
            </ul>
            <p className="mt-3">
              We do <strong className="text-foreground">not</strong> sell your personal data to third parties.
              We do not use your data for advertising.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Legal Basis for Processing (GDPR)</h2>
            <p className="mb-3">
              If you are located in the European Economic Area (EEA), we process your data under the
              following legal bases:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">Contract performance:</strong> Processing necessary to
                deliver the Cade service you signed up for.
              </li>
              <li>
                <strong className="text-foreground">Legitimate interests:</strong> Improving our service,
                preventing fraud, and ensuring security.
              </li>
              <li>
                <strong className="text-foreground">Consent:</strong> Where you have explicitly agreed,
                for example by connecting a third-party integration.
              </li>
              <li>
                <strong className="text-foreground">Legal obligation:</strong> Complying with applicable
                laws and regulations.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Data Retention</h2>
            <p>
              We retain your account and training data for as long as your account is active. If you delete
              your account, we will delete or anonymise your personal data within 30 days, except where we
              are required to retain it by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Third-Party Services</h2>
            <p className="mb-3">
              Cade integrates with third-party services to function. These include:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong className="text-foreground">Supabase:</strong> Database and authentication
                infrastructure. Your data is stored on Supabase-managed servers.
              </li>
              <li>
                <strong className="text-foreground">Anthropic:</strong> AI model provider (Claude) that
                powers Coach Cade. Coaching prompts including relevant training data are sent to
                Anthropic's API to generate responses.
              </li>
              <li>
                <strong className="text-foreground">intervals.icu:</strong> Third-party training log.
                You authorise Cade to read your training data via the intervals.icu API.
              </li>
            </ul>
            <p className="mt-3">
              Each third-party service has its own privacy policy governing their use of data.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Your Rights (GDPR)</h2>
            <p className="mb-3">
              If you are in the EEA, you have the following rights regarding your personal data:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-foreground">Access:</strong> Request a copy of the data we hold about you.</li>
              <li><strong className="text-foreground">Rectification:</strong> Ask us to correct inaccurate data.</li>
              <li><strong className="text-foreground">Erasure:</strong> Request deletion of your personal data ("right to be forgotten").</li>
              <li><strong className="text-foreground">Portability:</strong> Receive your data in a structured, machine-readable format.</li>
              <li><strong className="text-foreground">Objection:</strong> Object to processing based on legitimate interests.</li>
              <li><strong className="text-foreground">Restriction:</strong> Request that we limit processing of your data in certain circumstances.</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email us at{" "}
              <a href="mailto:franzbaumann07@gmail.com" className="text-primary underline underline-offset-2">
                franzbaumann07@gmail.com
              </a>. We will respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. Security</h2>
            <p>
              We implement industry-standard security measures including encrypted data transmission (TLS),
              hashed passwords, and access controls. No method of transmission over the internet is 100%
              secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Cookies</h2>
            <p>
              Cade uses strictly necessary cookies for authentication (session tokens). We do not use
              advertising cookies or third-party tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this policy from time to time. We will notify you of significant changes by
              email or by posting a notice in the app. Continued use of Cade after changes take effect
              constitutes acceptance of the updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Contact</h2>
            <p>
              For any privacy-related questions or requests, contact:{" "}
              <a href="mailto:franzbaumann07@gmail.com" className="text-primary underline underline-offset-2">
                franzbaumann07@gmail.com
              </a>
            </p>
          </section>
        </div>
      </main>

      <footer className="py-6 px-4 sm:px-6 border-t border-border mt-8">
        <div className="max-w-[1100px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CadeLogo variant="full" size="sm" />
            <span>© 2026</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
