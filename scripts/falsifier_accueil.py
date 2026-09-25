# -*- coding: utf-8 -*-
"""Falsifier le controle de l'accueil : chaque invariant doit tomber.

Un controle qu'on n'a jamais fait rougir ne prouve rien. On mute, on exige un
echec, on restaure par empreinte SHA-256 (jamais par `git diff`, qui subit
`eol=lf`). Le temoin : chaque execution doit LANCER le programme et lire un
resultat -- un « succes » vide serait une anomalie.
"""
import hashlib
import subprocess
import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent
PYTHON = sys.executable
TEST = "tests/accueil.test.mjs"

ACCUEIL = RACINE / "app/(tabs)/index.tsx"
PROGRAMME = RACINE / "app/(tabs)/programme.tsx"

# Le harnais passe par le chargeur d'alias du projet, comme `npm test`.
ARGS = [
    "--import", "./scripts/register-alias.mjs",
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    "--test", TEST,
]


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def lancer():
    r = subprocess.run(
        ["node", *ARGS], cwd=RACINE, capture_output=True, text=True,
        encoding="utf-8", errors="replace", timeout=180,
    )
    sortie = (r.stdout or "") + (r.stderr or "")
    if not sortie.strip():
        raise SystemExit("le controle n'a RIEN produit : un succes vide est une anomalie")
    return r.returncode, sortie


MUTATIONS = [
    (
        "la carte n'est plus pressable",
        ACCUEIL,
        "          style={({ pressed }) => [styles.carteCliquable, pressed && styles.cartePressee]}\n",
        "",
    ),
    (
        # L'ancre porte sur le `pathname` **propre a la carte** : le motif du
        # `params` seul apparait deux fois (la carte et le bouton du bas), et une
        # mutation en aurait change un autre que celui vise -- l'ancre comptee a
        # d'ailleurs refuse d'ecrire, la premiere fois.
        #
        # Le remplacement a ete REPRIS le jour ou `profil` a quitte le groupe des
        # onglets : il visait `/(tabs)/profil`, une route qui n'existe plus. Une
        # mutation doit mener quelque part de PLAUSIBLE -- un autre onglet --
        # sinon elle n'eprouve plus « la carte mene ailleurs », mais « la carte
        # mene nulle part », ce qui est un autre defaut.
        "la carte mene ailleurs que sur l'onglet Programme",
        ACCUEIL,
        "            router.push({\n              pathname: '/(tabs)/programme',\n              params: { onglet: 'renforcer', t: String(Date.now()) },\n            })\n          }\n          accessibilityRole=\"button\"",
        "            router.push({\n              pathname: '/(tabs)/progres',\n              params: { onglet: 'renforcer', t: String(Date.now()) },\n            })\n          }\n          accessibilityRole=\"button\"",
    ),
    (
        "la carte ouvre Programme sans demander l'onglet renforcer",
        ACCUEIL,
        "              pathname: '/(tabs)/programme',\n              params: { onglet: 'renforcer', t: String(Date.now()) },\n            })\n          }\n          accessibilityRole=\"button\"",
        "              pathname: '/(tabs)/programme',\n              params: { onglet: 'apprentissage', t: String(Date.now()) },\n            })\n          }\n          accessibilityRole=\"button\"",
    ),
    (
        "l'horodatage est retire : le second appui ne ferait rien",
        ACCUEIL,
        "              params: { onglet: 'renforcer', t: String(Date.now()) },\n            })\n          }\n          accessibilityRole=\"button\"",
        "              params: { onglet: 'renforcer' },\n            })\n          }\n          accessibilityRole=\"button\"",
    ),
    (
        "l'onglet Programme ne reconnait plus le parametre",
        PROGRAMME,
        "if (params.onglet === 'renforcer') setActiveTab('renforcer');",
        "if (params.onglet === 'renforce') setActiveTab('renforcer');",
    ),
    (
        "la bascule ne depend plus de l'horodatage",
        PROGRAMME,
        "  }, [params.onglet, params.t]);",
        "  }, [params.onglet]);",
    ),
    (
        "la carte s'affiche meme sans rien a renforcer",
        ACCUEIL,
        "      {aRenforcer > 0 && (",
        "      {aRenforcer >= 0 && (",
    ),
    (
        # Ajoutee le jour ou l'entree du Programme a ete renommee « Revision » :
        # le libelle vocal devait suivre, et l'assertion qui l'epingle n'avait
        # jamais ete mise en echec -- elle ne prouvait donc rien. La mutation
        # reste PLAUSIBLE : un libelle generique qui perd le compte et l'accord
        # au pluriel compile, et ne se voit qu'au lecteur d'ecran.
        "le libelle vocal de la carte perd le compte et l'accord",
        ACCUEIL,
        "accessibilityLabel={`Voir les ${aRenforcer} passage${aRenforcer > 1 ? 's' : ''} en révision`}",
        "accessibilityLabel={`Voir les passages en révision`}",
    ),
]

print("=" * 74)
conforme_avant = True
for nom, fichier, avant, apres in MUTATIONS:
    brut = fichier.read_bytes()
    empreinte = sha(fichier)

    code0, _ = lancer()
    if code0 != 0:
        print("  AVANT la mutation, le controle est deja en echec : %s" % nom)
        conforme_avant = False

    # Ancre comptee : refuser d'ecrire si elle n'apparait pas exactement une fois.
    n = brut.count(avant.encode("utf-8"))
    if n != 1:
        print("  ANCRE introuvable (%d occurrence(s)) : %s" % (n, nom))
        conforme_avant = False
        continue

    fichier.write_bytes(brut.replace(avant.encode("utf-8"), apres.encode("utf-8"), 1))
    assert sha(fichier) != empreinte, "la mutation n'a rien change"

    code1, sortie = lancer()
    detecte = code1 != 0
    print("--- %s" % nom)
    print("    %s" % ("DETECTE" if detecte else "NON DETECTE"))

    fichier.write_bytes(brut)
    assert sha(fichier) == empreinte, "la restauration n'est pas a l'identique"
    print("    restaure : OK")

    if not detecte:
        conforme_avant = False

print("=" * 74)
print("Verifications finales :")
code, _ = lancer()
print("  controle sur l'arbre reel : code %d" % code)
if code != 0:
    conforme_avant = False

if conforme_avant:
    print("  -> toutes les mutations sont detectees, et l'arbre reel est vert")
    sys.exit(0)
print("  -> IL RESTE UN PROBLEME")
sys.exit(1)
