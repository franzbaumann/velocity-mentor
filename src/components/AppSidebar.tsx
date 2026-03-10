import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  Calendar,
  Activity,
  MessageCircle,
  BarChart3,
  BookOpen,
  Settings,
  ChevronLeft,
  Zap,
  LogOut,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTheme, type Theme } from "@/hooks/useTheme";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Training Plan", url: "/plan", icon: Calendar },
  { title: "Activities", url: "/activities", icon: Activity },
  { title: "Kipcoachee", url: "/coach", icon: MessageCircle },
  { title: "Stats", url: "/stats", icon: BarChart3 },
  { title: "Philosophy", url: "/philosophy", icon: BookOpen },
  { title: "Settings", url: "/settings", icon: Settings },
];

const themeOptions: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const order: Theme[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  };

  const ThemeIcon = themeOptions.find((o) => o.value === theme)?.icon ?? Monitor;

  return (
    <aside
      className={`fixed top-0 left-0 z-40 h-screen glass-card rounded-none border-r border-border transition-all duration-300 flex flex-col ${
        collapsed ? "w-16" : "w-60"
      }`}
    >
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-border flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <span className="text-lg font-semibold text-foreground tracking-tight">
            PaceIQ
          </span>
        )}
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.url === "/"}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary transition-colors"
            activeClassName="bg-primary/10 text-primary font-medium"
          >
            <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
            {!collapsed && <span>{item.title}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Theme toggle */}
      {collapsed ? (
        <button
          onClick={cycleTheme}
          className="flex items-center justify-center px-3 py-2.5 mx-2 mb-1 rounded-xl text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="w-[18px] h-[18px]" />
        </button>
      ) : (
        <div className="mx-2 mb-1 flex rounded-xl bg-secondary/60 p-1">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                theme === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <opt.icon className="w-3.5 h-3.5" />
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <button
        onClick={() => supabase.auth.signOut()}
        className="flex items-center gap-3 px-3 py-2.5 mx-2 mb-2 rounded-xl text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
        {!collapsed && <span>Sign out</span>}
      </button>

      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-center h-12 border-t border-border text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft
          className={`w-4 h-4 transition-transform duration-300 ${
            collapsed ? "rotate-180" : ""
          }`}
        />
      </button>
    </aside>
  );
}
