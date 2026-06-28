import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="landing">
      <section className="landingCard">
        <p className="eyebrow">CodeMind Workspace</p>
        <h1>Standalone CodeMode</h1>
        <p>
          Open the browser console extracted from AELIB and backed by the standalone CodeMind CLI.
        </p>
        <Link className="primaryLink" href="/codemode">
          Open CodeMode
        </Link>
      </section>
    </main>
  )
}
