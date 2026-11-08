export type Statut = 'pending' | 'in_progress' | 'completed'
// `id` : le numéro que TaskCreate rend, pour retrouver la tâche quand TaskUpdate la change.
export type Etape = { nom: string; statut: Statut; id?: string }

declare module 'claude-code' {
  interface PluginState {
    'fil-progression': {
      plan: Etape[] | null
      enAttente: boolean
      masque: boolean
    }
  }
}
