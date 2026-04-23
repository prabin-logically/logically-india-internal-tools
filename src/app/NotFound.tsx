import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <div className="flex h-full items-center justify-center px-8 py-12">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-text">Tool not found</h1>
        <p className="mt-2 text-sm text-text-muted">
          This path doesn&apos;t match a registered tool.
        </p>
        <Link
          to="/"
          className="mt-4 inline-block text-sm text-accent hover:text-accent-hover"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
