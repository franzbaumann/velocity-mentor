import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  Calendar,
  Activity,
  MessageCircle,
  BarChart3,
  BookOpen,
  Settings,
  Zap,
  LogOut,
  Sun,
  Moon,
  Monitor,
} from "lucide-react";
import { useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTheme, type Theme } from "@/hooks/useTheme";
import { useSidebar } from "@/components/SidebarContext";

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
  const { collapsed, setCollapsed, hoverExpanded, setHoverExpanded } = useSidebar();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const expanded = !collapsed || hoverExpanded;

  const handleNavClick = useCallback(() => {
    setCollapsed(true);
    setHoverExpanded(false);
  }, [setCollapsed, setHoverExpanded]);

  const handleMouseEnter = useCallback(() => {
    if (!collapsed) return;
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoverExpanded(true), 120);
  }, [collapsed, setHoverExpanded]);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => setHoverExpanded(false), 200);
  }, [setHoverExpanded]);

  const cycleTheme = () => {
    const order: Theme[] = ["light", "dark", "system"];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  };

  const ThemeIcon = themeOptions.find((o) => o.value === theme)?.icon ?? Monitor;

  return (
    <aside
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`fixed top-0 left-0 z-40 h-screen glass-card rounded-none border-r border-border flex flex-col transition-[width] duration-300 ease-in-out ${
        expanded ? "w-60" : "w-16"
      } ${hoverExpanded ? "shadow-xl" : ""}`}
    >
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-border flex-shrink-0">
        <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
          <Zap className="w-4 h-4 text-primary-foreground" />
        </div>
        <span
          className={`text-lg font-semibold text-foreground tracking-tight transition-opacity duration-200 whitespace-nowrap ${
            expanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
          }`}
        >
          PaceIQ
        </span>
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.url === "/"}
            onClick={handleNavClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted-foreground hover:bg-secondary transition-colors"
            activeClassName="bg-primary/10 text-primary font-medium"
          >
            <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
            <span
              className={`transition-opacity duration-200 whitespace-nowrap ${
                expanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
              }`}
            >
              {item.title}
            </span>
          </NavLink>
        ))}
      </nav>

      {!expanded ? (
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
        className="flex items-center gap-3 px-3 py-2.5 mx-2 mb-4 rounded-xl text-sm text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      >
        <LogOut className="w-[18px] h-[18px] flex-shrink-0" />
        <span
          className={`transition-opacity duration-200 whitespace-nowrap ${
            expanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
          }`}
        >
          Sign out
        </span>
      </button>
    </aside>
  );
}
