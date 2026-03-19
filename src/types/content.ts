export type SkillCategory =
  | 'programming'
  | 'database'
  | 'ml-ai'
  | 'llm'
  | 'automation'
  | 'full-stack'
  | 'mobile'
  | 'game-dev'
  | 'cloud'

export type ProjectCategory =
  | 'ai'
  | 'web'
  | 'automation'
  | 'mobile'
  | 'game'
  | 'other'

export type ToolCategory =
  | 'ide'
  | 'ai-tools'
  | 'devops'
  | 'design'
  | 'productivity'
  | 'other'

export interface NavLink {
  label: string
  href: string
  isSection?: boolean
}
