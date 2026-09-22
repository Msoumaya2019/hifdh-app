import GardeAdministrateur from '@/composants/GardeAdministrateur';

import SuiviApprenants from './SuiviApprenants';

export default function PageApprenants() {
  return (
    <>
      <h1 className="titre-page">Suivi des apprenants</h1>
      <p className="sous-titre-page">
        Un administrateur <strong>voit</strong> ces donnees ; il ne les modifie pas. Les
        politiques d&apos;acces de la base l&apos;autorisent a lire, jamais a ecrire sur le
        compte de quelqu&apos;un d&apos;autre. La progression d&apos;un apprenant se corrige
        dans l&apos;application, par l&apos;apprenant.
      </p>

      <GardeAdministrateur>
        <SuiviApprenants />
      </GardeAdministrateur>
    </>
  );
}
