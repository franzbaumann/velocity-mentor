import { AppSidebar } from "@/components/AppSidebar";
import { useSidebar } from "@/components/SidebarContext";
import { ReactNode } from "react";

export function AppLayout({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <main
        className={`transition-[margin] duration-300 ease-in-out ${
          collapsed ? "ml-16" : "ml-60"
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
