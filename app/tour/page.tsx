/* eslint-disable @next/next/no-html-link-for-pages -- Public navigation intentionally avoids prefetch. */
import { T, LocalizedAttributes } from '@/app/localized-text';
import type { Metadata } from 'next';
import ProductTour from './product-tour';
import styles from './tour.module.css';

export const metadata: Metadata = {
  title: 'Explore FREE CRM — A synthetic workspace for every path',
  description: 'Try relationships, sales, billing, work, service, reports, and guarded agent simulations. Five audience journeys, no sign-in, no API key, and only fictional data.',
};

export default function TourPage() {
  return <div className={styles.shell}>
    <a className="skip-link" href="#tour-content"><T text="Skip to product tour" /></a>
    <header className={styles.topbar}><a className={styles.brand} href="/"><span>FREE</span> CRM</a><LocalizedAttributes names={["aria-label"]}><nav aria-label="Product tour navigation"><a href="/platform"><T text="Platform" /></a><a className={styles.presenterLink} href="/demo"><T text="Present" /></a><a href="/contribute"><T text="Contribute" /></a><a href="/start"><T text="Find my path " /><span aria-hidden="true">↗</span></a></nav></LocalizedAttributes></header>
    <main id="tour-content" tabIndex={-1}><ProductTour/></main>
    <footer className={styles.footer}><a href="/">FREE CRM</a><span><T text="One platform · three profiles · agents across them" /></span><a href="/deploy"><T text="Set up your own workspace →" /></a></footer>
  </div>;
}
