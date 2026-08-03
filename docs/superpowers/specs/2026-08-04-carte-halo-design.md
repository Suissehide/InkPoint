# Onde de rupture — la carte qui manquait au Halo

## 1. Intention

Le Halo est le seul power-up qu'aucune carte ne touche. Les sept autres ont au moins une
commune qui modifie un de leurs chiffres ; lui n'en a aucune, et pour une raison honnête —
il n'a pas de valeur à faire varier. Il absorbe un contact, détruit l'ennemi fautif,
accorde 1000 ms de grâce, et c'est tout. La spec de rebuild avait consigné ce trou au §5
comme « à trancher en jouant », en laissant deux pistes ouvertes : se régénérer toutes les
N vagues, ou absorber deux contacts.

**Ce document en retient une troisième**, et écarte les deux autres pour la même raison :
elles agissent sur la **présence** du Halo, donc sur le nombre de morts évitées. Or
`POWERUP_WEIGHT.halo` vaut 1,5 — parmi les plus bas du jeu — précisément parce que le Halo
est « celui qui empêche de mourir, donc celui dont une inflation se sentirait le plus ».
Une carte qui le fait revenir ou tenir deux coups est exactement l'inflation que cette
pondération existe pour contenir.

La carte agit donc sur sa **rupture** : ce qui se passe à l'instant où il casse. Le nombre
de morts évitées par Halo ne bouge pas ; ce qui change, c'est que le Halo cesse d'être une
mort reportée pour devenir une situation résolue.

**Le problème qu'elle règle est déjà documenté dans le code.** `collision.ts` justifie
ainsi les 1000 ms de grâce : « le Halo se brise au contact, donc au milieu de ce qui vient
de toucher le joueur — il lui faut de quoi en sortir avant de redevenir mortel ». La grâce
vous laisse fuir la grappe ; elle ne fait rien contre elle. On ressort d'un Halo brisé dans
la position exacte qui l'a brisé.

**Le rendu promet déjà ce que la carte livrera.** À chaque `haloBroken`, `juice.ts` émet
une onde de choc de 200 px, une salve de 24 particules, un flash et une secousse de 14.
Visuellement, la rupture dégage la zone. Mécaniquement, rien n'y meurt que l'ennemi fautif.

**Hors périmètre.** Aucun autre power-up. `POWERUP_WEIGHT.halo` reste à 1,5 : la carte ne
change pas la fréquence du Halo, seulement ce qu'il fait en cassant. Le rendu n'est pas
retouché (voir §5). Aucune carte existante n'est modifiée.

## 2. La carte

| Champ | Valeur |
| --- | --- |
| `id` | `halo-burst` |
| `rarity` | `rare` |
| `stackable` | `false` |
| `requires` | `'halo'` |
| `apply` | `s.rules.add('haloBurst')` |

**Rare et non commune.** Le gain est un changement de nature, pas un chiffre — c'est la
définition que ce projet donne à la rareté rare (« modifient un comportement », en tête de
section dans `upgrades.ts`). Les quatre rares actuelles sont une par power-up : Gel
(`creeping-frost`), Ronce (`lasting-bramble`), Volée (`nested-quills`), Bavure
(`splatter-split`). Le Halo est le trou de cette rangée, et cette carte le comble sans
inventer un patron nouveau.

**Textes.**

| Clé | fr | en |
| --- | --- | --- |
| `upgrade.halo-burst.name` | Onde de rupture | Breaking wave |
| `upgrade.halo-burst.desc` | Le halo brisé emporte ce qui l'entoure | A shattered halo takes its surroundings with it |

## 3. La mécanique

Dans la branche Halo de `collisionSystem` (`sim/systems/collision.ts`), après le retrait du
composant `Halo` et le marquage `Doomed` de l'ennemi fautif : si `stats.rules.has('haloBurst')`,
poser une zone `HAZARD_BLAST` au point de contact.

**L'ennemi fautif ne concerne pas l'explosion.** Il meurt déjà par `Doomed`, comme
aujourd'hui, et cela reste vrai que la carte soit prise ou non. L'explosion emporte **les
autres** — c'est toute la carte.

**`collisionSystem` reçoit `stats`.** Sa signature passe de `collisionSystem(world)` à
`collisionSystem(world, stats)`, et son appel dans `step.ts` suit. C'est le patron déjà en
place pour ses voisins immédiats dans l'ordre des systèmes : `tracingSystem(world, stats)`,
`freezeSystem(world, stats)`, `dashKillSystem(world, stats)`.

**La latence tombe juste, sans cas particulier.** `collisionSystem` tourne **après**
`hazardSystem` dans `step.ts`. L'explosion posée à la rupture sera donc éprouvée au pas
suivant — exactement la latence qu'ont déjà la Bombe posée au ramassage (`pickupSystem`) et
la seconde salve de « Double trait » (`delayedPowerUpSystem`), tous deux également placés
après `hazardSystem`. Aucune règle d'ordre n'est à inventer ni à documenter en plus.

**Réutiliser `HAZARD_BLAST` a une conséquence, la même que pour la Volée :** l'explosion
n'hérite **pas** de « Large explosion » ni de « Combustion lente ». Ces deux cartes lisent
`stats.blastRadius` et `stats.blastLingerMs`, alors que les réglages viennent ici de
`RULE_TUNING.haloBurst`. C'est voulu : « Onde de rupture » est une carte du Halo, pas une
carte de la Bombe, et un cumul entre les deux ferait dépendre la puissance du Halo d'un
investissement dans un autre power-up.

