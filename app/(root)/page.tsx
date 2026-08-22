import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>LocalLens</h1>
      <nav aria-label="Choose a language">
        <Link href="/en/">English</Link>
        <Link href="/vi/">Tiếng Việt</Link>
      </nav>
    </main>
  );
}
