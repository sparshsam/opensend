export default function TermsPage() {
  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-display text-text-primary">Terms of Service</h1>
      <p className="text-sm text-text-muted">Last updated: June 23, 2026</p>

      <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
        <section>
          <h2 className="text-xl font-bold text-text-primary mb-3">Service</h2>
          <p>OpenSend is an open-source file sharing platform. You may use it to transfer files up to 50 MB in size. Files are stored temporarily and automatically expire.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-text-primary mb-3">Acceptable Use</h2>
          <p>You agree not to use OpenSend to share:</p>
          <ul className="mt-2 space-y-2 list-disc pl-5">
            <li>Malware, viruses, or malicious software</li>
            <li>Illegal content or materials</li>
            <li>Content that infringes on others&apos; intellectual property</li>
            <li>Personal data of others without consent</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-text-primary mb-3">Limitations</h2>
          <p>OpenSend is provided &quot;as is&quot; without warranty. We reserve the right to remove content and suspend accounts that violate these terms. File transfers are encrypted in transit and at rest.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-text-primary mb-3">Open Source</h2>
          <p>OpenSend is AGPLv3 licensed. You may self-host your own instance. The source code is available on GitHub.</p>
        </section>
      </div>
    </div>
  );
}