## 4. Le réglage

`RULE_TUNING.haloBurst`, mis à l'échelle par `world.arena.rangeScale`.

**Ce point tranche entre deux précédents contradictoires du dépôt**, et le choix mérite
d'être énoncé plutôt que subi. Toutes les explosions du jeu sont mises à l'échelle : la
Bombe (`stats.blastRadius = POWERUP_BASE.blast.maxRadius * rangeScale`) comme l'explosion
d'impact de la Volée (`POWERUP_BASE.volley.blastRadius * scale`). Aucune des deux zones
issues de `RULE_TUNING` ne l'est : ni « Le papier boit » (`thirstyPaper.radius`, 22 px), ni
« Papier calque » (`tracingPaper.radius`, 14 px), qui posent leur rayon brut.

« Onde de rupture » suit la **famille des explosions**, pas celle de `RULE_TUNING` : c'est
une `HAZARD_BLAST`, elle doit couvrir la même part d'arène partout, et à 140 px l'écart
n'est pas théorique — une arène mobile la verrait couvrir proportionnellement bien plus
qu'une arène de bureau. Les deux zones non mises à l'échelle sont petites (22 et 14 px),
ce qui rend leur cas beaucoup moins sensible ; savoir si c'est chez elles un choix ou un
oubli est une question réelle, mais **hors périmètre ici**.

| Réglage | Valeur | Pourquoi ce chiffre |
| --- | --- | --- |
| `radius` | 140 | Sous la Bombe (150), franchement au-dessus de l'explosion de plume (90). Le repère est « dégager la grappe qui vous a touché », pas l'arène. Sur un Point (rayon 7), la portée réelle est de 147 px. |
| `growthRate` | 320 | Celui de toutes les explosions du jeu, Bombe et plume comprises. Une explosion doit se lire pareil quelle que soit sa taille. |
| `lingerMs` | 300 | Celui de la plume, et non celui de la Bombe (450) : la rupture est un événement, pas un piège qu'on laisse derrière soi. |

La durée de vie de la zone se calcule comme partout ailleurs : `(radius / growthRate) * 1000
+ lingerMs`, soit ≈ 738 ms.

**Ce qui borne 140 vers le haut.** Le Halo est le power-up le plus rare du jeu après la
Ronce, et cette carte est une rare : la conjonction est déjà exigeante. Une explosion plus
large que la Bombe ferait du Halo le meilleur outil offensif du jeu par accident, alors
qu'il est censé rester défensif. C'est aussi pourquoi la carte ne touche ni à la grâce de
rupture ni à la fréquence du Halo — un seul levier bouge.

## 5. Ce que le rendu ne fait pas

L'onde de choc de 200 px de `juice.ts` se déclenche à **chaque** rupture, carte prise ou
non. Elle n'est pas alignée sur le rayon de l'explosion, et ce document assume de ne pas
l'aligner.

La raison : l'onde de choc est le **geste** de la rupture, pas la portée de ce qui tue.
L'explosion, elle, dessine sa propre vérité par le rendu `HAZARD_BLAST` déjà en place —
exactement comme la Bombe, dont personne ne confond le disque avec le flash qui
l'accompagne. Aligner les deux coupleraient le front à une règle de simulation
(`rules.has('haloBurst')` devrait remonter jusqu'au rendu) pour un gain purement décoratif.

C'est une tension réelle avec la règle du §3.1 de la spec de rebuild — « ce que le joueur
voit doit être exactement ce qui tue » — et elle est tranchée ici en faveur du découplage,
en notant que la tension **préexiste** à cette carte : l'onde de 200 px sur-promet déjà
aujourd'hui, sur une rupture qui ne tue rien du tout. La carte rapproche la promesse de la
réalité au lieu de l'en éloigner.

## 6. Les tests

| Test | Ce qu'il éprouve |
| --- | --- |
| Règle absente | La rupture ne pose **aucune** zone. Garde du comportement actuel, pour qu'un jour où la règle fuiterait par défaut se voie. |
| Règle présente | Une zone `HAZARD_BLAST` naît au point de contact, avec le rayon et la croissance de `RULE_TUNING.haloBurst`. |
| L'explosion tue autour | Un ennemi voisin **non fautif**, placé à portée, meurt au pas suivant. C'est l'objet même de la carte, et le seul test qui la distingue d'une décoration. |
| L'ennemi fautif | Meurt dans les deux cas. L'explosion s'ajoute à `Doomed`, elle ne le remplace pas. |
| Le Halo a une carte | `UPGRADES` contient au moins une carte par power-up tirable — assertion générale plutôt que nommant `halo-burst`, pour qu'elle garde sa valeur au prochain élagage. |
| Parité i18n | Couverte par `parity.test.ts`, qui compare déjà `fr.json` et `en.json`. |

**Conséquences mécaniques attendues, à ne pas confondre avec des régressions :**
`SIM_VERSION` est à régénérer (`npm run version:sim`), toute source de `sim/` entrant dans
l'empreinte. L'empreinte de déterminisme (`REFERENCE_DIGEST`) ne devrait **pas** bouger :
sa run de référence ne prend aucune carte, donc la règle n'y est jamais active — si elle
bouge, c'est un signal à instruire, pas un fichier à régénérer.
