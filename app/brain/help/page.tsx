/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation supports both Next and Vinext deployments. */
import { T, LocalizedAttributes } from '@/app/localized-text';
import type { Metadata } from 'next';
import { freeCrmRepositoryUrl } from '@/lib/public-config';
import styles from './help.module.css';

export const metadata: Metadata = {
  title: 'Your second brain — FREE CRM',
  description: 'A local-first knowledge library, connected to your relationships. Capture and search without AI; add private local conversation when you choose.',
};

const deviceCommands = 'npm ci\nnpm run device';
const modelCommands = 'ollama pull gemma3:1b\nollama pull embeddinggemma\nollama list';
const dockerCommands = 'docker compose -f compose.yaml -f compose.brain.yaml up -d --build\ndocker compose -f compose.yaml -f compose.brain.yaml exec ollama ollama pull gemma3:1b\ndocker compose -f compose.yaml -f compose.brain.yaml exec ollama ollama pull embeddinggemma';

export default function BrainHelpPage() {
  return (
    <main className={styles.page}>
      <a className="skip-link" href="#brain-help-content"><T text="Skip to the second brain guide" /></a>
      <header className={styles.header}>
        <a className={styles.brand} href="/"><span>FREE</span> CRM</a>
        <LocalizedAttributes names={["aria-label"]}><nav aria-label="Second brain guide navigation">
          <a href={`${freeCrmRepositoryUrl}/blob/main/docs/SECOND-BRAIN.md`}><T text="Operator guide ↗" /></a>
          <a href="/brain" className={styles.open}><T text="Open my brain " /><span aria-hidden="true">→</span></a>
        </nav></LocalizedAttributes>
      </header>

      <div id="brain-help-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="brain-help-title">
          <p className={styles.eyebrow}><T text="Your knowledge. Your relationships. Your device." /></p>
          <h1 id="brain-help-title"><T text="Room for" /><br /><em><T text="your next thought." /></em></h1>
          <p className={styles.lead}><T text="A second brain for the notes you keep, the people you know, and the connections you make. Open source. A library that works without an AI subscription." /></p>
          <div className={styles.heroActions}>
            <a className={styles.primary} href="/brain"><T text="Open my brain " /><span aria-hidden="true">→</span></a>
            <a href="#local-setup"><T text="Set up locally " /><span aria-hidden="true">↓</span></a>
          </div>
          <p className={styles.caption}><T text="Use your own installation. A public deployment may require its owner to sign in." /></p>
        </section>

        <section className={styles.loop} aria-labelledby="brain-loop-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}><T text="A small, useful ritual" /></p>
            <h2 id="brain-loop-title"><T text="Keep it. Connect it." /><br /><em><T text="Come back to it." /></em></h2>
          </div>
          <ol className={styles.steps}>
            <li><span aria-hidden="true">01</span><h3><T text="Catch the thought" /></h3><p><T text="Write a note, paste a clip, or import a text or Markdown file. Add a source URL for context; URLs are not fetched automatically." /></p></li>
            <li><span aria-hidden="true">02</span><h3><T text="Make a connection" /></h3><p><T text="Link sources to each other and to CRM records. Explore a graph of explicit relationships you created—not invented connections." /></p></li>
            <li><span aria-hidden="true">03</span><h3><T text="Find your way back" /></h3><p><T text="Search by keyword anytime. Optionally index sources with a local model, ask a question, and open the source citations beside its answer." /></p></li>
          </ol>
        </section>

        <section id="local-setup" className={styles.setup} aria-labelledby="brain-setup-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}><T text="No key required" /></p>
            <h2 id="brain-setup-title"><T text="Start simple." /><br /><em><T text="Add AI by choice." /></em></h2>
            <p><T text="Capture, organize, link, and search your library before you install any model. Your knowledge is stored in the workspace database." /></p>
          </div>
          <div className={styles.setupSteps}>
            <article>
              <span className={styles.stepTag}><T text="01 / Library first" /></span>
              <h3><T text="Run the repository on your device." /></h3>
              <p><T text="With Node.js 22.13 or later installed, run these commands from the repository root. Back up your existing local state before an upgrade." /></p>
              <LocalizedAttributes names={["aria-label"]}><pre aria-label="Start FREE CRM on your device"><code>{deviceCommands}</code></pre></LocalizedAttributes>
              <p><T text="Open " /><code>http://127.0.0.1:3477/brain</code><T text=". The local-owner setup is for one trusted operator; keep it on loopback." /></p>
              <a href="/deploy?path=github"><T text="Get the source and deployment guide " /><span aria-hidden="true">→</span></a>
            </article>
            <article>
              <span className={styles.stepTag}><T text="02 / Optional local conversation" /></span>
              <h3><T text="Bring a model, not a secret key." /></h3>
              <p><T text="Install Ollama and set " /><code>OLLAMA_NO_CLOUD=1</code><T text=" on the Ollama server, then restart it. Keep its default private address. Follow the " /><a href="https://docs.ollama.com/quickstart"><T text="installation guide" /></a><T text=" and " /><a href="https://docs.ollama.com/faq"><T text="environment instructions" /></a>.</p>
              <p><T text="Review the models, then download them yourself. FREE CRM never pulls a model automatically." /></p>
              <LocalizedAttributes names={["aria-label"]}><pre aria-label="Manually download local models"><code>{modelCommands}</code></pre></LocalizedAttributes>
              <p><T text="The defaults are " /><a href="https://ollama.com/library/gemma3:1b">Gemma 3 1B</a><T text=" for conversation and " /><a href="https://ollama.com/library/embeddinggemma">EmbeddingGemma</a><T text=" for semantic retrieval. Their licenses are separate from FREE CRM. Use a current Ollama release." /></p>
              <p><T text="Enable local AI in your brain workspace, index a saved source, and ask a question about it. Index again after editing a source or updating the embedding model. Model content digests are checked automatically; old-weight vectors are not mixed with new ones." /></p>
            </article>
            <details className={styles.docker}>
              <summary><T text="Prefer Docker? Use the optional companion." /></summary>
              <p><T text="The existing CRM volume stays persistent. Ollama uses a separate model volume and has no published host port. Run from the repository root:" /></p>
              <LocalizedAttributes names={["aria-label"]}><pre aria-label="Start the optional Docker companion"><code>{dockerCommands}</code></pre></LocalizedAttributes>
              <p><T text="This starts CPU-only. Hardware acceleration needs host-specific setup; see " /><a href="https://docs.ollama.com/docker"><T text="Ollama's Docker guide" /></a><T text=". Model downloads take disk space and require internet. Inference speed and RAM needs depend on your hardware." /></p>
              <p><T text="Stop with " /><code>docker compose -f compose.yaml -f compose.brain.yaml down</code><T text=". Do not add " /><code>--volumes</code><T text=" unless you intend to permanently delete stored data and models." /></p>
            </details>
          </div>
        </section>

        <section className={styles.boundaries} aria-labelledby="brain-boundaries-title">
          <p className={styles.eyebrow}><T text="Trust is a feature" /></p>
          <h2 id="brain-boundaries-title"><T text="You stay" /><br /><em><T text="in the loop." /></em></h2>
          <div className={styles.boundaryGrid}>
            <article><h3><T text="Local means local." /></h3><p><T text="Model requests go from the app server to your private Ollama server, never directly from the browser. Cloud deployments can use the library, but cannot reach a model on your laptop in this release. No public model tunnel is needed." /></p></article>
            <article><h3><T text="A citation is a starting point." /></h3><p><T text="Open the original passage and verify the answer. Models can make mistakes. This assistant does not send messages, browse websites, execute tools, or change CRM records for you." /></p></article>
            <article><h3><T text="Your switch. Your export." /></h3><p><T text="Turn local AI off or use the emergency stop. Capture and keyword search remain available. Export JSON or Markdown; derived embeddings can be rebuilt. Exports are not a full recovery backup." /></p></article>
            <article><h3><T text="Deletion should mean something." /></h3><p><T text="Deleting a source also permanently removes conversations citing it or supplied it as context—even if the model did not cite it. Editing its content removes those conversations too, so old quotes do not linger. Review the confirmation and export anything you need first." /></p></article>
          </div>
        </section>

        <section className={styles.honesty} aria-labelledby="brain-honesty-title">
          <div><p className={styles.eyebrow}><T text="Built in the open" /></p><h2 id="brain-honesty-title"><T text="A useful beginning." /><br /><em><T text="Room to grow." /></em></h2></div>
          <div>
            <p><T text="This release supports up to 200 sources with 40,000 characters per source, and 100 conversations with 100 messages each. Separate 3 MiB budgets cover source text and metadata, and conversation messages and citations. Whichever limit comes first applies—not an unlimited archive." /></p>
            <p><T text="Automatic web clipping, third-party sync, PDF/OCR, audio transcription, native mobile apps, autonomous actions, and hosted AI providers are not included yet." /></p>
            <p><T text="The software is free and open source. Model downloads, hardware, electricity, and cloud infrastructure have their own requirements and costs." /></p>
            <a href={`${freeCrmRepositoryUrl}/blob/main/docs/SECOND-BRAIN.md`}><T text="Read the limits, recovery steps, and acceptance checklist " /><span aria-hidden="true">↗</span></a>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <a href="/">FREE CRM</a>
        <span><T text="Celebrate open source. Keep ownership." /></span>
        <a href={freeCrmRepositoryUrl}><T text="Contribute on GitHub ↗" /></a>
      </footer>
    </main>
  );
}
