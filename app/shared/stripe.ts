import { Linking } from "react-native";
import { STRIPE_CHECKOUT_URLS, type PlanId } from "./pricing";

export async function openStripeCheckout(planId: PlanId) {
  const url = STRIPE_CHECKOUT_URLS[planId];
  if (!url) return;
  await Linking.openURL(url);
}

