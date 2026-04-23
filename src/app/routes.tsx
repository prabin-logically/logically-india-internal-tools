import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { Layout } from "./Layout";
import { Home } from "./Home";
import { NotFound } from "./NotFound";
import { RequireUnlock } from "./RequireUnlock";
import { registry } from "./registry";

/**
 * Lazy-load each tool by slug so adding a new tool to the registry doesn't
 * require editing this file. Vite resolves the dynamic import per slug at
 * build time.
 */
function toolRoute(slug: string): RouteObject {
  return {
    path: `tools/${slug}`,
    lazy: async () => {
      const mod = await import(`../tools/${slug}/index.tsx`);
      return { Component: mod.default };
    },
  };
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: (
      <RequireUnlock>
        <Layout />
      </RequireUnlock>
    ),
    children: [
      { index: true, element: <Home /> },
      ...registry.map((m) => toolRoute(m.slug)),
      { path: "*", element: <NotFound /> },
    ],
  },
]);
