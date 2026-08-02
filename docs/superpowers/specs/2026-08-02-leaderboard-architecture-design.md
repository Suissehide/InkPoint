# Leaderboard en ligne — architecture d'ensemble

Document d'orientation, pas une spec exécutable. Il fixe le découpage, les choix de
technologies et les décisions déjà tranchées, pour que les trois specs qui en découlent
n'aient pas à les rejouer. Chaque étape a sa propre spec, son propre plan et sa propre
livraison.

## 1. Intention

Le README annonce en v2 un « classement en ligne ». Aujourd'hui le meilleur score vit
dans `localStorage` et le jeu est un site statique derrière nginx : un classement partagé
demande donc un service et un stockage persistant.

La décision structurante est le niveau de confiance accordé au client. Un classement de
jeu web se falsifie depuis la console en trois lignes. Comme la simulation d'InkPoint est
déjà déterministe — pas fixe de 16,67 ms, RNG à graine, aucun `Math.random`, aucune
horloge réelle, le tout tenu par un test de pureté — on retient la seule protection
réellement solide : **le serveur ne croit jamais le score envoyé, il rejoue la partie et
le recalcule lui-même**.

Ce choix a un coût qui n'était pas visible au départ, et qui commande tout le reste : la
simulation est déterministe *sur une même machine*, pas *entre moteurs JavaScript*. Elle
appelle 14 `Math.sin`, 14 `Math.cos`, 9 `Math.hypot`, 8 `Math.atan2` et 1 `Math.exp`, dont
la spec ECMAScript ne définit pas le résultat exact — chaque moteur a droit à son
approximation. Un joueur sous Firefox produirait un replay que le serveur Node refuserait
sans qu'il ait triché. Et une tolérance sur le score recalculé ne sauve rien : dans un
système chaotique, une divergence d'un ULP au pas 100 change qui est vivant au pas 10 000.
Cela se vérifie au bit près ou pas du tout.

D'où trois sous-systèmes empilés, chacun livrable et vérifiable seul.

## 2. Découpage

| Étape | Contenu | Livrable vérifiable seul |
| --- | --- | --- |
| **0** | Restructuration du dépôt en `front/` + `back/` + `sim/` | La suite passe à l'identique, empreinte de déterminisme inchangée |
| **1** | Arithmétique déterministe, hitstop dans la sim | Une run rejoue au bit près sous Node, Chromium, Firefox et WebKit |
| **2** | Format de replay + rejeu sans tête | `npm run replay partie.bin` affiche le score, identique à celui du jeu |
| **3** | Service leaderboard + UI | Le classement, en ligne |

L'ordre est contraint : 2 a besoin de 1, 3 a besoin de 2. Les étapes 0 et 1 sont couvertes
par `2026-08-02-sim-portable-design.md`. Les étapes 2 et 3 auront chacune leur spec, écrite
au moment de les aborder.

L'étape 1 n'est pas un détour : c'est aussi le prérequis du netcode annoncé en v3. Un
rollback netcode exige exactement la même garantie de rejeu bit-à-bit.

## 3. Structure du dépôt

Gachapon (`~/Documents/Gachapon`) est la référence de conventions : `back/` + `front/` +
`deploy/` à la racine, **aucun `package.json` racine**, deux projets npm indépendants, un
hook husky unique monté par `core.hooksPath`. InkPoint s'y aligne, avec un quatrième
dossier que Gachapon n'a pas besoin d'avoir :

```
sim/      noyau partagé — ECS bitECS pur, math déterministe, format de replay
front/    l'app actuelle (Pixi, DOM, Tailwind, Vite)
back/     Fastify + Prisma — API leaderboard et rejeu de vérification
deploy/   compose.yaml (Traefik) + dokploy/ + un Dockerfile par app
docs/     specs
```

`sim/` est **un dossier de sources TypeScript, pas un paquet npm** : ni `package.json`, ni
workspaces, donc la règle « aucun `package.json` racine » tient. `front` et `back` le
compilent chacun depuis la source via un alias `@sim`. `bitecs` devient une dépendance
déclarée des deux côtés.

C'est le seul écart de structure vis-à-vis de Gachapon, et il est forcé : Gachapon ne
partage aucun code entre son front et son back, il n'a rien à copier ici. En échange, le
statut de noyau partagé devient visible dans l'arborescence, ce qui prolonge les
« frontières dures » que le README revendique déjà.

Conséquence secondaire : `biome.json` reste **à la racine** et couvre les trois dossiers,
là où Gachapon en a un par paquet. Biome remonte l'arborescence pour trouver sa
configuration, donc `npm run lint` fonctionne depuis n'importe quel paquet. Un fichier
partagé ne peut pas être couvert par deux configurations concurrentes.

## 4. Technologies

| Domaine | Choix | Origine |
| --- | --- | --- |
| API | Fastify 5 | Gachapon |
| Validation | zod 4 + `fastify-type-provider-zod` | Gachapon |
| ORM / base | Prisma 7 + PostgreSQL 16 | Gachapon |
| Lint / format | Biome 2.4.5 épinglé sans caret | Gachapon |
| Commits | husky + commitlint, Conventional Commits | déjà en place |
| Tests back | Vitest | **écart** — Gachapon fait jest + wireit + swc ; InkPoint est déjà en Vitest |
| Build back | `tsc`, `tsx` en développement | **écart** — pas de wireit pour trois routes |
| Structure back | plate : `routes/`, `verify/`, `db/` | **écart** — Gachapon est hexagonal avec awilix, hors de proportion ici |
| Tests inter-moteurs | Playwright + Vitest browser mode | nouveau (étape 1) |
| Non repris | Redis, MinIO, Mailpit, Sonar | aucun besoin |

