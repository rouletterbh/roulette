import type { Metadata } from "next";
import { Suspense } from "react";
import { CashierView } from "@/components/cashier/cashier-view";
import { RealMoneyGate } from "@/components/compliance/real-money-gate";

export const metadata: Metadata = { title: "Cashier" };

export default function CashierPage() {
  return (
    <RealMoneyGate>
      <Suspense fallback={null}><CashierView /></Suspense>
    </RealMoneyGate>
  );
}
