import { registry } from "./registry";

export function Home() {
  return (
    <div className="flex h-full items-center justify-center px-8 py-12">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-text">Welcome</h1>
        <p className="mt-2 text-sm text-text-muted">
          {registry.length === 0
            ? "No tools are registered yet. Add a folder under src/tools/ and register its meta in src/app/registry.ts."
            : "Pick a tool from the sidebar to get started."}
        </p>
      </div>
    </div>
  );
}