La stack est celle de Gachapon ; c'est la profondeur d'échafaudage qui diffère. Un back de
trois routes et un worker doit se lire en entier en dix minutes.

## 5. Décisions déjà tranchées

| Sujet | Décision | Raison |
| --- | --- | --- |
| Identité du joueur | Pseudo libre, mémorisé en `localStorage` | Aucun compte, aucune donnée personnelle, aucune auth à écrire |
| Anti-triche | Rejeu vérifié côté serveur | Seule protection réelle ; la sim déterministe la rend possible |
| Portabilité numérique | Rendre la sim portable (`sim/math.ts`) | Sans elle le rejeu rejette des joueurs honnêtes |
| Précision | Polynômes minimax en f64 | < 1 ulp, aucune dégradation perceptible, portable par construction |
| Preuve | Rejeu inter-moteurs en CI | La portabilité est la prémisse entière ; elle ne peut pas casser en silence |
| Structure | Alignement Gachapon + `sim/` partagé | Cohérence entre les dépôts |
| Échafaudage back | Minimal, structure plate | Proportion à la surface réelle |
| Exposition de l'API | Sous-domaine `api.inkpoint.qwetle.fr` | Homogène avec Gachapon ; impose la configuration CORS |

## 6. Esquisse de l'étape 2 — replay

Pour mémoire, à détailler dans sa propre spec.

Format binaire compact : en-tête (magie, version de format, empreinte de version de sim,
graine, nombre de pas), puis deux entiers par pas pour `moveX`/`moveY`, plus une liste
creuse des cartes d'amélioration choisies. **L'arène n'y figure pas** : `ARENA` est une
constante `1280 × 720` de `sim/world.ts`, le viewport ne met à l'échelle que le rendu.

Point critique : **la quantification se fait à la capture**, dans le
`source.writeInto(...)` de la boucle à pas fixe. La simulation du joueur doit consommer
exactement les valeurs que le serveur rejouera ; quantifier après coup ferait diverger les
deux dès le premier pas. En int16 par axe, dix minutes pèsent 144 Ko bruts, que
`CompressionStream('gzip')` côté navigateur et `zlib` côté Node ramènent à quelques Ko —
les entrées sont lisses, elles se compressent très bien.

À vérifier au moment d'écrire la spec : comment les cartes d'amélioration sont choisies et
appliquées, et si ce choix passe par un chemin déjà déterministe.

## 7. Esquisse de l'étape 3 — service

Pour mémoire, à détailler dans sa propre spec.

Quatre routes : `POST /runs/start` (le serveur délivre la graine et un `runId`, ce qui
interdit de farmer des graines hors ligne), `POST /runs/:id/replay`, `GET /leaderboard`,
`GET /health` pour le healthcheck compose. Si `/runs/start` échoue, la partie se lance avec
une graine locale : elle est simplement non soumissible. **Le jeu reste jouable hors
ligne**, ce qu'il est aujourd'hui.

La vérification est **asynchrone**, et ce n'est pas un raffinement : rejouer 36 000 pas
prend de l'ordre de la dizaine de secondes, donc le faire dans le cycle de la requête HTTP
serait à la fois une mauvaise latence et un vecteur de déni de service évident. Donc
`202 Accepted`, une ligne en `PENDING`, et un worker qui dépile. File d'attente en Postgres
(`SELECT … FOR UPDATE SKIP LOCKED`) plutôt qu'un Redis de plus, worker dans un
`worker_threads` pour ne pas bloquer la boucle d'événements, et des bornes dures : taille
de replay maximale, nombre de pas maximal, timeout.

Une table `Run` : graine, version de sim, pseudo, score revendiqué, score vérifié, statut,
le replay en `bytea`, un hash d'IP pour le rate limit. Index sur
`(simVersion, status, verifiedScore desc)`. Les replays des runs rejetées ou hors top 100
sont purgés ; les autres pèsent quelques kilo-octets et restent pour audit.

Contrainte héritée de bitECS, déjà documentée dans `determinism.test.ts` : les `eid` sont
alloués depuis un compteur **global au module**. Chaque vérification doit donc partir d'un
état de module neuf — `resetGlobals()` avant chaque rejeu, ou un worker par job.

**Le classement démarrera vide et sera versionné par version de sim.** Un replay
enregistré sous une version ne rejoue plus dès qu'on touche à l'équilibrage ou à un
système. À chaque livraison de contenu il faudra trancher : repartir de zéro, tenir un
classement par version, ou archiver. À décider dans la spec de l'étape 3.

## 8. Hors périmètre

La méta-progression persistante, également annoncée en v2, n'est pas traitée. Elle
supposerait une identité stable entre sessions, donc de vrais comptes — un chantier
distinct, et une décision opposée à celle prise ici sur l'identité.
