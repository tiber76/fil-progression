import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Etape, Statut } from '../types'

// Le Fil de progression, en bandeau : un rond par étape, lu dans la liste d'étapes que Claude tient déjà
// (update_plan de l'app, TodoWrite du terminal). Rien à écrire dans le chat pour que la jauge reste juste.
const CLE_MASQUE = 'masque'
const COMMANDE = 'fil'
const LARGEUR_NOM = 14
const ORANGE = '#f08a24'

// Le moteur lit plugin et clé dans le source : des chaînes écrites en toutes lettres.
const plan = atom({ plugin: 'fil-progression', key: 'plan' } as const, null)
const enAttente = atom({ plugin: 'fil-progression', key: 'enAttente' } as const, false)
const masque = atom({ plugin: 'fil-progression', key: 'masque' } as const, false)

type ArgumentsPlan = { items?: unknown; advance?: unknown; done?: unknown; start?: unknown }

// Un nom d'étape en un ou deux mots : la jauge tient sur une rangée.
export function abreger(texte: string): string {
  const mots = texte.trim().split(/\s+/)
  let nom = (mots[0] ?? '').replace(/[,;:.]+$/, '')
  // Une virgule ou un deux-points coupe le nom : « Valider, typer » devient « Valider ».
  for (let i = 1; i < mots.length && !/[,;:.]$/.test(mots[i - 1]); i += 1) {
    const suite = `${nom} ${mots[i]}`.replace(/[,;:.]+$/, '')
    if (suite.length > LARGEUR_NOM) break
    nom = suite
  }
  return nom.length > LARGEUR_NOM ? `${nom.slice(0, LARGEUR_NOM - 1)}…` : nom
}

function versStatut(valeur: unknown): Statut {
  return valeur === 'completed' || valeur === 'in_progress' ? valeur : 'pending'
}

export function depuisListe(liste: unknown): Etape[] | null {
  if (!Array.isArray(liste)) return null
  const etapes = liste.flatMap((element): Etape[] => {
    if (typeof element !== 'object' || element === null) return []
    const { content, status } = element as { content?: unknown; status?: unknown }
    return typeof content === 'string' ? [{ nom: abreger(content), statut: versStatut(status) }] : []
  })
  return etapes.length ? etapes : null
}

// Rejoue un appel de update_plan : la liste entière, ou « suivante », « finies », « commence à ».
export function appliquer(courant: Etape[] | null, arguments_: ArgumentsPlan): Etape[] | null {
  const etapes = (depuisListe(arguments_.items) ?? courant)?.map(etape => ({ ...etape }))
  if (!etapes) return courant
  if (arguments_.advance === true) {
    const enCours = etapes.find(etape => etape.statut === 'in_progress')
    if (enCours) enCours.statut = 'completed'
    const suivante = etapes.find(etape => etape.statut === 'pending')
    if (suivante) suivante.statut = 'in_progress'
  }
  if (Array.isArray(arguments_.done)) {
    for (const numero of arguments_.done) {
      if (typeof numero === 'number' && etapes[numero - 1]) etapes[numero - 1].statut = 'completed'
    }
  }
  if (typeof arguments_.start === 'number' && etapes[arguments_.start - 1]) {
    etapes[arguments_.start - 1].statut = 'in_progress'
  }
  return etapes
}

