import Link from 'next/link';

export const metadata = { title: 'Privacy · NCAAF Edge' };

export default function PrivacyPage() {
  return (
    <div className="login-shell">
      <div className="login-card">
        <p className="brand-mark">Privacy</p>
        <p>NCAAF Edge is a small personal project for backtesting college football betting ideas.</p>
        <p>
          When you sign in with Google we receive your name, email address and profile picture. We store only your email address, to let
          you back in and to cap the app at a few users. Your name and picture are shown only to you.
        </p>
        <p>We also store the strategies and chats you create so you can return to them. Chat messages are sent to an AI model provider to generate replies.</p>
        <p>We never sell or share your data, and there are no ads or trackers. To delete your account and data, email ryan.cocuzzo@gmail.com.</p>
        <p className="fine">
          <Link href="/login">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
