import { defineStore } from 'pinia'
import log from 'electron-log'
import bus from '../bus'
import staticCommands, { RootCommand, getCommandsWithDescriptions } from '../commands'

export const useCommandCenterStore = defineStore('commandCenter', {
  state: () => ({
    rootCommand: new RootCommand(staticCommands)
  }),
  actions: {
    REGISTER_COMMAND(command) {
      this.rootCommand.subcommands.push(command)
    },
    SORT_COMMANDS() {
      this.rootCommand.subcommands.sort((a, b) => a.description.localeCompare(b.description))
    },
    async LISTEN_COMMAND_CENTER_BUS() {
      this.rootCommand.subcommands = await getCommandsWithDescriptions()
      this.SORT_COMMANDS()

      // Listen for language changes and initialize/update command descriptions
      bus.on('language-changed', async () => {
        // Update all command descriptions when language changes
        this.rootCommand.subcommands = await getCommandsWithDescriptions()
        this.SORT_COMMANDS()
      })

      // Init stuff
      bus.on('cmd::sort-commands', () => {
        this.SORT_COMMANDS()
      })
      // Path B-clean W6: 2 IPC listeners (mt::keybindings-response,
      // mt::execute-command-by-id) moved to bootstrap-ipc.js. They
      // call APPLY_KEYBINDINGS / EXECUTE_COMMAND_BY_ID below.

      // Register commands that are created at runtime.
      bus.on('cmd::register-command', (command) => {
        this.REGISTER_COMMAND(command)
      })

      // Allow other compontents to execute commands with predefined values.
      bus.on('cmd::execute', (commandId) => {
        executeCommand(this, commandId)
      })
    },

    APPLY_KEYBINDINGS(keybindingMap) {
      if (!keybindingMap || typeof keybindingMap !== 'object') return
      const { subcommands } = this.rootCommand
      for (const entry of subcommands) {
        const value = keybindingMap[entry.id]
        if (value) entry.shortcut = normalizeAccelerator(value)
      }
    },

    EXECUTE_COMMAND_BY_ID(commandId) {
      executeCommand(this, commandId)
    }
  }
})

const executeCommand = (store, commandId) => {
  const { subcommands } = store.rootCommand
  const command = subcommands.find((c) => c.id === commandId)
  if (!command) {
    const errorMsg = `Cannot execute command "${commandId}" because it's missing.`
    log.error(errorMsg)
    throw new Error(errorMsg)
  }
  command.execute()
}

const normalizeAccelerator = (acc) => {
  try {
    return acc
      .replace(/cmdorctrl|cmd/i, 'Cmd')
      .replace(/ctrl/i, 'Ctrl')
      .split('+')
  } catch (_) {
    return [acc]
  }
}
