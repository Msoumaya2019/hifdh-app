#!/usr/bin/env bash
# Rejoue en local les etapes du flux de verification.
#
# Ce fichier n'est qu'un point d'entree : la logique vit dans
# `scripts/rejouer_ci_local.py`, pour deux raisons.
#
# La premiere est que l'ORDRE doit etre EXTRAIT de `ci.yml`. Une liste recopiee
# ici derive : celle qui a precede avait fini par rejouer une etape absente du
# flux, et par en oublier deux autres, dont le garde-fou du lecteur de la page du
# moushaf — sans que rien ne le dise.
#
# La seconde est que `grep` et `sed` ne manipulent pas le non-ASCII sous Git
# Bash : lire un flux ecrit en francais avec eux donne des comparaisons fausses.
# Python le fait correctement, et se relit.
set -u
cd "$(dirname "$0")/.." || exit 1
exec python scripts/rejouer_ci_local.py "$@"
