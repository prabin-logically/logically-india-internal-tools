import { createBrowserRouter } from "react-router-dom";
import { Layout } from "./Layout";
import { Home } from "./Home";
import { NotFound } from "./NotFound";
import { RequireUnlock } from "./RequireUnlock";

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
      { path: "*", element: <NotFound /> },
    ],
  },
]);
