import { NavLink } from "@/components/NavLink";
import {
  LayoutDashboard,
  Calendar,
  Trophy,
  Activity,
  MessageCircle,
  BarChart3,
  BookOpen,
  Settings,
  LogOut,
  Sun,
  Moon,
  Monitor,
  Plus,
  Flame,
  Users,
} from "lucide-react";
import { useDailyCheckIn } from "@/components/DailyCheckInContext";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useTheme, type Theme } from "@/hooks/useTheme";
import { useSidebar } from "@/components/SidebarContext";
import { usePendingInvitesCount } from "@/hooks/useFriends";
import { CadeLogo } from "@/components/CadeLogo";

const navItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Training Plan", url: "/plan", icon: Calendar },
  { title: "Season", url: "/season", icon: Trophy },
  { title: "Activities", url: "/activities", icon: Activity },
  { title: "Coach Cade", url: "/coach", icon: MessageCircle },
  { title: "Stats", url: "/stats", icon: BarChart3 },
  { title: "Community", url: "/community", icon: Users },
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
  const { openCheckIn, hasCheckedInToday, currentStreak, longestStreak } = useDailyCheckIn();
  const { theme, setTheme } = useTheme();
  const location = useLocation();
  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { data: pendingCount = 0 } = usePendingInvitesCount();

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
      <div className={`flex items-center h-16 border-b border-border flex-shrink-0 ${expanded ? "gap-2.5 px-4" : "justify-center px-0"}`}>
        <CadeLogo variant="icon" size="md" className={expanded ? "scale-110" : ""} />
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto overflow-x-hidden">
        {navItems.map((item) => (
          <NavLink
            key={item.title}
            to={item.url}
            end={item.url === "/"}
            onClick={handleNavClick}
            className={
              expanded
                ? "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-600 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors relative"
                : "flex items-center justify-center px-0 py-2.5 rounded-xl text-gray-500 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors relative"
            }
            activeClassName={
              expanded
                ? "bg-blue-50 text-blue-700 dark:bg-primary/10 dark:text-primary font-medium"
                : "text-blue-600 dark:text-primary before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:w-0.5 before:h-5 before:rounded-full before:bg-blue-600 dark:before:bg-primary font-medium"
            }
          >
            <item.icon className={`${expanded ? "w-5 h-5" : "w-5 h-5"} flex-shrink-0`} />
            <span
              className={`transition-opacity duration-200 whitespace-nowrap ${
                expanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
              }`}
            >
              {item.title}
            </span>
            {item.url === "/community" && pendingCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={openCheckIn}
            className={`relative flex items-center justify-center w-10 h-10 mx-2 mb-2 rounded-full transition-colors ${
              hasCheckedInToday ? "bg-green-500/20 text-green-600 dark:text-green-400" : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
            title={hasCheckedInToday ? "Check-in done ✓" : "Daily check-in"}
          >
            <Plus className="w-5 h-5" />
            {hasCheckedInToday && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-background" />
            )}
            {currentStreak > 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500/90 text-[10px] font-bold text-white flex items-center justify-center gap-0.5">
                <Flame className="w-2.5 h-2.5" />
                {currentStreak}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">
          <p>{hasCheckedInToday ? "Check-in done ✓" : "Daily check-in"}</p>
          {currentStreak > 0 && <p className="text-xs text-muted-foreground mt-0.5">{currentStreak}-day streak{longestStreak > currentStreak ? ` · Best: ${longestStreak}` : ""}</p>}
        </TooltipContent>
      </Tooltip>

      {!expanded ? (
        <button
          onClick={cycleTheme}
          className="flex items-center justify-center px-3 py-2 mx-2 mb-1 rounded-lg text-xs text-muted-foreground hover:bg-gray-100 dark:hover:bg-secondary transition-colors"
          title={`Theme: ${theme}`}
        >
          <ThemeIcon className="w-[18px] h-[18px]" />
        </button>
      ) : (
        <div className="mx-2 mb-1 flex rounded-lg border border-border/60 bg-muted/30 p-0.5">
          {themeOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={`flex-1 flex items-center justify-center gap-1 py-1 rounded-md text-xs text-muted-foreground transition-all ${
                theme === opt.value
                  ? "bg-background text-foreground shadow-sm"
                  : "hover:text-foreground"
              }`}
            >
              <opt.icon className="w-3 h-3" />
              <span className="truncate">{opt.label}</span>
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
