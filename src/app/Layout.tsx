import { useCallback, useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [focusSearchSignal, setFocusSearchSignal] = useState(0);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((s) => !s);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "\\") {
        e.preventDefault();
        setSidebarOpen((s) => !s);
      } else if (e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSidebarOpen(true);
        setFocusSearchSignal((n) => n + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div className="flex h-full w-full">
      <Sidebar
        open={sidebarOpen}
        onToggle={toggleSidebar}
        focusSearchSignal={focusSearchSignal}
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-bg">
        <TopBar sidebarOpen={sidebarOpen} onToggleSidebar={toggleSidebar} />
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
