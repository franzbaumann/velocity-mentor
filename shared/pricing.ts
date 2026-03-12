export type PlanId = "iq_basic" | "iq_pro" | "iq_max";

export type PricingPlan = {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number;
  yearlyPrice: number;
  features: string[];
  popular?: boolean;
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "iq_basic",
    name: "IQ Basic",
    description:
      "Great for small teams getting started with AI‑powered coaching.",
    monthlyPrice: 12,
    yearlyPrice: 99,
    features: [
      "Unlimited cards",
      "Custom background & stickers",
      "2‑factor authentication",
    ],
  },
  {
    id: "iq_pro",
    name: "IQ Pro",
    description:
      "Best value for growing businesses that need more advanced features.",
    monthlyPrice: 48,
    yearlyPrice: 399,
    popular: true,
    features: [
      "Everything in Starter",
      "Advanced checklists",
      "Custom fields",
      "Serverless functions",
    ],
  },
  {
    id: "iq_max",
    name: "IQ Max Pro Max Plus",
    description:
      "For large teams that need advanced security and unlimited scale.",
    monthlyPrice: 96,
    yearlyPrice: 899,
    features: [
      "Everything in Business",
      "Multi‑board management",
      "Guest access controls",
      "Advanced permissions",
    ],
  },
];

export const STRIPE_CHECKOUT_URLS: Record<PlanId, string> = {
  iq_basic: "https://buy.stripe.com/replace-with-iq-basic",
  iq_pro: "https://buy.stripe.com/replace-with-iq-pro",
  iq_max: "https://buy.stripe.com/replace-with-iq-max",
};

