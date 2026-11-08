export type Statut = 'pending' | 'in_progress' | 'completed'
export type Etape = { nom: string; statut: Statut }

declare module 'claude-code' {
  interface PluginState {
    'fil-progression': {
      plan: Etape[] | null
      enAttente: boolean
      masque: boolean
    }
  }
}
