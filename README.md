# App de groupes d'amis (version de test)

App web installable pour organiser les plans entre potes : groupes, plans avec réponses,
« chaud » de dernière minute, trajets et SAM, suivi de conso privé, photos de soirée,
dépenses partagées et bilan de l'année.

- Interface : React + Vite, installable sur l'écran d'accueil (PWA)
- Serveur : Supabase (base Postgres, comptes, photos, temps réel), offre gratuite
- Hébergement : GitHub Pages, gratuit

## Mise en place (une seule fois)

1. **Supabase** : créer un projet sur supabase.com (région Europe).
   - SQL Editor > New query : coller tout le fichier `supabase/schema.sql`, puis Run.
   - Authentication > Sign In / Providers > Email : désactiver « Confirm email »
     pour la phase de test (sinon chaque inscription attend un e-mail, limité à quelques envois par heure).
   - Authentication > URL Configuration : mettre l'adresse de l'app dans « Site URL ».
   - Settings > API : copier la *Project URL* et la clé *anon public* dans le fichier `.env`.
2. **GitHub** : Settings > Pages > Source : choisir « GitHub Actions ».
   Chaque envoi sur `main` remet l'app en ligne automatiquement.

L'app est ensuite à l'adresse `https://<compte>.github.io/<dépôt>/`.

## Installer l'app sur son téléphone

- iPhone : ouvrir le lien dans Safari, bouton Partager, « Sur l'écran d'accueil ».
- Android : ouvrir le lien dans Chrome, menu ⋮, « Installer l'application ».

## Développer

```bash
npm install
npm run dev
```

## Sécurité

- La clé *anon* de Supabase est publique par conception : ce sont les règles d'accès
  de `supabase/schema.sql` qui protègent les données (chacun ne voit que ses groupes,
  la conso est privée sauf partage choisi groupe par groupe).
- Ne jamais mettre la clé *service_role* ni le mot de passe de la base dans le code.

## Avant une sortie publique

Voir le document de cadrage : CGU, politique de confidentialité, signalement de contenu,
classement 18+ et passage sur les stores.
