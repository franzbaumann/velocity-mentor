import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, HelpCircle, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const faqs = [
  {
    question: "What is Cade?",
    answer:
      "Cade is an AI running coach that trains you the way elite runners are coached — with your actual physiology, your training history, and a plan that adjusts when life gets in the way. Built on the same training science used by Kipchoge's coaching team and the Norwegian national program.",
  },
  {
    question: "How does Coach Cade work?",
    answer:
      "Chat with Coach Cade for pre-run readiness, post-workout analysis, race strategy, and pacing questions. Every answer references your actual CTL, HRV, TSB, and training zones — never generic advice. Daily check-ins and plan adjustments keep your training on track.",
  },
  {
    question: "What data sources does Cade support?",
    answer:
      "Cade connects via intervals.icu, which syncs from Garmin, Coros, Apple Watch, Polar, and Suunto. Cade reads your training history, HRV, sleep, CTL/ATL/TSB curves, and more. One connection gives Cade your full training picture.",
  },
  {
    question: "What training philosophies does Cade support?",
    answer:
      "Cade supports 80/20 polarized, Jack Daniels VDOT, Lydiard, Hansons, Pfitzinger, Norwegian method, Japanese, and Kenyan. Plans are philosophy-based and scaled to your level — from elite session structures adapted for recreational runners.",
  },
  {
    question: "Is Cade free?",
    answer:
      "Cade is free during beta. Early members train free and get 50% off when we launch. No credit card required. Cancel anytime.",
  },
  {
    question: "What is intervals.icu and why do I need it?",
    answer:
      "intervals.icu is a free training platform that aggregates data from your watch and provides CTL, ATL, TSB, and other metrics. Cade reads this data to coach you. One connection gives Cade your full training picture. Garmin, Coros, Apple Watch, and Polar sync via intervals.icu.",
  },
];

export function FAQAccordionBlock() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="w-full border-t border-border bg-gradient-to-b from-background to-muted/30 px-4 py-16 md:py-24">
      <div className="mx-auto max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12 text-center md:mb-16"
        >
          <Badge className="mb-4" variant="secondary">
            <HelpCircle className="mr-1 h-3 w-3" />
            FAQ
          </Badge>
          <h2 className="mb-4 text-3xl font-bold tracking-tight md:text-4xl lg:text-5xl">
            Frequently Asked Questions
          </h2>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
            Have a question? We've got answers. If you don't find what you're
            looking for, feel free to contact us.
          </p>
        </motion.div>

        {/* FAQ Accordion */}
        <div className="space-y-4">
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;

            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1, duration: 0.4 }}
              >
                <Card className="overflow-hidden border-border/50 bg-card transition-all hover:border-primary/50 hover:shadow-md">
                  <motion.button
                    onClick={() => setOpenIndex(isOpen ? null : index)}
                    className="flex w-full items-center justify-between p-4 text-left md:p-6"
                    whileHover={{
                      backgroundColor: "rgba(var(--primary), 0.03)",
                    }}
                  >
                    <span className="pr-4 text-base font-semibold md:text-lg">
                      {faq.question}
                    </span>
                    <motion.div
                      animate={{ rotate: isOpen ? 180 : 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="flex-shrink-0"
                    >
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    </motion.div>
                  </motion.button>

                  <AnimatePresence>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-border/50 p-4 md:p-6">
                          <motion.p
                            initial={{ y: -10 }}
                            animate={{ y: 0 }}
                            className="text-sm text-muted-foreground md:text-base"
                          >
                            {faq.answer}
                          </motion.p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-12 text-center md:mt-16"
        >
          <Card className="border-border/50 bg-gradient-to-br from-card to-muted/30 p-6 md:p-8">
            <MessageCircle className="mx-auto mb-4 h-12 w-12 text-primary" />
            <h3 className="mb-2 text-xl font-bold md:text-2xl">
              Still have questions?
            </h3>
            <p className="mb-6 text-sm text-muted-foreground md:text-base">
              Our team is here to help. Get in touch and we'll respond as soon
              as possible.
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link to="/contact">Contact Support</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/auth">Get started</Link>
              </Button>
            </div>
          </Card>
        </motion.div>
      </div>
    </section>
  );
}
