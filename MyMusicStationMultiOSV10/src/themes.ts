export type ThemeDefinition = {
  id: string
  name: string
  builtIn: boolean
  vars?: Record<string, string>
}

export const themes: ThemeDefinition[] = [
  {
    id: 'dark',
    name: 'Dark',
    builtIn: true,
  },
  {
    id: 'modern',
    name: 'Modern',
    builtIn: true,
  },
  {
    id: 'classic',
    name: 'Classic',
    builtIn: true,
  },
  {
    id: 'fancy',
    name: 'Fancy',
    builtIn: true,
  },
]