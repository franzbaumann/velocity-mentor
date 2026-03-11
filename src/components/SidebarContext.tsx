import { createContext, useContext, useState, type ReactNode } from "react";

interface SidebarState {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  hoverExpanded: boolean;
  setHoverExpanded: (v: boolean) => void;
}

const SidebarContext = createContext<SidebarState>({
  collapsed: false,
  setCollapsed: () => {},
  hoverExpanded: false,
  setHoverExpanded: () => {},
});

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [hoverExpanded, setHoverExpanded] = useState(false);

  return (
    <SidebarContext.Provider value={{ collapsed, setCollapsed, hoverExpanded, setHoverExpanded }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}