const estFini = (etapes: Etape[]) => etapes.every(etape => etape.statut === 'completed')

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMANDE,
      description: 'Affiche ou masque la jauge du Fil de progression au-dessus de la zone de saisie',
    })
    const estMasque = (await $.store.get(CLE_MASQUE).catch(() => false)) === true
    await update($, masque, () => estMasque)

    return next(e)
  })

  on('command.run', { command: COMMANDE }, async $ => {
    const estMasque = !(await read($, masque))
    await update($, masque, () => estMasque)
    await $.store.set(CLE_MASQUE, estMasque)

    return { text: estMasque ? 'Jauge du Fil masquée. /fil pour la réafficher.' : 'Jauge du Fil affichée.' }
  })

  on('tool.call', { tool: 'mcp__ccd_turn__update_plan' }, async ($, e, next) => {
    await update($, plan, courant => appliquer(courant, e as ArgumentsPlan)).catch(() => undefined)

    return next(e)
  })

  on('tool.call', { tool: 'TodoWrite' }, async ($, e, next) => {
    await update($, plan, courant => appliquer(courant, { items: e.todos })).catch(() => undefined)

    return next(e)
  })

  // Le bilan de fin de tour coche toute la liste.
  on('tool.call', { tool: 'mcp__ccd_turn__wrap_up' }, async ($, e, next) => {
    await update($, plan, courant =>
      courant ? courant.map(etape => ({ ...etape, statut: 'completed' as const })) : courant,
    ).catch(() => undefined)

    return next(e)
  })

  // Une question posée à Jeremy : l'étape en cours passe en orange le temps qu'il réponde.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    await update($, enAttente, () => true).catch(() => undefined)
    try {
      return await next(e)
    } finally {
      await update($, enAttente, () => false).catch(() => undefined)
    }
  })

  // Un nouveau message après un plan fini : la jauge pleine a eu son temps, elle s'efface.
  on('prompt.submit', async ($, e, next) => {
    await update($, plan, courant => (courant && estFini(courant) ? null : courant)).catch(() => undefined)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const etapes = await read($, plan)
    if (e.props.hasSurvey || !etapes || (await read($, masque))) return next(e)

    const { Box, Text } = $.ui.resolve(e)
    const autres = await next(e)
    const attend = await read($, enAttente)
    const total = etapes.length
    const indexCourant = etapes.findIndex(etape => etape.statut === 'in_progress')
    const numero = indexCourant >= 0 ? indexCourant + 1 : etapes.filter(etape => etape.statut === 'completed').length
    const compteur = `${numero}/${total}`

    const glyphe = (etape: Etape) =>
      etape.statut === 'completed' ? '●' : etape.statut === 'in_progress' ? '◉' : '○'
    const teinte = (etape: Etape) =>
      etape.statut === 'completed'
        ? 'success'
        : etape.statut === 'in_progress'
          ? attend
            ? ORANGE
            : 'warning'
          : 'inactive'

    // Large : chaque étape nommée, reliée par un trait plein derrière elle et en pointillés devant.
    const largeur =
      etapes.reduce((somme, etape) => somme + 2 + etape.nom.length, 0) + 3 * (total - 1) + 2 + compteur.length
    const large = largeur <= e.props.bodyColumns

    const ligne = large ? (
      <Text wrap="truncate-end">
        {etapes.map((etape, i) => (
          <Text>
            {i > 0 ? <Text dimColor>{etapes[i - 1].statut === 'completed' ? ' ━ ' : ' ┄ '}</Text> : ''}
            <Text color={teinte(etape)}>{glyphe(etape)}</Text>
            <Text dimColor={etape.statut === 'pending'}>{` ${etape.nom}`}</Text>
          </Text>
        ))}
        <Text dimColor>{`  ${compteur}`}</Text>
      </Text>
    ) : (
      // Étroit : les ronds seuls, puis l'étape en cours.
      <Text wrap="truncate-end">
        {etapes.map(etape => (
          <Text color={teinte(etape)}>{`${glyphe(etape)} `}</Text>
        ))}
        <Text dimColor>{` Étape ${compteur}`}</Text>
        {indexCourant >= 0 ? <Text dimColor>{` · ${etapes[indexCourant].nom}`}</Text> : ''}
      </Text>
    )

    // La jauge tout contre la zone de saisie, les autres bandeaux au-dessus d'elle, une ligne vide entre les deux
    // pour qu'elle ne se confonde pas avec les moniteurs.
    return (
      <Box flexDirection="column">
        {autres}
        <Box marginTop={1}>{ligne}</Box>
      </Box>
    )
  })
}
