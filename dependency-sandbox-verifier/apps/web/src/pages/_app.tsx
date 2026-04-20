import type { AppProps } from 'next/app';
import Link from 'next/link';
import '../styles/globals.css';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <nav>
        <div className="container inner">
          <Link href="/" className="brand">
            DSV <span>Dashboard</span>
          </Link>
          <Link href="/">Scans</Link>
        </div>
      </nav>
      <main className="container" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
        <Component {...pageProps} />
      </main>
    </>
  );
}
