# Arène fixe — vérification visuelle à faire à l'écran

Le lot « arène fixe » est entièrement vérifié par lecture, typecheck, lint, 273 tests
et build. **Rien n'a été vu tourner** : aucun agent n'avait de navigateur. Cette liste
est ce qui reste, ordonné par risque décroissant.

Rappel utile : `requestAnimationFrame` est gelé dans un onglet en arrière-plan. Il faut
la fenêtre au premier plan, sinon rien ne s'anime et le jeu paraît figé à tort.

## Le risque principal, à faire en premier

1. **Mouvement réduit ACTIVÉ, fenêtre non 16:9** — regarder une vague apparaître.
   Aucun ennemi ne doit se montrer dans la marge.
   C'est la seule configuration où le masque porte réellement : quand les filtres sont
   actifs, `content.filterArea` recadre déjà sur l'arène et masquerait un masque
   défaillant. C'est aussi le risque Pixi v8 que la spec avait identifié (masque et
   filtre sur le même conteneur).
   *Si des ennemis fuient dans la marge* : déplacer `content.mask` sur `viewportLayer`,
   le repli que la spec prévoyait déjà.

2. **Mouvement réduit DÉSACTIVÉ, fenêtre non 16:9** — même contrôle, plus : l'arène
   doit s'afficher tout court. Un échec de composition masque/filtre en Pixi v8 se
   manifeste plutôt par un terrain noir ou vide que par une fuite.

## Ensuite

3. **Teinte de danger** — laisser un ennemi s'approcher, en fenêtre non 16:9. Le halo
   rouge doit s'arrêter net au cadre d'encre, sans couture rectangulaire ni bavure
   dans la marge.

4. **Symétrie de la vignette** — rester immobile au centre. Comparer les quatre coins.
   **Une asymétrie est attendue** : le nuanceur de la vignette n'est pas centré sur
   l'arène (bug préexistant, antérieur à ce lot). La texture de filtre est arrondie à
   la puissance de deux supérieure, donc le centre du dégradé tombe vers 64 % / 57 %
   de l'arène : coin haut-gauche le plus sombre, bas-droit le plus clair.
   À décider : corriger le nuanceur (`vTextureCoord / uInputClamp.zw`) ou laisser.

5. **Cadre d'encre** — le trait est à alpha 0,18 et se trouve dans la passe de la
   vignette, donc environ 29 % plus sombre dans les coins que le long des murs.
   Juger s'il reste lisible ; si l'effacement paraît *inégal* plutôt que
   symétrique, la cause est le point 4, pas l'alpha du cadre.

6. **Flash de combo / de mort** — gros combo en fenêtre ultralarge. Le voile blanc doit
   remplir l'arène exactement, pas la marge, y compris juste après un redimensionnement.

7. **Redimensionnement en pleine partie** — passer de 16:9 à ultralarge puis à haut et
   étroit en jouant. Le zoom suit, pas de fuite dans la marge, pas de bande noire, le
   HUD reste collé au coin de l'arène, et **le nombre et la vitesse des ennemis ne
   changent pas** — c'est le but de tout le lot.

8. **HUD à fort et faible zoom** — texte net (il est mis à l'échelle en CSS), score dans
   le coin de l'*arène*, jauge de vague centrée sur l'arène, rien qui déborde dans la
   marge, HUD toujours masqué au menu.

9. **Secousse contre un mur** — grosse élimination près d'un bord. Les entités glissent
   désormais sous un cadre fixe et sont découpées par le masque : vérifier que ça se lit
   comme une secousse de caméra et non comme des sprites tronqués.

10. **Grain** — il couvre toujours la marge (voulu), mais il n'est plus atténué par la
    vignette : vérifier que les coins ne paraissent pas plus bruités qu'avant.

11. **Extrêmes** — fenêtre ~400×300, puis très haute et étroite : aucun débordement,
    aucune barre de défilement due à la boîte HUD de 1600×900, arène toujours centrée.

12. **Boucle complète** — menu → partie → carte de fin de vague → pause → game over →
    menu, en fenêtre non 16:9 : les écrans restent plein fenêtre par-dessus la marge, et
    l'arène gelée derrière eux garde son cadre et sa découpe.

## Réglage d'équilibrage à juger en jouant

L'arène de référence fait 1600×900 contre ~1300×900 auparavant, à nombre d'ennemis par
vague inchangé : le jeu est un peu plus permissif qu'avant. Aucun réquilibrage n'a été
fait, c'est délibéré.
