// FILE: tests/renderer/muya/checkbox-dirty.test.js
// START_MODULE_CONTRACT
//   PURPOSE: Pin exclusive task-checkbox routing, readonly default-action cancellation and single native-input delivery without synthetic changes.
//   SCOPE: ClickEvent with a real DOM container and native checkbox clicks; controllers are spies, leaving history behavior to built-renderer tests.
//   DEPENDS: ClickEvent, CLASS_OR_ID, Vitest/jsdom.
//   LINKS: M-012
//   ROLE: TEST
//   MAP_MODE: LOCALS
// END_MODULE_CONTRACT
// START_MODULE_MAP
//   fixture - a real checkbox container with spied content-state routes and native input observer.
// END_MODULE_MAP
import { afterEach, describe, expect, it, vi } from 'vitest'
import ClickEvent from 'muya/lib/eventHandler/clickEvent'
import { CLASS_OR_ID } from 'muya/lib/config'

const fixture = (readonly = false) => {
  const container = document.createElement('div')
  container.setAttribute('contenteditable', String(!readonly))
  document.body.appendChild(container)
  const checkbox = document.createElement('input')
  checkbox.type = 'checkbox'
  checkbox.className = CLASS_OR_ID.AG_TASK_LIST_ITEM_CHECKBOX
  container.appendChild(checkbox)
  const contentState = { listItemCheckBoxClick: vi.fn(), clickHandler: vi.fn() }
  const muya = {
    container, contentState,
    eventCenter: { dispatch: vi.fn(), attachDOMEvent: (target, type, handler) => target.addEventListener(type, handler) },
    dispatchChange: vi.fn()
  }
  new ClickEvent(muya)
  const inputs = vi.fn()
  container.addEventListener('input', inputs)
  return { container, checkbox, contentState, muya, inputs }
}
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks() })

describe('checkbox semantic click boundary', () => {
  it('routes editable tasks once without generic cursor handling or a synthetic dispatch', () => {
    const { checkbox, contentState, muya, inputs } = fixture()
    checkbox.click()
    expect(contentState.listItemCheckBoxClick).toHaveBeenCalledExactlyOnceWith(checkbox)
    expect(contentState.clickHandler).not.toHaveBeenCalled()
    expect(inputs).toHaveBeenCalledTimes(1)
    expect(muya.dispatchChange).not.toHaveBeenCalled()
  })
  it('cancels readonly task default actions before model or input changes', () => {
    const { checkbox, contentState, inputs } = fixture(true)
    checkbox.click()
    expect(checkbox.checked).toBe(false)
    expect(contentState.listItemCheckBoxClick).not.toHaveBeenCalled()
    expect(contentState.clickHandler).not.toHaveBeenCalled()
    expect(inputs).not.toHaveBeenCalled()
  })
  it('preserves the ordinary generic click route', () => {
    const { container, contentState, inputs } = fixture()
    const paragraph = document.createElement('p')
    paragraph.textContent = 'ordinary text'
    container.appendChild(paragraph)
    paragraph.click()
    expect(contentState.clickHandler).toHaveBeenCalledTimes(1)
    expect(contentState.listItemCheckBoxClick).not.toHaveBeenCalled()
    expect(inputs).not.toHaveBeenCalled()
  })
})
