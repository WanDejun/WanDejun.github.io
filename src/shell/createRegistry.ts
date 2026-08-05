import { CommandRegistry } from './CommandRegistry';
import {
  basenameCommand, catCommand, cdCommand, clearCommand, dirnameCommand, exitCommand,
  findCommand, grepCommand, headCommand, lsCommand, pwdCommand, tailCommand, treeCommand, wcCommand,
} from './commands/fileCommands';
import {
  cutCommand, echoCommand, nlCommand, printfCommand, sedCommand, sortCommand,
  trCommand, uniqCommand, whichCommand,
} from './commands/textCommands';
import { renderCommand } from './commands/renderCommand';
import type { Command } from './types';

const helpCommand: Command = {
  name: 'help',
  description: 'Show the help file',
  usage: 'help',
  execute(_args, stdin, context) {
    // Delegate instead of copying help text so `help` and `cat /help` cannot drift.
    return catCommand.execute(['/help'], stdin, context);
  },
};

export function createRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  [
    basenameCommand, catCommand, cdCommand, clearCommand, cutCommand, dirnameCommand,
    echoCommand, exitCommand, findCommand, grepCommand, headCommand,
    helpCommand, lsCommand, nlCommand, printfCommand, pwdCommand, sedCommand, sortCommand,
    renderCommand, tailCommand, trCommand, treeCommand, uniqCommand, wcCommand, whichCommand,
  ].forEach((command) => registry.register(command));
  return registry;
}
