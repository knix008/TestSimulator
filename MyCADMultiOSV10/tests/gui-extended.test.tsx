import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { App } from '../src/ui/App'
import { WORKBENCHES } from '../src/core/workbenches'
import { COMMAND_IDS } from '../src/core/commands'
import { MENUS } from '../src/core/menus'
import { menuIcon, translate } from '../src/core/i18n'

async function openMenu(user: ReturnType<typeof userEvent.setup>, id: string) {
  await user.click(screen.getByTestId(`menu-${id}`))
  return screen.getByTestId('menu-popup')
}

describe('gui extended workbenches', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('[GUI] every command id has a Korean label, an English label and an icon', () => {
    for (const id of COMMAND_IDS) {
      expect(translate('ko', id), id).not.toBe(id)
      expect(translate('en', id), id).not.toBe(id)
      expect(menuIcon(id), id).not.toBe('•')
    }
    for (const workbench of WORKBENCHES) {
      expect(translate('ko', workbench.labelKey), workbench.id).not.toBe(workbench.labelKey)
      expect(workbench.tools.length, workbench.id).toBeGreaterThan(0)
    }
  })

  it('[GUI] the new menus are reachable and every item has an icon and a label', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    for (const id of ['sketchMenu', 'surfaceMenu', 'assemblyMenu', 'annotateMenu', 'analyzeMenu', 'manufactureMenu', 'bimMenu', 'sketchupMenu']) {
      const menu = MENUS.find((entry) => entry.id === id)
      expect(menu, id).toBeTruthy()
      const popup = await openMenu(user, id)
      for (const item of menu!.items) {
        const row = within(popup).getByTestId(`menuitem-${item.id}`)
        expect(row.querySelector('.menu-icon')?.textContent?.length, item.id).toBeGreaterThan(0)
        expect(row.querySelector('.menu-label')?.textContent?.length, item.id).toBeGreaterThan(0)
      }
    }
  })

  it('[GUI] SketchUp push/pull adds a solid from the SketchUp menu', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await openMenu(user, 'sketchupMenu')
    await user.click(screen.getByTestId('menuitem-suRectangleTool'))
    await openMenu(user, 'sketchupMenu')
    await user.click(screen.getByTestId('menuitem-suPushPull'))
    await waitFor(() => expect(screen.getByTestId('status-objects').textContent).toContain('1'))
    expect(screen.getByTestId('statusbar').textContent).toContain('푸시풀')
  })

  it('[GUI] FEM analysis opens a copyable report dialog', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.click(screen.getByTestId('tb-box'))
    await openMenu(user, 'analyzeMenu')
    await user.click(screen.getByTestId('menuitem-femSolve'))
    await waitFor(() => expect(screen.getAllByTestId('report-line').length).toBeGreaterThan(3))
    expect(screen.getAllByTestId('report-line').map((line) => line.textContent).join('\n')).toContain('Safety factor')
    await user.click(screen.getByTestId('close-report'))
    expect(screen.queryByTestId('report-line')).toBeNull()
  })

  it('[GUI] BIM wall, window and schedule work from the architecture menu', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await openMenu(user, 'bimMenu')
    await user.click(screen.getByTestId('menuitem-bimWall'))
    await waitFor(() => expect(screen.getByTestId('status-objects').textContent).toContain('1'))
    await openMenu(user, 'bimMenu')
    await user.click(screen.getByTestId('menuitem-bimWindow'))
    await waitFor(() => expect(screen.getByTestId('status-objects').textContent).toContain('2'))
    await openMenu(user, 'bimMenu')
    await user.click(screen.getByTestId('menuitem-bimSchedule'))
    await waitFor(() => expect(screen.getAllByTestId('report-line').length).toBeGreaterThan(0))
    expect(screen.getAllByTestId('report-line').map((line) => line.textContent).join('\n')).toContain('wall')
  })

  it('[GUI] the workbench picker switches the tool panel to CATIA and SketchUp sets', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    const picker = screen.getByTestId('workbench')
    for (const id of ['gsd', 'sheetMetal', 'kinematics', 'knowledge', 'drafting', 'sketchup', 'sandbox']) {
      await user.selectOptions(picker, id)
      const tools = WORKBENCHES.find((item) => item.id === id)!.tools
      const grid = screen.getByTestId('tool-grid')
      expect(grid.querySelectorAll('button').length, id).toBe(tools.length)
      expect(grid.textContent, id).toContain(translate('ko', tools[0]))
    }
  })

  it('[GUI] sheet metal wall, flange and unfold report the developed length', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await user.selectOptions(screen.getByTestId('workbench'), 'sheetMetal')
    const grid = screen.getByTestId('tool-grid')
    await user.click(within(grid).getByTitle(translate('ko', 'smWall')))
    await user.click(within(grid).getByTitle(translate('ko', 'smFlange')))
    await user.click(within(grid).getByTitle(translate('ko', 'smUnfold')))
    await waitFor(() => expect(screen.getAllByTestId('report-line').length).toBeGreaterThan(1))
    expect(screen.getAllByTestId('report-line')[0].textContent).toContain('전개 길이')
  })

  it('[GUI] a failing command shows the error dialog instead of crashing', async () => {
    const user = userEvent.setup({ delay: null })
    render(<App />)
    await openMenu(user, 'assemblyMenu')
    await user.click(screen.getByTestId('menuitem-asmExplode'))
    await waitFor(() => expect(screen.getByTestId('error-message').textContent).toContain('부품'))
  })
})
