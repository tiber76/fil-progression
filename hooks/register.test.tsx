import { expect, test } from 'claude-code/testing'

import { abreger, ajouterTache, appliquer, depuisListe, majTache } from './register'

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

test('TaskCreate et TaskUpdate : une tâche s’ajoute, change de statut, est renommée ou retirée', () => {
  const trois = ['Cadrer', 'Coder', 'Relire'].reduce<ReturnType<typeof ajouterTache> | null>(
    (liste, sujet, i) => ajouterTache(liste, String(i + 1), sujet),
    null,
  )
  expect(trois?.map(e => [e.id, e.nom, e.statut])).toEqual([
    ['1', 'Cadrer', 'pending'],
    ['2', 'Coder', 'pending'],
    ['3', 'Relire', 'pending'],
  ])

  const avance = majTache(majTache(trois, { taskId: '1', status: 'completed' }), { taskId: '2', status: 'in_progress', subject: 'Coder le mod' })
  expect(avance?.map(e => [e.nom, e.statut])).toEqual([
    ['Cadrer', 'completed'],
    ['Coder le mod', 'in_progress'],
    ['Relire', 'pending'],
  ])

  expect(majTache(avance, { taskId: '3', status: 'deleted' })?.map(e => e.id)).toEqual(['1', '2'])
  // Une tâche inconnue, ou une mise à jour sans numéro, ne change rien.
  expect(majTache(avance, { taskId: '9', status: 'completed' })).toEqual(avance)
  expect(majTache(avance, { status: 'completed' })).toEqual(avance)
  expect(majTache(null, { taskId: '1', status: 'completed' })).toBeNull()
})

test('le bandeau suit les tâches de Claude Code en terminal', async ($, on) => {
  const memoire = new Map<string, unknown>()
  let numero = 0
  on('command.register', () => ({ value: { command: 'fil' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('state.get', (_, e) => ({ value: { value: memoire.get(e.key), version: 1 } }))
  on('state.set', (_, e) => {
    memoire.set(e.key, e.value)
    return { value: { isSet: true, version: 1 } }
  })
  // L'outil rend le numéro de la tâche créée, comme le vrai TaskCreate.
  on('tool.call', (_, e) =>
    e.tool === 'TaskCreate'
      ? { result: { task: { id: String((numero += 1)), subject: e.subject } } }
      : { result: {} },
  )
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>moteur</Text>
  })

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (const subject of ['Cadrer', 'Coder', 'Relire']) {
    await $.tool.call({ tool: 'TaskCreate', subject, description: subject })
  }
  await $.tool.call({ tool: 'TaskUpdate', taskId: '1', status: 'completed' })
  await $.tool.call({ tool: 'TaskUpdate', taskId: '2', status: 'in_progress' })

  const ui = await $.ui.mount({ ...BANDEAU, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /2\/3/ })).toBeTruthy()
  await ui.unmount()
})
