import { getUniqueId } from '../util'
import { PATH_SEPARATOR } from '../config'

/**
 * Return all sub-directories relative to the root directory.
 *
 * @param {string} rootPath Root directory path
 * @param {string} pathname Full directory path
 * @returns {Array<string>} Sub-directories relative to root.
 */
const getSubdirectoriesFromRoot = (rootPath, pathname) => {
  if (!window.path.isAbsolute(pathname)) {
    throw new Error('Invalid path!')
  }
  const relativePath = window.path.relative(rootPath, pathname)
  return relativePath ? relativePath.split(PATH_SEPARATOR) : []
}

// v1.1.0 Phase-A6: defense-in-depth containment guard.
// project-store's _processTreeEvent dispatches to the longest-prefix root
// before calling treeCtrl, so this should never reject in normal flow. We
// still guard against:
//   - prefix-string collisions (e.g., /foo vs /foobar)
//   - dispatcher bugs that route the wrong tree
//   - Unicode normalization mismatch (NFD vs NFC) that makes
//     window.path.relative produce '../foo'
// Returns true if `pathname` is contained inside `tree.pathname` (so the
// per-tree mutator can proceed); false otherwise (caller should bail).
const isPathInsideTree = (tree, pathname) => {
  if (!pathname) return false
  if (!window.path.isAbsolute(pathname)) return false
  const relative = window.path.relative(tree.pathname, pathname)
  // window.path.relative returns:
  //   ''            iff pathname === tree.pathname
  //   'sub/dir'     iff pathname is inside tree
  //   '../other'    iff pathname is outside tree (sibling or upward)
  //   absolute      iff pathname is on a different drive (Windows)
  if (relative === '') return true
  if (relative.startsWith('..')) return false
  if (window.path.isAbsolute(relative)) return false
  return true
}

const rejectOutOfTree = (fnName, tree, pathname) => {
  const relative = window.path.relative(tree.pathname, pathname || '')
  // eslint-disable-next-line no-console
  console.debug(
    `[TreeCtrl][${fnName}][BLOCK_REJECT_OUT_OF_TREE] root=${tree.pathname} path=${pathname} relative=${relative}`
  )
}

/**
 * Add a new file to the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} file The file that should be added
 */
export const addFile = (tree, file) => {
  const { pathname, name } = file
  if (!isPathInsideTree(tree, pathname)) {
    rejectOutOfTree('addFile', tree, pathname)
    return
  }
  const dirname = window.path.dirname(pathname)
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, dirname)

  let currentPath = tree.pathname
  let currentFolder = tree
  let currentSubFolders = tree.folders
  for (const directoryName of subDirectories) {
    let childFolder = currentSubFolders.find((f) => f.name === directoryName)
    if (!childFolder) {
      childFolder = {
        id: getUniqueId(),
        pathname: `${currentPath}${PATH_SEPARATOR}${directoryName}`,
        name: directoryName,
        isCollapsed: true,
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      }
      currentSubFolders.push(childFolder)
    }

    currentPath = `${currentPath}${PATH_SEPARATOR}${directoryName}`
    currentFolder = childFolder
    currentSubFolders = childFolder.folders
  }

  // Add file to related directory
  if (!currentFolder.files.find((f) => f.name === name)) {
    // Remove file content from object.
    const fileCopy = {
      id: getUniqueId(),
      birthTime: file.birthTime,
      isDirectory: file.isDirectory,
      isFile: file.isFile,
      isMarkdown: file.isMarkdown,
      name: file.name,
      pathname: file.pathname
    }

    const idx = currentFolder.files.findIndex((f) => {
      return f.name.localeCompare(name) > 0
    })
    if (idx !== -1) {
      currentFolder.files.splice(idx, 0, fileCopy)
    } else {
      currentFolder.files.push(fileCopy)
    }
  } else {
    // eslint-disable-next-line no-console
    console.debug(`[TreeCtrl][addFile][BLOCK_SKIP_DUPLICATE] root=${tree.pathname} name=${name} parent=${currentPath}`)
  }
}

/**
 * Add a new directory to the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} dir The directory that should be added
 */
export const addDirectory = (tree, dir) => {
  if (!isPathInsideTree(tree, dir.pathname)) {
    rejectOutOfTree('addDirectory', tree, dir.pathname)
    return
  }
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, dir.pathname)

  let currentPath = tree.pathname
  let currentSubFolders = tree.folders
  for (const directoryName of subDirectories) {
    let childFolder = currentSubFolders.find((f) => f.name === directoryName)
    if (!childFolder) {
      childFolder = {
        id: getUniqueId(),
        pathname: `${currentPath}${PATH_SEPARATOR}${directoryName}`,
        name: directoryName,
        isCollapsed: true,
        isDirectory: true,
        isFile: false,
        isMarkdown: false,
        folders: [],
        files: []
      }
      // Insert folder in alphabetical order
      const idx = currentSubFolders.findIndex((f) => {
        return f.name.localeCompare(directoryName) > 0
      })
      if (idx !== -1) {
        currentSubFolders.splice(idx, 0, childFolder)
      } else {
        currentSubFolders.push(childFolder)
      }
    }

    currentPath = `${currentPath}${PATH_SEPARATOR}${directoryName}`
    currentSubFolders = childFolder.folders
  }
}

/**
 * Remove the given file from the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} file The file that should be deleted
 */
export const unlinkFile = (tree, file) => {
  const { pathname } = file
  if (!isPathInsideTree(tree, pathname)) {
    rejectOutOfTree('unlinkFile', tree, pathname)
    return
  }
  const dirname = window.path.dirname(pathname)
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, dirname)

  let currentFolder = tree
  let currentSubFolders = tree.folders
  for (const directoryName of subDirectories) {
    const childFolder = currentSubFolders.find((f) => f.name === directoryName)
    if (!childFolder) return
    currentFolder = childFolder
    currentSubFolders = childFolder.folders
  }

  const index = currentFolder.files.findIndex((f) => f.pathname === pathname)
  if (index !== -1) {
    currentFolder.files.splice(index, 1)
  }
}

/**
 * Remove the given directory from the tree list.
 *
 * @param {*} tree Root file tree
 * @param {*} dir The directory that should be deleted
 */
export const unlinkDirectory = (tree, dir) => {
  const { pathname } = dir
  if (!isPathInsideTree(tree, pathname)) {
    rejectOutOfTree('unlinkDirectory', tree, pathname)
    return
  }
  const subDirectories = getSubdirectoriesFromRoot(tree.pathname, pathname)

  subDirectories.pop()
  let currentFolder = tree.folders
  for (const directoryName of subDirectories) {
    const childFolder = currentFolder.find((f) => f.name === directoryName)
    if (!childFolder) return
    currentFolder = childFolder.folders
  }

  const index = currentFolder.findIndex((f) => f.pathname === pathname)
  if (index !== -1) {
    currentFolder.splice(index, 1)
  }
}
