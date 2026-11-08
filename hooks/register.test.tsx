import { expect, test } from 'claude-code/testing'

import { abreger, appliquer, depuisListe } from './register'

const BANDEAU = {
  plugin: 'fil-progression',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: true, maxRows: 10, bodyColumns: 120 },
} as const

const PLAN = [
  { content: 'Cadrage', status: 'completed' },
  { content: 'Plan', status: 'completed' },
  { content: 'Correctif', status: 'in_progress' },
  { content: 'Tests', status: 'pending' },
  { content: 'Relecture', status: 'pending' },
  { content: 'PR', status: 'pending' },
]

test('un nom d’étape tient en un ou deux mots', () => {
  expect(abreger('Lire exemples et types du moteur')).toBe('Lire exemples')
  expect(abreger('Valider, typer, tester le mod')).toBe('Valider')
  expect(abreger('Anticonstitutionnellement')).toBe('Anticonstitut…')
})

test('update_plan : la liste entière, puis suivante, finies et commence à', () => {
  const liste = depuisListe(PLAN)
  expect(liste?.map(e => e.statut)).toEqual(['completed', 'completed', 'in_progress', 'pending', 'pending', 'pending'])

  const suivante = appliquer(liste, { advance: true })
  expect(suivante?.map(e => e.statut)).toEqual(['completed', 'completed', 'completed', 'in_progress', 'pending', 'pending'])

  const finies = appliquer(suivante, { done: [4], start: 5 })
  expect(finies?.map(e => e.statut)).toEqual(['completed', 'completed', 'completed', 'completed', 'in_progress', 'pending'])

  // Rien n'est modifié sur place : la liste d'avant reste intacte.
  expect(liste?.[2].statut).toBe('in_progress')
  // Sans liste connue, un « suivante » seul ne crée rien.
  expect(appliquer(null, { advance: true })).toBeNull()
})

test('le bandeau dessine un rond par étape et le compteur', async ($, on) => {
  on('command.register', () => ({ value: { command: 'fil' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  // Une mémoire d'état de pacotille : ce que le mod écrit, il le relit.
  const memoire = new Map<string, unknown>()
  on('state.get', (_, e) => ({ value: { value: memoire.get(e.key), version: 1 } }))
  on('state.set', (_, e) => {
    memoire.set(e.key, e.value)
    return { value: { isSet: true, version: 1 } }
  })
  on('tool.call', () => ({ result: {} }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>moteur</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: PLAN })

  const ui = await $.ui.mount({ ...BANDEAU, surface: 'desktop' })
  const texte = await ui.find({ type: 'Text', text: /3\/6/ })
  expect(texte).toBeTruthy()
  await ui.unmount()
})

test('à l’étroit, les ronds seuls puis l’étape en cours', async ($, on) => {
  const memoire = new Map<string, unknown>()
  on('command.register', () => ({ value: { command: 'fil' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('state.get', (_, e) => ({ value: { value: memoire.get(e.key), version: 1 } }))
  on('state.set', (_, e) => {
    memoire.set(e.key, e.value)
    return { value: { isSet: true, version: 1 } }
  })
  on('tool.call', () => ({ result: {} }))
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>moteur</Text>
  })

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: 'mcp__ccd_turn__update_plan', items: PLAN })

  const ui = await $.ui.mount({ ...BANDEAU, props: { ...BANDEAU.props, bodyColumns: 30 }, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Étape 3\/6/ })).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /Relecture/ })).toBeFalsy()
  await ui.unmount()
})
