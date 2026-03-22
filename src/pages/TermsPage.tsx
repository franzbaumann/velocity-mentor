import { Link } from "react-router-dom";
import { CadeLogo } from "@/components/CadeLogo";

export default function TermsPage() {
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
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">Terms of Service</h1>
        <p className="text-sm text-muted-foreground mb-10">Last updated: March 22, 2026</p>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-8 text-muted-foreground leading-relaxed">

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Cade ("the Service"), you agree to be bound by these Terms of Service
              ("Terms"). If you do not agree to these Terms, do not use the Service. These Terms apply to
              all visitors, users, and others who access the Service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">2. Description of Service</h2>
            <p>
              Cade is an AI-powered running coaching platform that provides personalised training plans,
              workout analysis, physiological tracking, and coaching conversations. The Service integrates
              with third-party platforms such as intervals.icu, Garmin, Coros, Apple Watch, and Polar to
              access your training data.
            </p>
            <p className="mt-3">
              Cade is currently in private beta. Features may change, be added, or removed at any time
              without prior notice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">3. Eligibility</h2>
            <p>
              You must be at least 16 years old to use the Service. By using Cade, you represent that you
              meet this requirement. If you are under 18, you confirm that you have obtained parental or
              guardian consent.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">4. Account Registration</h2>
            <p>
              To access most features, you must create an account. You agree to provide accurate and
              complete information and to keep your account credentials confidential. You are responsible
              for all activity that occurs under your account. Notify us immediately at{" "}
              <a href="mailto:franzbaumann07@gmail.com" className="text-primary underline underline-offset-2">
                franzbaumann07@gmail.com
              </a>{" "}
              if you suspect unauthorised use of your account.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">5. Not Medical Advice</h2>
            <p>
              <strong className="text-foreground">
                Cade is a training coaching tool, not a medical service.
              </strong>{" "}
              Nothing in the Service constitutes medical advice, diagnosis, or treatment. Always consult a
              qualified healthcare professional before starting a new training programme, especially if you
              have any pre-existing health conditions, injuries, or concerns. Cade is not responsible for
              any injury or health issue arising from training based on the Service's recommendations.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">6. Acceptable Use</h2>
            <p className="mb-3">You agree not to:</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Use the Service for any unlawful purpose or in violation of any applicable laws.</li>
              <li>Attempt to gain unauthorised access to any part of the Service or its infrastructure.</li>
              <li>Upload or transmit viruses, malware, or any other harmful code.</li>
              <li>Scrape, crawl, or extract data from the Service without express written permission.</li>
              <li>Impersonate any person or entity or misrepresent your affiliation with any person or entity.</li>
              <li>Use the Service to harass, abuse, or harm other users.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">7. Third-Party Integrations</h2>
            <p>
              The Service connects to third-party platforms (intervals.icu, Garmin Connect, Strava, etc.)
              to import your training data. By connecting these integrations, you authorise Cade to access
              data from those platforms on your behalf. Your use of third-party platforms is governed by
              their respective terms of service and privacy policies. Cade is not responsible for the
              availability, accuracy, or content of third-party services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">8. AI-Generated Content</h2>
            <p>
              Coach Cade uses large language models (Claude by Anthropic) to generate coaching responses.
              AI-generated content may contain errors or inaccuracies. You should use your own judgement
              and, where appropriate, consult qualified professionals. Cade does not guarantee the
              accuracy or completeness of any AI-generated coaching advice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">9. Intellectual Property</h2>
            <p>
              The Service, including its design, code, text, graphics, and AI systems, is the property of
              Cade and is protected by applicable intellectual property laws. You are granted a limited,
              non-exclusive, non-transferable licence to use the Service for personal, non-commercial
              purposes in accordance with these Terms.
            </p>
            <p className="mt-3">
              You retain ownership of your training data. By using the Service, you grant Cade a limited
              licence to process your data solely to provide the coaching service.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">10. Pricing and Beta</h2>
            <p>
              Cade is currently free during the private beta period. We reserve the right to introduce
              paid plans in the future. Beta users will receive advance notice and a discounted rate as
              a thank-you for their early support. We reserve the right to modify or discontinue the
              Service at any time.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">11. Disclaimer of Warranties</h2>
            <p>
              The Service is provided "as is" and "as available" without warranties of any kind, either
              express or implied, including but not limited to implied warranties of merchantability,
              fitness for a particular purpose, or non-infringement. We do not warrant that the Service
              will be uninterrupted, error-free, or free of harmful components.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">12. Limitation of Liability</h2>
            <p>
              To the fullest extent permitted by applicable law, Cade and its operators shall not be
              liable for any indirect, incidental, special, consequential, or punitive damages arising
              from your use of or inability to use the Service. Our total liability to you for any claim
              arising from these Terms or your use of the Service shall not exceed the amount you paid
              us in the 12 months preceding the claim (or €50 if you have not made any payments).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">13. Termination</h2>
            <p>
              You may stop using the Service at any time by deleting your account. We reserve the right
              to suspend or terminate your access to the Service at our discretion, with or without notice,
              if we believe you have violated these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">14. Governing Law</h2>
            <p>
              These Terms shall be governed by and construed in accordance with the laws of Sweden,
              without regard to its conflict of law provisions. Any disputes arising under these Terms
              shall be subject to the exclusive jurisdiction of the courts of Sweden.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">15. Changes to Terms</h2>
            <p>
              We may update these Terms from time to time. We will notify you of significant changes
              by email or in-app notice. Your continued use of the Service after changes take effect
              constitutes your acceptance of the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-foreground mb-3">16. Contact</h2>
            <p>
              For questions about these Terms, contact us at:{" "}
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
