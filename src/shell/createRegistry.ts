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
import { shareCommand } from './commands/shareCommand';
import { themeCommand } from './commands/themeCommand';
import type { Command } from './types';

const helpCommand: Command = {
  name: 'help',
  description: 'Show the help file',
  usage: 'help',
  execute(_args, stdin, context) {
    // Delegate instead of copying help text so the command and static file cannot drift.
    return catCommand.execute(['/static/help'], stdin, context);
  },
};

const aboutMeCommand: Command = {
  name: 'about_me',
  description: 'Render the about page',
  usage: 'about_me',
  execute(args, stdin, context) {
    // Use the absolute virtual path so the command works from every cwd.
    return renderCommand.execute(['/static/about_me.md', ...args], stdin, context);
  },
};

export function createRegistry(): CommandRegistry {
  const registry = new CommandRegistry();
  [
    aboutMeCommand, basenameCommand, catCommand, cdCommand, clearCommand, cutCommand, dirnameCommand,
    echoCommand, exitCommand, findCommand, grepCommand, headCommand,
    helpCommand, lsCommand, nlCommand, printfCommand, pwdCommand, sedCommand, sortCommand,
    renderCommand, shareCommand, tailCommand, themeCommand, trCommand, treeCommand, uniqCommand, wcCommand, whichCommand,
  ].forEach((command) => registry.register(command));
  return registry;
}
