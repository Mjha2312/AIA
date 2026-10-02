/**
 * Shared shape for the pages that are routed but not built yet, so every one of
 * them already has a real `<h1>`, readable line length and a way back.
 */
export function PageStub({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h1 className="text-2xl font-bold text-navy-900 sm:text-3xl">{title}</h1>
      <p className="prose-civic mt-2 max-w-prose">{description}</p>
    </div>
  );
}