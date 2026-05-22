/**
 * Tests for src/renderer/src/util/listToTree.js
 *
 * Covers: listToTree default export, Node class, findParent logic
 */

import listToTree from '@/util/listToTree'

describe('util/listToTree', () => {
  it('should return empty array for empty list', () => {
    const result = listToTree([])
    expect(result).toEqual([])
  })

  it('should create a single root node', () => {
    const list = [{ lvl: 1, content: 'Heading 1', slug: 'heading-1' }]
    const result = listToTree(list)
    expect(result).toHaveLength(1)
    expect(result[0].label).toBe('Heading 1')
    expect(result[0].slug).toBe('heading-1')
    expect(result[0].lvl).toBe(1)
    expect(result[0].children).toEqual([])
  })

  it('should nest child nodes under parent', () => {
    const list = [
      { lvl: 1, content: 'H1', slug: 'h1' },
      { lvl: 2, content: 'H2', slug: 'h2' },
      { lvl: 3, content: 'H3', slug: 'h3' }
    ]
    const result = listToTree(list)
    expect(result).toHaveLength(1)
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children[0].label).toBe('H2')
    expect(result[0].children[0].children).toHaveLength(1)
    expect(result[0].children[0].children[0].label).toBe('H3')
  })

  it('should handle siblings at same level', () => {
    const list = [
      { lvl: 1, content: 'H1', slug: 'h1' },
      { lvl: 2, content: 'H2a', slug: 'h2a' },
      { lvl: 2, content: 'H2b', slug: 'h2b' }
    ]
    const result = listToTree(list)
    expect(result).toHaveLength(1)
    expect(result[0].children).toHaveLength(2)
    expect(result[0].children[0].label).toBe('H2a')
    expect(result[0].children[1].label).toBe('H2b')
  })

  it('should handle multiple top-level siblings', () => {
    const list = [
      { lvl: 1, content: 'H1a', slug: 'h1a' },
      { lvl: 1, content: 'H1b', slug: 'h1b' }
    ]
    const result = listToTree(list)
    expect(result).toHaveLength(2)
  })

  it('should handle going back up multiple levels', () => {
    const list = [
      { lvl: 1, content: 'H1', slug: 'h1' },
      { lvl: 2, content: 'H2', slug: 'h2' },
      { lvl: 3, content: 'H3', slug: 'h3' },
      { lvl: 1, content: 'H1b', slug: 'h1b' }
    ]
    const result = listToTree(list)
    expect(result).toHaveLength(2)
    expect(result[0].children).toHaveLength(1)
    expect(result[1].label).toBe('H1b')
  })

  it('should handle skipped levels (h1 -> h3)', () => {
    const list = [
      { lvl: 1, content: 'H1', slug: 'h1' },
      { lvl: 3, content: 'H3', slug: 'h3' }
    ]
    const result = listToTree(list)
    expect(result).toHaveLength(1)
    expect(result[0].children).toHaveLength(1)
    expect(result[0].children[0].label).toBe('H3')
  })

  it('should set parent reference on child nodes', () => {
    const list = [
      { lvl: 1, content: 'Parent', slug: 'parent' },
      { lvl: 2, content: 'Child', slug: 'child' }
    ]
    const result = listToTree(list)
    expect(result[0].children[0].parent).toBe(result[0])
  })

  it('should handle complex nested structure', () => {
    const list = [
      { lvl: 1, content: 'A', slug: 'a' },
      { lvl: 2, content: 'A1', slug: 'a1' },
      { lvl: 3, content: 'A1a', slug: 'a1a' },
      { lvl: 2, content: 'A2', slug: 'a2' },
      { lvl: 1, content: 'B', slug: 'b' },
      { lvl: 2, content: 'B1', slug: 'b1' }
    ]
    const result = listToTree(list)
    expect(result).toHaveLength(2)
    expect(result[0].children).toHaveLength(2)
    expect(result[0].children[0].children).toHaveLength(1)
    expect(result[1].children).toHaveLength(1)
  })
})
