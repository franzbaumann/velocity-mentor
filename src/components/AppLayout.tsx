import { AppSidebar } from "@/components/AppSidebar";
import { ReactNode } from "react";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      {/* Offset for sidebar — uses ml that matches sidebar width via CSS */}
      <main className="ml-16 lg:ml-60 transition-all duration-300">
        <div className="max-w-[1100px] mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
