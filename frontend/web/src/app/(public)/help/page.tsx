import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Help' };

const FAQ = [
  {
    q: 'Do I have to use the 3D city?',
    a: 'No. Every job, company, event and workflow is available in the regular web app. The city is an alternative way in, and the City directory offers a non-3D map and list.',
  },
  {
    q: 'How do I move in the city?',
    a: 'Desktop: WASD or arrow keys to move, E to interact, Esc to close panels, mouse click to walk to a point. Mobile: use the on-screen joystick or tap the ground; tap prompts to interact. You can also open the "Places" list in the city HUD to travel by keyboard.',
  },
  {
    q: 'My computer struggles with the city.',
    a: 'Open city Settings and choose Low quality, or turn on reduced motion. If WebGL is unavailable the city automatically switches to an accessible directory view.',
  },
  {
    q: 'Are applications sent to employers?',
    a: 'Not in this demo. Applications are recorded locally and clearly marked as simulated. You will always be asked to confirm before anything is submitted.',
  },
  {
    q: 'Does my personality affect which jobs I see?',
    a: 'No. Personality preferences only personalise social features such as community and event suggestions. Job fit uses skills, experience, salary, location, employment type and qualifications.',
  },
  {
    q: 'Is the payroll real?',
    a: 'No. Payroll screens produce illustrative previews with synthetic data. No funds move, no payslips are issued, and tax/pension figures are not compliant with any jurisdiction.',
  },
  {
    q: 'Who else is in the city?',
    a: 'Figures labelled "simulated" are generated locally. Live multiplayer requires a realtime backend that does not exist yet.',
  },
  {
    q: 'How do I reset the demo?',
    a: 'Candidates: Settings → Reset demo data. Organisation personas: Organisation profile → Reset demo data. Everything is stored only in this browser.',
  },
];

export default function HelpPage() {
  return (
    <div className="container section stack" style={{ ['--gap' as string]: '20px', maxWidth: 820 }}>
      <h1>Help</h1>
      {FAQ.map((f) => (
        <details key={f.q} className="card">
          <summary style={{ fontWeight: 600, cursor: 'pointer' }}>{f.q}</summary>
          <p className="muted" style={{ marginTop: 8 }}>
            {f.a}
          </p>
        </details>
      ))}
      <p className="muted">
        Still stuck? Read <Link href="/about">how Grooveli works</Link>.
      </p>
    </div>
  );
}
