import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="flex h-full w-full">
      <Sidebar />
      <div className="flex-1 overflow-hidden bg-bg">
        <Outlet />
      </div>
    </div>
  );
}
