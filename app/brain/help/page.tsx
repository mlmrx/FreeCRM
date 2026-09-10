/* eslint-disable @next/next/no-html-link-for-pages -- Full navigation supports both Next and Vinext deployments. */
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
      <a className="skip-link" href="#brain-help-content">Skip to the second brain guide</a>
      <header className={styles.header}>
        <a className={styles.brand} href="/"><span>FREE</span> CRM</a>
        <nav aria-label="Second brain guide navigation">
          <a href={`${freeCrmRepositoryUrl}/blob/main/docs/SECOND-BRAIN.md`}>Operator guide ↗</a>
          <a href="/brain" className={styles.open}>Open my brain <span aria-hidden="true">→</span></a>
        </nav>
      </header>

      <div id="brain-help-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="brain-help-title">
          <p className={styles.eyebrow}>Your knowledge. Your relationships. Your device.</p>
          <h1 id="brain-help-title">Room for<br /><em>your next thought.</em></h1>
          <p className={styles.lead}>A second brain for the notes you keep, the people you know, and the connections you make. Open source. A library that works without an AI subscription.</p>
          <div className={styles.heroActions}>
            <a className={styles.primary} href="/brain">Open my brain <span aria-hidden="true">→</span></a>
            <a href="#local-setup">Set up locally <span aria-hidden="true">↓</span></a>
          </div>
          <p className={styles.caption}>Use your own installation. A public deployment may require its owner to sign in.</p>
        </section>

        <section className={styles.loop} aria-labelledby="brain-loop-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>A small, useful ritual</p>
            <h2 id="brain-loop-title">Keep it. Connect it.<br /><em>Come back to it.</em></h2>
          </div>
          <ol className={styles.steps}>
            <li><span aria-hidden="true">01</span><h3>Catch the thought</h3><p>Write a note, paste a clip, or import a text or Markdown file. Add a source URL for context; URLs are not fetched automatically.</p></li>
            <li><span aria-hidden="true">02</span><h3>Make a connection</h3><p>Link sources to each other and to CRM records. Explore a graph of explicit relationships you created—not invented connections.</p></li>
            <li><span aria-hidden="true">03</span><h3>Find your way back</h3><p>Search by keyword anytime. Optionally index sources with a local model, ask a question, and open the source citations beside its answer.</p></li>
          </ol>
        </section>

        <section id="local-setup" className={styles.setup} aria-labelledby="brain-setup-title">
          <div className={styles.sectionHeading}>
            <p className={styles.eyebrow}>No key required</p>
            <h2 id="brain-setup-title">Start simple.<br /><em>Add AI by choice.</em></h2>
            <p>Capture, organize, link, and search your library before you install any model. Your knowledge is stored in the workspace database.</p>
          </div>
          <div className={styles.setupSteps}>
            <article>
              <span className={styles.stepTag}>01 / Library first</span>
              <h3>Run the repository on your device.</h3>
              <p>With Node.js 22.13 or later installed, run these commands from the repository root. Back up your existing local state before an upgrade.</p>
              <pre aria-label="Start FREE CRM on your device"><code>{deviceCommands}</code></pre>
              <p>Open <code>http://127.0.0.1:3477/brain</code>. The local-owner setup is for one trusted operator; keep it on loopback.</p>
              <a href="/deploy?path=github">Get the source and deployment guide <span aria-hidden="true">→</span></a>
            </article>
            <article>
              <span className={styles.stepTag}>02 / Optional local conversation</span>
              <h3>Bring a model, not a secret key.</h3>
              <p>Install Ollama and set <code>OLLAMA_NO_CLOUD=1</code> on the Ollama server, then restart it. Keep its default private address. Follow the <a href="https://docs.ollama.com/quickstart">installation guide</a> and <a href="https://docs.ollama.com/faq">environment instructions</a>.</p>
              <p>Review the models, then download them yourself. FREE CRM never pulls a model automatically.</p>
              <pre aria-label="Manually download local models"><code>{modelCommands}</code></pre>
              <p>The defaults are <a href="https://ollama.com/library/gemma3:1b">Gemma 3 1B</a> for conversation and <a href="https://ollama.com/library/embeddinggemma">EmbeddingGemma</a> for semantic retrieval. Their licenses are separate from FREE CRM. Use a current Ollama release.</p>
              <p>Enable local AI in your brain workspace, index a saved source, and ask a question about it. Index again after editing a source or updating the embedding model. Model content digests are checked automatically; old-weight vectors are not mixed with new ones.</p>
            </article>
            <details className={styles.docker}>
              <summary>Prefer Docker? Use the optional companion.</summary>
              <p>The existing CRM volume stays persistent. Ollama uses a separate model volume and has no published host port. Run from the repository root:</p>
              <pre aria-label="Start the optional Docker companion"><code>{dockerCommands}</code></pre>
              <p>This starts CPU-only. Hardware acceleration needs host-specific setup; see <a href="https://docs.ollama.com/docker">Ollama&apos;s Docker guide</a>. Model downloads take disk space and require internet. Inference speed and RAM needs depend on your hardware.</p>
              <p>Stop with <code>docker compose -f compose.yaml -f compose.brain.yaml down</code>. Do not add <code>--volumes</code> unless you intend to permanently delete stored data and models.</p>
            </details>
          </div>
        </section>

        <section className={styles.boundaries} aria-labelledby="brain-boundaries-title">
          <p className={styles.eyebrow}>Trust is a feature</p>
          <h2 id="brain-boundaries-title">You stay<br /><em>in the loop.</em></h2>
          <div className={styles.boundaryGrid}>
            <article><h3>Local means local.</h3><p>Model requests go from the app server to your private Ollama server, never directly from the browser. Cloud deployments can use the library, but cannot reach a model on your laptop in this release. No public model tunnel is needed.</p></article>
            <article><h3>A citation is a starting point.</h3><p>Open the original passage and verify the answer. Models can make mistakes. This assistant does not send messages, browse websites, execute tools, or change CRM records for you.</p></article>
            <article><h3>Your switch. Your export.</h3><p>Turn local AI off or use the emergency stop. Capture and keyword search remain available. Export JSON or Markdown; derived embeddings can be rebuilt. Exports are not a full recovery backup.</p></article>
            <article><h3>Deletion should mean something.</h3><p>Deleting a source also permanently removes conversations citing it or supplied it as context—even if the model did not cite it. Editing its content removes those conversations too, so old quotes do not linger. Review the confirmation and export anything you need first.</p></article>
          </div>
        </section>

        <section className={styles.honesty} aria-labelledby="brain-honesty-title">
          <div><p className={styles.eyebrow}>Built in the open</p><h2 id="brain-honesty-title">A useful beginning.<br /><em>Room to grow.</em></h2></div>
          <div>
            <p>This release supports up to 200 sources with 40,000 characters per source, and 100 conversations with 100 messages each. Separate 3 MiB budgets cover source text and metadata, and conversation messages and citations. Whichever limit comes first applies—not an unlimited archive.</p>
            <p>Automatic web clipping, third-party sync, PDF/OCR, audio transcription, native mobile apps, autonomous actions, and hosted AI providers are not included yet.</p>
            <p>The software is free and open source. Model downloads, hardware, electricity, and cloud infrastructure have their own requirements and costs.</p>
            <a href={`${freeCrmRepositoryUrl}/blob/main/docs/SECOND-BRAIN.md`}>Read the limits, recovery steps, and acceptance checklist <span aria-hidden="true">↗</span></a>
          </div>
        </section>
      </div>

      <footer className={styles.footer}>
        <a href="/">FREE CRM</a>
        <span>Celebrate open source. Keep ownership.</span>
        <a href={freeCrmRepositoryUrl}>Contribute on GitHub ↗</a>
      </footer>
    </main>
  );
}
