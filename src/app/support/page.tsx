import { Mail, Github } from "lucide-react";

export default function SupportPage() {
  return (
    <div className="space-y-8 max-w-lg">
      <h1 className="text-display text-text-primary">Support</h1>
      <p className="text-sm text-text-muted">Get help with OpenSend</p>

      <div className="space-y-6">
        <div className="border-t border-b border-border-default py-6 space-y-4">
          <div className="flex justify-between items-center py-2">
            <span className="text-label text-text-muted">Email</span>
            <a
              href="mailto:support@opensend.app"
              className="text-sm font-semibold text-accent hover:brightness-110"
            >
              support@opensend.app
            </a>
          </div>
          <div className="flex justify-between items-center py-2">
            <span className="text-label text-text-muted">GitHub</span>
            <a
              href="https://github.com/sparshsam/opensend"
              className="text-sm font-semibold text-accent hover:brightness-110"
            >
              github.com/sparshsam/opensend
            </a>
          </div>
        </div>

        <div className="space-y-4 text-sm text-text-secondary leading-relaxed">
          <h2 className="text-xl font-bold text-text-primary">FAQ</h2>

          <div className="space-y-3">
            <div>
              <p className="font-semibold text-text-primary">How long are files stored?</p>
              <p>Files are stored for 24 hours from upload, then automatically deleted.</p>
            </div>
            <div>
              <p className="font-semibold text-text-primary">What&apos;s the file size limit?</p>
              <p>Files up to 50 MB are supported. Larger files cannot be uploaded.</p>
            </div>
            <div>
              <p className="font-semibold text-text-primary">Is my file secure?</p>
              <p>Files are encrypted in transit (TLS) and at rest. Only people with the link or claim code can access your transfer.</p>
            </div>
            <div>
              <p className="font-semibold text-text-primary">Can I cancel a transfer early?</p>
              <p>Yes. Sign in and visit your transfer history to delete any active transfer.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
