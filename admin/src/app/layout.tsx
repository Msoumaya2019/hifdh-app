import type { Metadata } from 'next';

import Coquille from '@/composants/Coquille';
import { FournisseurSession } from '@/composants/FournisseurSession';

import './globals.css';

export const metadata: Metadata = {
  title: 'Hifdh — Administration',
  description:
    'Verification des bornes de toumoun et suivi des apprenants. FCPE Freres Lumieres, Montmagny.',
};

// Le `lang` est en francais : l'interface est integralement en francais, comme
// l'application. Un lecteur d'ecran qui prononcerait ces mots avec une
// phonetique anglaise les rendrait incomprehensibles.
export default function RacineLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <FournisseurSession>
          <Coquille>{children}</Coquille>
        </FournisseurSession>
      </body>
    </html>
  );
}
