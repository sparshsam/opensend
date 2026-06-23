export default function PrivacyPage() {
  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-display text-text-primary">Privacy Policy</h1>
      <p className="text-sm text-text-muted">Last updated: June 23, 2026</p>

      <div className="space-y-6 text-sm text-text-secondary leading-relaxed">
        <section>
          <h2 className="text-xl font-bold text-text-primary mb-3">What We Collect</h2>
          <p>OpenSend only stores what is strictly necessary to provide file transfer services:</p>
          <ul className="mt-2 space-y-2 list-disc pl-5">
            <li>Account information (email) if you sign in via GitHub OAuth</li>
            <li>Files you upload (stored temporarily in encrypted storage)</li>
            <li>Transfer metadata (file names, sizes, timestamps)</li>
            <li>Download counts for analytics</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-text-primary mb-3">What We Don&apos;t Collect</h2>
          <ul className="space-y-2 list-disc pl-5">
            <li>IP addresses beyond what Supabase requires</li>
            <li>Browser fingerprints or device identifiers</li>
            <li>Cookies for tracking purposes</li>
            <li>Personal data beyond email (no names, addresses, etc.)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-text-primary mb-3">Data Retention</h2>
          <p>Uploaded files are automatically deleted after 24 hours or when you manually delete them. Transfer metadata is retained for 30 days for history purposes, then permanently deleted.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-text-primary mb-3">Third-Party Services</h2>
          <p>OpenSend uses Supabase for authentication, database, and file storage. Supabase is SOC 2 compliant and stores data in the region you select. See Supabase&apos;s privacy policy for their data handling practices.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-text-primary mb-3">Data Deletion</h2>
          <p>You can delete individual transfers at any time from your history page. To request full account deletion, contact support. All your data will be removed within 7 days.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-text-primary mb-3">Contact</h2>
          <p>For privacy-related inquiries, reach out via the Support page.</p>
        </section>
      </div>
    </div>
  );
}
