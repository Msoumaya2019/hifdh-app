import type { NextConfig } from 'next';

// Configuration volontairement minimale.
//
// Il n'y a ici aucun `proxy.ts`, et c'est un choix. La documentation livrée avec
// Next 16 prévient qu'un Server Function n'est pas une route séparée dans la
// chaîne du proxy : un matcher qui exclut un chemin exclut aussi les appels de
// Server Functions posés sur ce chemin, et un déplacement de code peut retirer
// silencieusement la couverture. L'autorisation est donc faite là où elle est
// vérifiable — dans la politique RLS de la base — et l'écran ne fait que
// refléter ce que la base a bien voulu rendre.
const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Le tableau de bord vit dans `admin/`, a l'interieur du depot de
  // l'application, qui a lui aussi un `package-lock.json`. Sans cette ligne,
  // Next remonte au dossier parent et prend la racine du depot pour racine du
  // projet — ce qui change ce qu'il surveille et ce qu'il embarque. La racine
  // est donc declaree, et non deduite.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
